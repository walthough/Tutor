const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const workspace = path.resolve(__dirname, '../..');
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'StudyWorkspaceTest-'));
  await fs.mkdir(path.join(root, 'tools/study'), { recursive: true });
  for (const file of ['StudyData.ps1', 'StudyTimer.ps1'])
    await fs.copyFile(
      path.join(workspace, 'tools/study', file),
      path.join(root, 'tools/study', file)
    );
  for (const subject of ['Finnish', 'React']) {
    const dashboard = path.join(root, 'StudyVault', subject, '00-Dashboard');
    const cache = path.join(root, '.tutor-cache', 'subjects', subject);
    await fs.mkdir(dashboard, { recursive: true });
    await fs.mkdir(cache, { recursive: true });
    await fs.writeFile(
      path.join(dashboard, 'Curriculum Coverage.md'),
      `# ${subject} Curriculum Coverage\n\n| Area | Total | Reached |\n| --- | --- | --- |\n| Total | 2 | 1 |\n\n## Topic Checklist\n\n### Foundation\n- [x] First topic\n- [ ] Second topic\n`
    );
    await fs.writeFile(path.join(cache, 'current-topic.txt'), `${subject} test topic`);
    await fs.writeFile(
      path.join(cache, 'study-session.json'),
      JSON.stringify({
        startedUtc: '2026-10-14T10:00:00Z',
        stoppedUtc: '2026-10-14T10:00:00Z',
        elapsedBeforeSeconds: 120,
        totalBeforeSeconds: 3600
      })
    );
    await fs.writeFile(
      path.join(cache, 'study-activity.json'),
      JSON.stringify({
        version: 1,
        timeZone: 'Europe/Helsinki',
        days: { '2026-10-14': 120 },
        checkpoints: {}
      })
    );
  }
  await fs.writeFile(path.join(root, '.tutor-cache', 'active-subject.txt'), 'Finnish');
  return root;
}
async function cleanup(root) {
  const resolved = path.resolve(root);
  if (!resolved.startsWith(path.join(os.tmpdir(), 'StudyWorkspaceTest-')))
    throw new Error('Unsafe fixture cleanup');
  await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
module.exports = { fixture, cleanup, workspace };
