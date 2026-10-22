const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { fixture, cleanup } = require('./fixture.cjs');
const noteText = '# Session\n\nWe learned that Finnish has vowel harmony. Front vowels and back vowels generally do not mix in the same word stem. Neutral vowels can occur with either group.\n';
function draft() { return { title: 'Vowel harmony', questions: Array.from({ length: 4 }, (_, i) => ({ prompt: 'Question ' + i, choices: ['Correct ' + i, 'Other one', 'Other two', 'Other three'], correctIndex: 0, explanation: 'The source explains this rule.', evidence: { sourceId: 'notes', quote: 'Finnish has vowel harmony.' } })) }; }
async function setup() {
  const root = await fixture();
  await build({ entryPoints: [path.join(__dirname, '../src/quiz.ts')], outfile: path.join(root, 'quiz.cjs'), bundle: true, platform: 'node', format: 'cjs' });
  await build({ entryPoints: [path.join(__dirname, '../src/data.ts')], outfile: path.join(root, 'data.cjs'), bundle: true, platform: 'node', format: 'cjs' });
  const mod = require(path.join(root, 'quiz.cjs'));
  const store = new (require(path.join(root, 'data.cjs')).StudyStore)(root);
  const note = await store.createNotes('Finnish'); await fs.writeFile(path.join(store.vault('Finnish'), note), noteText);
  return { root, ...mod, store, note };
}
test('quiz validation rejects malformed schema, duplicate choices and unsupported evidence', async () => {
  const c = await setup();
  try {
    const sources = [{ id: 'notes', text: noteText }];
    c.validateDraft(draft(), sources);
    for (const mutate of [d => d.questions.pop(), d => d.questions[0].choices.pop(), d => d.extra = 1, d => d.questions[0].correctIndex = 4, d => d.questions[0].correctIndex = 1.5, d => d.questions[0].prompt = ' ', d => d.questions[0].choices[1] = d.questions[0].choices[0], d => d.questions[0].evidence.sourceId = 'invented', d => d.questions[0].evidence.quote = 'This was never in the source material.', d => d.questions[1].prompt = d.questions[0].prompt]) {
      const d = draft(); mutate(d); assert.throws(() => c.validateDraft(d, sources));
    }
  } finally { await cleanup(c.root); }
});
test('quiz lifecycle: hidden key, stable shuffle, explicit assessment, immutable attempts and subject isolation', async () => {
  const c = await setup();
  try {
    const before = { coverage: await fs.readFile(path.join(c.store.vault('Finnish'), '00-Dashboard/Curriculum Coverage.md'), 'utf8'), session: await fs.readFile(path.join(c.store.cache('Finnish'), 'study-session.json'), 'utf8') };
    const service = new c.QuizService(c.store, async () => draft());
    const view = await service.create('Finnish', c.note, []);
    const publicText = JSON.stringify(view);
    assert.doesNotMatch(publicText, /correctChoiceId|explanation|evidence|correctIndex|test-key/);
    assert.equal(view.questions.length, 4);
    const qfile = path.join(c.store.cache('Finnish'), 'quizzes', view.id + '.json');
    const record = JSON.parse(await fs.readFile(qfile, 'utf8'));
    assert.equal(record.sources[0].sha256.length, 64); assert.equal(record.sources[0].text, noteText);
    assert.deepEqual((await service.get('Finnish', view.id)).quiz, view);
    assert.equal((await service.get('Finnish', view.id)).result, null);
    assert.equal((await service.list('Finnish'))[0].score, null);
    await assert.rejects(service.submit('Finnish', view.id, []));
    await assert.rejects(service.submit('Finnish', view.id, view.questions.map(q => ({ questionId: q.id, choiceId: 'fake' }))));
    assert.equal((await service.get('Finnish', view.id)).result, null);
    const answers = view.questions.map((q, i) => ({ questionId: q.id, choiceId: i === 0 ? q.choices.find(choice => choice.id !== record.questions[i].correctChoiceId).id : record.questions[i].correctChoiceId }));
    const [assessed, duplicate] = await Promise.all([service.submit('Finnish', view.id, answers), service.submit('Finnish', view.id, answers)]);
    assert.deepEqual(assessed, duplicate); assert.equal(assessed.score, 3);
    assert.deepEqual(assessed.answers.map(a => ({ questionId: a.questionId, choiceId: a.choiceId })), answers);
    const retry = await service.submit('Finnish', view.id, record.questions.map(q => ({ questionId: q.id, choiceId: q.correctChoiceId })));
    assert.deepEqual(retry, assessed);
    assert.equal((await service.list('Finnish'))[0].score, 3);
    assert.deepEqual(await service.list('React'), []);
    await assert.rejects(service.get('React', view.id));
    await assert.rejects(service.get('Finnish', '../bad'));
    assert.equal(await fs.readFile(path.join(c.store.vault('Finnish'), '00-Dashboard/Curriculum Coverage.md'), 'utf8'), before.coverage);
    assert.equal(await fs.readFile(path.join(c.store.cache('Finnish'), 'study-session.json'), 'utf8'), before.session);
    assert.deepEqual((await service.get('Finnish', view.id)).result, assessed);
    assert.deepEqual((await fs.readdir(path.join(c.store.cache('Finnish'), 'quiz-attempts'))), [view.id + '.json']);
  } finally { await cleanup(c.root); }
});
test('generation validates input and sources; failures never save a quiz', async () => {
  const c = await setup();
  try {
    let called = 0;
    const service = new c.QuizService(c.store, async () => { called++; return draft(); });
    await assert.rejects(service.create('Finnish', c.note, ['../../AGENTS.md']));
    await assert.rejects(service.create('../Finnish', c.note, []));
    await assert.rejects(service.create('Finnish', '../secret.md', []));
    await assert.rejects(service.create('Finnish', c.note, new Array(5).fill('bad')));
    assert.equal(called, 0);
    const bad = new c.QuizService(c.store, async () => ({}));
    await assert.rejects(bad.create('Finnish', c.note, []), /Invalid study output format/);
    assert.deepEqual(await service.list('Finnish'), []);
    await fs.mkdir(path.join(c.store.vault('Finnish'), '01-Lessons'));
    await fs.writeFile(path.join(c.store.vault('Finnish'), '01-Lessons/Harmony.md'), noteText);
    assert.deepEqual(await service.sourcePaths('Finnish'), ['01-Lessons/Harmony.md']);
    const view = await service.create('Finnish', c.note, ['01-Lessons/Harmony.md']);
    assert.equal(view.sourcePaths.length, 2);
    await fs.writeFile(path.join(c.store.vault('Finnish'), c.note), '# Empty\n\n## Summary');
    await assert.rejects(service.create('Finnish', c.note, []), /substantive lesson notes/);
  } finally { await cleanup(c.root); }
});
test('Codex adapter uses stdin, schema, read-only ephemeral run and cleans up', async () => {
  const c = await setup();
  try {
    const script = path.join(c.root,'fake-codex.cjs');
    await fs.writeFile(script, `const fs=require('node:fs');let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(path.join(c.root,'launch.json'))},JSON.stringify({args:process.argv,input,cwd:process.cwd(),key:process.env.OPENAI_API_KEY}));if(process.argv[2]==='hang')return setTimeout(()=>{},30000);if(process.argv[2]==='fail')return process.exit(1);fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],process.argv[2]==='bad'?'invalid':${JSON.stringify(JSON.stringify(draft()))});});`);
    const launch = mode => (_file,args,options) => require('node:child_process').spawn(process.execPath,[script,mode,...args],options);
    assert.deepEqual(await c.requestQuiz([{id:'notes',text:noteText}],'codex.exe',launch('ok')),draft());
    const invocation=JSON.parse(await fs.readFile(path.join(c.root,'launch.json'),'utf8'));
    assert.match(invocation.input,/Finnish has vowel harmony/);assert.equal(invocation.key,undefined);
    assert.ok(invocation.args.includes('--ephemeral'));assert.ok(invocation.args.includes('--output-schema'));assert.ok(invocation.args.includes('read-only'));
    await assert.rejects(fs.stat(invocation.cwd),{code:'ENOENT'});
    await assert.rejects(c.requestQuiz([],'codex.exe',launch('bad')),/invalid JSON/);
    await assert.rejects(c.requestQuiz([],'codex.exe',launch('fail')),/sign-in and usage limits/);
    await assert.rejects(c.requestQuiz([],'codex.exe',launch('hang'),500),/timed out/);
    const controller=new AbortController();controller.abort();
    await assert.rejects(c.requestQuiz([],'codex.exe',launch('ok'),10000,controller.signal),/cancelled/);
  } finally {await cleanup(c.root);}
});
