const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { build } = require('esbuild');
const { fixture, cleanup } = require('./fixture.cjs');

async function setup() {
  const root = await fixture();
  await build({
    stdin: {
      contents:
        "export {ChatService, verifySave, CodexChatConnection} from './chat'; export {StudyStore} from './data'; export {SourceLibrary} from './sources';",
      resolveDir: path.join(__dirname, '../src'),
      loader: 'ts'
    },
    outfile: path.join(root, 'chat.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs'
  });
  const { ChatService, StudyStore, SourceLibrary, verifySave } = require(
    path.join(root, 'chat.cjs')
  );
  const store = new StudyStore(root),
    sources = new SourceLibrary(store),
    calls = [];
  let emit,
    count = 0,
    saveFails = false,
    injectionFails = false,
    paused = false,
    ask = false,
    pending;
  const factory = async (callback) => {
    emit = callback;
    return {
      async request(method, params) {
        calls.push({ method, params });
        if (method === 'thread/inject_items' && injectionFails)
          throw new Error('Session preparation failed');
        if (method.startsWith('thread/'))
          return { thread: { id: params.threadId || 'thread-' + ++count } };
        if (method === 'turn/interrupt') {
          setImmediate(() =>
            emit({
              method: 'turn/completed',
              params: {
                threadId: pending.threadId,
                turn: { id: pending.id, status: 'interrupted', items: [] }
              }
            })
          );
          return {};
        }
        if (method === 'turn/start') {
          const id = 'turn-' + ++count,
            text = params.input[0].text;
          pending = { threadId: params.threadId, id };
          const saving = !!params.outputSchema?.properties.saveId;
          let response = 'A useful explanation with **an example**.';
          if (saving) {
            const saveId = JSON.parse(text.match(/saveId must be ("[^"]+")/)[1]);
            response = JSON.stringify({
              saveId: saveFails ? 'wrong-id' : saveId,
              subject: JSON.parse(text.match(/subject must be ("[^"]+")/)[1]),
              assessedProgressSaved: true,
              notesSaved: true,
              noChanges: true,
              files: []
            });
          } else if (params.outputSchema)
            response = JSON.stringify({
              status: 'needs_input',
              message: 'Please verify these source mappings.'
            });
          setImmediate(() => {
            emit({ method: 'turn/started', params: { threadId: params.threadId, turn: { id } } });
            if (paused && !saving) return;
            if (ask && !saving) {
              emit({
                id: 87,
                method: 'item/tool/requestUserInput',
                params: {
                  threadId: params.threadId,
                  questions: [{ id: 'goal', question: 'Your goal?' }]
                }
              });
              return;
            }
            emit({
              method: 'item/agentMessage/delta',
              params: { threadId: params.threadId, itemId: id + '-answer', delta: response }
            });
            emit({
              method: 'item/completed',
              params: {
                threadId: params.threadId,
                item: { id: id + '-answer', type: 'agentMessage', text: response }
              }
            });
            emit({
              method: 'turn/completed',
              params: {
                threadId: params.threadId,
                turn: {
                  id,
                  status: 'completed',
                  items: [{ id: id + '-answer', type: 'agentMessage', text: response }]
                }
              }
            });
          });
          return { turn: { id } };
        }
        return {};
      },
      respond(id, result) {
        calls.push({ method: 'response', id, result });
        setImmediate(() =>
          emit({
            method: 'turn/completed',
            params: {
              threadId: pending.threadId,
              turn: { id: pending.id, status: 'completed', items: [] }
            }
          })
        );
      },
      close() {
        calls.push({ method: 'close' });
      }
    };
  };
  return {
    root,
    store,
    sources,
    verifySave,
    ChatService,
    calls,
    factory,
    service: new ChatService(store, sources, factory, () => {}),
    make: () => new ChatService(store, sources, factory, () => {}),
    failSave: (value) => {
      saveFails = value;
    },
    failInjection: (value) => {
      injectionFails = value;
    },
    pause: (value) => {
      paused = value;
    },
    ask: (value) => {
      ask = value;
    }
  };
}
test('chat streams, persists and resumes the same per-subject conversation; verified finish can be retried', async () => {
  const x = await setup();
  try {
    const before = await x.store.snapshot(null);
    await x.service.start('Finnish', false, 'lesson', 'grammar');
    let view = await x.service.view('Finnish');
    assert.equal(view.status, 'idle');
    assert.match(view.messages[0].text, /useful explanation/);
    assert.ok(
      x.calls
        .find((call) => call.method === 'turn/start')
        .params.input[0].text.includes('tutor-language/SKILL.md')
    );
    await x.service.send('Finnish', 'Minä opin suomea.');
    view = await x.service.view('Finnish');
    assert.equal(view.messages.filter((message) => message.role === 'user').length, 1);
    x.failSave(true);
    await assert.rejects(x.service.finish(), /not confirmed/);
    assert.equal((await x.service.view('Finnish')).saveError, true);
    assert.equal(x.service.activeSubject, 'Finnish');
    x.failSave(false);
    await x.service.finish();
    assert.equal((await x.service.view('Finnish')).status, 'saved');
    const resumed = x.make();
    await resumed.start('Finnish');
    assert.deepEqual((await resumed.view('Finnish')).messages, view.messages);
    await resumed.send('Finnish', 'Continue from here.');
    assert.equal(x.calls.filter((call) => call.method === 'thread/resume').length, 1);
    assert.ok(
      x.calls
        .find((call) => call.method === 'thread/resume')
        .params.developerInstructions.includes('tutor-language/SKILL.md')
    );
    assert.equal(await resumed.view('React'), null);
    await resumed.finish();
    await resumed.start('Finnish', false, 'lesson', 'vocabulary');
    assert.ok(
      x.calls
        .findLast((call) => call.method === 'turn/start')
        .params.input[0].text.includes('I choose Vocabulary review.')
    );
    await resumed.finish();
    await resumed.start('React');
    assert.ok(
      x.calls
        .findLast((call) => call.method === 'turn/start')
        .params.input[0].text.includes('tutor-software-engineering/SKILL.md')
    );
    await resumed.finish();
    await resumed.close();
    assert.deepEqual((await x.store.snapshot(null)).session, before.session);
  } finally {
    await x.service.close();
    await cleanup(x.root);
  }
});
test('CLI handoff resumes the same subject and notebook, detaches the connection, and still verifies saving', async () => {
  const x = await setup();
  try {
    const timer = (await x.store.snapshot(null)).session;
    const session = await x.service.startCLI('Finnish', false, 'grammar');
    assert.equal(
      x.calls.filter((call) => call.method === 'turn/start').length,
      0,
      'Opening the terminal must not wait for a model response'
    );
    const opening = x.calls.find((call) => call.method === 'thread/start');
    assert.equal(opening.params.approvalPolicy, 'never');
    assert.equal(opening.params.sandbox, 'danger-full-access');
    assert.equal(opening.params.model, undefined);
    assert.ok(session.prompt.includes('tutor-language/SKILL.md'));
    assert.equal(x.calls.at(-1).method, 'close');
    assert.equal((await x.service.view('Finnish')).notePath, session.notePath);
    await assert.rejects(x.service.startCLI('React'), /Finish your current session/);
    await x.service.finish();
    const saves = x.calls.filter(
      (call) => call.method === 'turn/start' && call.params.outputSchema?.properties.saveId
    );
    assert.equal(saves[0].params.threadId, session.threadId);
    assert.equal((await x.service.view('Finnish')).status, 'saved');
    const connections = x.calls.filter((call) => call.method.startsWith('thread/')).length;
    const resumed = await x.service.startCLI('Finnish');
    assert.equal(
      x.calls.filter((call) => call.method.startsWith('thread/')).length,
      connections,
      'Reopening a saved CLI must not start another app-server'
    );
    assert.equal(resumed.threadId, session.threadId);
    assert.equal(resumed.notePath, session.notePath);
    assert.equal(resumed.prompt, undefined);
    await x.service.finish();
    assert.equal(
      x.calls.filter(
        (call) => call.method === 'turn/start' && call.params.outputSchema?.properties.saveId
      ).length,
      2
    );
    const fresh = await x.service.startCLI('Finnish', true);
    assert.notEqual(fresh.threadId, session.threadId);
    assert.notEqual(fresh.notePath, session.notePath);
    assert.ok(await x.store.safeNote('Finnish', session.notePath));
    assert.deepEqual((await x.store.snapshot(null)).session, timer);
    await x.service.finish();
  } finally {
    await x.service.close();
    await cleanup(x.root);
  }
});

test('failed CLI preparation can retry after reopening without losing the notebook', async () => {
  const x = await setup();
  let reopened;
  try {
    x.failInjection(true);
    await assert.rejects(x.service.startCLI('Finnish'), /Session preparation failed/);
    const notePath = (await x.service.view('Finnish')).notePath;
    await x.service.close();
    x.failInjection(false);
    reopened = x.make();
    const session = await reopened.startCLI('Finnish');
    assert.equal(session.notePath, notePath);
    assert.equal(x.calls.filter((call) => call.method === 'thread/start').length, 2);
    assert.equal(x.calls.filter((call) => call.method === 'turn/start').length, 0);
    await reopened.finish();
  } finally {
    await reopened?.close();
    await x.service.close();
    await cleanup(x.root);
  }
});

test('save verification rejects stale receipts, incorrect hashes, cross-subject files and traversal', async () => {
  const x = await setup();
  try {
    const relative = 'StudyVault/Finnish/00-Dashboard/Curriculum Coverage.md';
    const bytes = await fs.readFile(path.join(x.root, relative));
    const receipt = {
      saveId: 'save-1',
      subject: 'Finnish',
      assessedProgressSaved: true,
      notesSaved: true,
      noChanges: false,
      files: [{ path: relative, sha256: createHash('sha256').update(bytes).digest('hex') }]
    };
    await x.verifySave(x.store, 'Finnish', 'save-1', receipt);
    await assert.rejects(x.verifySave(x.store, 'Finnish', 'save-2', receipt));
    await assert.rejects(x.verifySave(x.store, 'Finnish', 'save-1', { ...receipt, files: [] }));
    for (const file of [
      { path: relative, sha256: '0'.repeat(64) },
      { path: '../outside.md', sha256: 'a'.repeat(64) },
      { path: 'StudyVault/React/00-Dashboard/Curriculum Coverage.md', sha256: 'a'.repeat(64) }
    ])
      await assert.rejects(
        x.verifySave(x.store, 'Finnish', 'save-1', { ...receipt, files: [file] })
      );
  } finally {
    await x.service.close();
    await cleanup(x.root);
  }
});
test('interactive questions wait for explicit answers; finishing interrupts pending output without grading it', async () => {
  const x = await setup();
  try {
    x.ask(true);
    const starting = x.service.start('React');
    while (!(await x.service.view('React'))?.requests.length)
      await new Promise((resolve) => setTimeout(resolve, 10));
    await assert.rejects(x.service.answer('Finnish', 87, { goal: 'wrong subject' }));
    await x.service.answer('React', 87, { goal: 'Learn components' });
    await starting;
    assert.deepEqual(x.calls.find((call) => call.method === 'response').result, {
      answers: { goal: { answers: ['Learn components'] } }
    });
    await x.service.finish();
    x.ask(false);
    x.pause(true);
    const continuing = x.service.send('React', 'A pending unanswered question');
    void continuing.catch(() => {});
    while (
      !(await x.service.view('React'))?.messages.some(
        (message) => message.text === 'A pending unanswered question'
      )
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    await x.service.finish();
    await assert.rejects(continuing, /interrupted/);
    assert.equal((await x.service.view('React')).status, 'saved');
    assert.ok(x.calls.some((call) => call.method === 'turn/interrupt'));
  } finally {
    await x.service.close();
    await cleanup(x.root);
  }
});
test('source preparation resumes its own thread after reopening and waits for source verification', async () => {
  const x = await setup();
  try {
    await x.sources.addURL('React', 'https://example.com/react');
    await x.service.start('React', false, 'setup');
    assert.equal((await x.sources.settings('React')).preparation, 'needs_input');
    await x.service.close();
    const resumed = x.make();
    await resumed.send('React', 'Please explain the mapping before I confirm.');
    const view = await resumed.view('React');
    assert.equal(view.kind, 'setup');
    assert.equal(view.messages.filter((message) => message.role === 'user').length, 1);
    assert.equal(x.calls.filter((call) => call.method === 'thread/resume').length, 1);
    assert.equal(
      x.calls.findLast((call) => call.method === 'turn/start').params.outputSchema.properties.status
        .type,
      'string'
    );
    await resumed.finish();
    await resumed.close();
  } finally {
    await x.service.close();
    await cleanup(x.root);
  }
});
test('reconnecting after an initial failure still supplies subject, skill and notebook context', async () => {
  const x = await setup();
  let first = true;
  const service = new x.ChatService(
    x.store,
    x.sources,
    async (...args) => {
      if (first) {
        first = false;
        throw new Error('offline');
      }
      return x.factory(...args);
    },
    () => {}
  );
  try {
    await assert.rejects(service.start('React'), /offline/);
    const failed = await service.view('React');
    assert.equal(failed.status, 'error');
    await service.start('React');
    const resumed = await service.view('React');
    assert.equal(resumed.id, failed.id);
    assert.equal(resumed.notePath, failed.notePath);
    assert.ok(
      x.calls
        .find((call) => call.method === 'turn/start')
        .params.input[0].text.includes('tutor-software-engineering/SKILL.md')
    );
    assert.equal(resumed.messages.length, 1);
    await service.finish();
  } finally {
    await service.close();
    await cleanup(x.root);
  }
});
