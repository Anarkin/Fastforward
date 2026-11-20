import {
  fittedLines,
  type FittedLines,
  type MeasuredCrowd,
} from './bubbleLines';

const noCrowds: readonly MeasuredCrowd[] = [];

export class CrowdLayout {
  private crowds = noCrowds;
  private fitted: (FittedLines | undefined)[] = [];
  private room = 0;
  private readonly lines = new Map<number, readonly number[]>();

  get(position: number): readonly number[] | undefined {
    return this.lines.get(position);
  }

  has(position: number): boolean {
    return this.lines.has(position);
  }

  take(crowds: readonly MeasuredCrowd[]): readonly number[] | undefined {
    if (crowds === this.crowds) {
      return undefined;
    }
    const touched = new Set(this.lines.keys());
    this.crowds = crowds;
    this.fitted = [];
    this.lines.clear();
    this.layOut();
    for (const { position } of crowds) {
      touched.add(position);
    }
    return [...touched];
  }

  fit(room: number): readonly number[] | undefined {
    if (room === this.room) {
      return undefined;
    }
    this.room = room;
    const changed = this.layOut();
    return changed.length > 0 ? changed : undefined;
  }

  private layOut(): number[] {
    const changed: number[] = [];
    this.crowds.forEach(({ position, indent, advances }, at) => {
      if (this.room <= 0) {
        this.fitted[at] = undefined;
        if (this.lines.delete(position)) {
          changed.push(position);
        }
        return;
      }
      const room = this.room - indent;
      const was = this.fitted[at];
      if (was !== undefined && room >= was.from && room < was.until) {
        return;
      }
      const now = fittedLines(advances, room);
      this.fitted[at] = now;
      if (now.lines !== this.lines.get(position)) {
        this.lines.set(position, now.lines);
        changed.push(position);
      }
    });
    return changed;
  }
}
