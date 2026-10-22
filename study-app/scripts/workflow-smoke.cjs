const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { fixture, cleanup } = require('../tests/fixture.cjs');

(async () => {
  const root = await fixture(),
    project = path.resolve(__dirname, '..');
  let app, page;
  const errors = [];
  const launch = async () => {
    const env = {
      ...process.env,
      STUDY_APP_TEST_ROOT: root,
      STUDY_APP_TEST_NODE: process.execPath
    };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ args: [path.join(project, 'tests/launch.cjs')], env });
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForFunction(
      () =>
        [...document.querySelector('#subject').options].some(
          (option) => option.value === 'React'
        ) && !document.querySelector('#timer-toggle').disabled
    );
    await page.evaluate(() => {
      window.__statusEvents = [];
      window.__cliOutput = document.querySelector('#terminal').textContent;
      window.study.onTerminal((event) => {
        if (event.kind !== 'data') window.__statusEvents.push(event);
        if (event.kind === 'status' && event.data === 'Codex CLI') window.__cliOutput = '';
        if (event.kind === 'data') window.__cliOutput += event.data;
      });
    });
  };
  const waitCLI = () =>
    page.waitForFunction(
      () =>
        window.__cliOutput.includes('Codex CLI ready') &&
        document.querySelector('#terminal-status').textContent === 'Codex CLI'
    );
  try {
    await launch();
    assert.equal(await page.locator('#study-view').isVisible(), true);
    assert.equal(await page.locator('#timer-state').textContent(), 'PAUSED');
    assert.equal(await page.locator('#open-shell').isVisible(), false);
    const before = JSON.parse(
      await fs.readFile(path.join(root, '.tutor-cache/subjects/Finnish/study-session.json'))
    );
    await waitCLI();
    assert.equal(await page.locator('#chat-form').isVisible(), false);
    assert.equal(await page.locator('#cli-terminal .xterm').isVisible(), true);
    const font = await page.evaluate(() => {
      const measure = document.querySelector('#terminal .xterm-char-measure-element');
      return measure
        ? { family: getComputedStyle(measure).fontFamily, size: getComputedStyle(measure).fontSize }
        : null;
    });
    assert.ok(font?.family.includes('JetBrains Mono'));
    assert.equal(font.size, '12px');
    assert.equal(await page.locator('.notes-pane').isVisible(), true);
    const firstNotes = (await page.evaluate(() => window.study.snapshot())).notePath;
    await page.locator('#terminal .xterm-helper-textarea').pressSequentially('/model');
    await page.locator('#terminal .xterm-helper-textarea').press('Enter');
    await page.waitForFunction(() => window.__cliOutput.includes('CLI received: /model'));
    await page.evaluate(() => window.study.input('write a note\r'));
    await page.waitForFunction(() =>
      document.querySelector('#notes-content').textContent.includes('Practised Finnish in the CLI')
    );
    await page.locator('#change-mode').click();
    await page.locator('#lesson-mode-grammar').click();
    await page.waitForFunction(() => window.__cliOutput.includes('I choose Grammar practice.'));
    await page.locator('#timer-toggle').click();
    await page.waitForFunction(
      () => document.querySelector('#timer-state').textContent === 'STUDYING'
    );
    await fs.writeFile(path.join(root, 'fail-save'), '1');
    await page.locator('#end-lesson').click();
    await page.waitForFunction(() =>
      document.querySelector('#chat-error-text').textContent.includes('not confirmed')
    );
    assert.equal(await page.locator('#timer-state').textContent(), 'PAUSED');
    assert.equal(await page.locator('#end-lesson').textContent(), 'Retry saving');
    await fs.unlink(path.join(root, 'fail-save'));
    await page.locator('#chat-retry').click();
    await page.waitForFunction(() =>
      document.querySelector('#chat-status').textContent.includes('Session saved')
    );
    await page.locator('#home-tab').click();
    await page.locator('#continue-study').click();
    await waitCLI();
    assert.equal((await page.evaluate(() => window.study.snapshot())).notePath, firstNotes);
    await page.locator('#end-lesson').click();
    await page.waitForFunction(() =>
      document.querySelector('#chat-status').textContent.includes('Session saved')
    );
    await page.locator('#new-session').click();
    await waitCLI();
    assert.notEqual((await page.evaluate(() => window.study.snapshot())).notePath, firstNotes);
    await page.locator('#change-mode').click();
    await page.locator('#lesson-mode-text').click();
    await page.locator('#text-level').selectOption('B2.1');
    await page.locator('#text-length').selectOption('50');
    await page.locator('#generate-text-submit').click();
    await page.waitForFunction(() =>
      window.__cliOutput.includes('targeting B2.1, exactly 50 words')
    );
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 0 });
    });
    await page.locator('#subject').selectOption('React');
    await page.waitForFunction(() => document.querySelector('#subject').value === 'Finnish');
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    await page.locator('#subject').selectOption('React');
    await page.waitForFunction(
      () => document.querySelector('#home-subject').textContent === 'React'
    );
    assert.equal((await page.evaluate(() => window.study.snapshot())).terminalMode, null);
    await page.locator('#quiz-tab').click();
    assert.equal(await page.locator('#practice-activities').isVisible(), false);
    await fs.mkdir(path.join(root, 'StudyVault/React/01-Components'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'StudyVault/React/01-Components/Props.md'),
      '# Props\n\nProps pass information into a component. Components receive read-only props from their parents.\n\n## Terms & definitions\n- **props**: Inputs supplied to a component.\n'
    );
    await page.locator('#home-tab').click();
    await page.locator('#quiz-tab').click();
    await page.locator('#practice-material').selectOption('01-Components/Props.md');
    await page.waitForFunction(() => !document.querySelector('#practice-activities').hidden);
    assert.equal(await page.locator('#writing-generate').isEnabled(), true);
    await page.locator('#add-subject').click();
    await page.locator('#subject-name').fill('French');
    assert.equal(await page.locator('#subject-type').inputValue(), 'language');
    await page.locator('#subject-name').fill('Biology');
    await page.locator('#subject-type').selectOption('general');
    await page.locator('#create-subject').click();
    await page.waitForFunction(
      () => document.querySelector('#sources-subject').textContent === 'Biology'
    );
    assert.match(await page.locator('#setup-step').textContent(), /STEP 2/);
    await fs.writeFile(path.join(root, 'cells.txt'), 'Cells are the basic unit of life.');
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      },
      path.join(root, 'cells.txt')
    );
    await page.locator('#import-sources').click();
    await page.waitForFunction(() => document.querySelectorAll('#source-list li').length === 1);
    await page.locator('#import-sources').click();
    await page.waitForFunction(() => document.querySelectorAll('#source-list li').length === 2);
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    });
    await page.locator('#import-sources').click();
    await page.waitForFunction(() => !document.querySelector('#import-sources').disabled);
    assert.equal(await page.locator('#source-list li').count(), 2);
    await page.locator('#source-url').fill('https://example.com/biology');
    await page.locator('#add-source-url').click();
    await page.waitForFunction(() => document.querySelectorAll('#source-list li').length === 3);
    await page.locator('#generate-material').click();
    await page.waitForFunction(() =>
      document.querySelector('#chat-messages').textContent.includes('mapping match')
    );
    assert.match(
      (await page.evaluate(() => window.study.subjectSettings('Biology'))).preparation,
      /needs_input/
    );
    await page.locator('#chat-input').fill('The mappings look correct');
    await page.locator('#chat-send').click();
    await page.waitForFunction(() => !document.querySelector('#setup-ready').hidden);
    assert.equal(
      (await page.evaluate(() => window.study.subjectSettings('Biology'))).preparation,
      'ready'
    );
    await page.locator('#setup-start-study').click();
    await waitCLI();
    assert.equal(await page.locator('#timer-state').textContent(), 'PAUSED');
    await fs.mkdir(path.join(project, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(project, 'test-results/chat-redesign.png') });
    await page.locator('#end-lesson').click();
    await page.waitForFunction(() =>
      document.querySelector('#chat-status').textContent.includes('Session saved')
    );
    await app.close();
    app = null;
    await launch();
    assert.equal(await page.locator('#subject').inputValue(), 'Biology');
    await waitCLI();
    assert.equal(await page.locator('#timer-state').textContent(), 'PAUSED');
    await page.locator('#end-lesson').click();
    await page.waitForFunction(() =>
      document.querySelector('#chat-status').textContent.includes('Session saved')
    );
    await page.locator('#home-tab').click();
    await page.screenshot({ path: path.join(project, 'test-results/overview-redesign.png') });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1000, height: 700 })
    );
    await page.waitForTimeout(150);
    assert.ok(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight
      )
    );
    await page.screenshot({ path: path.join(project, 'test-results/overview-compact.png') });
    await page.locator('#study-tab').click();
    await waitCLI();
    assert.ok(
      await page.evaluate(() => {
        const timer = document.querySelector('#session-widget').getBoundingClientRect(),
          study = document.querySelector('#study-view').getBoundingClientRect(),
          terminal = document.querySelector('#cli-terminal').getBoundingClientRect();
        return timer.bottom <= study.top && terminal.bottom <= innerHeight && terminal.height > 150;
      })
    );
    await page.screenshot({ path: path.join(project, 'test-results/chat-compact.png') });
    assert.deepEqual(errors, []);
    const calls = (await fs.readFile(path.join(root, 'chat-calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert.ok(calls.some((call) => call.params.input[0].text.includes('$tutor-setup')));
    const launches = (await fs.readFile(path.join(root, 'cli-launches.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert.ok(
      launches.some((launch) => launch.args.some((arg) => arg.includes('tutor-language/SKILL.md')))
    );
    assert.ok(launches.length >= 4);
    assert.equal(launches[0].args[0], 'resume');
    assert.equal(launches[0].args[1], launches[1].args[1]);
    assert.notEqual(launches[1].args[1], launches[2].args[1]);
    assert.ok(
      launches.every(
        (launch) =>
          launch.args.includes('never') &&
          launch.args.includes('--no-daemon') &&
          launch.args.includes('danger-full-access') &&
          !launch.args.includes('--model')
      )
    );
    assert.ok(
      launches.every((launch) =>
        launch.notesPath.startsWith(path.join(root, 'StudyVault', launch.subject))
      )
    );
    assert.equal(
      before.totalBeforeSeconds,
      JSON.parse(
        await fs.readFile(path.join(root, '.tutor-cache/subjects/Finnish/study-session.json'))
      ).totalBeforeSeconds
    );
    console.log(
      'Study workflow UI passed: native terminal input, CLI controls, live notebook, modes, save retry, paused switching, subject isolation, guided setup, resumption and compact layout.'
    );
  } catch (e) {
    if (page) {
      console.error(
        await page
          .locator('#error-text')
          .textContent()
          .catch(() => '')
      );
      console.error(await page.evaluate(() => window.__statusEvents).catch(() => []));
      await page
        .screenshot({ path: path.join(project, 'test-results/redesign-failure.png') })
        .catch(() => {});
    }
    throw e;
  } finally {
    if (app) await app.close().catch(() => {});
    await cleanup(root);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
