export const rowGlide = 150;

export interface GlideClock {
  readonly now: () => number;
  readonly frame: (step: () => void) => number;
  readonly cancel: (frame: number) => void;
}

const pageClock: GlideClock = {
  now: () => performance.now(),
  frame: (step) => requestAnimationFrame(step),
  cancel: (frame) => {
    cancelAnimationFrame(frame);
  },
};

export interface Glider<Point> {
  readonly glideTo: (to: Point, resting: Point) => void;
  readonly settle: () => void;
  readonly target: () => Point | undefined;
}

export const alongLine = (from: number, to: number, share: number): number =>
  from + (to - from) * share;

interface Glide<Point> {
  readonly from: Point;
  readonly to: Point;
  readonly start: number;
}

const shareOf = (start: number, now: number) =>
  Math.max(0, Math.min(1, (now - start) / rowGlide));

const eased = (share: number) => 1 - (1 - share) ** 2;

export function gliderOf<Point>(
  place: (at: Point) => void,
  between: (from: Point, to: Point, share: number) => Point,
  clock: GlideClock = pageClock,
): Glider<Point> {
  let glide: Glide<Point> | undefined;
  let frame: number | undefined;
  const pointOf = (running: Glide<Point>, share: number) =>
    share === 1 ? running.to : between(running.from, running.to, eased(share));
  const step = () => {
    frame = undefined;
    const running = glide;
    if (running === undefined) {
      return;
    }
    const share = shareOf(running.start, clock.now());
    if (share === 1) {
      glide = undefined;
    } else {
      frame = clock.frame(step);
    }
    place(pointOf(running, share));
  };
  return {
    glideTo: (to, resting) => {
      const now = clock.now();
      glide = {
        from:
          glide === undefined
            ? resting
            : pointOf(glide, shareOf(glide.start, now)),
        to,
        start: now,
      };
      frame ??= clock.frame(step);
    },
    settle: () => {
      glide = undefined;
      if (frame !== undefined) {
        clock.cancel(frame);
        frame = undefined;
      }
    },
    target: () => glide?.to,
  };
}
