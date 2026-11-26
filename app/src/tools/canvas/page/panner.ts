import { glideAt, glideEnded, type Glide } from '../../../lib/page/glide';
import { rowGlide } from '../../../lib/page/rowScroll';
import {
  holdRest,
  type ScrollSettings,
} from '../../../lib/page/scrollSettings';
import { snapped, type Origin } from './pan';

export interface PannerAccess {
  readonly origin: () => Origin | undefined;
  readonly pan: (origin: Origin) => void;
  readonly scrolling: () => ScrollSettings;
  readonly now?: () => number;
  readonly frame?: (step: () => void) => number;
  readonly cancelFrame?: (frame: number) => void;
}

interface Gliding {
  readonly column: Glide;
  readonly row: Glide;
  readonly to: Origin;
}

const moved = (origin: Origin, by: Origin): Origin => ({
  column: origin.column + by.column,
  row: origin.row + by.row,
});

const same = (one: Origin, other: Origin): boolean =>
  one.column === other.column && one.row === other.row;

export class Panner {
  private gliding: Gliding | undefined;
  private frame: number | undefined;
  private rest: ReturnType<typeof setTimeout> | undefined;
  private readonly now: () => number;
  private readonly frameOf: (step: () => void) => number;
  private readonly cancelFrame: (frame: number) => void;

  constructor(private readonly access: PannerAccess) {
    this.now = access.now ?? (() => performance.now());
    this.frameOf = access.frame ?? ((step) => requestAnimationFrame(step));
    this.cancelFrame =
      access.cancelFrame ?? ((frame) => cancelAnimationFrame(frame));
  }

  glideBy(by: Origin): void {
    const at = this.access.origin();
    if (at === undefined) {
      return;
    }
    this.restless();
    this.moveTo(moved(this.gliding?.to ?? snapped(at), by), at);
  }

  holdBy(by: Origin): void {
    const at = this.access.origin();
    if (at === undefined) {
      return;
    }
    this.stop();
    this.access.pan(moved(at, by));
    this.restless();
    this.rest = setTimeout(() => this.letGo(), holdRest);
  }

  holdAt(origin: Origin): void {
    this.stop();
    this.restless();
    this.access.pan(origin);
  }

  letGo(): void {
    this.restless();
    const at = this.access.origin();
    if (at === undefined || !this.access.scrolling().smoothSnap) {
      return;
    }
    const to = snapped(at);
    if (!same(to, at)) {
      this.moveTo(to, at);
    }
  }

  dispose(): void {
    this.stop();
    this.restless();
  }

  private moveTo(to: Origin, from: Origin): void {
    if (!this.access.scrolling().smooth) {
      this.stop();
      this.access.pan(to);
      return;
    }
    const start = this.now();
    const glide = (fromAt: number, toAt: number): Glide => ({
      from: fromAt,
      to: toAt,
      start,
      duration: rowGlide,
      power: 2,
    });
    this.gliding = {
      column: glide(from.column, to.column),
      row: glide(from.row, to.row),
      to,
    };
    this.frame ??= this.frameOf(this.step);
  }

  private readonly step = (): void => {
    this.frame = undefined;
    const gliding = this.gliding;
    if (gliding === undefined) {
      return;
    }
    const now = this.now();
    this.access.pan({
      column: glideAt(gliding.column, now),
      row: glideAt(gliding.row, now),
    });
    if (glideEnded(gliding.column, now) && glideEnded(gliding.row, now)) {
      this.gliding = undefined;
    } else {
      this.frame = this.frameOf(this.step);
    }
  };

  private stop(): void {
    this.gliding = undefined;
    if (this.frame !== undefined) {
      this.cancelFrame(this.frame);
      this.frame = undefined;
    }
  }

  private restless(): void {
    clearTimeout(this.rest);
    this.rest = undefined;
  }
}
