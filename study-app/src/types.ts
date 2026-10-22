import type { LessonMode, ModeSuggestion, TextOptions } from './lesson-modes';
export type TimerAction = 'start' | 'stop' | 'reset' | 'select' | 'pause-all' | 'checkpoint';
export type TerminalMode = 'powershell' | 'bash' | 'tutor';
export interface Session {
  startedUtc: string;
  stoppedUtc?: string | null;
  totalBeforeSeconds?: number;
  elapsedBeforeSeconds?: number;
}
export interface Topic {
  section: string;
  name: string;
  reached: boolean;
}
export interface Note {
  name: string;
  relativePath: string;
}
export interface StudySource {
  name: string;
  kind: 'file' | 'url';
  url?: string;
}
export type TutorType = 'language' | 'software-engineering' | 'general';
export interface SubjectSettings {
  tutorType: TutorType;
  preparation: 'not_started' | 'preparing' | 'needs_input' | 'ready' | 'error';
  error?: string;
}
export interface Material {
  path: string;
  title: string;
  kind: 'lesson' | 'topic';
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}
export interface ChatRequest {
  id: string | number;
  kind: 'approval' | 'questions';
  message: string;
  questions?: {
    id: string;
    header?: string;
    question: string;
    isSecret?: boolean;
    options?: { label: string; description?: string }[];
  }[];
}
export interface ChatView {
  id: string;
  subject: string;
  kind: 'lesson' | 'setup';
  notePath: string | null;
  messages: ChatMessage[];
  status: 'idle' | 'busy' | 'saving' | 'saved' | 'error';
  error: string | null;
  saveError?: boolean;
  requests: ChatRequest[];
}
export interface Snapshot {
  subjects: string[];
  subject: string;
  topic: string;
  session: Session | null;
  notes: Note[];
  notePath: string | null;
  markdown: string;
  noteUpdated: string | null;
  workspace: string;
  terminalMode: TerminalMode | null;
  timerReady?: boolean;
  flashcardsVersion?: number;
  tutorNotePath?: string | null;
  endingLesson?: boolean;
  lessonMode?: LessonMode | null;
  practiceStatus?: string;
  notebookPath?: string | null;
}
export interface Dashboard {
  topics: Topic[];
  days: Record<string, number>;
  totalSeconds: number;
  undatedSeconds: number;
  skillProfile?: string;
  nextTask?: string;
}
export interface TerminalEvent {
  kind: 'data' | 'exit' | 'status';
  data: string;
}
export interface API {
  createSubject(name: string, tutorType?: TutorType): Promise<string>;
  subjectSettings(subject: string): Promise<SubjectSettings>;
  setTutorType(subject: string, tutorType: TutorType): Promise<void>;
  materials(subject: string): Promise<Material[]>;
  material(subject: string, relative: string): Promise<string>;
  chat(subject: string): Promise<ChatView | null>;
  startChat(
    subject: string,
    fresh?: boolean,
    mode?: LessonMode,
    options?: TextOptions
  ): Promise<void>;
  sendChat(subject: string, text: string): Promise<void>;
  interruptChat(subject: string): Promise<void>;
  closeShell(): Promise<void>;
  answerChat(
    subject: string,
    id: string | number,
    answer: boolean | Record<string, string>
  ): Promise<void>;
  sources(subject: string): Promise<StudySource[]>;
  importSources(subject: string): Promise<void>;
  addSourceURL(subject: string, url: string): Promise<void>;
  generateMaterial(subject: string, cols: number, rows: number): Promise<void>;
  endLesson(): Promise<void>;
  modeSuggestion(subject: string): Promise<ModeSuggestion>;
  cancelPractice(): Promise<void>;
  flashcardReview(
    subject: string,
    id: string,
    remembered: boolean,
    reviewId: string
  ): Promise<Flashcard>;
  writingFollowup(subject: string, id: string, kind: 'revision' | 'transfer'): Promise<WritingTask>;
  flashcards(subject: string): Promise<Flashcard[]>;
  flashcardAdd(subject: string, notePath: string, word: string): Promise<Flashcard>;
  flashcardEnrich(subject: string, id: string): Promise<Flashcard>;
  flashcardSave(subject: string, id: string, meaning: string, example: string): Promise<Flashcard>;
  writingList(subject: string): Promise<WritingTask[]>;
  writingCreate(subject: string, notePath: string, topic: string): Promise<WritingTask>;
  noteRecall(subject: string, notePath: string): Promise<WritingTask>;
  flashcardAcceptNote(subject: string, id: string): Promise<Flashcard>;
  writingSubmit(subject: string, id: string, response: string): Promise<WritingTask>;

  quizSources(subject: string): Promise<string[]>;
  quizGenerate(subject: string, notePath: string, sources: string[]): Promise<QuizView>;
  quizList(subject: string): Promise<QuizSummary[]>;
  quizGet(subject: string, id: string): Promise<{ quiz: QuizView; result: QuizResult | null }>;
  quizSubmit(subject: string, id: string, answers: QuizAnswer[]): Promise<QuizResult>;
  snapshot(): Promise<Snapshot>;
  timer(action: TimerAction, subject: string): Promise<void>;
  dashboard(subject: string): Promise<Dashboard>;
  notes(subject: string, relativePath: string | null): Promise<Snapshot>;
  newNotes(subject: string): Promise<Snapshot>;
  terminal(
    mode: TerminalMode,
    subject: string,
    cols: number,
    rows: number,
    lessonMode?: LessonMode,
    textOptions?: TextOptions,
    fresh?: boolean
  ): Promise<void>;
  input(data: string): void;
  resize(cols: number, rows: number): void;
  acknowledge(bytes: number): void;
  openCode(target: 'workspace' | 'subject', subject: string): Promise<void>;
  openNotes(subject: string): Promise<void>;
  onTerminal(callback: (event: TerminalEvent) => void): () => void;
  onChange(callback: () => void): () => void;
  ready(): void;
}
declare global {
  interface Window {
    study: API;
  }
}

export interface QuizAnswer {
  questionId: string;
  choiceId: string;
}
export interface QuizSummary {
  id: string;
  title: string;
  createdAt: string;
  score: number | null;
}
export interface QuizView {
  id: string;
  subject: string;
  notePath: string;
  title: string;
  createdAt: string;
  sourcePaths: string[];
  questions: { id: string; prompt: string; choices: { id: string; text: string }[] }[];
}
export interface QuizResult {
  quizId: string;
  subject: string;
  submittedAt: string;
  score: number;
  total: number;
  answers: {
    questionId: string;
    choiceId: string;
    correct: boolean;
    correctChoiceId: string;
    explanation: string;
    evidence: { path: string; quote: string };
  }[];
}

export interface Flashcard {
  id: string;
  subject: string;
  word: string;
  meaning: string;
  example: string;
  notePath: string;
  context: string;
  createdAt: string;
  revision: number;
  reviews?: { id: string; at: string; remembered: boolean }[];
  dueAt?: string;
  intervalDays?: number;
  sourceMeaning?: string;
  suggestedMeaning?: string;
  archivedAt?: string;
}
export interface WritingFeedback {
  recallSuccessful?: boolean;
  summary: string;
  strengths: string[];
  corrections: { original: string; replacement: string; explanation: string }[];
  correctedParagraph: string;
}
export interface WritingTask {
  parentId?: string;
  kind?: 'revision' | 'transfer' | 'recall';
  dueAt?: string;
  intervalDays?: number;
  noteReference?: string;
  id: string;
  subject: string;
  notePath: string;
  createdAt: string;
  title: string;
  prompt: string;
  guidance: string[];
  targetWords: number;
  attempt: { response: string; submittedAt: string; feedback: WritingFeedback } | null;
}
