const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const root = process.cwd();
let next = 0, thread, active, threads = new Map();
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const event = (method, params) => send({ method, params: { threadId: thread, ...params } });
readline.createInterface({ input: process.stdin }).on('line', line => {
  const { id, method, params } = JSON.parse(line);
  if (method === 'initialized') return;
  if (method === 'initialize') { send({ id, result: { userAgent: 'test-chat' } }); return; }
  if (method === 'thread/start' || method === 'thread/resume') {
    thread = params.threadId || 'thread-' + Date.now() + '-' + (++next); threads.set(thread, params);
    send({ id, result: { thread: { id: thread, turns: [] } } }); return;
  }
  if (method === 'turn/interrupt') { event('turn/completed', { turn: { id: active, status: 'interrupted', items: [] } }); send({ id, result: {} }); return; }
  if (method !== 'turn/start') { send({ id, result: {} }); return; }
  const turnId = active = 'turn-' + (++next), text = params.input[0].text;
  fs.appendFileSync(path.join(root, 'chat-calls.jsonl'), JSON.stringify({ method, params }) + '\n');
  send({ id, result: { turn: { id: turnId, status: 'inProgress', items: [] } } }); event('turn/started', { turn: { id: turnId } });
  let answer = 'Let’s work through this together. Explain your idea, then try **one new example**.\n\n```js\nconst subject = "learning";\n```';
  if (params.outputSchema?.properties.saveId) {
    const saveId = JSON.parse(text.match(/saveId must be ("[^"]+")/)[1]), subject = JSON.parse(text.match(/subject must be ("[^"]+")/)[1]);
    answer = JSON.stringify({ saveId: fs.existsSync(path.join(root, 'fail-save')) ? 'bad-receipt' : saveId, subject, assessedProgressSaved: true, notesSaved: true, noChanges: true, files: [] });
  } else if (params.outputSchema?.properties.status) {
    const ready = text.includes('The mappings look correct');
    if (ready) {
      const settings = [...fs.readdirSync(path.join(root, 'StudyVault'))].find(name => name === 'Biology');
      const folder = path.join(root, 'StudyVault', settings);
      fs.writeFileSync(path.join(folder, '00-Dashboard/Curriculum Coverage.md'), '# Biology\n\n## Topic Checklist\n\n### Cells\n- [ ] Cell structure\n');
      fs.mkdirSync(path.join(folder, '01-Cells'), { recursive: true });
      fs.writeFileSync(path.join(folder, '01-Cells/Cell structure.md'), '# Cell structure\n\nCells are the basic unit of life. The cell membrane regulates what enters and leaves a cell.\n');
    }
    answer = JSON.stringify({ status: ready ? 'ready' : 'needs_input', message: ready ? 'Your curriculum and practice material are ready.' : 'I found a source about cell structure. Does this mapping match your material?' });
  } else if (text.includes('hold this response')) return;
  setTimeout(() => {
    event('item/agentMessage/delta', { itemId: turnId + '-message', delta: answer });
    const item = { id: turnId + '-message', type: 'agentMessage', text: answer, phase: 'final_answer' };
    event('item/completed', { item }); event('turn/completed', { turn: { id: turnId, status: 'completed', items: [item] } });
  }, params.outputSchema?.properties.saveId ? 120 : 35);
});
