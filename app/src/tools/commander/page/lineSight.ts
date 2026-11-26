import type { LinePointed } from './lineRecords';

export interface PointerPlaces {
  readonly gitLeft: number;
  readonly gitSize: number;
  readonly size: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
}

const mostInks = 1000;

export class LineSight {
  pointed: LinePointed | undefined;
  places: PointerPlaces | undefined;
  private readonly inks = new Map<number, string>();
  private drawing: () => void = () => {};

  drawWith(draw: () => void): void {
    this.drawing = draw;
  }

  stopDrawing(draw: () => void): void {
    if (this.drawing === draw) {
      this.drawing = () => {};
    }
  }

  redraw(): void {
    this.drawing();
  }

  point(now: LinePointed | undefined): void {
    const before = this.pointed;
    if (before?.index !== now?.index || before?.overCheck !== now?.overCheck) {
      this.pointed = now;
      this.drawing();
    }
  }

  place(places: PointerPlaces): void {
    this.places = places;
  }

  inked(index: number, ink: string): void {
    this.inks.set(index, ink);
    if (this.inks.size > mostInks) {
      const [oldest] = this.inks.keys();
      if (oldest !== undefined) {
        this.inks.delete(oldest);
      }
    }
  }

  inkOf(index: number): string | undefined {
    return this.inks.get(index);
  }
}
