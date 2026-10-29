export interface FlowLimits {
  readonly highWatermark: number;
  readonly lowWatermark: number;
  readonly batchMilliseconds: number;
  readonly batchChars: number;
  readonly exitMilliseconds: number;
}

export const flowLimits: FlowLimits = {
  highWatermark: 100_000,
  lowWatermark: 10_000,
  batchMilliseconds: 5,
  batchChars: 65_536,
  exitMilliseconds: 250,
};

export class Backlog {
  private chars = 0;

  constructor(private readonly limits: FlowLimits) {}

  sent(chars: number): void {
    this.chars += chars;
  }

  taken(chars: number): void {
    this.chars = Math.max(0, this.chars - chars);
  }

  reset(): void {
    this.chars = 0;
  }

  get full(): boolean {
    return this.chars > this.limits.highWatermark;
  }

  get drained(): boolean {
    return this.chars < this.limits.lowWatermark;
  }
}
