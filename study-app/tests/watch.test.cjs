const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { fixture, cleanup } = require('./fixture.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('workspace watches atomic note saves and timer/topic changes without idle polling; close stops watching', async () => {
  const root = await fixture(); let stop;
  try {
    await build({ entryPoints: [path.join(__dirname, '../src/watch.ts')], outfile: path.join(root, 'watch.cjs'), bundle: true, platform: 'node', format: 'cjs' });
    let changes = 0;
    stop = require(path.join(root, 'watch.cjs')).watchWorkspace(root, () => changes++);
    await delay(350); assert.equal(changes, 0);
    const note = path.join(root, 'StudyVault/Finnish/90-Session-Notes/test.md');
    await fs.mkdir(path.dirname(note), { recursive: true }); await delay(250);
    const before = changes;
    await fs.writeFile(note + '.tmp', 'Saved lesson'); await delay(250);
    assert.equal(changes, before);
    await fs.rename(note + '.tmp', note);
    for (let i = 0; changes === before && i < 30; i++) await delay(50);
    assert.ok(changes > before);
    const saved = changes;
    await fs.writeFile(path.join(root, '.tutor-cache/subjects/Finnish/current-topic.txt'), 'New topic');
    for (let i = 0; changes === saved && i < 30; i++) await delay(50);
    assert.ok(changes > saved);
    stop(); const stopped = changes;
    await fs.writeFile(note, 'Later update'); await delay(250); assert.equal(changes, stopped);
  } finally { stop?.(); await cleanup(root); }
});
