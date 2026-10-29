interface AskingShell {
  asksBeforeQuit(): boolean;
  askToQuit(): void;
}

export class QuitGuard {
  private pending: (() => void) | undefined;
  private allowed = false;
  private ending = false;
  private hung = false;

  constructor(private readonly shell: () => AskingShell | undefined) {}

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
  }

  responsive(answers: boolean): void {
    this.hung = !answers;
  }
}
