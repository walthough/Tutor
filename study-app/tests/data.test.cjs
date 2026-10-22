const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { fixture, cleanup } = require('./fixture.cjs');
test('atomic saves retry transient Windows locks and leave the old record intact on permanent failure', async () => {
  const root = await fixture();
  const rename = fs.rename;
  try {
    await build({ entryPoints: [path.join(__dirname, '../src/data.ts')], outfile: path.join(root, 'atomic.cjs'), bundle: true, platform: 'node', format: 'cjs' });
    const { atomicWrite } = require(path.join(root, 'atomic.cjs'));
    const file = path.join(root, 'record.json'); await fs.writeFile(file, 'old');
    let attempts = 0;
    fs.rename = async (from, to) => {
      if (to === file && ++attempts < 3) { assert.equal(await fs.readFile(file, 'utf8'), 'old'); throw Object.assign(new Error('temporarily locked'), { code: 'EPERM' }); }
      return rename(from, to);
    };
    await atomicWrite(file, 'new'); assert.equal(attempts, 3); assert.equal(await fs.readFile(file, 'utf8'), 'new');
    fs.rename = async (from, to) => { if (to === file) throw Object.assign(new Error('disk failure'), { code: 'EIO' }); return rename(from, to); };
    await assert.rejects(atomicWrite(file, 'bad'), /disk failure/);
    assert.equal(await fs.readFile(file, 'utf8'), 'new');
    assert.equal((await fs.readdir(root)).filter(file => file.endsWith('.tmp')).length, 0);
  } finally { fs.rename = rename; await cleanup(root); }
});
test('vault data: subject isolation, curriculum counts, safe note paths and daily totals', async () => {
  const root = await fixture();
  try {
    await build({ entryPoints: [path.join(__dirname, '../src/data.ts')], outfile: path.join(root, 'data.cjs'), bundle: true, platform: 'node', format: 'cjs' });
    const { StudyStore, seconds } = require(path.join(root, 'data.cjs'));
    const store = new StudyStore(root);
    const original = await store.snapshot(null);
    assert.equal(original.subject, 'Finnish'); assert.equal(original.markdown, '');
    await assert.rejects(store.validate('../React'));
    await assert.rejects(store.safeNote('Finnish', '../../AGENTS.md'));
    const first = await store.createNotes('Finnish');
    await fs.appendFile(path.join(store.vault('Finnish'), first), '\nDiscussed: **correction**.\n');
    assert.match((await store.snapshot(null)).markdown, /\*\*correction\*\*/);
    assert.equal((await store.listNotes('React')).length, 0);
    let data = await store.dashboard('Finnish');
    assert.equal(data.topics.length, 2); assert.equal(data.topics.filter(t => t.reached).length, 1);
    assert.equal(data.totalSeconds, 3720); assert.equal(data.undatedSeconds, 3600);
    assert.equal(seconds({ startedUtc: '2026-01-01T00:00:00Z', stoppedUtc: '2026-01-01T01:00:00Z', elapsedBeforeSeconds: 60 }), 3660);
    // The older React format discovers curriculum files, never session pages.
    await fs.writeFile(path.join(store.vault('React'), '00-Dashboard/Curriculum Coverage.md'), '# Coverage\n\n## Reached topics\n\n- First topic\n');
    await fs.mkdir(path.join(store.vault('React'), '01-Foundation'));
    for (const name of ['First topic', 'Second topic', 'Foundation Practice']) await fs.writeFile(path.join(store.vault('React'), '01-Foundation', name + '.md'), '# Test');
    await store.createNotes('React');
    data = await store.dashboard('React');
    assert.equal(data.topics.length, 2); assert.equal(data.topics[0].reached, true);
    // Match real workspace curriculum totals without writing to the learner's vault.
    const real = new StudyStore(path.resolve(__dirname, '../..'));
    assert.equal((await real.dashboard('React')).topics.length, 39);
    assert.equal((await real.dashboard('Finnish')).topics.length, 34);
  } finally { await cleanup(root); }
});
