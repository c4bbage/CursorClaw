import { EventEmitter } from 'events';
import { CronJob } from 'cron';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export class TaskScheduler extends EventEmitter {
  constructor(persistPath) {
    super();
    this.tasks = new Map();
    this.taskDefs = new Map();
    this.persistPath = persistPath || null;

    if (this.persistPath) {
      this._loadDefs();
    }
  }

  schedule(taskId, cronExpression, callback, def) {
    if (this.tasks.has(taskId)) {
      this.tasks.get(taskId).stop();
    }

    const job = new CronJob(cronExpression, async () => {
      console.log(`[Task] Executing: ${taskId}`);
      await callback();
    });

    this.tasks.set(taskId, job);
    job.start();
    console.log(`[Task] Scheduled: ${taskId} with ${cronExpression}`);

    if (def && this.persistPath) {
      this.taskDefs.set(taskId, { ...def, cron: cronExpression, createdAt: new Date().toISOString() });
      this._saveDefs();
    }
  }

  cancel(taskId) {
    if (this.tasks.has(taskId)) {
      this.tasks.get(taskId).stop();
      this.tasks.delete(taskId);
      this.taskDefs.delete(taskId);
      if (this.persistPath) this._saveDefs();
      return true;
    }
    return false;
  }

  list() {
    return Array.from(this.tasks.keys());
  }

  getSavedDefs() {
    return new Map(this.taskDefs);
  }

  _loadDefs() {
    try {
      const raw = readFileSync(this.persistPath, 'utf8');
      const obj = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj)) {
        this.taskDefs.set(k, v);
      }
      console.log(`[Task] Loaded ${this.taskDefs.size} task definitions from ${this.persistPath}`);
    } catch {
      // first run or corrupt file — start empty
    }
  }

  _saveDefs() {
    try {
      mkdirSync(dirname(this.persistPath), { recursive: true });
      const obj = Object.fromEntries(this.taskDefs);
      writeFileSync(this.persistPath, JSON.stringify(obj, null, 2));
    } catch (err) {
      console.error('[Task] Failed to persist tasks:', err.message);
    }
  }
}
