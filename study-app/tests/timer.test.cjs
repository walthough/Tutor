const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fixture, cleanup } = require('./fixture.cjs');
function connect(root) {
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve(__dirname, '../scripts/timer-bridge.ps1'), '-Root', root], { windowsHide: true });
  let sequence = 0, pending = new Map(), errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  createInterface({ input: child.stdout }).on('line', line => {
    const response = JSON.parse(line); const callback = pending.get(response.id); pending.delete(response.id);
    if (callback) response.ok ? callback.resolve() : callback.reject(new Error(response.error));
  });
  return {
    request(action, subject = 'Finnish') { return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, action, subject }) + '\n'); }); },
    close() { if (child.exitCode !== null) return Promise.resolve(); return new Promise((resolve, reject) => { child.once('exit', code => code ? reject(new Error(errors)) : resolve()); child.stdin.end(); }); }
  };
}
test('shared timer: idempotent Start, resume, reset, switching, concurrency, EOF pause and migration', { timeout: 30000 }, async () => {
  const root = await fixture(); const a = connect(root), b = connect(root);
  const file = subject => path.join(root, '.tutor-cache/subjects', subject, 'study-session.json');
  const read = async subject => JSON.parse(await fs.readFile(file(subject), 'utf8'));
  try {
    await a.request('pause-all');
    assert.equal((await read('Finnish')).elapsedBeforeSeconds, 120);
    await Promise.all([a.request('start'), b.request('start')]);
    const start = (await read('Finnish')).startedUtc;
    await a.request('start'); assert.equal((await read('Finnish')).startedUtc, start);
    await new Promise(r => setTimeout(r, 120));
    await a.request('stop'); const stop = await read('Finnish'); assert.ok(stop.stoppedUtc);
    await b.request('checkpoint');
    const ledger = JSON.parse(await fs.readFile(path.join(root, '.tutor-cache/subjects/Finnish/study-activity.json'), 'utf8'));
    await a.request('checkpoint');
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, '.tutor-cache/subjects/Finnish/study-activity.json'), 'utf8')), ledger);
    await a.request('start'); await a.request('select', 'React');
    assert.ok((await read('Finnish')).stoppedUtc); assert.ok((await read('React')).stoppedUtc);
    await b.request('start', 'React'); await a.request('start', 'Finnish');
    assert.ok((await read('React')).stoppedUtc); assert.equal((await read('Finnish')).stoppedUtc, null);
    await a.request('reset'); const reset = await read('Finnish');
    assert.equal(reset.elapsedBeforeSeconds, 0); assert.ok(reset.totalBeforeSeconds >= 3720); assert.ok(reset.stoppedUtc);
    await a.request('start'); await a.close(); assert.ok((await read('Finnish')).stoppedUtc);
    // Legacy original remains untouched; repeated migration never overwrites React.
    const reactBefore = await fs.readFile(file('React'), 'utf8');
    const legacy = JSON.stringify({ startedUtc: '2026-01-01T00:00:00Z', stoppedUtc: '2026-01-01T00:00:00Z', totalBeforeSeconds: 12345 });
    await fs.writeFile(path.join(root, '.tutor-cache/study-session.json'), legacy);
    await b.request('checkpoint'); assert.equal(await fs.readFile(file('React'), 'utf8'), reactBefore);
    await fs.unlink(file('React')); await b.request('checkpoint');
    assert.equal((await read('React')).totalBeforeSeconds, 12345);
    assert.equal(await fs.readFile(path.join(root, '.tutor-cache/study-session.json'), 'utf8'), legacy);
    await assert.rejects(b.request('start', '../React'));
  } finally { await Promise.all([a.close(), b.close()]); await cleanup(root); }
});
