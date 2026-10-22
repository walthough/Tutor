import { watch, type FSWatcher } from 'node:fs';
import * as path from 'node:path';

export function watchWorkspace(root: string, changed: () => void): () => void {
  const watchers: FSWatcher[] = [];
  let pending: ReturnType<typeof setTimeout> | undefined;
  let fallback: ReturnType<typeof setInterval> | undefined;
  const notify = () => {
    clearTimeout(pending);
    pending = setTimeout(changed, 100);
  };
  const recover = (error: Error) => {
    console.error('Workspace watcher unavailable:', error.message);
    // Keep external updates visible on filesystems without reliable watching.
    if (!fallback) fallback = setInterval(changed, 30000);
  };
  for (const folder of ['StudyVault', '.tutor-cache']) {
    try {
      const watcher = watch(path.join(root, folder), { recursive: true }, (_event, file) => {
        if (!file || !file.endsWith('.tmp')) notify();
      });
      watcher.on('error', recover);
      watchers.push(watcher);
    } catch (error) {
      recover(error as Error);
    }
  }
  return () => {
    watchers.forEach((w) => w.close());
    clearTimeout(pending);
    clearInterval(fallback);
  };
}
