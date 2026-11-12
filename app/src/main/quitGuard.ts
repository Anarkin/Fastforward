import { realTimer, type Timer } from '../tools/git/main/autoFetch';

const systemEndingFor = 10_000;

export type Closing = 'held' | 'quits' | 'alone';

interface AskingShell {
  asksBeforeQuit(): boolean;
  askToQuit(): void;
}

export class QuitGuard {
  private pending: (() => void) | undefined;
  private allowed = false;
  private ending = false;
  private hung = false;
  private quitting = false;
  private held = false;
  private stopEnding: (() => void) | undefined;

  constructor(
    private readonly shell: () => AskingShell | undefined,
    private readonly timer: Timer = realTimer,
  ) {}

  holds(then: () => void): boolean {
    const shell = this.shell();
    if (
      this.allowed ||
      this.ending ||
      this.hung ||
      shell === undefined ||
      !shell.asksBeforeQuit()
    ) {
      return false;
    }
    this.pending = then;
    shell.askToQuit();
    return true;
  }

  get quits(): boolean {
    return this.quitting;
  }

  quitStarts(): void {
    this.quitting = true;
  }

  closing(last: boolean, then: () => void): Closing {
    if (!this.quitting && !last) {
      return 'alone';
    }
    if (this.quitting && this.held) {
      return 'held';
    }
    if (!this.holds(then)) {
      return 'quits';
    }
    if (this.quitting) {
      this.held = true;
      this.timer(() => {
        this.quitting = false;
        this.held = false;
      }, 0);
    }
    return 'held';
  }

  confirmed(): void {
    const then = this.pending;
    if (then === undefined) {
      return;
    }
    this.pending = undefined;
    this.allowed = true;
    then();
  }

  allow(): void {
    this.allowed = true;
  }

  reset(): void {
    this.allowed = false;
  }

  systemEnding(): void {
    this.ending = true;
    this.stopEnding?.();
    this.stopEnding = this.timer(() => {
      this.ending = false;
      this.stopEnding = undefined;
    }, systemEndingFor);
  }

  responsive(answers: boolean): void {
    this.hung = !answers;
  }
}
