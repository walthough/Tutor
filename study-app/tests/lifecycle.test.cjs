const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('esbuild');

async function lifecycle({
  tutor = false,
  native = false,
  timerFails = false,
  saveFails = false
} = {}) {
  const source = await fs.readFile(path.join(__dirname, '../src/main.ts'), 'utf8');
  const result = await build({
    stdin: {
      contents:
        source +
        `
    export { shutdown };
    export function setup(fakes) {
      win = fakes.win; terminal = fakes.terminal; bridge = fakes.bridge;
      terminalMode = fakes.native ? 'tutor' : fakes.tutor ? 'powershell' : null; chat.finish = fakes.save; chat.close = async () => {};
      if (fakes.native) terminal.onExit(() => { terminal = null; terminalMode = null; });
      store.active = async () => 'Finnish';
      ticker = setInterval(() => {}, 2000); stopWatching = fakes.stopWatching;
    }
    export function answerTimer(failed) {
      for (const [id, task] of pending) { pending.delete(id); clearTimeout(task.timeout); failed ? task.reject(new Error('Timer offline')) : task.resolve(); }
    }
  `,
      resolveDir: path.join(__dirname, '../src'),
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron', 'node-pty'],
    write: false
  });
  const calls = { killed: 0, destroyed: 0, stopped: 0, cleared: 0, messages: [], prompts: [] };
  let response = 0,
    rejectSave = saveFails;
  const electron = {
    app: { setPath() {}, requestSingleInstanceLock: () => false, quit() {} },
    dialog: {
      showErrorBox: (title, message) => calls.prompts.push(title + ': ' + message),
      showMessageBox: async (_win, options) => {
        calls.prompts.push(options.message);
        return { response };
      }
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: (name) => (name === 'electron' ? electron : require(name)),
    __dirname: path.join(__dirname, '../dist'),
    process,
    performance,
    console,
    setInterval: () => ({}),
    clearInterval: () => calls.cleared++,
    setTimeout: () => ({}),
    clearTimeout() {}
  });
  const api = module.exports;
  const exits = new Set();
  api.setup({
    tutor,
    native,
    save: async () => {
      calls.messages.push('save');
      if (rejectSave) throw new Error('Save not confirmed');
    },
    stopWatching: () => calls.stopped++,
    win: { isDestroyed: () => false, destroy: () => calls.destroyed++, webContents: { send() {} } },
    terminal: {
      kill: () => {
        calls.killed++;
        if (native) {
          calls.messages.push('cli-stopped');
          for (const handler of exits) handler({ exitCode: 0 });
        }
      },
      write: (text) => calls.messages.push(text),
      onExit: (handler) => {
        exits.add(handler);
        return { dispose: () => exits.delete(handler) };
      }
    },
    bridge: {
      exitCode: null,
      stdin: { writable: true, write: () => api.answerTimer(timerFails), end() {} }
    }
  });
  return {
    api,
    calls,
    respond: (value) => {
      response = value;
    },
    retrySave: () => {
      rejectSave = false;
    }
  };
}

test('window close keeps the session alive on failed saving and closes automatically after retry succeeds', async () => {
  const { api, calls, retrySave } = await lifecycle({ tutor: true, saveFails: true });
  await api.shutdown();
  assert.equal(calls.killed, 0);
  assert.equal(calls.destroyed, 0);
  assert.equal(calls.messages.length, 1);
  assert.match(calls.prompts[0], /Save not confirmed/);
  assert.equal(calls.cleared, 0);
  assert.equal(calls.stopped, 0);
  retrySave();
  await api.shutdown();
  assert.equal(calls.killed, 1);
  assert.equal(calls.destroyed, 1);
  assert.equal(calls.cleared, 1);
  assert.equal(calls.stopped, 1);
});

test('closing the native CLI stops its process before saving and retains the app on failed save', async () => {
  const { api, calls, retrySave } = await lifecycle({ native: true, saveFails: true });
  await api.shutdown();
  assert.deepEqual(calls.messages, ['cli-stopped', 'save']);
  assert.equal(calls.killed, 1);
  assert.equal(calls.destroyed, 0);
  assert.equal(calls.stopped, 0);
  retrySave();
  await api.shutdown();
  assert.deepEqual(calls.messages, ['cli-stopped', 'save', 'save']);
  assert.equal(calls.killed, 1);
  assert.equal(calls.destroyed, 1);
});

test('keeping the app open after a timer failure retains refresh and checkpoint scheduling', async () => {
  const { api, calls } = await lifecycle({ timerFails: true });
  await api.shutdown();
  assert.match(calls.prompts[0], /Could not confirm/);
  assert.equal(calls.destroyed, 0);
  assert.equal(calls.killed, 0);
  assert.equal(calls.cleared, 0);
  assert.equal(calls.stopped, 0);
});
