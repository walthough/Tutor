const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path');
const { fixture, cleanup } = require('../tests/fixture.cjs');
(async () => {
  const root = await fixture();
  let app, page;
  const project = path.resolve(__dirname, '..');
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
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(
      () =>
        document.querySelector('#subject').value === 'Finnish' &&
        !document.querySelector('#timer-toggle').disabled
    );
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    await page.waitForFunction(
      () => document.querySelector('#terminal-status').textContent === 'Codex CLI'
    );
    await page.waitForFunction(() =>
      document.querySelector('#notes-content').textContent.includes('Session notes')
    );
    const snapshot = await page.evaluate(() => window.study.snapshot());
    const notes =
      '# Session\n\n**Palautua** means to recover after effort. A relaxing weekend can help you recover from a busy working week. We discussed rest and exercise.\n';
    await fs.writeFile(path.join(root, 'StudyVault/Finnish', snapshot.notePath), notes);
    await page.waitForFunction(
      () => document.querySelector('#notes-content strong')?.textContent === 'Palautua'
    );
    const timerBefore = JSON.stringify(
      (await page.evaluate(() => window.study.snapshot())).session
    );
    const coverageBefore = await fs.readFile(
      path.join(root, 'StudyVault/Finnish/00-Dashboard/Curriculum Coverage.md'),
      'utf8'
    );
    const fake = path.join(root, 'fake-practice.cjs');
    await fs.writeFile(
      fake,
      `const fs=require('node:fs');let input='';process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{const args=process.argv;const schema=JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema')+1],'utf8'));const result=schema.properties.meaning?{meaning:'to recover',example:'Haluan palautua viikonloppuna.'}:schema.properties.targetWords?{title:'A relaxing weekend',prompt:'Write about how you recover during a weekend.',guidance:['Describe your routine.'],targetWords:80}:{summary:'Clear ideas.',strengths:['Your meaning is understandable.'],corrections:[{original:'Minä halua',replacement:'Minä haluan',explanation:'Use the first-person form.'}],correctedParagraph:'Minä haluan palautua viikonloppuna.',...(schema.properties.recallSuccessful?{recallSuccessful:true}:{})};setTimeout(()=>fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(result)),fs.existsSync(${JSON.stringify(path.join(root, 'slow-practice'))})?30000:200);});`
    );
    await app.evaluate(
      (_, c) => {
        const cp = process.getBuiltinModule('child_process'),
          old = cp.spawn;
        cp.spawn = (file, args, options) =>
          /codex\.exe$/i.test(file) && args.includes('exec')
            ? old(c.node, [c.script, ...args], options)
            : old(file, args, options);
      },
      { node: process.execPath, script: fake }
    );
    await page.locator('#notes-content strong').click({ button: 'right' });
    assert.equal(await page.locator('#notebook-menu').isVisible(), true);
    await page.getByRole('menuitem', { name: 'Add to flash card word bank' }).click();
    await page.waitForFunction(() =>
      document.querySelector('#card-status').textContent.includes('ready to review')
    );
    assert.equal((await page.evaluate(() => window.study.flashcards('Finnish'))).length, 1);
    await page.locator('#quiz-tab').click();
    await page.locator('#practice-material').selectOption(snapshot.notePath);
    assert.equal(await page.locator('#flashcards-panel').isVisible(), true);
    assert.equal(await page.locator('#card-word').textContent(), 'Palautua');
    assert.equal(await page.locator('#card-back').isVisible(), false);
    await page.locator('#card-reveal').click();
    assert.equal(await page.locator('#card-meaning').textContent(), 'to recover');
    await page.locator('#card-edit').click();
    await page.locator('#card-meaning-input').fill('recover from effort');
    await page.locator('#card-example-input').fill('Tarvitsen aikaa palautua.');
    await page.locator('#card-save').click();
    await page.waitForFunction(
      () => document.querySelector('#card-status').textContent === 'Card saved.'
    );
    await page.locator('#study-tab').click();
    await page.locator('#notes-content strong').click({ button: 'right' });
    await page.locator('#add-flashcard').click();
    await page.waitForFunction(() =>
      document.querySelector('#card-status').textContent.includes('already in')
    );
    assert.equal((await page.evaluate(() => window.study.flashcards('Finnish'))).length, 1);
    await fs.appendFile(
      path.join(root, 'StudyVault/Finnish', snapshot.notePath),
      '\n## Terms & definitions\n- **Palautua**: Do not overwrite my edited card.\n- **lepo**: rest\n- **vapaa aika**: free time\n'
    );
    await page.waitForFunction(() =>
      document.querySelector('#notes-content').textContent.includes('vapaa aika')
    );
    assert.equal(
      await page.locator('#card-bank option').count(),
      1,
      'Hidden Practice should not rebuild its bank'
    );
    const imported = await page.evaluate(() => window.study.flashcards('Finnish'));
    assert.deepEqual(imported.map((c) => c.word).sort(), ['Palautua', 'lepo', 'vapaa aika']);
    assert.equal(imported.find((c) => c.word === 'Palautua').meaning, 'recover from effort');
    assert.equal(imported.find((c) => c.word === 'lepo').meaning, 'rest');
    assert.ok(imported.some((c) => c.word === 'vapaa aika'));
    await page.locator('#quiz-tab').click();
    await page.locator('#practice-material').selectOption(snapshot.notePath);
    await page.locator('#writing-mode').click();
    await page.waitForFunction(() => document.querySelectorAll('#card-bank option').length === 3);
    await page.locator('#writing-topic').fill('a relaxing weekend');
    await page.locator('#writing-generate').click();
    await page.waitForFunction(() => !document.querySelector('#writing-form').hidden);
    assert.equal(await page.locator('#writing-feedback').isVisible(), false);
    const tasks = await page.evaluate(() => window.study.writingList('Finnish'));
    assert.equal(tasks[0].attempt, null);
    const response = 'Minä halua palautua viikonloppuna.';
    await page.locator('#writing-response').fill(response);
    await page.locator('#subject').selectOption('React');
    await page.waitForFunction(
      () => document.querySelector('#subject-label').textContent === 'React'
    );
    assert.equal(await page.locator('#writing-form').isVisible(), false);
    assert.equal(await page.locator('#card-review').isVisible(), false);
    await page.locator('#subject').selectOption('Finnish');
    await page.waitForFunction(
      () => document.querySelector('#subject-label').textContent === 'Finnish'
    );
    await page.locator('#quiz-tab').click();
    await page.locator('#practice-material').selectOption(snapshot.notePath);
    await page.waitForFunction(
      () => document.querySelectorAll('#writing-history option').length === 2
    );
    await page.locator('#writing-history').selectOption(tasks[0].id);
    assert.equal(await page.locator('#writing-response').inputValue(), response);
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelector('#subject').value === 'Finnish' &&
        !document.querySelector('#timer-toggle').disabled
    );
    await page.locator('#quiz-tab').click();
    await page.locator('#practice-material').selectOption(snapshot.notePath);
    await page.locator('#writing-mode').click();
    await page.locator('#writing-history').selectOption(tasks[0].id);
    assert.equal(await page.locator('#writing-response').inputValue(), response);
    await page.locator('#writing-submit').click();
    await page.waitForFunction(() => !document.querySelector('#writing-feedback').hidden);
    assert.equal(await page.locator('.corrected-paragraph strong').textContent(), 'haluan ');
    assert.equal(await page.locator('#writing-response').inputValue(), response);
    assert.equal(await page.locator('#writing-submit').isVisible(), false);
    assert.equal(
      (await page.evaluate(() => window.study.writingList('Finnish')))[0].attempt.response,
      response
    );
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
    await fs.mkdir(path.join(project, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(project, 'test-results/paragraph-writing.png') });
    await page.locator('#flashcards-mode').click();
    await page.locator('#card-reveal').click();
    assert.equal(await page.locator('#card-meaning').textContent(), 'recover from effort');
    await page.screenshot({ path: path.join(project, 'test-results/flashcards.png') });
    await page.locator('#card-remembered').click();
    await page.waitForFunction(() => document.querySelectorAll('#card-bank option').length === 2);
    const rated = await page.evaluate(() => window.study.flashcards('Finnish'));
    assert.equal(rated.find((c) => c.word === 'Palautua').reviews.length, 1);
    await page.locator('#card-due-only').uncheck();
    assert.equal(await page.locator('#card-bank option').count(), 3);
    await page.locator('#writing-mode').click();
    await page.locator('#writing-revise').click();
    await page.waitForFunction(() =>
      document.querySelector('#writing-title').textContent.startsWith('Revise:')
    );
    assert.equal(await page.locator('#writing-response').inputValue(), response);
    const linked = await page.evaluate(() => window.study.writingList('Finnish'));
    assert.equal(linked[0].parentId, tasks[0].id);
    assert.equal(linked[0].attempt, null);
    await page.locator('#writing-history').selectOption(tasks[0].id);
    await page.locator('#writing-transfer').click();
    await page.waitForFunction(() =>
      document.querySelector('#writing-status').textContent.includes('Saved for later')
    );
    const followups = await page.evaluate(() => window.study.writingList('Finnish'));
    assert.equal(followups.length, 3);
    assert.equal(followups[0].kind, 'transfer');
    assert.equal(followups.find((t) => t.id === tasks[0].id).attempt.response, response);
    assert.ok(Date.parse(followups[0].dueAt) > Date.now() + 23 * 3600000);
    assert.equal(
      await page.locator('#writing-history').inputValue(),
      tasks[0].id,
      'Later retrieval must not open immediately'
    );
    const evidence = JSON.parse(
      await fs.readFile(
        path.join(root, '.tutor-cache/subjects/Finnish/tutor-evidence.json'),
        'utf8'
      )
    );
    assert.equal(evidence.writing[0].id, tasks[0].id);
    await fs.writeFile(
      path.join(root, 'StudyVault/Finnish/00-Dashboard/CEFR Skill Profile.md'),
      '# Skill profile\n\nListening: unassessed. Actual audio needed.'
    );
    await page.locator('#dashboard-tab').click();
    await page.waitForFunction(() =>
      document.querySelector('#next-task').textContent.includes('Continue writing')
    );
    assert.match(await page.locator('#skill-profile').textContent(), /Actual audio/);
    await page.locator('.learning-summary details').evaluate((e) => (e.open = true));
    await page.screenshot({ path: path.join(project, 'test-results/learning-dashboard.png') });
    await page.locator('#quiz-tab').click();
    await page.locator('#practice-material').selectOption(snapshot.notePath);
    await page.locator('#writing-mode').click();
    await page.locator('#writing-history').selectOption(linked[0].id);
    await page.waitForFunction(
      () =>
        !document.querySelector('#writing-panel').hidden &&
        !document.querySelector('#writing-form').hidden
    );
    await fs.writeFile(path.join(root, 'slow-practice'), '1');
    await page.locator('#writing-generate').click();
    await page.waitForFunction(() => !document.querySelector('#practice-cancel').hidden);
    await page.locator('#practice-cancel').click();
    await page.waitForFunction(() =>
      document.querySelector('#writing-status').textContent.includes('failed')
    );
    assert.equal((await page.evaluate(() => window.study.writingList('Finnish'))).length, 3);
    await page.locator('#dismiss-error').click();
    await fs.rm(path.join(root, 'slow-practice'));
    const noteFile = path.join(root, 'StudyVault/Finnish', snapshot.notePath);
    await fs.writeFile(
      noteFile,
      (await fs.readFile(noteFile, 'utf8')).replace(
        'Do not overwrite my edited card.',
        'to recover after effort.'
      )
    );
    await page.locator('#flashcards-mode').click();
    await page.locator('#card-bank').selectOption(rated.find((c) => c.word === 'Palautua').id);
    if (await page.locator('#card-reveal').isVisible()) await page.locator('#card-reveal').click();
    await page.waitForFunction(() =>
      document.querySelector('#card-note-meaning').textContent.includes('to recover after effort.')
    );
    assert.equal(await page.locator('#card-meaning').textContent(), 'recover from effort');
    await page.locator('#card-accept-note').click();
    await page.waitForFunction(
      () => document.querySelector('#card-meaning').textContent === 'to recover after effort.'
    );
    assert.equal(
      (await page.evaluate(() => window.study.flashcards('Finnish'))).find(
        (c) => c.word === 'Palautua'
      ).reviews.length,
      1
    );
    await page.locator('#study-tab').click();
    await page.locator('#note-recall').click();
    await page.waitForFunction(() =>
      document.querySelector('#writing-target').textContent.includes('Keep the notebook closed')
    );
    assert.equal(await page.locator('#study-view').isVisible(), false);
    assert.equal(await page.locator('#note-reference').isVisible(), false);
    assert.equal(await page.locator('#note-reference-text').textContent(), '');
    const recall = (await page.evaluate(() => window.study.writingList('Finnish'))).find(
      (t) => t.kind === 'recall'
    );
    assert.equal(recall.attempt, null);
    await page.locator('#writing-response').fill(response);
    await page.locator('#writing-submit').click();
    await page.waitForFunction(
      () =>
        !document.querySelector('#writing-feedback').hidden &&
        !document.querySelector('#note-reference').hidden
    );
    await page.locator('#note-reference summary').click();
    assert.match(
      await page.locator('#note-reference-text').textContent(),
      /to recover after effort/
    );
    let recallTasks = (await page.evaluate(() => window.study.writingList('Finnish'))).filter(
      (t) => t.kind === 'recall'
    );
    assert.equal(recallTasks.length, 2);
    assert.equal(recallTasks.find((t) => t.attempt).attempt.response, response);
    const nextRecall = recallTasks.find((t) => !t.attempt);
    await page.locator('#writing-history').selectOption(nextRecall.id);
    assert.equal(await page.locator('#writing-submit').isDisabled(), true);
    assert.match(await page.locator('#writing-prompt').textContent(), /Scheduled for/);
    await assert.rejects(
      page.evaluate(
        (t) => window.study.writingSubmit('Finnish', t.id, 'Minä halua palautua viikonloppuna.'),
        nextRecall
      ),
      /scheduled/
    );
    const savedTasks = await page.evaluate(() => window.study.writingList('Finnish'));
    savedTasks.find((t) => t.id === nextRecall.id).dueAt = new Date(
      Date.now() - 1000
    ).toISOString();
    await fs.writeFile(
      path.join(root, '.tutor-cache/subjects/Finnish/practice/writing.json'),
      JSON.stringify(savedTasks)
    );
    await page.locator('#quiz-tab').click();
    await page.locator('#practice-material').selectOption(snapshot.notePath);
    await page.waitForFunction(
      (id) =>
        [...document.querySelector('#writing-history').options].some(
          (o) => o.value === id && o.textContent.includes('Unsubmitted')
        ),
      nextRecall.id
    );
    await page.locator('#writing-history').selectOption(recall.id);
    await page.locator('#writing-history').selectOption(nextRecall.id);
    assert.equal(await page.locator('#writing-submit').isDisabled(), false);
    await page.locator('#writing-response').fill(response);
    await page.locator('#writing-submit').click();
    await page.waitForFunction(() => !document.querySelector('#writing-feedback').hidden);
    recallTasks = (await page.evaluate(() => window.study.writingList('Finnish'))).filter(
      (t) => t.kind === 'recall'
    );
    assert.equal(recallTasks.length, 3);
    assert.equal(recallTasks.find((t) => !t.attempt).intervalDays, 2);
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
    await page.screenshot({ path: path.join(project, 'test-results/note-review.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 650));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(
      'PASS practice UI: cards, due reviews, scheduled transfer, note correction acceptance, closed-note recall, hidden reference until submission, recurring reviews, evidence handoff, dashboard routing, generation cancellation, draft persistence, subject isolation, unchanged timer and coverage.'
    );
  } catch (e) {
    if (page) {
      console.error(
        await page
          .locator('#error-text')
          .textContent()
          .catch(() => '')
      );
      console.error(
        await page
          .evaluate(async () => ({
            snapshot: await window.study.snapshot(),
            status: document.querySelector('#writing-status').textContent,
            queue: document.querySelector('#practice-queue').textContent
          }))
          .catch(() => ({}))
      );
      await page
        .screenshot({ path: path.join(project, 'test-results/practice-failure.png') })
        .catch(() => {});
    }
    throw e;
  } finally {
    if (app) await app.close();
    await cleanup(root);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
