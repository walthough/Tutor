const { test } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const path = require('node:path');

test('mode suggestions use assessed errors and due reviews, never untested catalogue entries', async () => {
  const result = await build({ entryPoints: [path.join(__dirname, '../src/lesson-modes.ts')], bundle: true, platform: 'node', format: 'cjs', write: false });
  const module = { exports: {} };
  new Function('module', 'exports', result.outputFiles[0].text)(module, module.exports);
  const { suggestMode, validateLessonMode, modeRequest, validateTextOptions, textLevels, textLengths } = module.exports;
  assert.equal(suggestMode([{ reason: 'new' }], []).mode, 'conversation');
  assert.equal(suggestMode([{ reason: 'due review' }], []).mode, 'vocabulary');
  assert.equal(suggestMode([{ reason: 'due review' }], [{ reason: 'recent error' }]).mode, 'grammar');
  assert.equal(suggestMode([{ reason: 'recent error', last_practised: '2026-10-15' }], [{ reason: 'recent error', last_practised: '2026-10-18' }]).mode, 'grammar');
  assert.throws(() => validateLessonMode('React', 'grammar'));
  assert.throws(() => validateLessonMode('Finnish', 'invented'));
  validateLessonMode('Finnish', 'grammar');
  assert.match(modeRequest('grammar'), /I choose Grammar practice/);
  assert.match(modeRequest('grammar'), /Leave unanswered work ungraded/);
  assert.match(modeRequest('grammar'), /do not start, stop or reset time/);
  assert.throws(() => modeRequest('text'));
  for (const options of [null, {}, { level: 'A0', words: 20 }, { level: 'C1', words: 21 }, { level: 'A1.1', words: '20' }]) assert.throws(() => validateTextOptions(options));
  for (const level of textLevels) for (const words of textLengths) {
    const request = modeRequest('text', { level, words });
    assert.ok(request.includes(`targeting ${level}, exactly ${words} words`));
    assert.match(request, /WAIT for my response/);
    assert.match(request, /without a translation or glossary/);
    assert.match(request, /not my assessed CEFR placement/);
    assert.match(request, /Active Text Practice\.md, outside the notebook/);
    assert.match(request, /Read that file before EVERY subsequent task/);
    assert.match(request, /each exercise must practise at least one word from my list/);
    assert.match(request, /Practise these again or Generate another text and wait/);
    assert.match(request, /Round completion is not mastery/);
  }
});
