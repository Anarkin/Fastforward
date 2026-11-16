import type { PdfFound } from './pdfFinds';

export class KeptMatch {
  private steps = 0;
  private stepping = false;

  constructor(
    private wanted: number | undefined,
    private readonly later: (run: () => void) => void = (run) => {
      setTimeout(run, 0);
    },
  ) {}

  get kept(): number | undefined {
    return this.wanted;
  }

  drop(): void {
    this.wanted = undefined;
  }

  seek(wanted: number | undefined): void {
    this.wanted = wanted;
    this.steps = 0;
  }

  found(
    { current, total, settled }: PdfFound,
    step: (by: 1 | -1) => void,
  ): void {
    const { wanted } = this;
    if (wanted === undefined || this.stepping || !settled) {
      return;
    }
    if (
      current === wanted ||
      current === 0 ||
      total < wanted ||
      this.steps >= total
    ) {
      this.wanted = undefined;
      return;
    }
    const ahead = (wanted - current + total) % total;
    const by = ahead <= total - ahead ? 1 : -1;
    this.stepping = true;
    this.steps += 1;
    this.later(() => {
      this.stepping = false;
      if (this.wanted !== undefined) {
        step(by);
      }
    });
  }
}
