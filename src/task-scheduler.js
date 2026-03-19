import { EventEmitter } from 'events';
import { CronJob } from 'cron';

export class TaskScheduler extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
  }

  schedule(taskId, cronExpression, callback) {
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
  }

  cancel(taskId) {
    if (this.tasks.has(taskId)) {
      this.tasks.get(taskId).stop();
      this.tasks.delete(taskId);
      return true;
    }
    return false;
  }

  list() {
    return Array.from(this.tasks.keys());
  }
}
