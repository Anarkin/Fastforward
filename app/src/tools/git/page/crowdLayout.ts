import {
  fittedLines,
  type FittedLines,
  type MeasuredCrowd,
} from './bubbleLines';

const noCrowds: readonly MeasuredCrowd[] = [];

const everyPosition = () => true;

export class CrowdLayout {
  private crowds = noCrowds;
  private fitted: (FittedLines | undefined)[] = [];
  private room = 0;
  private readonly lines = new Map<number, readonly number[]>();
  private readonly waiting = new Map<number, readonly number[] | undefined>();

  get(position: number): readonly number[] | undefined {
    return this.lines.get(position);
  }

  has(position: number): boolean {
    return this.lines.has(position);
  }

  get waits(): boolean {
    return this.waiting.size > 0;
  }

  take(crowds: readonly MeasuredCrowd[]): readonly number[] | undefined {
    if (crowds === this.crowds) {
      return undefined;
    }
    const touched = new Set(this.lines.keys());
    this.crowds = crowds;
    this.fitted = [];
    this.lines.clear();
    this.waiting.clear();
    this.layOut();
    this.show();
    for (const { position } of crowds) {
      touched.add(position);
    }
    return [...touched];
  }

  fit(room: number): boolean {
    if (room !== this.room) {
      this.room = room;
      this.layOut();
    }
    return this.waits;
  }

  show(
    shown: (position: number) => boolean = everyPosition,
  ): readonly number[] | undefined {
    const changed: number[] = [];
    for (const [position, lines] of this.waiting) {
      if (!shown(position)) {
        continue;
      }
      if (lines === undefined) {
        this.lines.delete(position);
      } else {
        this.lines.set(position, lines);
      }
      this.waiting.delete(position);
      changed.push(position);
    }
    return changed.length > 0 ? changed : undefined;
  }

  private layOut(): void {
    this.crowds.forEach(({ position, indent, advances }, at) => {
      const room = this.room - indent;
      const was = this.fitted[at];
      if (
        this.room > 0 &&
        was !== undefined &&
        room >= was.from &&
        room < was.until
      ) {
        return;
      }
      const now = this.room > 0 ? fittedLines(advances, room) : undefined;
      this.fitted[at] = now;
      if (now?.lines === this.lines.get(position)) {
        this.waiting.delete(position);
      } else {
        this.waiting.set(position, now?.lines);
      }
    });
  }
}
