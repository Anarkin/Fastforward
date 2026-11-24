import type { TextLine } from '../../../components/cells/page/lines';

export class DrawnLines {
  private before = new Map<number, TextLine>();
  private drawing = new Map<number, TextLine>();

  draw(): void {
    this.before = this.drawing;
    this.drawing = new Map();
  }

  of(number: number, text: string, ending: string | undefined): TextLine {
    const known = this.drawing.get(number) ?? this.before.get(number);
    const line =
      known?.text === text && known.ending === ending
        ? known
        : { start: number, end: number + 1, text, ending };
    this.drawing.set(number, line);
    return line;
  }

  size(): number {
    return new Set([...this.before.keys(), ...this.drawing.keys()]).size;
  }
}
