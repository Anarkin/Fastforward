export interface IdleDeadline {
  timeRemaining(): number;
}

export interface Idling {
  readonly ask: (run: (deadline: IdleDeadline) => void) => number;
  readonly cancel: (asked: number) => void;
}

export type IdleJob = () => boolean;

const mostOfASlice = 4;

const leastLeft = 1;

export const pageIdling = (): Idling => ({
  ask: (run) => requestIdleCallback(run),
  cancel: (asked) => cancelIdleCallback(asked),
});

export class IdleWork {
  private readonly jobs = new Map<string, IdleJob>();
  private asked: number | undefined;

  constructor(
    private readonly idling: Idling,
    private readonly slice: (left: number) => void,
    private readonly done: () => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  put(name: string, job: IdleJob): void {
    this.jobs.delete(name);
    this.jobs.set(name, job);
    this.asked ??= this.idling.ask(this.run);
  }

  clear(): void {
    this.jobs.clear();
    if (this.asked !== undefined) {
      this.idling.cancel(this.asked);
      this.asked = undefined;
    }
  }

  private readonly run = (deadline: IdleDeadline) => {
    this.asked = undefined;
    const left = Math.min(mostOfASlice, deadline.timeRemaining());
    const until = this.now() + left - leastLeft;
    this.slice(left);
    for (const [name, job] of this.jobs) {
      while (this.now() < until && deadline.timeRemaining() > 0) {
        if (job()) {
          this.jobs.delete(name);
          break;
        }
      }
      if (this.jobs.has(name)) {
        break;
      }
    }
    this.done();
    if (this.jobs.size > 0) {
      this.asked = this.idling.ask(this.run);
    }
  };
}
