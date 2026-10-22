import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import type { IPty } from 'node-pty';
import { watchWorkspace } from './watch';
import { StudyStore } from './data';
import { SourceLibrary, sourceExtensions } from './sources';
import { ChatService, CodexChatConnection } from './chat';
import { QuizService, requestQuiz, requestStructured } from './quiz';
import { PracticeService } from './practice';
import type { TerminalMode, TimerAction, TutorType } from './types';
import { validateLessonMode, suggestMode, type LessonMode, type TextOptions } from './lesson-modes';

const started = performance.now();
const root = path.resolve(process.env.STUDY_APP_TEST_ROOT || path.join(__dirname, '../..'));
const testMode = !!process.env.STUDY_APP_TEST_ROOT;
const store = new StudyStore(root);
const sources = new SourceLibrary(store);
const chat = new ChatService(
  store,
  sources,
  async (event, failed, notesPath) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      STUDY_APP_ACTIVE: '1',
      STUDY_APP_NOTES_PATH: notesPath
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.OPENAI_API_KEY;
    const connection = new CodexChatConnection(
      await executable('codex'),
      root,
      env,
      event,
      (error) => {
        failed(error);
        if (initialized)
          void store
            .active()
            .then((subject) => timerRequest('pause-all', subject))
            .then(changed)
            .catch((error) => publish('status', error.message));
      }
    );
    try {
      await connection.request('initialize', {
        clientInfo: { name: 'study_workspace', title: 'Study Workspace', version: '0.1.0' },
        capabilities: { experimentalApi: true, requestAttestation: false }
      });
      connection.notify('initialized');
      return connection;
    } catch (error) {
      connection.close();
      throw error;
    }
  },
  () => {
    changed();
  }
);
const quizzes = new QuizService(store, async (sources, signal) =>
  requestQuiz(sources, await executable('codex'), undefined, 180000, signal)
);
const practice = new PracticeService(store, async (prompt, schema, signal) =>
  requestStructured(prompt, schema, await executable('codex'), undefined, 180000, signal)
);
app.setPath('userData', path.join(testMode ? root : path.join(root, 'study-app'), '.runtime'));
let win: BrowserWindow;
let terminal: IPty | null = null;
let terminalMode: TerminalMode | null = null;
let closing = false,
  initialized = false;
let bridge: ChildProcessWithoutNullStreams | null = null;
let timerSequence = 0;
let generation = 0,
  outstanding = 0;
let terminalLaunching = false;
let tutorStopping: Promise<void> | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let stopWatching: (() => void) | null = null;
const pending = new Map<
  number,
  { resolve: () => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }
>();
const run = promisify(execFile);
let timerQueue = Promise.resolve();
const timers = new Set<TimerAction>([
  'start',
  'stop',
  'reset',
  'select',
  'pause-all',
  'checkpoint'
]);

function publish(kind: 'data' | 'exit' | 'status', data: string) {
  if (!win?.isDestroyed()) win.webContents.send('study:terminal-event', { kind, data });
}
let changePending: ReturnType<typeof setTimeout> | null = null;
function changed() {
  if (changePending) return;
  changePending = setTimeout(() => {
    changePending = null;
    if (!win?.isDestroyed()) win.webContents.send('study:changed');
  }, 50);
}

function startBridge() {
  bridge = spawn(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, '../scripts/timer-bridge.ps1'),
      '-Root',
      root
    ],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  createInterface({ input: bridge.stdout }).on('line', (line) => {
    try {
      const result = JSON.parse(line);
      const task = pending.get(result.id);
      if (!task) return;
      clearTimeout(task.timeout);
      pending.delete(result.id);
      if (result.ok) task.resolve();
      else task.reject(new Error(result.error));
    } catch {
      /* Non-protocol stdout is never executed. */
    }
  });
  let errors = '';
  bridge.stderr.on('data', (chunk) => {
    errors = (errors + chunk).slice(-4000);
  });
  const fail = (error: Error) => {
    initialized = false;
    for (const task of pending.values()) {
      clearTimeout(task.timeout);
      task.reject(error);
    }
    pending.clear();
    if (!closing) publish('status', error.message);
  };
  bridge.on('error', fail);
  bridge.on('exit', () =>
    fail(new Error('Timer connection closed.' + (errors ? ` ${errors}` : '')))
  );
}
function timerRequest(action: TimerAction, subject: string): Promise<void> {
  const next = timerQueue
    .catch(() => {})
    .then(
      () =>
        new Promise<void>((resolve, reject) => {
          if (!bridge || bridge.exitCode !== null || !bridge.stdin.writable) {
            reject(new Error('Timer connection is unavailable. Restart the app.'));
            return;
          }
          const id = ++timerSequence;
          const timeout = setTimeout(() => {
            pending.delete(id);
            reject(new Error('Timer operation timed out. Restart the app before continuing.'));
          }, 15000);
          pending.set(id, { resolve, reject, timeout });
          bridge.stdin.write(JSON.stringify({ id, action, subject }) + '\n', (error) => {
            if (error) {
              clearTimeout(timeout);
              pending.delete(id);
              reject(error);
            }
          });
        })
    );
  timerQueue = next;
  return next;
}
async function executable(name: 'codex' | 'code' | 'bash') {
  const candidates =
    name === 'codex'
      ? [path.join(process.env.LOCALAPPDATA || '', 'Programs/OpenAI/Codex/bin/codex.exe')]
      : name === 'code'
        ? [
            path.join(process.env.LOCALAPPDATA || '', 'Programs/Microsoft VS Code/Code.exe'),
            'C:/Program Files/Microsoft VS Code/Code.exe'
          ]
        : ['C:/Program Files/Git/usr/bin/bash.exe', 'C:/Program Files/Git/bin/bash.exe'];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  if (name !== 'code') {
    try {
      const result = await run('where.exe', [name + '.exe'], { windowsHide: true });
      const first = result.stdout.trim().split(/\r?\n/)[0];
      if (first) return first;
    } catch {}
  }
  throw new Error(
    `${name === 'code' ? 'VS Code' : name} was not found. Install it and restart the app.`
  );
}
function dimensions(cols: unknown, rows: unknown) {
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    (cols as number) < 2 ||
    (cols as number) > 500 ||
    (rows as number) < 1 ||
    (rows as number) > 200
  )
    throw new Error('Invalid terminal size.');
}
async function openTerminal(
  mode: TerminalMode,
  subject: string,
  cols: number,
  rows: number,
  lessonMode?: LessonMode,
  textOptions?: TextOptions,
  fresh = false
) {
  if (!['powershell', 'bash', 'tutor'].includes(mode))
    throw new Error('Choose a supported terminal.');
  await store.validate(subject);
  if (subject !== (await store.active()))
    throw new Error('Select this subject before opening a terminal.');
  dimensions(cols, rows);
  if (mode === 'tutor' && !initialized)
    throw new Error('Wait for the study timer to connect before studying.');
  if (typeof fresh !== 'boolean') throw new Error('Invalid session request.');
  if (lessonMode !== undefined) validateLessonMode(subject, lessonMode);
  if (terminalLaunching) throw new Error('A shell is already opening.');
  terminalLaunching = true;
  try {
    if (terminalMode === 'tutor') {
      if (mode === 'tutor' && !fresh) return;
      if (!(await prepareSwitch())) return;
    }
    if (terminal) {
      const answer = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Keep shell', 'Replace shell'],
        defaultId: 0,
        cancelId: 0,
        message: 'Replace the open shell?'
      });
      if (answer.response !== 1) return;
    }
    const program =
      mode === 'tutor'
        ? await executable('codex')
        : mode === 'bash'
          ? await executable('bash')
          : 'powershell.exe';
    if (mode === 'tutor' && fresh && chat.activeSubject && !(await prepareSwitch())) return;
    const lesson =
      mode === 'tutor' ? await chat.startCLI(subject, fresh, lessonMode, textOptions) : null;
    const args = lesson
      ? [
          'resume',
          lesson.threadId,
          ...(lesson.prompt ? [lesson.prompt] : []),
          // Release the thread writer when this terminal exits so saving can resume it.
          '--no-daemon',
          '--sandbox',
          'danger-full-access',
          '--ask-for-approval',
          'never'
        ]
      : mode === 'bash'
        ? ['--login', '-i']
        : ['-NoLogo'];
    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      STUDY_APP_ACTIVE: '1',
      STUDY_APP_SUBJECT: subject,
      ...(lesson ? { STUDY_APP_NOTES_PATH: path.join(store.vault(subject), lesson.notePath) } : {})
    } as Record<string, string>;
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.OPENAI_API_KEY;
    const pty = require('node-pty') as typeof import('node-pty');
    generation++;
    const ownGeneration = generation;
    terminal?.kill();
    outstanding = 0;
    terminal = pty.spawn(program, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: root,
      env,
      useConpty: true
    });
    terminalMode = mode;
    publish('status', mode === 'tutor' ? 'Codex CLI' : mode === 'bash' ? 'Git Bash' : 'PowerShell');
    terminal.onData((data) => {
      if (ownGeneration !== generation) return;
      outstanding += data.length;
      publish('data', data);
      if (outstanding > 262144) terminal?.pause();
    });
    terminal.onExit(({ exitCode }) => {
      if (ownGeneration !== generation) return;
      terminal = null;
      terminalMode = null;
      publish('exit', `${mode === 'tutor' ? 'Codex CLI' : 'Shell'} closed (${exitCode}).`);
      changed();
      if (mode === 'tutor' && !tutorStopping)
        void finishSession().catch((error) => publish('status', error.message));
    });
    changed();
  } finally {
    terminalLaunching = false;
  }
}

function stopTutorTerminal(): Promise<void> {
  if (tutorStopping) return tutorStopping;
  if (!terminal || terminalMode !== 'tutor') return Promise.resolve();
  const current = terminal;
  tutorStopping = Promise.resolve()
    .then(
      () =>
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            listener.dispose();
            reject(new Error('Codex CLI did not close. Retry Finish session.'));
          }, 10000);
          const listener = current.onExit(() => {
            clearTimeout(timeout);
            listener.dispose();
            resolve();
          });
          try {
            current.kill();
          } catch (error) {
            clearTimeout(timeout);
            listener.dispose();
            reject(error);
          }
        })
    )
    .finally(() => {
      tutorStopping = null;
    });
  return tutorStopping;
}

async function finishSession() {
  await timerRequest('pause-all', await store.active());
  changed();
  await stopTutorTerminal();
  await chat.finish();
  if (terminal) {
    generation++;
    terminal.kill();
    terminal = null;
    terminalMode = null;
    publish('exit', 'Shell closed.');
  }
  changed();
}
async function prepareSwitch(): Promise<boolean> {
  if (!chat.activeSubject) return true;
  const answer = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Stay here', 'Finish and switch'],
    defaultId: 0,
    cancelId: 0,
    message: 'Finish this study session before switching?',
    detail:
      'Time will pause immediately. The app will save your assessed progress and notes before switching.'
  });
  if (answer.response !== 1) return false;
  await finishSession();
  return true;
}
function trusted(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
    throw new Error('Untrusted app request.');
}
function handle(name: string, callback: (...args: any[]) => unknown) {
  ipcMain.handle(name, (event, ...args) => {
    trusted(event);
    return callback(...args);
  });
}
function registerIPC() {
  handle('study:close-shell', async () => {
    if (terminalMode === 'tutor') return finishSession();
    generation++;
    terminal?.kill();
    terminal = null;
    terminalMode = null;
    publish('exit', 'Shell closed.');
    changed();
  });
  handle('study:subject-settings', (subject: string) => sources.settings(subject));
  handle('study:set-tutor-type', async (subject: string, tutorType: TutorType) => {
    if (chat.activeSubject === subject)
      throw new Error('Finish this session before changing its tutor type.');
    sources.validateTutorType(tutorType);
    await sources.saveSettings(subject, { ...(await sources.settings(subject)), tutorType });
    changed();
  });
  handle('study:materials', (subject: string) => store.materials(subject));
  handle('study:material', async (subject: string, relative: string) => {
    const text = await fs.readFile(await store.safeMaterial(subject, relative), 'utf8');
    await practice.syncNotes(subject, relative, text);
    changed();
    return text;
  });
  handle('study:chat', (subject: string) => chat.view(subject));
  handle(
    'study:start-chat',
    async (subject: string, fresh = false, mode?: LessonMode, options?: TextOptions) => {
      await store.validate(subject);
      if (subject !== (await store.active()))
        throw new Error('Select this subject before studying.');
      if (fresh && chat.activeSubject && !(await prepareSwitch())) return;
      await chat.start(subject, fresh, 'lesson', mode, options);
      changed();
    }
  );
  handle('study:send-chat', (subject: string, text: string) => chat.send(subject, text));
  handle('study:interrupt-chat', (subject: string) => chat.interrupt(subject));
  handle(
    'study:answer-chat',
    (subject: string, id: string | number, answer: boolean | Record<string, string>) =>
      chat.answer(subject, id, answer)
  );
  handle('study:create-subject', async (name: string, tutorType: TutorType = 'general') => {
    if (!initialized)
      throw new Error('Wait for the study timer to connect before adding a subject.');
    if (!(await prepareSwitch()))
      throw new Error('Subject creation cancelled. Your session is still open.');
    if (terminal) {
      generation++;
      terminal.kill();
      terminal = null;
      terminalMode = null;
    }
    const subject = await sources.createSubject(name, tutorType);
    await timerRequest('select', subject);
    changed();
    return subject;
  });
  handle('study:sources', (subject: string) => sources.list(subject));
  handle('study:import-sources', async (subject: string) => {
    await store.validate(subject);
    const result = await dialog.showOpenDialog(win, {
      title: `Add sources to ${subject}`,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Study sources', extensions: sourceExtensions }]
    });
    if (!result.canceled) {
      await sources.importFiles(subject, result.filePaths);
      changed();
    }
  });
  handle('study:add-source-url', async (subject: string, url: string) => {
    await sources.addURL(subject, url);
    changed();
  });
  handle('study:generate-material', async (subject: string) => {
    if (subject !== (await store.active()))
      throw new Error('Select this subject before preparing material.');
    await sources.generationPrompt(subject);
    if (
      chat.activeSubject &&
      (await chat.view(subject))?.kind !== 'setup' &&
      !(await prepareSwitch())
    )
      return;
    await chat.start(subject, (await sources.settings(subject)).preparation === 'ready', 'setup');
    changed();
  });
  handle('study:practice-cancel', () => {
    practice.cancelPending();
    changed();
  });
  handle(
    'study:flashcard-review',
    (subject: string, id: string, remembered: boolean, reviewId: string) =>
      practice.review(subject, id, remembered, reviewId)
  );
  handle('study:writing-followup', (subject: string, id: string, kind: 'revision' | 'transfer') =>
    practice.followup(subject, id, kind)
  );
  handle('study:end-lesson', finishSession);
  handle('study:flashcards', (subject: string) => practice.cards(subject));
  handle('study:flashcard-add', (subject: string, notePath: string, word: string) =>
    practice.add(subject, notePath, word)
  );
  handle('study:flashcard-enrich', (subject: string, id: string) => practice.enrich(subject, id));
  handle('study:flashcard-save', (subject: string, id: string, meaning: string, example: string) =>
    practice.edit(subject, id, meaning, example)
  );
  handle('study:writing-list', (subject: string) => practice.writing(subject));
  handle('study:writing-create', (subject: string, notePath: string, topic: string) =>
    practice.createWriting(subject, notePath, topic)
  );
  handle('study:note-recall', (subject: string, notePath: string) =>
    practice.createRecall(subject, notePath)
  );
  handle('study:flashcard-accept-note', (subject: string, id: string) =>
    practice.acceptNoteMeaning(subject, id)
  );
  handle('study:writing-submit', async (subject: string, id: string, response: string) => {
    const result = await practice.submitWriting(subject, id, response);
    await store.tutorEvidence(subject);
    changed();
    return result;
  });
  handle('study:quiz-sources', (subject: string) => quizzes.sourcePaths(subject));
  handle('study:quiz-list', (subject: string) => quizzes.list(subject));
  handle('study:quiz-get', (subject: string, id: string) => quizzes.get(subject, id));
  handle(
    'study:quiz-submit',
    async (subject: string, id: string, answers: import('./types').QuizAnswer[]) => {
      const result = await quizzes.submit(subject, id, answers);
      await store.tutorEvidence(subject);
      changed();
      return result;
    }
  );
  handle('study:quiz-generate', (subject: string, notePath: string, sources: string[]) =>
    quizzes.create(subject, notePath, sources)
  );
  handle('study:snapshot', async () => {
    const snapshot = await store.snapshot(terminalMode);
    await practice.syncNotes(snapshot.subject, snapshot.notePath, snapshot.markdown);
    return {
      ...snapshot,
      timerReady: initialized,
      flashcardsVersion: practice.version(snapshot.subject),
      tutorNotePath:
        chat.activeSubject === snapshot.subject
          ? (await chat.view(snapshot.subject))?.notePath
          : null,
      endingLesson: !!tutorStopping || chat.isSaving,
      practiceStatus: practice.status
    };
  });
  handle('study:dashboard', (subject: string) => store.dashboard(subject));
  handle('study:timer', async (action: TimerAction, subject: string) => {
    if (!initialized)
      throw new Error('Timer is still connecting or unavailable. Please wait or restart the app.');
    if (!timers.has(action)) throw new Error('Invalid timer action.');
    await store.validate(subject);
    if (action === 'select' && (await store.active()) !== subject && !(await prepareSwitch())) {
      changed();
      return;
    }
    if (action === 'select' && terminal && (await store.active()) !== subject) {
      const response = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Keep subject', 'Switch and close shell'],
        defaultId: 0,
        cancelId: 0,
        message: 'Close the current shell and switch subjects?',
        detail:
          'The shell carries the current subject and notes location. A new shell will use the subject you select.'
      });
      if (response.response !== 1) {
        changed();
        return;
      }
      generation++;
      terminal.kill();
      terminal = null;
      terminalMode = null;
      publish('exit', 'Shell closed for subject change. Open a new shell or tutor to continue.');
    }
    await timerRequest(action, subject);
    changed();
  });
  handle('study:notes', async (subject: string, relative: string | null) => {
    await store.validate(subject);
    if (relative !== null) {
      if (typeof relative !== 'string') throw new Error('Invalid note path.');
      await store.safeNote(subject, relative);
      store.selectedNotes.set(subject, relative);
    }
    return store.snapshot(terminalMode);
  });
  handle('study:new-notes', async (subject: string) => {
    if (chat.activeSubject)
      throw new Error('Finish the current session before creating a notebook page.');
    await store.createNotes(subject);
    changed();
    return store.snapshot(terminalMode);
  });
  handle('study:terminal', openTerminal);
  handle('study:mode-suggestion', async (subject: string) => {
    await store.validate(subject);
    validateLessonMode(subject, 'conversation');
    try {
      const { createTracker } = require(path.join(root, 'tools/study/FinnishMastery.cjs'));
      const tracker = createTracker(store.vault(subject));
      return suggestMode(
        tracker.review({ kind: 'word', limit: 1 }),
        tracker.review({ kind: 'grammar', limit: 1 })
      );
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
        (error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND'
      )
        throw error;
      return {
        mode: 'conversation',
        reason: 'Start with conversation. Assessed review history is not available yet.'
      };
    }
  });
  handle('study:code', async (target: string, subject: string) => {
    if (!['workspace', 'subject'].includes(target)) throw new Error('Invalid VS Code target.');
    await store.validate(subject);
    const code = await executable('code');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        code,
        ['--new-window', target === 'subject' ? store.vault(subject) : root],
        { windowsHide: true, detached: true, stdio: 'ignore' }
      );
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
  });
  handle('study:open-notes', async (subject: string) => {
    await store.validate(subject);
    const state = await store.snapshot(terminalMode);
    if (state.subject !== subject || !state.notePath)
      throw new Error('No session notes to open yet.');
    const error = await shell.openPath(await store.safeNote(subject, state.notePath));
    if (error) throw new Error(error);
  });
  ipcMain.on('study:input', (event, data: unknown) => {
    trusted(event);
    if (typeof data === 'string' && data.length <= 65536) terminal?.write(data);
  });
  ipcMain.on('study:resize', (event, cols, rows) => {
    trusted(event);
    try {
      dimensions(cols, rows);
      terminal?.resize(cols, rows);
    } catch {}
  });
  ipcMain.on('study:ack', (event, bytes: unknown) => {
    trusted(event);
    if (Number.isInteger(bytes) && (bytes as number) > 0 && (bytes as number) <= 262144) {
      outstanding = Math.max(0, outstanding - (bytes as number));
      if (outstanding < 65536) terminal?.resume();
    }
  });
  ipcMain.on('study:ready', (event) => {
    trusted(event);
    console.log(
      JSON.stringify({
        metric: 'interface-ready',
        milliseconds: Math.round(performance.now() - started)
      })
    );
  });
}
async function shutdown() {
  try {
    if (bridge) await timerRequest('pause-all', await store.active());
  } catch (error) {
    if (!win.isDestroyed()) {
      const response = await dialog.showMessageBox(win, {
        type: 'error',
        buttons: ['Keep app open', 'Exit anyway'],
        defaultId: 0,
        cancelId: 0,
        message: 'Could not confirm that study time stopped.',
        detail: String(error) + '\nYou can also stop time with the existing study widget.'
      });
      if (response.response === 0) {
        closing = false;
        return;
      }
    }
  }
  try {
    await stopTutorTerminal();
    await chat.finish();
    await chat.close();
  } catch (error) {
    closing = false;
    changed();
    if (!win.isDestroyed())
      dialog.showErrorBox(
        'Session is still open',
        String(error) + '\nYour session has not been closed. Retry Finish session.'
      );
    return;
  }
  quizzes.cancel();
  practice.cancel();
  if (ticker) clearInterval(ticker);
  stopWatching?.();
  generation++;
  terminal?.kill();
  terminal = null;
  bridge?.stdin.end();
  win.destroy();
  app.quit();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      win = new BrowserWindow({
        title: 'Study Workspace',
        width: 1440,
        height: 920,
        minWidth: 850,
        minHeight: 600,
        backgroundColor: '#171b1e',
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          spellcheck: false
        }
      });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', (event) => event.preventDefault());
      win.webContents.on('will-attach-webview', (event) => event.preventDefault());
      win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false)
      );
      win.on('close', (event) => {
        event.preventDefault();
        if (!closing) {
          closing = true;
          void shutdown();
        }
      });
      registerIPC();
      win.once('ready-to-show', () => {
        win.show();
        console.log(
          JSON.stringify({
            metric: 'window-shown',
            milliseconds: Math.round(performance.now() - started)
          })
        );
      });
      await win.loadFile(path.join(__dirname, 'index.html'));
      startBridge();
      try {
        await timerRequest('pause-all', await store.active());
        initialized = true;
        changed();
      } catch (e) {
        publish('status', `Timer unavailable: ${(e as Error).message}`);
      }
      stopWatching = watchWorkspace(root, changed);
      let ticks = 0,
        lastPracticeStatus = practice.status;
      ticker = setInterval(() => {
        if (lastPracticeStatus !== practice.status) {
          lastPracticeStatus = practice.status;
          changed();
        }
        if (++ticks % 15 === 0 && initialized)
          void store
            .active()
            .then((s) => timerRequest('checkpoint', s))
            .catch((e) => publish('status', e.message));
      }, 2000);
    })
    .catch((error) => {
      console.error(error);
      dialog.showErrorBox('Study Workspace could not start', String(error));
      app.exit(1);
    });
  app.on('before-quit', (event) => {
    if (win && !win.isDestroyed()) {
      event.preventDefault();
      if (!closing) {
        closing = true;
        void shutdown();
      }
    }
  });
  app.on('window-all-closed', () => app.quit());
}
