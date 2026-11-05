/** Optional derived emotion work only. Story facts/memory jobs and billing do NOT use this queue. */
export class StoryAftercare {
  private jobs: Array<{ chatId: string; run: () => Promise<void> }> = [];
  private active = new Set<string>();
  private outstanding = 0;

  constructor(private readonly concurrency = 4, private readonly capacity = 32) {}

  enqueue(chatId: string, run: () => Promise<void>, onFailure: () => void): boolean {
    if (this.outstanding >= this.capacity) return false;
    this.outstanding++;
    this.jobs.push({ chatId, run: async () => {
      try { await run(); } catch { onFailure(); }
    } });
    this.drain();
    return true;
  }

  private drain(): void {
    while (this.active.size < this.concurrency) {
      const index = this.jobs.findIndex(job => !this.active.has(job.chatId));
      if (index < 0) return;
      const [job] = this.jobs.splice(index, 1);
      this.active.add(job.chatId);
      void Promise.resolve().then(job.run).catch(() => { /* Error reporting must not stall the queue. */ })
        .finally(() => { this.active.delete(job.chatId); this.outstanding--; this.drain(); });
    }
  }
}
export const storyAftercare = new StoryAftercare();
