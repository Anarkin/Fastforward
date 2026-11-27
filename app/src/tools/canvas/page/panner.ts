import {
  alongLine,
  gliderOf,
  type GlideClock,
  type Glider,
} from '../../../lib/page/glide';
import {
  holdRest,
  type ScrollSettings,
} from '../../../lib/page/scrollSettings';
import { snapped, type Origin } from './pan';

export interface PannerAccess {
  readonly origin: () => Origin | undefined;
  readonly pan: (origin: Origin) => void;
  readonly scrolling: () => ScrollSettings;
  readonly clock?: GlideClock;
}

const moved = (origin: Origin, by: Origin): Origin => ({
  column: origin.column + by.column,
  row: origin.row + by.row,
});

const same = (one: Origin, other: Origin): boolean =>
  one.column === other.column && one.row === other.row;

const between = (from: Origin, to: Origin, share: number): Origin => ({
  column: alongLine(from.column, to.column, share),
  row: alongLine(from.row, to.row, share),
});

export class Panner {
  private rest: ReturnType<typeof setTimeout> | undefined;
  private readonly glider: Glider<Origin>;

  constructor(private readonly access: PannerAccess) {
    this.glider = gliderOf(
      (origin) => {
        access.pan(origin);
      },
      between,
      access.clock,
    );
  }

  glideBy(by: Origin): void {
    const at = this.access.origin();
    if (at === undefined) {
      return;
    }
    this.restless();
    this.moveTo(moved(this.glider.target() ?? snapped(at), by), at);
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
    this.glider.glideTo(to, from);
  }

  private stop(): void {
    this.glider.settle();
  }

  private restless(): void {
    clearTimeout(this.rest);
    this.rest = undefined;
  }
}
