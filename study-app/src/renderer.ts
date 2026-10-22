import {
  lessonModes,
  modeRequest,
  textLevels,
  textLengths,
  validateTextOptions,
  type LessonMode,
  type TextOptions
} from './lesson-modes';
import { setupPractice } from './practice-renderer';
import { setupQuiz } from './quiz-renderer';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type {
  Dashboard,
  Snapshot,
  TerminalMode,
  TimerAction,
  ChatView,
  SubjectSettings,
  TutorType,
  Material
} from './types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const select = (id: string) => $<HTMLSelectElement>(id);
const button = (id: string) => $<HTMLButtonElement>(id);
let state: Snapshot | null = null,
  chat: ChatView | null = null,
  settings: SubjectSettings | null = null;
let dashboard: Dashboard | null = null,
  view = 'home',
  topicSubject = '',
  dashboardBusy = false;
let refreshing = false,
  rerunRefresh = false,
  working = false,
  sourceWorking = false,
  sourceCount = 0;
let modeExpanded = false,
  selectedMode: LessonMode | undefined,
  renderedChatId = '';
let materials: Material[] = [],
  practicePath = '',
  materialKey = '',
  notesKey = '',
  chatKey = '',
  requestKey = '';
let setupSubject = '',
  notebookOpen = localStorage.getItem('notebook-open') !== 'false';
let term: Terminal | null = null;
const fit = new FitAddon();
let openCLIOnReady = true;
const quizUI = setupQuiz(error),
  practiceUI = setupPractice(error);
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Helsinki',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
function helsinkiDay(date = new Date()) {
  const parts = dayFormat.formatToParts(date);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}-${parts.find((p) => p.type === 'day')!.value}`;
}
function error(e: unknown) {
  $('error-text').textContent =
    e instanceof Error
      ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
      : String(e);
  $('error').hidden = false;
}
async function task<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (e) {
    error(e);
    return undefined;
  }
}
function markdown(text: string) {
  return DOMPurify.sanitize(marked.parse(text, { async: false }) as string, {
    FORBID_TAGS: ['img', 'iframe', 'form', 'style', 'video', 'audio'],
    FORBID_ATTR: ['style'],
    ALLOW_DATA_ATTR: false
  });
}
function setOptions(
  element: HTMLSelectElement,
  items: { label: string; value: string }[],
  selected?: string
) {
  element.replaceChildren(...items.map((item) => new Option(item.label, item.value)));
  if (selected) element.value = selected;
}
function lessonTitle(title: string) {
  const stamp = title.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-\d+Z$/);
  return stamp
    ? new Date(`${stamp[1]}T${stamp[2]}:${stamp[3]}:${stamp[4]}Z`).toLocaleString()
    : title;
}
function renderTimer() {
  if (!state) return;
  const session = state.session,
    running = !!session && !session.stoppedUtc;
  const end = session?.stoppedUtc ? Date.parse(session.stoppedUtc) : Date.now();
  const elapsed = session
    ? Number(session.elapsedBeforeSeconds || 0) +
      Math.max(0, (end - Date.parse(session.startedUtc)) / 1000)
    : 0;
  const seconds = Math.floor(elapsed);
  $('elapsed').textContent = `${Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0')}:${Math.floor((seconds / 60) % 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  $('timer-state').textContent = running ? 'STUDYING' : 'PAUSED';
  button('timer-toggle').textContent = running ? 'Stop' : 'Start';
  $('total-time').textContent =
    `${((Number(session?.totalBeforeSeconds || 0) + elapsed) / 3600).toFixed(2)} hours total`;
}
function render(next: Snapshot) {
  const changed = state?.subject !== next.subject;
  state = next;
  if (changed) {
    chat = null;
    settings = null;
    dashboard = null;
    practicePath = '';
    materialKey = '';
    chatKey = '';
    requestKey = '';
    materials = [];
    selectedMode = undefined;
    modeExpanded = false;
    $('source-list').replaceChildren();
    $('chat-messages').replaceChildren();
    $('chat-requests').replaceChildren();
    $('chat-error').hidden = true;
    $<HTMLTextAreaElement>('chat-input').value =
      localStorage.getItem('chat-draft:' + next.subject) || '';
    $<HTMLFormElement>('source-url-form').reset();
  }
  if ([...select('subject').options].map((o) => o.value).join('\n') !== next.subjects.join('\n'))
    setOptions(
      select('subject'),
      next.subjects.map((subject) => ({ label: subject, value: subject }))
    );
  select('subject').value = next.subject;
  select('subject').disabled = next.timerReady === false || !!next.endingLesson;
  button('add-subject').disabled = next.timerReady === false || !!next.endingLesson;
  $('subject-label').textContent = next.subject;
  $('current-topic').textContent = next.topic || 'Choose your next lesson';
  $('home-subject').textContent = next.subject;
  $('home-topic').textContent = next.topic || 'Find your starting point';
  $('home-context').textContent = 'Your lessons, material and progress, together.';
  button('timer-toggle').disabled = next.timerReady === false || !!next.endingLesson;
  button('timer-reset').disabled = next.timerReady === false || !!next.endingLesson;
  const key = next.subject + JSON.stringify(next.notes);
  if (select('note-select').dataset.key !== key) {
    select('note-select').dataset.key = key;
    setOptions(
      select('note-select'),
      next.notes.length
        ? next.notes.map((note) => ({ label: lessonTitle(note.name), value: note.relativePath }))
        : [{ label: 'No lesson notes yet', value: '' }]
    );
  }
  if (next.notePath) select('note-select').value = next.notePath;
  select('note-select').disabled = !next.notes.length;
  button('open-note-file').disabled = !next.notePath;
  button('note-recall').disabled = !next.notePath || !next.markdown.trim();
  const noteKey = next.subject + next.notePath + next.markdown;
  if (notesKey !== noteKey) {
    notesKey = noteKey;
    $('notes-content').innerHTML = next.markdown
      ? markdown(next.markdown)
      : '<p class="subtle">Key ideas and examples will appear here as you study.</p>';
    for (const input of $('notes-content').querySelectorAll('input')) input.disabled = true;
  }
  $('status-message').textContent =
    next.timerReady === false
      ? 'Connecting to study timer...'
      : 'Your progress stays with this subject.';
  renderTimer();
  updatePractice();
  setNotebook(notebookOpen);
  if (changed && view === 'dashboard') void loadDashboard();
}
async function refresh() {
  if (refreshing) {
    rerunRefresh = true;
    return;
  }
  refreshing = true;
  try {
    const next = await window.study.snapshot();
    render(next);
    const [conversation, profile] = await Promise.all([
      window.study.chat(next.subject),
      window.study.subjectSettings(next.subject)
    ]);
    if (state?.subject !== next.subject) return;
    chat = conversation;
    settings = profile;
    renderChat();
    renderHome();
    updateSourceControls();
    if (openCLIOnReady && next.timerReady) {
      openCLIOnReady = false;
      if (view === 'study') void task(() => beginStudy());
    }
    if (view === 'sources') await loadSources();
  } catch (e) {
    error(e);
  } finally {
    refreshing = false;
    if (rerunRefresh) {
      rerunRefresh = false;
      void refresh();
    }
  }
}
function renderHome() {
  if (!state) return;
  $('home-next').textContent =
    chat?.kind === 'lesson'
      ? 'Your conversation is saved. Continue from where you left off.'
      : 'Your tutor will use your study plan and latest assessed work to choose a useful starting point.';
  $('home-readiness').textContent = readiness();
  button('continue-study').textContent =
    chat?.kind === 'setup' && chat.status !== 'saved'
      ? 'Continue preparation'
      : 'Continue studying';
  button('continue-study').disabled = state.timerReady === false || working || !!state.endingLesson;
  button('home-new-session').hidden = chat?.kind !== 'lesson';
}
function readiness() {
  if (!settings) return '';
  return {
    not_started: 'Study with your tutor, or add sources to prepare a curriculum.',
    preparing: 'Preparing material. Open Study to follow the tutor\u2019s progress.',
    needs_input: 'Preparation needs your input. Open Study to continue.',
    ready: 'Your subject is ready to study.',
    error: 'Preparation needs attention. Open Study to retry or review the message.'
  }[settings.preparation];
}
function renderChat() {
  const cli = chat?.kind !== 'setup' || state?.terminalMode === 'tutor';
  $('cli-terminal').hidden = !cli;
  $('chat-messages').hidden = cli;
  $('chat-form').hidden = cli;
  if (term && state?.terminalMode) placeTerminal(state.terminalMode);
  if (renderedChatId !== (chat?.id || '')) {
    renderedChatId = chat?.id || '';
    chatKey = '';
    requestKey = '';
    $('chat-messages').replaceChildren();
  }
  const busy = chat?.status === 'busy',
    saving = chat?.status === 'saving' || !!state?.endingLesson;
  $('chat-heading').textContent = chat?.kind === 'setup' ? 'Prepare your subject' : 'Your tutor';
  $('chat-status').textContent = saving
    ? 'Saving your session...'
    : busy
      ? 'Tutor is responding...'
      : chat?.status === 'saved'
        ? 'Session saved. Reply to continue the conversation.'
        : chat?.status === 'error'
          ? 'Needs attention'
          : 'Ready for your next thought';
  button('end-lesson').hidden = !chat || chat.status === 'saved';
  button('end-lesson').disabled = saving;
  button('end-lesson').textContent = saving
    ? 'Saving...'
    : chat?.saveError
      ? 'Retry saving'
      : 'Finish session';
  button('new-session').disabled = saving || working;
  button('change-mode').hidden = state?.subject !== 'Finnish' || chat?.kind === 'setup';
  $('lesson-modes').hidden =
    !modeExpanded || state?.subject !== 'Finnish' || chat?.kind === 'setup';
  button('change-mode').setAttribute('aria-expanded', String(modeExpanded));
  button('chat-send').disabled =
    !chat ||
    saving ||
    busy ||
    working ||
    !!chat.saveError ||
    (chat.kind === 'setup' && chat.status === 'saved');
  $('setup-ready').hidden = chat?.kind !== 'setup' || chat.status !== 'saved';
  if (cli) {
    $('chat-heading').textContent = 'Codex CLI';
    $('chat-status').textContent = saving
      ? 'Saving your session...'
      : working
        ? 'Opening Codex CLI...'
        : state?.terminalMode === 'tutor'
          ? 'Choose models and permissions in Codex.'
          : chat?.status === 'saved'
            ? 'Session saved. Continue studying to reopen Codex.'
            : 'Continue studying to open Codex.';
    $('setup-ready').hidden = true;
  }
  button('stop-response').hidden = !busy || saving;
  const key = JSON.stringify(chat?.messages || []);
  if (chatKey !== key) {
    chatKey = key;
    const pane = $('chat-messages'),
      atEnd = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 100;
    const existing = new Map(
      [...pane.querySelectorAll<HTMLElement>('.chat-message')].map((node) => [
        node.dataset.id,
        node
      ])
    );
    if (chat?.messages.length) pane.querySelector('.chat-welcome')?.remove();
    for (const message of chat?.messages || []) {
      let article = existing.get(message.id);
      if (!article) {
        article = document.createElement('article');
        article.className = 'chat-message ' + message.role;
        article.dataset.id = message.id;
        const label = document.createElement('span');
        label.className = 'message-author';
        label.textContent = message.role === 'user' ? 'You' : 'Tutor';
        const body = document.createElement('div');
        body.className = 'markdown';
        article.append(label, body);
        pane.append(article);
      }
      if (article.dataset.text !== message.text) {
        article.querySelector('.markdown')!.innerHTML = markdown(message.text);
        article.dataset.text = message.text;
      }
    }
    if (!chat?.messages.length) {
      const empty = document.createElement('p');
      empty.className = 'chat-welcome';
      empty.textContent =
        state?.subject === 'Finnish'
          ? 'Choose a study mode to begin, or continue your conversation from Overview.'
          : 'Continue studying from Overview to begin a conversation.';
      pane.replaceChildren(empty);
    }
    if (atEnd) pane.scrollTop = pane.scrollHeight;
  }
  $('chat-error').hidden = !chat?.error;
  $('chat-error-text').textContent = chat?.error || '';
  button('chat-retry').textContent = chat?.saveError ? 'Retry saving' : 'Reconnect';
  const requests = JSON.stringify(chat?.requests || []);
  if (requestKey !== requests) {
    requestKey = requests;
    $('chat-requests').replaceChildren(
      ...(chat?.requests || []).map((request) => {
        const form = document.createElement('form'),
          label = document.createElement('p');
        label.textContent = request.message;
        form.append(label);
        if (request.kind === 'approval') {
          for (const allowed of [false, true]) {
            const choice = document.createElement('button');
            choice.type = 'button';
            choice.className = allowed ? 'secondary' : 'quiet';
            choice.textContent = allowed ? 'Allow once' : 'Decline';
            choice.onclick = () => {
              void task(() => window.study.answerChat(state!.subject, request.id, allowed));
            };
            form.append(choice);
          }
        } else {
          for (const question of request.questions || []) {
            const label = document.createElement('label');
            label.textContent = question.question;
            const input = document.createElement('input');
            input.name = question.id;
            input.type = question.isSecret ? 'password' : 'text';
            input.required = true;
            input.maxLength = 8000;
            label.append(input);
            form.append(label);
            if (question.options?.length) {
              const options = document.createElement('div');
              for (const option of question.options) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'quiet';
                button.textContent = option.label;
                button.title = option.description || '';
                button.onclick = () => {
                  input.value = option.label;
                };
                options.append(button);
              }
              form.append(options);
            }
          }
          const submit = document.createElement('button');
          submit.textContent = 'Submit';
          submit.className = 'secondary';
          form.append(submit);
          form.onsubmit = (event) => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(form)) as Record<string, string>;
            void task(() => window.study.answerChat(state!.subject, request.id, values));
          };
        }
        return form;
      })
    );
  }
  renderModes();
}
async function beginStudy(fresh = false, mode?: LessonMode) {
  if (!state || working) return;
  const subject = state.subject;
  await switchView('study');
  if (!fresh && !mode && chat?.kind === 'setup' && chat.status !== 'saved') {
    renderChat();
    return;
  }
  if (state.terminalMode === 'tutor' && !fresh && !mode) {
    term?.focus();
    return;
  }
  working = true;
  renderChat();
  try {
    ensureTerminal();
    placeTerminal('tutor');
    fit.fit();
    await window.study.terminal(
      'tutor',
      subject,
      term!.cols || 80,
      term!.rows || 24,
      mode,
      mode === 'text' ? textOptions() : undefined,
      fresh
    );
    await refresh();
  } finally {
    working = false;
    renderChat();
    renderHome();
  }
}
function textOptions(): TextOptions {
  const options = { level: select('text-level').value, words: Number(select('text-length').value) };
  validateTextOptions(options);
  return options;
}
async function startMode(mode: LessonMode) {
  selectedMode = mode;
  if (state?.terminalMode === 'tutor') {
    // shortcut: mode buttons paste into the CLI draft; use an empty prompt until native draft control is available.
    window.study.input(
      '\x1b[200~' + modeRequest(mode, mode === 'text' ? textOptions() : undefined) + '\x1b[201~\r'
    );
    term?.focus();
  } else await beginStudy(false, mode);
  modeExpanded = false;
  await refresh();
}
for (const level of textLevels) select('text-level').add(new Option(level, level));
for (const words of textLengths)
  select('text-length').add(new Option(`${words} words`, String(words)));
for (const mode of lessonModes) {
  const choice = document.createElement('button');
  choice.id = 'lesson-mode-' + mode.id;
  choice.type = 'button';
  choice.className = 'mode-choice';
  const title = document.createElement('strong');
  title.textContent = mode.label;
  const description = document.createElement('span');
  description.textContent = mode.description;
  choice.append(title, description);
  choice.onclick = () => {
    selectedMode = mode.id;
    renderModes();
    if (mode.id !== 'text') void task(() => startMode(mode.id));
  };
  $('mode-options').append(choice);
}
function renderModes() {
  $('generate-text-options').hidden = selectedMode !== 'text';
  const blocked = working || chat?.status === 'busy' || chat?.status === 'saving';
  for (const mode of lessonModes) {
    button('lesson-mode-' + mode.id).disabled = !!blocked;
    button('lesson-mode-' + mode.id).setAttribute('aria-pressed', String(selectedMode === mode.id));
  }
  button('generate-text-submit').disabled = !!blocked;
}
$('generate-text-options').onsubmit = (event) => {
  event.preventDefault();
  void task(() => startMode('text'));
};
button('change-mode').onclick = () => {
  modeExpanded = !modeExpanded;
  renderChat();
};
$('chat-form').onsubmit = (event) => {
  event.preventDefault();
  if (!state || button('chat-send').disabled) return;
  const input = $<HTMLTextAreaElement>('chat-input'),
    text = input.value,
    subject = state.subject;
  if (!text.trim()) return;
  input.value = '';
  localStorage.removeItem('chat-draft:' + subject);
  void task(async () => {
    try {
      await window.study.sendChat(subject, text);
    } catch (e) {
      if (state?.subject === subject && !input.value) {
        input.value = text;
        localStorage.setItem('chat-draft:' + subject, text);
      }
      throw e;
    } finally {
      await refresh();
    }
  });
};
$<HTMLTextAreaElement>('chat-input').oninput = () => {
  if (state)
    localStorage.setItem('chat-draft:' + state.subject, $<HTMLTextAreaElement>('chat-input').value);
};
$('chat-input').onkeydown = (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $<HTMLFormElement>('chat-form').requestSubmit();
  }
};
button('stop-response').onclick = () => {
  if (state) void task(() => window.study.interruptChat(state!.subject));
};
async function finish() {
  try {
    await window.study.endLesson();
    $('error').hidden = true;
  } catch (e) {
    await refresh();
    if (!chat?.error) error(e);
    return;
  }
  await refresh();
}
button('end-lesson').onclick = () => {
  void task(finish);
};
button('chat-retry').onclick = () => {
  void task(async () => {
    if (chat?.saveError) await finish();
    else if (chat?.kind === 'setup') await window.study.generateMaterial(state!.subject, 80, 24);
    else await beginStudy();
    await refresh();
  });
};
function setNotebook(open: boolean) {
  notebookOpen = open;
  $('study-view').classList.toggle('notebook-closed', !open);
  document.querySelector<HTMLElement>('.notes-pane')!.hidden = !open;
  $('divider').hidden = !open;
  button('toggle-notebook').setAttribute('aria-pressed', String(open));
}
button('toggle-notebook').onclick = () => {
  setNotebook(!notebookOpen);
  localStorage.setItem('notebook-open', String(notebookOpen));
};
async function switchView(next: string) {
  view = next;
  for (const [name, id] of [
    ['home', 'home'],
    ['study', 'study'],
    ['quiz', 'quiz'],
    ['dashboard', 'dashboard'],
    ['sources', 'sources'],
    ['tools', 'tools']
  ]) {
    $(id + '-view').hidden = next !== name;
    button(id + '-tab').classList.toggle('selected', next === name);
    button(id + '-tab').setAttribute('aria-pressed', String(next === name));
  }
  if (next === 'sources') await loadSources();
  if (next === 'dashboard') await loadDashboard();
  if (next === 'quiz') {
    await loadMaterials();
    await Promise.all([quizUI.activate(), practiceUI.activate()]);
  }
  if (next === 'tools' || next === 'study')
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {}
    });
}
async function loadMaterials() {
  if (!state) return;
  const subject = state.subject,
    items = await window.study.materials(subject);
  if (state.subject !== subject) return;
  materials = items;
  const key = subject + JSON.stringify(items);
  if (key !== materialKey) {
    materialKey = key;
    setOptions(
      select('practice-material'),
      [
        { label: 'Choose a topic or lesson note...', value: '' },
        ...items.map((item) => ({
          label: `${item.kind === 'topic' ? 'Topic' : 'Lesson'} - ${item.kind === 'lesson' ? lessonTitle(item.title) : item.title}`,
          value: item.path
        }))
      ],
      practicePath
    );
  }
  updatePractice();
}
function updatePractice() {
  if (!state) return;
  const selected = materials.find((item) => item.path === practicePath);
  const snapshot = {
    ...state,
    notebookPath: state.notePath,
    notePath: selected ? practicePath : null
  };
  practiceUI.update(snapshot);
  quizUI.update(snapshot);
  $('practice-activities').hidden = !selected;
  $('quiz-section').hidden = !selected;
  $('flashcards-panel').hidden =
    !selected || button('writing-mode').getAttribute('aria-pressed') === 'true';
  $('writing-panel').hidden =
    !selected || button('writing-mode').getAttribute('aria-pressed') !== 'true';
  $('practice-material-help').textContent = selected
    ? `Using: ${selected.title}. Choose an activity below.`
    : 'Choose a topic or lesson note here. Your notebook selection stays unchanged.';
}
select('practice-material').onchange = () => {
  practicePath = select('practice-material').value;
  updatePractice();
  void task(async () => {
    if (practicePath) {
      const subject = state!.subject,
        relative = practicePath;
      const text = await window.study.material(subject, relative);
      if (state?.subject === subject && practicePath === relative) {
        $('practice-material-help').textContent =
          'Selected: ' + materials.find((item) => item.path === relative)?.title;
      }
    }
    await practiceUI.activate();
  });
};
const subjectDialog = $<HTMLDialogElement>('subject-dialog');
button('add-subject').onclick = () => {
  $('subject-error').textContent = '';
  $<HTMLInputElement>('subject-name').value = '';
  select('subject-type').value = 'general';
  subjectDialog.showModal();
};
let typeChosen = false;
select('subject-type').onchange = () => {
  typeChosen = true;
};
$<HTMLInputElement>('subject-name').oninput = () => {
  if (typeChosen) return;
  const value = $<HTMLInputElement>('subject-name').value;
  select('subject-type').value =
    /finnish|english|spanish|french|german|swedish|japanese|language|italian|korean|chinese|arabic/i.test(
      value
    )
      ? 'language'
      : /react|programming|javascript|typescript|python|software|coding|rust|java|c\+\+/i.test(
            value
          )
        ? 'software-engineering'
        : 'general';
};
subjectDialog.addEventListener('close', () => {
  typeChosen = false;
});
button('cancel-subject').onclick = () => subjectDialog.close();
$('subject-form').onsubmit = (event) => {
  event.preventDefault();
  void (async () => {
    button('create-subject').disabled = true;
    try {
      const subject = await window.study.createSubject(
        $<HTMLInputElement>('subject-name').value,
        select('subject-type').value as TutorType
      );
      setupSubject = subject;
      subjectDialog.close();
      await refresh();
      await switchView('sources');
    } catch (e) {
      $('subject-error').textContent =
        e instanceof Error
          ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
          : String(e);
    } finally {
      button('create-subject').disabled = false;
    }
  })();
};
function updateSourceControls() {
  const blocked = sourceWorking || !state?.subject;
  button('import-sources').disabled = blocked;
  button('add-source-url').disabled = blocked;
  button('generate-material').disabled =
    blocked || !sourceCount || chat?.status === 'busy' || chat?.status === 'saving';
  button('generate-material').textContent =
    settings?.preparation === 'needs_input'
      ? 'Continue preparation'
      : settings?.preparation === 'ready'
        ? 'Prepare updated material'
        : 'Prepare study material';
  $('preparation-status').textContent = readiness();
  $('setup-step').textContent =
    setupSubject === state?.subject ? 'STEP 2 OF 3 ? ADD SOURCES OR SKIP' : 'SUBJECT SOURCES';
  if (settings) select('source-tutor-type').value = settings.tutorType;
  select('source-tutor-type').disabled = blocked || (!!chat && chat.status !== 'saved');
}
async function loadSources() {
  if (!state) return;
  const subject = state.subject;
  $('sources-subject').textContent = subject;
  const sources = await window.study.sources(subject);
  if (state.subject !== subject) return;
  sourceCount = sources.length;
  $('source-list').replaceChildren(
    ...sources.map((source) => {
      const row = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = source.url || source.name;
      const kind = document.createElement('span');
      kind.className = 'subtle';
      kind.textContent = source.kind === 'url' ? 'Website' : 'File';
      row.append(name, kind);
      return row;
    })
  );
  $('sources-status').textContent = sources.length
    ? `${sources.length} source${sources.length === 1 ? '' : 's'} added.`
    : 'Sources are optional. Add files or links, or study directly with your tutor.';
  updateSourceControls();
}
async function sourceAction(work: () => Promise<void>) {
  if (sourceWorking) return;
  sourceWorking = true;
  updateSourceControls();
  try {
    await work();
  } catch (e) {
    error(e);
  } finally {
    sourceWorking = false;
    await refresh();
    if (view === 'sources') await task(loadSources);
    updateSourceControls();
  }
}
button('import-sources').onclick = () => {
  if (state) {
    const subject = state.subject;
    void sourceAction(() => window.study.importSources(subject));
  }
};
$('source-url-form').onsubmit = (event) => {
  event.preventDefault();
  if (!state) return;
  const subject = state.subject,
    input = $<HTMLInputElement>('source-url'),
    url = input.value;
  void sourceAction(async () => {
    await window.study.addSourceURL(subject, url);
    if (state?.subject === subject && input.value === url) input.value = '';
  });
};
select('source-tutor-type').onchange = () => {
  void task(async () => {
    await window.study.setTutorType(state!.subject, select('source-tutor-type').value as TutorType);
    await refresh();
  });
};
button('generate-material').onclick = () => {
  if (!state) return;
  const subject = state.subject;
  void sourceAction(async () => {
    await switchView('study');
    if (chat?.kind === 'setup' && settings?.preparation === 'needs_input') return;
    await window.study.generateMaterial(subject, 80, 24);
  });
};
button('skip-sources').onclick = () => {
  setupSubject = '';
  void task(() => beginStudy());
};
button('continue-study').onclick = () => {
  void task(() => beginStudy());
};
button('setup-start-study').onclick = () => {
  setupSubject = '';
  void task(() => beginStudy());
};
button('home-new-session').onclick = button('new-session').onclick = () => {
  void task(() => beginStudy(true));
};
button('home-practice').onclick = () => {
  void task(() => switchView('quiz'));
};
button('home-sources').onclick = () => {
  void task(() => switchView('sources'));
};
async function loadDashboard() {
  if (!state || dashboardBusy) return;
  dashboardBusy = true;
  const subject = state.subject;
  try {
    const result = await window.study.dashboard(subject);
    if (state?.subject !== subject) return;
    dashboard = result;
    topicSubject = subject;
    renderDashboard();
  } catch (e) {
    error(e);
  } finally {
    dashboardBusy = false;
    if (state && state.subject !== subject && view === 'dashboard') void loadDashboard();
  }
}
function renderDashboard() {
  if (!dashboard || !state || topicSubject !== state.subject) return;
  const reached = dashboard.topics.filter((t) => t.reached).length;
  $('next-task').textContent = dashboard.nextTask || '';
  button('next-task-start').textContent = /Continue writing:|due flashcards/.test(
    dashboard.nextTask || ''
  )
    ? 'Choose practice material'
    : 'Open tutor';
  $('skill-profile').innerHTML = dashboard.skillProfile
    ? DOMPurify.sanitize(marked.parse(dashboard.skillProfile, { async: false }) as string, {
        FORBID_TAGS: ['img', 'iframe', 'form', 'style', 'video', 'audio'],
        FORBID_ATTR: ['style']
      })
    : '<p>Unassessed: no skill profile recorded for this subject. Ask the tutor to collect an independent sample.</p>';
  $('coverage-stat').textContent = `${reached} / ${dashboard.topics.length}`;
  $('coverage-fill').style.width =
    `${dashboard.topics.length ? (reached / dashboard.topics.length) * 100 : 0}%`;
  $('hours-stat').textContent = `${(dashboard.totalSeconds / 3600).toFixed(2)} h`;
  const today = helsinkiDay();
  const utcDay = new Date(today + 'T12:00:00Z');
  const monday = new Date(utcDay);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  let weekSeconds = 0;
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setUTCDate(day.getUTCDate() + i);
    weekSeconds += Number(dashboard.days[day.toISOString().slice(0, 10)] || 0);
  }
  $('week-stat').textContent = `${(weekSeconds / 3600).toFixed(1)} h`;
  const currentYear = Number(today.slice(0, 4));
  const years = new Set([
    currentYear,
    ...Object.keys(dashboard.days).map((k) => Number(k.slice(0, 4)))
  ]);
  const yearValue = Number(select('heatmap-year').value) || currentYear;
  setOptions(
    select('heatmap-year'),
    [...years].sort((a, b) => b - a).map((y) => ({ label: String(y), value: String(y) })),
    String(yearValue)
  );
  renderHeatmap();
  renderTopics();
  $('undated-note').textContent =
    dashboard.undatedSeconds > 60
      ? `${(dashboard.undatedSeconds / 3600).toFixed(2)} h of saved time has no dated breakdown. It remains in your total.`
      : 'Only actual timed intervals appear here. Blank days mean no recorded time.';
}
function renderHeatmap() {
  if (!dashboard) return;
  const year = Number(select('heatmap-year').value);
  $('active-year').textContent = `Calendar year ${year}`;
  $('days-stat').textContent = String(
    Object.entries(dashboard.days).filter(
      ([key, value]) => key.startsWith(`${year}-`) && Number(value) > 0
    ).length
  );
  const first = new Date(Date.UTC(year, 0, 1, 12));
  const begin = new Date(first);
  begin.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const last = new Date(Date.UTC(year, 11, 31, 12));
  const cells: HTMLElement[] = [],
    months: HTMLElement[] = [];
  const today = helsinkiDay();
  for (let date = new Date(begin); date <= last; date.setUTCDate(date.getUTCDate() + 1)) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'heat-cell';
    const key = date.toISOString().slice(0, 10);
    if (date < first) {
      const blank = document.createElement('span');
      cells.push(blank);
      continue;
    }
    const value = Number(dashboard.days[key] || 0);
    const level = value >= 3600 ? 4 : value >= 1800 ? 3 : value >= 900 ? 2 : value > 0 ? 1 : 0;
    cell.classList.add(`level${level}`);
    if (key > today) cell.classList.add('future');
    if (key === today) cell.classList.add('today');
    const description = `${key} · ${key > today ? 'Future day' : value > 0 ? `${(value / 60).toFixed(1)} minutes studied` : 'No recorded study time'}`;
    cell.title = description;
    cell.setAttribute('aria-label', description);
    cell.onclick = () => {
      $('status-message').textContent = description;
    };
    cells.push(cell);
    if (date.getUTCDate() === 1) {
      const label = document.createElement('span');
      label.textContent = date.toLocaleString('en', { month: 'short', timeZone: 'UTC' });
      label.style.gridColumn = `${Math.floor((date.getTime() - begin.getTime()) / 86400000 / 7) + 1} / span 3`;
      label.style.gridRow = '1';
      months.push(label);
    }
  }
  $('heatmap').replaceChildren(...cells);
  $('heatmap-months').replaceChildren(...months);
}
function renderTopics() {
  if (!dashboard) return;
  const filter = select('topic-filter').value;
  const groups = new Map<string, typeof dashboard.topics>();
  for (const topic of dashboard.topics) {
    if ((filter === 'reached' && !topic.reached) || (filter === 'ahead' && topic.reached)) continue;
    const group = groups.get(topic.section) || [];
    group.push(topic);
    groups.set(topic.section, group);
  }
  const elements: HTMLElement[] = [];
  for (const [name, topics] of groups) {
    const group = document.createElement('div');
    group.className = 'topic-group';
    const heading = document.createElement('h4');
    heading.textContent = name;
    group.append(heading);
    for (const topic of topics) {
      const row = document.createElement('div');
      row.className = `topic-row ${topic.reached ? 'reached' : 'ahead'}`;
      const check = document.createElement('span');
      check.className = 'topic-check';
      check.textContent = topic.reached ? '✓' : '';
      check.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = topic.name;
      const badge = document.createElement('span');
      badge.className = 'topic-badge';
      badge.textContent = topic.reached ? 'Reached' : 'Still ahead';
      row.append(check, label, badge);
      group.append(row);
    }
    elements.push(group);
  }
  if (!elements.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No topics in this filter.';
    empty.className = 'subtle';
    elements.push(empty);
  }
  $('topic-list').replaceChildren(...elements);
}

button('dismiss-error').onclick = () => {
  $('error').hidden = true;
};
function setSidebar(hidden: boolean) {
  document.querySelector('.app')!.classList.toggle('sidebar-hidden', hidden);
  $('sidebar').hidden = hidden;
  button('sidebar-toggle').setAttribute('aria-expanded', String(!hidden));
  button('sidebar-toggle').setAttribute('aria-label', hidden ? 'Show sidebar' : 'Hide sidebar');
  localStorage.setItem('sidebar-hidden', String(hidden));
}
setSidebar(localStorage.getItem('sidebar-hidden') === 'true');
button('sidebar-toggle').onclick = () => setSidebar(!$('sidebar').hidden);
async function timer(action: TimerAction) {
  if (!state) return;
  try {
    await window.study.timer(action, state.subject);
    await refresh();
  } catch (e) {
    error(e);
  }
}
button('timer-toggle').onclick = () => {
  void timer(state?.session && !state.session.stoppedUtc ? 'stop' : 'start');
};
button('timer-reset').onclick = () => {
  void timer('reset');
};
select('subject').onchange = () => {
  const name = select('subject').value;
  void switchView('home');
  void task(async () => {
    try {
      await window.study.timer('select', name);
    } finally {
      await refresh();
    }
  });
};
for (const [id, next] of [
  ['home', 'home'],
  ['study', 'study'],
  ['quiz', 'quiz'],
  ['dashboard', 'dashboard'],
  ['sources', 'sources'],
  ['tools', 'tools']
])
  button(id + '-tab').onclick = () => {
    void task(async () => {
      await switchView(next);
      if (next === 'study') {
        await beginStudy();
      }
    });
  };
button('next-task-start').onclick = () => {
  void task(async () => {
    if (/Continue writing:|due flashcards/.test(dashboard?.nextTask || ''))
      await switchView('quiz');
    else await beginStudy();
  });
};
button('open-code').onclick = () => {
  if (state)
    void task(() =>
      window.study.openCode(select('code-target').value as 'workspace' | 'subject', state!.subject)
    );
};
button('open-note-file').onclick = () => {
  if (state) void task(() => window.study.openNotes(state!.subject));
};
button('note-recall').onclick = () => {
  if (!state?.notePath) return;
  const { subject, notePath } = state;
  void task(async () => {
    await switchView('quiz');
    practicePath = notePath;
    select('practice-material').value = notePath;
    updatePractice();
    await practiceUI.recallNote(subject, notePath);
  });
};
select('note-select').onchange = () => {
  if (state && select('note-select').value)
    void task(async () =>
      render(await window.study.notes(state!.subject, select('note-select').value))
    );
};
select('heatmap-year').onchange = renderHeatmap;
select('topic-filter').onchange = renderTopics;
for (const id of ['notes-content', 'skill-profile', 'chat-messages'])
  $(id).addEventListener('click', (event) => {
    if ((event.target as Element).closest('a')) event.preventDefault();
  });
const divider = $('divider');
let paneWidth = Number(localStorage.getItem('terminal-width')) || 65;
function setPaneWidth(value: number) {
  paneWidth = Math.max(30, Math.min(70, value));
  document.documentElement.style.setProperty('--terminal-width', `${paneWidth}%`);
  divider.setAttribute('aria-valuenow', String(Math.round(paneWidth)));
}
setPaneWidth(paneWidth);
divider.onpointerdown = (event) => {
  divider.setPointerCapture(event.pointerId);
  document.body.classList.add('resizing');
};
divider.onpointermove = (event) => {
  if (!divider.hasPointerCapture(event.pointerId)) return;
  const rect = $('study-view').getBoundingClientRect();
  setPaneWidth(((event.clientX - rect.left) / rect.width) * 100);
};
divider.onpointerup = (event) => {
  divider.releasePointerCapture(event.pointerId);
  document.body.classList.remove('resizing');
  localStorage.setItem('terminal-width', String(paneWidth));
};
divider.onkeydown = (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    setPaneWidth(paneWidth + (event.key === 'ArrowRight' ? 2 : -2));
    localStorage.setItem('terminal-width', String(paneWidth));
  }
};
function ensureTerminal() {
  if (term) return;
  term = new Terminal({
    screenReaderMode: true,
    cursorBlink: true,
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: 12,
    scrollback: 2500,
    theme: { background: '#202729', foreground: '#e4e9e7' }
  });
  term.loadAddon(fit);
  term.open($('terminal'));
  term.onData((data) => window.study.input(data));
  term.onResize(({ cols, rows }) => window.study.resize(cols, rows));
}
function placeTerminal(mode: TerminalMode) {
  const container = $(mode === 'tutor' ? 'cli-terminal' : 'shell-terminal');
  if ($('terminal').parentElement !== container) container.append($('terminal'));
  $('terminal').hidden = false;
  requestAnimationFrame(() => {
    try {
      fit.fit();
    } catch {}
  });
}
button('open-shell').onclick = () => {
  if (state)
    void task(async () => {
      ensureTerminal();
      placeTerminal(select('shell-select').value as TerminalMode);
      requestAnimationFrame(() => fit.fit());
      await window.study.terminal(
        select('shell-select').value as TerminalMode,
        state!.subject,
        term!.cols || 80,
        term!.rows || 24
      );
    });
};
button('close-shell').onclick = () => {
  void task(async () => {
    await window.study.closeShell();
    $('terminal').hidden = true;
  });
};
window.study.onTerminal((event) => {
  if (event.kind === 'data') {
    ensureTerminal();
    $('terminal').hidden = false;
    term!.write(event.data, () => window.study.acknowledge(event.data.length));
  } else {
    $('terminal-status').textContent = event.data;
    if (event.kind === 'status' && ['Codex CLI', 'PowerShell', 'Git Bash'].includes(event.data)) {
      ensureTerminal();
      term!.reset();
      placeTerminal(
        event.data === 'Codex CLI' ? 'tutor' : event.data === 'Git Bash' ? 'bash' : 'powershell'
      );
      term!.focus();
    }
  }
});
new ResizeObserver(() => {
  if ((view === 'tools' || view === 'study') && term) {
    try {
      fit.fit();
    } catch {}
  }
}).observe($('tools-view'));
new ResizeObserver(() => {
  if (view === 'study' && term) {
    try {
      fit.fit();
    } catch {}
  }
}).observe($('cli-terminal'));
window.study.onChange(() => {
  void refresh();
});
setInterval(renderTimer, 250);
setInterval(() => {
  if (view === 'dashboard') void loadDashboard();
}, 15000);
ensureTerminal();
placeTerminal('tutor');
void switchView('study');
void refresh().then(() => window.study.ready());
