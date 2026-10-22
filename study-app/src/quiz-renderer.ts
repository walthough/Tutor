import type { QuizView, QuizResult, Snapshot } from './types';
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export function setupQuiz(showError: (e: unknown) => void) {
  let subject = '',
    notePath: string | null = null,
    quiz: QuizView | null = null,
    result: QuizResult | null = null;
  let generating = false,
    submitting = false,
    loadVersion = 0,
    historyVersion = 0;
  const sources = el<HTMLSelectElement>('quiz-sources'),
    history = el<HTMLSelectElement>('quiz-history');
  function buttons() {
    el<HTMLButtonElement>('quiz-generate').disabled = generating || !notePath;
    el<HTMLButtonElement>('quiz-generate').textContent = generating
      ? 'Generating…'
      : 'Generate quiz';
    el<HTMLButtonElement>('quiz-submit').disabled = submitting || !!result;
  }
  function draw() {
    el('quiz-form').hidden = !quiz;
    if (!quiz) {
      el('quiz-questions').replaceChildren();
      el('quiz-result').textContent = '';
      buttons();
      return;
    }
    el('quiz-title').textContent = quiz.title;
    el('quiz-origin').textContent = quiz.sourcePaths.join(' · ');
    const fields = quiz.questions.map((q, index) => {
      const field = document.createElement('fieldset');
      field.className = 'quiz-question';
      const legend = document.createElement('legend');
      legend.textContent = index + 1 + '. ' + q.prompt;
      field.append(legend);
      const assessed = result?.answers.find((a) => a.questionId === q.id);
      q.choices.forEach((choice, i) => {
        const label = document.createElement('label');
        label.className = 'quiz-choice';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = q.id;
        input.value = choice.id;
        input.required = true;
        input.disabled = !!result;
        input.checked = assessed?.choiceId === choice.id;
        const text = document.createElement('span');
        text.textContent = String.fromCharCode(65 + i) + '. ' + choice.text;
        if (assessed?.correctChoiceId === choice.id) {
          label.classList.add('correct');
          text.textContent += ' — Correct answer';
        }
        if (assessed?.choiceId === choice.id && !assessed.correct) {
          label.classList.add('incorrect');
          text.textContent += ' — Your answer';
        }
        label.append(input, text);
        field.append(label);
      });
      if (assessed) {
        const feedback = document.createElement('p');
        feedback.className = 'quiz-feedback';
        feedback.textContent = assessed.explanation;
        const evidence = document.createElement('p');
        evidence.className = 'quiz-evidence';
        evidence.textContent = assessed.evidence.path + '\n“' + assessed.evidence.quote + '”';
        field.append(feedback, evidence);
      }
      return field;
    });
    el('quiz-questions').replaceChildren(...fields);
    el('quiz-submit').hidden = !!result;
    el('quiz-result').textContent = result
      ? result.score +
        ' / ' +
        result.total +
        ' correct. Attempt saved separately; tutor progress and mastery are unchanged.'
      : '';
    buttons();
  }
  async function list() {
    const current = subject,
      version = ++historyVersion;
    const items = await window.study.quizList(current);
    if (subject !== current || version !== historyVersion) return;
    history.replaceChildren(
      new Option('Choose a saved quiz…', ''),
      ...items.map(
        (q) =>
          new Option(
            new Date(q.createdAt).toLocaleString() +
              ' · ' +
              q.title +
              (q.score === null ? ' · Unanswered' : ' · ' + q.score + '/4'),
            q.id
          )
      )
    );
    history.value = quiz?.id || '';
  }
  async function activate() {
    const current = subject,
      version = ++loadVersion;
    try {
      const [paths] = await Promise.all([window.study.quizSources(current), list()]);
      if (subject !== current || version !== loadVersion) return;
      const selected = new Set([...sources.selectedOptions].map((o) => o.value));
      sources.replaceChildren(
        ...paths.map((p) => {
          const option = new Option(p, p);
          option.selected = selected.has(p);
          return option;
        })
      );
    } catch (e) {
      if (subject === current) showError(e);
    }
  }
  el<HTMLButtonElement>('quiz-generate').onclick = async () => {
    if (generating || !notePath) return;
    const current = subject,
      path = notePath,
      selected = [...sources.selectedOptions].map((o) => o.value);
    if (selected.length > 4) {
      showError(new Error('Choose up to four supporting sources.'));
      return;
    }
    generating = true;
    buttons();
    el('quiz-status').textContent =
      'Codex is generating four questions. This can take up to three minutes…';
    try {
      const created = await window.study.quizGenerate(current, path, selected);
      if (subject !== current) return;
      quiz = created;
      result = null;
      draw();
      await list();
      el('quiz-status').textContent = 'Quiz saved. Choose your answers below.';
    } catch (e) {
      if (subject === current) {
        showError(e);
        el('quiz-status').textContent = 'Generation failed. You can try again.';
      }
    } finally {
      generating = false;
      buttons();
    }
  };
  history.onchange = async () => {
    const current = subject,
      id = history.value,
      version = ++loadVersion;
    if (!id) {
      quiz = null;
      result = null;
      draw();
      return;
    }
    try {
      const saved = await window.study.quizGet(current, id);
      if (subject !== current || version !== loadVersion) return;
      quiz = saved.quiz;
      result = saved.result;
      el('quiz-status').textContent = 'Saved quiz loaded.';
      draw();
    } catch (e) {
      if (subject === current) showError(e);
    }
  };
  el<HTMLFormElement>('quiz-form').onsubmit = async (event) => {
    event.preventDefault();
    if (!quiz || result || submitting) return;
    const current = subject,
      active = quiz;
    const data = new FormData(el<HTMLFormElement>('quiz-form'));
    const answers = active.questions.map((q) => ({
      questionId: q.id,
      choiceId: String(data.get(q.id) || '')
    }));
    submitting = true;
    buttons();
    try {
      const assessed = await window.study.quizSubmit(current, active.id, answers);
      if (subject !== current || quiz?.id !== active.id) return;
      result = assessed;
      draw();
      await list();
    } catch (e) {
      if (subject === current) showError(e);
    } finally {
      submitting = false;
      buttons();
    }
  };
  return {
    activate,
    update(state: Snapshot) {
      const changed = subject !== state.subject;
      subject = state.subject;
      notePath = state.notePath;
      el('quiz-note-label').textContent = notePath
        ? 'Uses your selected material.'
        : 'Choose a topic or lesson note above.';
      if (changed) {
        loadVersion++;
        historyVersion++;
        quiz = null;
        result = null;
        sources.replaceChildren();
        history.replaceChildren(new Option('Choose a saved quiz…', ''));
        el('quiz-status').textContent = '';
        draw();
        if (!el('quiz-view').hidden) void activate();
      }
      buttons();
    }
  };
}
