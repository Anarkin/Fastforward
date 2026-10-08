export interface Glide {
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly duration: number;
}

function progressOf(glide: Glide, now: number): number {
  return glide.duration > 0
    ? Math.max(0, Math.min(1, (now - glide.start) / glide.duration))
    : 1;
}

export function glideAt(glide: Glide, now: number): number {
  const progress = progressOf(glide, now);
  return progress === 1
    ? glide.to
    : glide.from + (glide.to - glide.from) * (1 - (1 - progress) ** 3);
}

export function glideEnded(glide: Glide, now: number): boolean {
  return progressOf(glide, now) === 1;
}

export function glideBy(
  glide: Glide | undefined,
  scrolled: number,
  now: number,
  delta: number,
  duration: number,
  widest: number,
): Glide {
  const within = (at: number) => Math.max(0, Math.min(widest, at));
  return {
    from: within(glide ? glideAt(glide, now) : scrolled),
    to: within((glide?.to ?? scrolled) + delta),
    start: now,
    duration,
  };
}
