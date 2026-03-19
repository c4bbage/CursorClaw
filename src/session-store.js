import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { dirname, join } from 'path';

export class SessionStore {
  constructor(stateDir) {
    this.filePath = join(stateDir, 'bridge-state.json');
  }

  load() {
    if (!existsSync(this.filePath)) {
      return null;
    }
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const state = JSON.parse(raw);
      console.log('[SessionStore] Loaded state from', this.filePath, {
        savedAt: state.savedAt,
        sessions: state.sessions?.length ?? 0,
        targets: Object.keys(state.targets || {}).length,
        pendingInteractions: Object.keys(state.pendingInteractions || {}).length,
        scheduledTasks: state.scheduledTasks?.length ?? 0
      });
      return state;
    } catch (err) {
      console.error('[SessionStore] Failed to load state:', err.message);
      return null;
    }
  }

  save(state) {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    state.savedAt = new Date().toISOString();

    const tmpPath = this.filePath + '.tmp';
    writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    renameSync(tmpPath, this.filePath);

    console.log('[SessionStore] State saved to', this.filePath, {
      sessions: state.sessions?.length ?? 0,
      targets: Object.keys(state.targets || {}).length,
      scheduledTasks: state.scheduledTasks?.length ?? 0
    });
  }
}
