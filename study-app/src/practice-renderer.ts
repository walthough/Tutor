import type { Flashcard, Snapshot, WritingTask } from './types';
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const btn = (id: string) => el<HTMLButtonElement>(id);
const sel = (id: string) => el<HTMLSelectElement>(id);
const field = (id: string) => el<HTMLTextAreaElement>(id);
const wordPattern = /^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u;
// Token LCS keeps unchanged words plain and bolds only additions/replacements.
export function correctedText(original: string, corrected: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const a = original.match(/\S+/g) || [],
    parts = corrected.match(/\S+\s*/g) || [],
    b = parts.map((p) => p.trim());
  if (a.length * b.length > 2000000) {
    const known = new Set(a);
    parts.forEach((p) => {
      const span = document.createElement(known.has(p.trim()) ? 'span' : 'strong');
      span.textContent = p;
      fragment.append(span);
    });
    return fragment;
  }
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      rows[i][j] =
        a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
  const unchanged = new Set<number>();
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      unchanged.add(j);
      i++;
      j++;
    } else if (rows[i + 1][j] >= rows[i][j + 1]) i++;
    else j++;
  }
  parts.forEach((part, index) => {
    if (unchanged.has(index)) fragment.append(document.createTextNode(part));
    else {
      const strong = document.createElement('strong');
      strong.textContent = part;
      fragment.append(strong);
    }
  });
  return fragment;
}
export function setupPractice(showError: (e: unknown) => void) {
  let state: Snapshot | null = null,
    epoch = 0,
    cards: Flashcard[] = [],
    tasks: WritingTask[] = [],
    cardId = '',
    task: WritingTask | null = null;
  let makingPrompt = false,
    assessing = false,
    savingCard = false,
    loading = 0;
  let rating = false,
    reviewId = crypto.randomUUID();
  let cardsDirty = true;
  let waitingForDue = false;
  const scheduled = (t: WritingTask | null) => !!t?.dueAt && Date.parse(t.dueAt) > Date.now();
  const dueOnly = () => el<HTMLInputElement>('card-due-only').checked;
  const reviewCards = () =>
    cards.filter(
      (c) =>
        (!state?.notePath || c.notePath === state.notePath) &&
        (!dueOnly() || !c.dueAt || Date.parse(c.dueAt) <= Date.now())
    );
  const enriching = new Set<string>();
  const draftKey = (t: WritingTask) => 'paragraph-draft:' + t.subject + ':' + t.id;
  const current = () => cards.find((c) => c.id === cardId);
  function cardStatus(message: string) {
    el('card-status').textContent = message;
    el('note-flashcard-status').textContent = message;
    el('note-flashcard-status').hidden = !message;
  }
  function buttons() {
    btn('writing-generate').disabled = makingPrompt || !state?.notePath;
    btn('writing-submit').disabled = assessing || !!task?.attempt || scheduled(task);
    field('writing-response').readOnly = assessing || !!task?.attempt || scheduled(task);
    btn('card-save').disabled = savingCard;
    btn('card-retry').disabled = !!current() && enriching.has(current()!.id);
    btn('card-again').disabled = btn('card-remembered').disabled = rating;
    btn('writing-revise').disabled = btn('writing-transfer').disabled = makingPrompt || assessing;
  }
  function showCard(id: string, preserveEditor = false) {
    const same = cardId === id;
    cardId = id;
    const card = current();
    el('card-review').hidden = !card;
    if (!card) {
      el('card-rating').hidden = true;
      return;
    }
    sel('card-bank').value = id;
    el('card-position').textContent = cards.indexOf(card) + 1 + ' / ' + cards.length;
    el('card-word').textContent = card.word;
    el('card-meaning').textContent = card.meaning;
    el('card-example').textContent = card.example;
    el('card-note-update').hidden = !card.suggestedMeaning;
    el('card-note-meaning').textContent = card.suggestedMeaning
      ? 'Updated notebook definition: ' + card.suggestedMeaning
      : '';
    if (!same) {
      el('card-back').hidden = true;
      reviewId = crypto.randomUUID();
    }
    el('card-rating').hidden = el('card-back').hidden;
    btn('card-reveal').hidden = !el('card-back').hidden;
    btn('card-reveal').disabled = !card.meaning;
    btn('card-retry').hidden = !!card.meaning && !!card.example;
    if (!preserveEditor || !same) {
      el('card-editor').hidden = true;
      field('card-meaning-input').value = card.meaning;
      field('card-example-input').value = card.example;
    }
    buttons();
  }
  function bank(preferred = cardId, preserveEditor = false) {
    const visible = reviewCards();
    sel('card-bank').replaceChildren(
      ...visible.map((c) => new Option(c.word + (!c.meaning ? ' · Needs meaning' : ''), c.id))
    );
    showCard(
      visible.some((c) => c.id === preferred) ? preferred : visible[0]?.id || '',
      preserveEditor
    );
    if (cards.length && !visible.length)
      cardStatus('No cards due. Uncheck Due cards only to browse the bank.');
  }
  function feedback(t: WritingTask) {
    const article = el('writing-feedback');
    article.replaceChildren();
    article.hidden = !t.attempt;
    if (!t.attempt) return;
    const f = t.attempt.feedback;
    const add = (tag: string, text: string) => {
      const node = document.createElement(tag);
      node.textContent = text;
      article.append(node);
    };
    add('h3', 'Feedback');
    add('p', f.summary);
    add('h4', 'What worked');
    const strengths = document.createElement('ul');
    f.strengths.forEach((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      strengths.append(li);
    });
    article.append(strengths);
    if (f.corrections.length) {
      add('h4', 'Corrections');
      f.corrections.forEach((c) => {
        const p = document.createElement('p');
        p.append(
          document.createTextNode(c.original + ' → '),
          correctedText(c.original, c.replacement)
        );
        article.append(p);
        add('p', c.explanation);
      });
    }
    add('h4', 'Corrected paragraph');
    const corrected = document.createElement('p');
    corrected.className = 'corrected-paragraph';
    corrected.append(correctedText(t.attempt.response, f.correctedParagraph));
    article.append(corrected);
    add('small', 'Original response and feedback saved. Tutor progress and mastery are unchanged.');
  }
  function drawTask(t: WritingTask | null) {
    task = t;
    el('writing-form').hidden = !t;
    waitingForDue = scheduled(t);
    el('writing-followups').hidden = !t?.attempt || t.kind === 'recall';
    el('note-reference').hidden = !t?.attempt || !t.noteReference;
    el('note-reference-text').textContent = t?.attempt ? t.noteReference || '' : '';
    el<HTMLDetailsElement>('note-reference').open = false;
    if (!t) {
      field('writing-response').value = '';
      el('writing-feedback').replaceChildren();
      buttons();
      return;
    }
    sel('writing-history').value = t.id;
    el('writing-title').textContent = t.title;
    el('writing-prompt').textContent = waitingForDue
      ? 'Scheduled for ' +
        new Date(t.dueAt!).toLocaleString() +
        '. Return then for retrieval practice.'
      : t.prompt;
    el('writing-guidance').replaceChildren(
      ...(waitingForDue ? [] : t.guidance).map((g) => {
        const li = document.createElement('li');
        li.textContent = g;
        return li;
      })
    );
    el('writing-target').textContent = waitingForDue
      ? ''
      : (t.kind === 'recall'
          ? 'Keep the notebook closed. Explain from memory and use your own new example. Aim for about '
          : 'Aim for about ') +
        t.targetWords +
        ' words.';
    field('writing-response').value =
      t.attempt?.response ?? localStorage.getItem(draftKey(t)) ?? '';
    field('writing-response').readOnly = !!t.attempt || waitingForDue;
    btn('writing-submit').hidden = !!t.attempt;
    field('writing-response').oninput?.(new Event('input'));
    feedback(t);
    buttons();
  }
  function history() {
    sel('writing-history').replaceChildren(
      new Option('Choose a saved task…', ''),
      ...tasks
        .filter((t) => !state?.notePath || t.notePath === state.notePath)
        .map(
          (t) =>
            new Option(
              t.title +
                (t.attempt
                  ? ' · Reviewed'
                  : scheduled(t)
                    ? ' · Due ' + new Date(t.dueAt!).toLocaleString()
                    : ' · Unsubmitted'),
              t.id
            )
        )
    );
    sel('writing-history').value = task?.id || '';
  }
  async function activate(cardsOnly = false) {
    if (!state) return;
    const subject = state.subject,
      version = epoch,
      request = ++loading;
    try {
      const [foundCards, foundTasks] = await Promise.all([
        window.study.flashcards(subject),
        cardsOnly ? Promise.resolve(tasks) : window.study.writingList(subject)
      ]);
      if (version !== epoch || request !== loading) return;
      cards = foundCards;
      cardsDirty = false;
      bank(cardId, true);
      if (!cardsOnly) {
        tasks = foundTasks;
        history();
      }
      if (!cards.length)
        el('card-status').textContent =
          'Terms from your session notes appear here automatically. You can also right-click a word in the notebook.';
    } catch (e) {
      if (version === epoch) showError(e);
    }
  }
  async function enrich(card: Flashcard) {
    if (enriching.has(card.id)) return;
    const version = epoch;
    enriching.add(card.id);
    buttons();
    cardStatus('“' + card.word + '” saved. Codex is preparing its meaning and example…');
    try {
      const updated = await window.study.flashcardEnrich(card.subject, card.id);
      if (version !== epoch) return;
      cards = cards.map((c) => (c.id === updated.id ? updated : c));
      bank(cardId, true);
      cardStatus(
        '“' + updated.word + '” is ready to review. You can edit its meaning and example.'
      );
    } catch (e) {
      if (version === epoch) {
        showError(e);
        cardStatus('The word is saved. Retry Generate meaning or fill in the card yourself.');
      }
    } finally {
      enriching.delete(card.id);
      buttons();
    }
  }
  const menu = el('notebook-menu');
  let menuWord: { word: string; subject: string; notePath: string } | null = null;
  function closeMenu() {
    menu.hidden = true;
    menuWord = null;
  }
  const notebook = el('notes-content');
  notebook.addEventListener('contextmenu', (event) => {
    if (!state || !(state.notebookPath === undefined ? state.notePath : state.notebookPath)) return;
    const doc = document as Document & { caretRangeFromPoint(x: number, y: number): Range | null };
    const caret = doc.caretRangeFromPoint(event.clientX, event.clientY);
    let word = '';
    if (
      caret &&
      caret.startContainer.nodeType === Node.TEXT_NODE &&
      notebook.contains(caret.startContainer)
    ) {
      const text = caret.startContainer.textContent || '',
        offset = caret.startOffset;
      for (const match of text.matchAll(/[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu))
        if (offset >= match.index! && offset <= match.index! + match[0].length) {
          word = match[0];
          const range = document.createRange();
          range.setStart(caret.startContainer, match.index!);
          range.setEnd(caret.startContainer, match.index! + word.length);
          const selection = getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          break;
        }
    } else {
      const selection = getSelection();
      if (
        selection?.anchorNode &&
        notebook.contains(selection.anchorNode) &&
        selection.focusNode &&
        notebook.contains(selection.focusNode)
      )
        word = selection.toString().trim();
    }
    if (!wordPattern.test(word) || word.length > 80) {
      closeMenu();
      return;
    }
    event.preventDefault();
    menuWord = {
      word,
      subject: state.subject,
      notePath: (state.notebookPath === undefined ? state.notePath : state.notebookPath)!
    };
    menu.hidden = false;
    menu.style.left =
      Math.max(4, Math.min(event.clientX, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top =
      Math.max(4, Math.min(event.clientY, innerHeight - menu.offsetHeight - 8)) + 'px';
    btn('add-flashcard').focus();
  });
  btn('add-flashcard').onclick = async () => {
    const target = menuWord,
      version = epoch;
    closeMenu();
    if (!target) return;
    cardStatus('Saving “' + target.word + '”…');
    try {
      const card = await window.study.flashcardAdd(target.subject, target.notePath, target.word);
      if (version !== epoch) return;
      if (!cards.some((c) => c.id === card.id)) cards.push(card);
      bank(card.id);
      if (!card.meaning || !card.example) void enrich(card);
      else cardStatus('“' + card.word + '” is already in your word bank.');
      el('status-message').textContent = '“' + card.word + '” added to flash card word bank.';
    } catch (e) {
      if (version === epoch) showError(e);
    }
  };
  document.addEventListener('pointerdown', (e) => {
    if (!menu.contains(e.target as Node)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
  el('notes-scroll').addEventListener('scroll', closeMenu);
  window.addEventListener('blur', closeMenu);
  function mode(writing: boolean) {
    el('flashcards-panel').hidden = writing;
    el('writing-panel').hidden = !writing;
    for (const [id, active] of [
      ['flashcards-mode', !writing],
      ['writing-mode', writing]
    ] as const) {
      btn(id).setAttribute('aria-pressed', String(active));
      btn(id).className = active ? 'secondary' : 'quiet';
    }
  }
  btn('flashcards-mode').onclick = () => mode(false);
  btn('writing-mode').onclick = () => mode(true);
  sel('card-bank').onchange = () => showCard(sel('card-bank').value);
  el<HTMLInputElement>('card-due-only').onchange = () => bank();
  btn('card-reveal').onclick = () => {
    el('card-back').hidden = false;
    btn('card-reveal').hidden = true;
    el('card-rating').hidden = false;
  };
  const move = (delta: number) => {
    const visible = reviewCards();
    if (visible.length)
      showCard(
        visible[
          (visible.findIndex((c) => c.id === cardId) + delta + visible.length) % visible.length
        ].id
      );
  };
  async function rate(remembered: boolean) {
    const c = current(),
      version = epoch;
    if (!c || rating || el('card-back').hidden) return;
    rating = true;
    buttons();
    try {
      const updated = await window.study.flashcardReview(c.subject, c.id, remembered, reviewId);
      if (version !== epoch) return;
      cards = cards.map((c) => (c.id === updated.id ? updated : c));
      const visible = reviewCards();
      cardId = '';
      bank(visible.find((c) => c.id !== updated.id)?.id || '');
      cardStatus(
        `Review saved. Next due: ${new Date(updated.dueAt!).toLocaleString()}. Mastery unchanged.`
      );
    } catch (e) {
      if (version === epoch) showError(e);
    } finally {
      rating = false;
      buttons();
    }
  }
  btn('card-again').onclick = () => {
    void rate(false);
  };
  btn('card-remembered').onclick = () => {
    void rate(true);
  };
  btn('card-next').onclick = () => move(1);
  btn('card-prev').onclick = () => move(-1);
  btn('card-edit').onclick = () => {
    const c = current();
    if (!c) return;
    field('card-meaning-input').value = c.meaning;
    field('card-example-input').value = c.example;
    el('card-editor').hidden = false;
    field('card-meaning-input').focus();
  };
  btn('card-edit-cancel').onclick = () => {
    el('card-editor').hidden = true;
  };
  btn('card-accept-note').onclick = async () => {
    const c = current(),
      version = epoch;
    if (!c || savingCard) return;
    savingCard = true;
    btn('card-accept-note').disabled = true;
    try {
      const updated = await window.study.flashcardAcceptNote(c.subject, c.id);
      if (version !== epoch) return;
      cards = cards.map((card) => (card.id === updated.id ? updated : card));
      bank(updated.id);
      cardStatus('Updated note definition saved. Review history preserved.');
    } catch (e) {
      if (version === epoch) showError(e);
    } finally {
      savingCard = false;
      btn('card-accept-note').disabled = false;
      buttons();
    }
  };
  btn('card-retry').onclick = () => {
    const c = current();
    if (c) void enrich(c);
  };
  el<HTMLFormElement>('card-editor').onsubmit = async (e) => {
    e.preventDefault();
    const c = current(),
      version = epoch;
    if (!c || savingCard) return;
    savingCard = true;
    buttons();
    try {
      const saved = await window.study.flashcardSave(
        c.subject,
        c.id,
        field('card-meaning-input').value,
        field('card-example-input').value
      );
      if (version !== epoch) return;
      cards = cards.map((c) => (c.id === saved.id ? saved : c));
      bank(saved.id);
      cardStatus('Card saved.');
    } catch (e) {
      if (version === epoch) showError(e);
    } finally {
      savingCard = false;
      buttons();
    }
  };
  sel('writing-history').onchange = () =>
    drawTask(tasks.find((t) => t.id === sel('writing-history').value) || null);
  async function followup(kind: 'revision' | 'transfer') {
    if (!task?.attempt || makingPrompt) return;
    const original = task,
      version = epoch;
    makingPrompt = true;
    buttons();
    el('writing-status').textContent =
      kind === 'revision'
        ? 'Preparing a linked revision…'
        : 'Queued: preparing a different situation for later retrieval…';
    try {
      const created = await window.study.writingFollowup(original.subject, original.id, kind);
      if (version !== epoch) return;
      if (!tasks.some((t) => t.id === created.id)) tasks.unshift(created);
      if (kind === 'revision' && !created.attempt && !localStorage.getItem(draftKey(created)))
        localStorage.setItem(draftKey(created), original.attempt!.response);
      if (kind === 'revision') drawTask(created);
      history();
      el('writing-status').textContent =
        kind === 'revision'
          ? 'Revise using the saved feedback. The original is preserved in history.'
          : 'Saved for later. Due ' +
            new Date(created.dueAt!).toLocaleString() +
            '. Find it in saved tasks when due.';
    } catch (e) {
      if (version === epoch) showError(e);
    } finally {
      makingPrompt = false;
      buttons();
    }
  }
  btn('writing-revise').onclick = () => {
    void followup('revision');
  };
  btn('writing-transfer').onclick = () => {
    void followup('transfer');
  };
  btn('practice-cancel').onclick = () => {
    void window.study.cancelPractice().catch(showError);
  };
  field('writing-response').oninput = () => {
    const value = field('writing-response').value;
    el('writing-count').textContent = (value.trim().match(/\S+/g)?.length || 0) + ' words';
    if (task && !task.attempt) localStorage.setItem(draftKey(task), value);
  };
  btn('writing-generate').onclick = async () => {
    if (!state?.notePath || makingPrompt) return;
    const subject = state.subject,
      path = state.notePath,
      version = epoch;
    makingPrompt = true;
    buttons();
    el('writing-status').textContent = 'Codex is preparing a writing topic…';
    try {
      const created = await window.study.writingCreate(
        subject,
        path,
        el<HTMLInputElement>('writing-topic').value
      );
      if (version !== epoch) return;
      tasks.unshift(created);
      drawTask(created);
      history();
      el('writing-status').textContent = 'Write your paragraph, then submit when you are ready.';
    } catch (e) {
      if (version === epoch) {
        showError(e);
        el('writing-status').textContent = 'Prompt generation failed. Try again.';
      }
    } finally {
      makingPrompt = false;
      buttons();
    }
  };
  el<HTMLFormElement>('writing-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!task || task.attempt || assessing || scheduled(task)) return;
    const active = task,
      version = epoch,
      response = field('writing-response').value;
    assessing = true;
    buttons();
    el('writing-status').textContent =
      'Codex is reviewing your paragraph. Your original draft is saved locally…';
    try {
      const reviewed = await window.study.writingSubmit(active.subject, active.id, response);
      if (version !== epoch) return;
      tasks = tasks.map((t) => (t.id === reviewed.id ? reviewed : t));
      if (task?.id === reviewed.id) drawTask(reviewed);
      history();
      el('writing-status').textContent =
        reviewed.kind === 'recall'
          ? 'Feedback and original response saved. Your next review is scheduled in saved tasks; mastery is unchanged.'
          : 'Feedback saved with your original paragraph.';
      localStorage.removeItem(draftKey(reviewed));
      if (reviewed.kind === 'recall') await activate();
    } catch (e) {
      if (version === epoch) {
        showError(e);
        el('writing-status').textContent =
          'Review failed. Your draft is preserved; you can submit again.';
      }
    } finally {
      assessing = false;
      buttons();
    }
  };
  setInterval(() => {
    if (el('quiz-view').hidden) return;
    if (waitingForDue && !scheduled(task)) {
      drawTask(task);
      history();
    }
    const visible = reviewCards()
      .map((c) => c.id)
      .join(',');
    if (visible !== [...sel('card-bank').options].map((o) => o.value).join(',')) bank(cardId, true);
  }, 30000);
  return {
    activate: () => activate(),
    async recallNote(subject: string, notePath: string) {
      if (makingPrompt || state?.subject !== subject) return;
      const version = epoch;
      makingPrompt = true;
      mode(true);
      drawTask(null);
      buttons();
      el('writing-status').textContent = 'Preparing a short closed-note review…';
      try {
        const created = await window.study.noteRecall(subject, notePath);
        if (version !== epoch) return;
        if (!tasks.some((t) => t.id === created.id)) tasks.unshift(created);
        drawTask(created);
        history();
        el('writing-status').textContent = scheduled(created)
          ? 'This note already has a scheduled review.'
          : 'Answer from memory before submitting. Feedback and the reference appear afterwards.';
      } catch (e) {
        if (version === epoch) {
          showError(e);
          el('writing-status').textContent = 'Review generation failed. Your notes are unchanged.';
        }
      } finally {
        makingPrompt = false;
        buttons();
      }
    },
    async nextTask() {
      await activate();
      const pending = tasks.find((t) => !t.attempt && !scheduled(t));
      if (pending) {
        mode(true);
        drawTask(pending);
        history();
      } else {
        mode(false);
        el<HTMLInputElement>('card-due-only').checked = true;
        bank();
      }
    },
    update(next: Snapshot) {
      const changed = state?.subject !== next.subject,
        materialChanged = state?.notePath !== next.notePath,
        bankChanged = state?.flashcardsVersion !== next.flashcardsVersion;
      state = next;
      if (changed || bankChanged) cardsDirty = true;
      el('practice-queue').textContent = next.practiceStatus || '';
      btn('practice-cancel').hidden = !next.practiceStatus;
      el('writing-note').textContent = next.notePath
        ? 'Uses your selected material.'
        : 'Choose a topic or lesson note above.';
      if (materialChanged && !changed) {
        epoch++;
        drawTask(null);
        history();
        bank();
      }
      if (changed) {
        epoch++;
        closeMenu();
        cards = [];
        tasks = [];
        cardId = '';
        bank();
        drawTask(null);
        history();
        cardStatus('');
        el('writing-status').textContent = '';
        el<HTMLInputElement>('writing-topic').value = '';
        if (!el('quiz-view').hidden) void activate();
      }
      if (!changed && cardsDirty && !el('quiz-view').hidden) void activate(true);
      buttons();
    }
  };
}
