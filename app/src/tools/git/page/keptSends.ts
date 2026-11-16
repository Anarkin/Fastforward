import type { GitToHost } from '../shared/protocol';

const keptDelay = 300;

export class KeptSends {
  private readonly owed = new Set<string>();
  private readonly sent = new Map<string, string>();
  private readonly dropped = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly messageOf: (scope: string) => GitToHost | undefined,
    private readonly blank: (message: GitToHost) => boolean,
    private readonly post: (message: GitToHost) => void,
  ) {}

  owe(scope: string): void {
    this.owed.add(scope);
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, keptDelay);
  }

  flush(scope?: string): void {
    for (const owed of scope === undefined ? [...this.owed] : [scope]) {
      if (this.owed.delete(owed)) {
        this.send(owed);
      }
    }
    if (this.owed.size === 0) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  drop(scope: string): void {
    this.owed.delete(scope);
    this.sent.delete(scope);
    this.dropped.add(scope);
  }

  shown(scope: string): void {
    this.dropped.delete(scope);
  }

  resend(scope: string): void {
    this.dropped.delete(scope);
    this.sent.delete(scope);
    this.owed.add(scope);
    this.flush(scope);
  }

  private send(scope: string): void {
    const message = this.dropped.has(scope) ? undefined : this.messageOf(scope);
    if (message === undefined) {
      return;
    }
    const json = JSON.stringify(message);
    const last = this.sent.get(scope);
    if (json !== last && (last !== undefined || !this.blank(message))) {
      this.sent.set(scope, json);
      this.post(message);
    }
  }
}
