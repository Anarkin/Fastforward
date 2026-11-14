export class Slots<T> {
  private readonly waiting: (() => void)[] = [];
  private readonly queued = new Map<string, Promise<T>>();

  constructor(private free: number) {}

  run(key: string, work: () => Promise<T>): Promise<T> {
    const queued = this.queued.get(key);
    if (queued) {
      return queued;
    }
    if (this.free > 0) {
      this.free--;
      return this.occupy(work);
    }
    const turn = new Promise<void>((resolve) =>
      this.waiting.push(resolve),
    ).then(() => {
      this.queued.delete(key);
      return this.occupy(work);
    });
    this.queued.set(key, turn);
    return turn;
  }

  private async occupy(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        next();
      } else {
        this.free++;
      }
    }
  }
}
