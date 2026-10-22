import { contextBridge, ipcRenderer } from 'electron';
import type { API, TerminalEvent } from './types';
const api: API = {
  createSubject: (name, tutorType) => ipcRenderer.invoke('study:create-subject', name, tutorType),
  subjectSettings: (subject) => ipcRenderer.invoke('study:subject-settings', subject),
  setTutorType: (subject, tutorType) =>
    ipcRenderer.invoke('study:set-tutor-type', subject, tutorType),
  materials: (subject) => ipcRenderer.invoke('study:materials', subject),
  material: (subject, relative) => ipcRenderer.invoke('study:material', subject, relative),
  chat: (subject) => ipcRenderer.invoke('study:chat', subject),
  startChat: (subject, fresh, mode, options) =>
    ipcRenderer.invoke('study:start-chat', subject, fresh, mode, options),
  sendChat: (subject, text) => ipcRenderer.invoke('study:send-chat', subject, text),
  interruptChat: (subject) => ipcRenderer.invoke('study:interrupt-chat', subject),
  closeShell: () => ipcRenderer.invoke('study:close-shell'),
  answerChat: (subject, id, answer) => ipcRenderer.invoke('study:answer-chat', subject, id, answer),
  sources: (subject) => ipcRenderer.invoke('study:sources', subject),
  importSources: (subject) => ipcRenderer.invoke('study:import-sources', subject),
  addSourceURL: (subject, url) => ipcRenderer.invoke('study:add-source-url', subject, url),
  generateMaterial: (subject, cols, rows) =>
    ipcRenderer.invoke('study:generate-material', subject, cols, rows),
  modeSuggestion: (subject) => ipcRenderer.invoke('study:mode-suggestion', subject),
  endLesson: () => ipcRenderer.invoke('study:end-lesson'),
  cancelPractice: () => ipcRenderer.invoke('study:practice-cancel'),
  flashcardReview: (subject, id, remembered, reviewId) =>
    ipcRenderer.invoke('study:flashcard-review', subject, id, remembered, reviewId),
  writingFollowup: (subject, id, kind) =>
    ipcRenderer.invoke('study:writing-followup', subject, id, kind),
  flashcards: (subject) => ipcRenderer.invoke('study:flashcards', subject),
  flashcardAdd: (subject, notePath, word) =>
    ipcRenderer.invoke('study:flashcard-add', subject, notePath, word),
  flashcardEnrich: (subject, id) => ipcRenderer.invoke('study:flashcard-enrich', subject, id),
  flashcardSave: (subject, id, meaning, example) =>
    ipcRenderer.invoke('study:flashcard-save', subject, id, meaning, example),
  writingList: (subject) => ipcRenderer.invoke('study:writing-list', subject),
  writingCreate: (subject, notePath, topic) =>
    ipcRenderer.invoke('study:writing-create', subject, notePath, topic),
  noteRecall: (subject, notePath) => ipcRenderer.invoke('study:note-recall', subject, notePath),
  flashcardAcceptNote: (subject, id) =>
    ipcRenderer.invoke('study:flashcard-accept-note', subject, id),
  writingSubmit: (subject, id, response) =>
    ipcRenderer.invoke('study:writing-submit', subject, id, response),
  quizSources: (subject) => ipcRenderer.invoke('study:quiz-sources', subject),
  quizGenerate: (subject, notePath, sources) =>
    ipcRenderer.invoke('study:quiz-generate', subject, notePath, sources),
  quizList: (subject) => ipcRenderer.invoke('study:quiz-list', subject),
  quizGet: (subject, id) => ipcRenderer.invoke('study:quiz-get', subject, id),
  quizSubmit: (subject, id, answers) =>
    ipcRenderer.invoke('study:quiz-submit', subject, id, answers),
  snapshot: () => ipcRenderer.invoke('study:snapshot'),
  timer: (action, subject) => ipcRenderer.invoke('study:timer', action, subject),
  dashboard: (subject) => ipcRenderer.invoke('study:dashboard', subject),
  notes: (subject, relative) => ipcRenderer.invoke('study:notes', subject, relative),
  newNotes: (subject) => ipcRenderer.invoke('study:new-notes', subject),
  terminal: (mode, subject, cols, rows, lessonMode, textOptions, fresh) =>
    ipcRenderer.invoke('study:terminal', mode, subject, cols, rows, lessonMode, textOptions, fresh),
  input: (data) => ipcRenderer.send('study:input', data),
  resize: (cols, rows) => ipcRenderer.send('study:resize', cols, rows),
  acknowledge: (bytes) => ipcRenderer.send('study:ack', bytes),
  openCode: (target, subject) => ipcRenderer.invoke('study:code', target, subject),
  openNotes: (subject) => ipcRenderer.invoke('study:open-notes', subject),
  onTerminal: (callback) => {
    const handler = (_: unknown, event: TerminalEvent) => callback(event);
    ipcRenderer.on('study:terminal-event', handler);
    return () => ipcRenderer.removeListener('study:terminal-event', handler);
  },
  onChange: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('study:changed', handler);
    return () => ipcRenderer.removeListener('study:changed', handler);
  },
  ready: () => ipcRenderer.send('study:ready')
};
contextBridge.exposeInMainWorld('study', api);
