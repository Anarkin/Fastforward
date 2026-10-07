export class InFlight {
  private readonly running = new Set<Promise<unknown>>();

  track<T>(work: Promise<T>): Promise<T> {
    this.running.add(work);
    const done = () => this.running.delete(work);
    void work.then(done, done);
    return work;
  }

  async settled(): Promise<void> {
    while (this.running.size > 0) {
      await Promise.allSettled(this.running);
    }
  }
}
