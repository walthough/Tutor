const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fixture, cleanup } = require('../tests/fixture.cjs');
(async () => {
  const root = await fixture();
  let app;
  const project = path.resolve(__dirname, '..');
  const notes =
    '# Vowel harmony\n\nFinnish has vowel harmony. Front vowels and back vowels generally do not mix in the same word stem. Neutral vowels can occur with either group.\n';
  try {
    const env = {
      ...process.env,
      STUDY_APP_TEST_ROOT: root,
      STUDY_APP_TEST_NODE: process.execPath
    };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      args: [path.join(project, 'tests/launch.cjs')],
      env,
      timeout: 30000
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(
      () =>
        document.querySelector('#subject').value === 'Finnish' &&
        !document.querySelector('#timer-toggle').disabled
    );
    await page.waitForFunction(
      () => document.querySelector('#terminal-status').textContent === 'Codex CLI'
    );
    await page.locator('#quiz-tab').click();
    await page.locator('.legacy-quizzes').evaluate((e) => (e.open = true));
    assert.equal(await page.locator('#quiz-generate').isDisabled(), true);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    await page.waitForFunction(
      () => document.querySelector('#terminal-status').textContent === 'Codex CLI'
    );
    await page.waitForFunction(() =>
      document.querySelector('#notes-content').textContent.includes('Finnish · Session notes')
    );
    const state = await page.evaluate(() => window.study.snapshot());
    await fs.writeFile(path.join(root, 'StudyVault/Finnish', state.notePath), notes);
    await page.waitForFunction(() =>
      document.querySelector('#notes-content').textContent.includes('Finnish has vowel harmony.')
    );
    const timerBefore = JSON.stringify(
      (await page.evaluate(() => window.study.snapshot())).session
    );
    const coverageBefore = await fs.readFile(
      path.join(root, 'StudyVault/Finnish/00-Dashboard/Curriculum Coverage.md'),
      'utf8'
    );
    const fakeCodex = path.join(root, 'fake-codex.cjs');
    await fs.writeFile(
      fakeCodex,
      `const fs=require('node:fs');process.stdin.resume();process.stdin.on('end',()=>{const quiz={title:'Vowel harmony',questions:Array.from({length:4},(_,i)=>({prompt:'Understanding harmony '+(i+1),choices:['Answer '+i,'Distractor one','Distractor two','Distractor three'],correctIndex:0,explanation:'Explanation '+i,evidence:{sourceId:'notes',quote:'Finnish has vowel harmony.'}}))};fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],fs.existsSync(${JSON.stringify(path.join(root, 'invalid-quiz'))})?'invalid':JSON.stringify(quiz));});`
    );
    await app.evaluate(
      (_, config) => {
        const cp = process.getBuiltinModule('child_process');
        const original = cp.spawn;
        cp.spawn = (file, args, options) =>
          /codex\.exe$/i.test(file) && args.includes('exec')
            ? original(config.node, [config.script, ...args], options)
            : original(file, args, options);
      },
      { node: process.execPath, script: fakeCodex }
    );
    await page.locator('#quiz-tab').click();
    await page.locator('#practice-material').selectOption(state.notePath);
    await page.locator('.legacy-quizzes').evaluate((e) => (e.open = true));
    await page.locator('#quiz-generate').click();
    await page.waitForFunction(() => document.querySelectorAll('.quiz-question').length === 4);
    assert.equal(await page.locator('.quiz-feedback, .quiz-evidence').count(), 0);
    assert.equal(await page.locator('.quiz-choice.correct').count(), 0);
    const list = await page.evaluate(() => window.study.quizList('Finnish'));
    assert.equal(list.length, 1);
    assert.equal(list[0].score, null);
    const publicView = await page.evaluate((id) => window.study.quizGet('Finnish', id), list[0].id);
    assert.doesNotMatch(
      JSON.stringify(publicView),
      /correctChoiceId|correctIndex|Explanation|quiz-ui-test-key/
    );
    // Required radios prevent empty form submission and no result is saved.
    await page.locator('#quiz-submit').click();
    assert.equal(
      (await page.evaluate((id) => window.study.quizGet('Finnish', id), list[0].id)).result,
      null
    );
    for (const field of await page.locator('.quiz-question').all())
      await field.locator('input').first().check();
    await page.locator('#quiz-submit').click();
    await page.waitForFunction(() => document.querySelectorAll('.quiz-feedback').length === 4);
    assert.equal(await page.locator('.quiz-choice.correct').count(), 4);
    assert.equal(await page.locator('#quiz-submit').isVisible(), false);
    assert.match(await page.locator('#quiz-result').textContent(), /Attempt saved separately/);
    assert.equal(await page.locator('.quiz-question input:disabled').count(), 16);
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelector('#subject').value === 'Finnish' &&
        !document.querySelector('#timer-toggle').disabled
    );
    await page.locator('#quiz-tab').click();
    await page.locator('#practice-material').selectOption(state.notePath);
    await page.locator('.legacy-quizzes').evaluate((e) => (e.open = true));
    await page.waitForFunction(
      () => document.querySelectorAll('#quiz-history option').length === 2
    );
    await page.locator('#quiz-history').selectOption(list[0].id);
    await page.waitForFunction(() => document.querySelectorAll('.quiz-feedback').length === 4);
    await page.locator('#subject').selectOption('React');
    await page.waitForFunction(
      () => document.querySelector('#subject-label').textContent === 'React'
    );
    assert.equal(await page.locator('#quiz-form').isVisible(), false);
    assert.equal(await page.locator('#quiz-generate').isDisabled(), true);
    await page.locator('#subject').selectOption('Finnish');
    await page.waitForFunction(
      () => document.querySelector('#subject-label').textContent === 'Finnish'
    );
    await page.locator('#quiz-tab').click();
    await page.locator('#practice-material').selectOption(state.notePath);
    await page.locator('.legacy-quizzes').evaluate((e) => (e.open = true));
    await fs.writeFile(path.join(root, 'invalid-quiz'), '1');
    await page.locator('#quiz-generate').click();
    await page.waitForFunction(() =>
      document.querySelector('#quiz-status').textContent.includes('failed')
    );
    assert.equal((await page.evaluate(() => window.study.quizList('Finnish'))).length, 1);
    assert.equal(
      JSON.stringify((await page.evaluate(() => window.study.snapshot())).session),
      timerBefore
    );
    assert.equal(
      await fs.readFile(
        path.join(root, 'StudyVault/Finnish/00-Dashboard/Curriculum Coverage.md'),
        'utf8'
      ),
      coverageBefore
    );
    await page.locator('#dismiss-error').click();
    await page.locator('#quiz-history').selectOption(list[0].id);
    await page.waitForFunction(() => document.querySelectorAll('.quiz-feedback').length === 4);
    await fs.mkdir(path.join(project, 'test-results'), { recursive: true });
    await page.screenshot({
      path: path.join(project, 'test-results/quiz-results.png'),
      fullPage: true
    });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 650));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(
      'PASS quiz UI: generation, hidden answers, explicit submission, persisted review, subject isolation, Codex failure, timer/progress unchanged, compact layout'
    );
  } finally {
    if (app) await app.close();
    await cleanup(root);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
