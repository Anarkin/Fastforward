import { realTimer, type Timer } from '../tools/git/main/autoFetch';

const systemEndingFor = 10_000;

interface AskingShell {
  asksBeforeQuit(): boolean;
  askToQuit(): void;
}

export class QuitGuard {
  private pending: (() => void) | undefined;
  private allowed = false;
  private ending = false;
  private hung = false;
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
