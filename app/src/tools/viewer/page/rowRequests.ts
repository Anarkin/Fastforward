let lastRequest = 0;

export class RowRequests<Ask> {
  private answering: number | undefined;
  private waiting: Ask | undefined;
  private asked = new Map<number, Ask>();

  constructor(private readonly send: (request: number, ask: Ask) => void) {}

  ask(wanted: Ask): void {
    if (this.answering === undefined) {
      this.sendNow(wanted);
    } else {
      this.waiting = wanted;
    }
  }

  answered(request: number): Ask | undefined {
    const wanted = this.asked.get(request);
    this.asked.delete(request);
    if (request === this.answering) {
      this.answering = undefined;
      const next = this.waiting;
      this.waiting = undefined;
      if (next !== undefined) {
        this.sendNow(next);
      }
    }
    return wanted;
  }

  restart(): void {
    this.answering = undefined;
    this.waiting = undefined;
    this.asked = new Map();
  }

  private sendNow(wanted: Ask): void {
    const request = ++lastRequest;
    this.answering = request;
    this.asked.set(request, wanted);
    this.send(request, wanted);
  }
}
