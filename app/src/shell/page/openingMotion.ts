import { appIconDrawing } from './appIconDrawing';

export interface OpeningViewport {
  readonly width: number;
  readonly height: number;
}

export interface OpeningLanding {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface OpeningPose {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly opacity: number;
  readonly settled: boolean;
}

export const openingTimes = {
  risen: 550,
  pulledBack: 1050,
  leaving: 1130,
  ended: 1500,
  skyFading: 600,
  skyFaded: 1100,
} as const;

const firstCover = 1.6;
const logoShare = 0.125;
const leastLogoRadius = 32;
const mostLogoRadius = 96;
const vanishedShare = 0.6;

const icon = appIconDrawing();
const folderTopAboveMiddle = 1 - (2 * icon.tabTop) / icon.size;

type Place = Omit<OpeningPose, 'settled'>;

function easedOut(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function easedInOut(progress: number): number {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (2 - 2 * progress) ** 3 / 2;
}

function progressBetween(elapsed: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (elapsed - from) / (to - from)));
}

function between(from: Place, to: Place, progress: number): OpeningPose {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
    radius: from.radius * (to.radius / from.radius) ** progress,
    opacity: from.opacity + (to.opacity - from.opacity) * progress,
    settled: false,
  };
}

export function openingPose(
  elapsed: number,
  { width, height }: OpeningViewport,
  landing: OpeningLanding | undefined,
): OpeningPose {
  const middle = { x: width / 2, y: height / 2, opacity: 1 };
  const cover = Math.hypot(width, height) / 2;
  const first = cover * firstCover;
  const logo = Math.min(
    mostLogoRadius,
    Math.max(leastLogoRadius, Math.min(width, height) * logoShare),
  );
  const below = {
    ...middle,
    y: height + folderTopAboveMiddle * first,
    radius: first,
  };
  const covering = { ...middle, radius: cover };
  const shown = { ...middle, radius: logo };
  const gone =
    landing === undefined
      ? { ...middle, radius: logo * vanishedShare, opacity: 0 }
      : { x: landing.x, y: landing.y, radius: landing.size / 2, opacity: 1 };
  const { risen, pulledBack, leaving, ended } = openingTimes;
  if (elapsed >= ended) {
    return { ...gone, settled: true };
  }
  if (elapsed >= leaving) {
    return between(
      shown,
      gone,
      easedInOut(progressBetween(elapsed, leaving, ended)),
    );
  }
  if (elapsed >= risen) {
    return between(
      covering,
      shown,
      easedInOut(progressBetween(elapsed, risen, pulledBack)),
    );
  }
  return between(below, covering, easedOut(progressBetween(elapsed, 0, risen)));
}
