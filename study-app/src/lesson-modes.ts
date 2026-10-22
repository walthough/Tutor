export const lessonModes = [
  {
    id: 'conversation',
    label: 'Personal conversation',
    description: 'Use learned words and grammar to talk about your life.'
  },
  {
    id: 'vocabulary',
    label: 'Vocabulary review',
    description: 'Retrieve useful words and revisit earlier mistakes.'
  },
  {
    id: 'grammar',
    label: 'Grammar practice',
    description: 'Work on a grammar gap, then use it in new sentences.'
  },
  {
    id: 'text',
    label: 'Generate text',
    description: 'Read a text at your chosen level, then practise unfamiliar words.'
  }
] as const;
export type LessonMode = (typeof lessonModes)[number]['id'];
export interface ModeSuggestion {
  mode: LessonMode;
  reason: string;
}
export const textLevels = [
  'A1.1',
  'A1.2',
  'A1.3',
  'A2.1',
  'A2.2',
  'B1.1',
  'B1.2',
  'B2.1',
  'B2.2',
  'C1'
] as const;
export const textLengths = [20, 50, 100] as const;
export interface TextOptions {
  level: (typeof textLevels)[number];
  words: (typeof textLengths)[number];
}
export function validateTextOptions(options: unknown): asserts options is TextOptions {
  const value = options as TextOptions | null;
  if (!value || !textLevels.includes(value.level) || !textLengths.includes(value.words))
    throw new Error('Choose a text level from A1.1 to C1 and a length of 20, 50 or 100 words.');
}
export function validateLessonMode(subject: string, mode: unknown): asserts mode is LessonMode {
  if (subject !== 'Finnish' || !lessonModes.some((item) => item.id === mode))
    throw new Error('Invalid lesson mode for this subject.');
}
export function modeRequest(mode: LessonMode, options?: TextOptions) {
  const label = lessonModes.find((item) => item.id === mode)!.label;
  let reading = '';
  if (mode === 'text') {
    validateTextOptions(options);
    // shortcut: the tutor checks generated word counts; validate in-app if generation moves out of chat.
    reading = ` This is an explicit request for a new passage. Generate an original Finnish text targeting ${options.level}, exactly ${options.words} words. Use the Finnish CEFR-linked sublevels through B2.2 and the CEFR C1 band. Match vocabulary, sentence complexity and discourse to the selected level; length alone does not define difficulty. Count whitespace-separated words in the text body, excluding any title or instructions, and revise to the requested count before displaying it. Present the text in chat without a translation or glossary, then ask me to type the words or phrases I do not understand and WAIT for my response. Follow the Generate text workflow and active-practice rules in StudyVault/Finnish/00-Dashboard/Study Modes.md. Save the passage, my unfamiliar-word list and practice position in StudyVault/Finnish/00-Dashboard/Active Text Practice.md, outside the notebook. Read that file before EVERY subsequent task; each exercise must practise at least one word from my list and name its target. Stay on that list until I explicitly choose another text or mode. At the end of a round, offer Practise these again or Generate another text and wait. Round completion is not mastery. The chosen difficulty is a practice target, not my assessed CEFR placement.`;
  }
  return `I choose ${label}. Before switching, batch-save any already assessed progress using stable exercise IDs. Leave unanswered work ungraded. Continue in my chosen mode using my existing history and study plan, without asking me to choose a mode again. Preserve the lesson notes and timer; do not start, stop or reset time.${reading}`;
}
export function suggestMode(
  words: { reason: string; last_practised?: string }[],
  grammar: { reason: string; last_practised?: string }[]
): ModeSuggestion {
  const candidates = [
    ...words.map((item) => ({ ...item, mode: 'vocabulary' as const })),
    ...grammar.map((item) => ({ ...item, mode: 'grammar' as const }))
  ].filter((item) => item.reason === 'recent error' || item.reason === 'due review');
  candidates.sort(
    (a, b) =>
      Number(b.reason === 'recent error') - Number(a.reason === 'recent error') ||
      (b.last_practised || '').localeCompare(a.last_practised || '')
  );
  const next = candidates[0];
  return next
    ? {
        mode: next.mode,
        reason:
          next.reason === 'recent error'
            ? 'Revisit an error in your assessed practice.'
            : 'Revisit previously assessed items that are due for review.'
      }
    : {
        mode: 'conversation',
        reason:
          'Try using what you know in conversation. No assessed error or due review was found.'
      };
}
