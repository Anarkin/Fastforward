import { openingId } from '../shared/opening';
import { appIconColors } from './appIconDrawing';
import type {
  FromOpeningWorker,
  OpeningPixels,
  ToOpeningWorker,
} from './openingMessages';
import { openingTimes, type OpeningLanding } from './openingMotion';

export interface OpeningWorker {
  begin(startedAt: number, pixels: OpeningPixels): void;
  post(message: Exclude<ToOpeningWorker, { type: 'start' }>): void;
  listen(heard: (message: FromOpeningWorker) => void, failed: () => void): void;
  stop(): void;
}

export interface OpeningPage {
  readonly document: Document;
  readonly reducesMotion: boolean;
  readonly firstFrame: (run: (time: number) => void) => void;
  readonly fadeSky: (sky: HTMLElement, startedAt: number) => void;
  readonly draw: (canvas: HTMLCanvasElement) => OpeningWorker;
  readonly watchSize: (
    canvas: HTMLCanvasElement,
    sized: (pixels: OpeningPixels) => void,
  ) => () => void;
  readonly watchTree: (root: Node, changed: () => void) => () => void;
  readonly later: (run: () => void, milliseconds: number) => void;
  readonly showWindow: () => void;
}

export interface OpeningAddress {
  readonly location: Pick<Location, 'hash' | 'pathname' | 'search'>;
  readonly history: Pick<History, 'replaceState'>;
}

const playing = 'data-opening';
const titleBarIcon = '.tabs .title-bar-icon';
const remeasuredBeforeLeaving = 100;
const endedAtTheLatest = 1000;

function watchingNothing(): void {
  return undefined;
}

function pixelsOf(canvas: HTMLCanvasElement, ratio: number): OpeningPixels {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  return {
    width,
    height,
    pixelWidth: Math.round(width * ratio),
    pixelHeight: Math.round(height * ratio),
  };
}

function landingOf(icon: Element): OpeningLanding {
  const box = icon.getBoundingClientRect();
  return {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
    size: box.width,
  };
}

function play(page: OpeningPage, showsWindow: boolean): void {
  const { document } = page;
  const root = document.documentElement;
  const opening = document.createElement('div');
  opening.id = openingId;
  opening.setAttribute('aria-hidden', 'true');
  const sky = document.createElement('div');
  sky.className = 'opening-sky';
  sky.style.background = appIconColors.sky;
  const canvas = document.createElement('canvas');
  canvas.className = 'opening-icon';
  opening.append(sky, canvas);
  document.body.append(opening);
  root.toggleAttribute(playing, true);
  const worker = page.draw(canvas);
  let ended = false;
  let stopTree = watchingNothing;
  let stopSize = watchingNothing;
  const end = () => {
    if (ended) {
      return;
    }
    ended = true;
    stopTree();
    stopSize();
    worker.stop();
    opening.remove();
    root.removeAttribute(playing);
  };
  worker.listen((message) => {
    if (message.type === 'done') {
      end();
    }
  }, end);
  const land = (): boolean => {
    const icon = document.querySelector(titleBarIcon);
    if (icon !== null && !ended) {
      worker.post({ type: 'land', landing: landingOf(icon) });
    }
    return icon !== null;
  };
  page.firstFrame((startedAt) => {
    if (ended) {
      return;
    }
    page.fadeSky(sky, startedAt);
    worker.begin(
      startedAt,
      pixelsOf(canvas, document.defaultView?.devicePixelRatio ?? 1),
    );
    if (showsWindow) {
      page.showWindow();
    }
    if (!land()) {
      stopTree = page.watchTree(root, () => {
        if (land()) {
          stopTree();
        }
      });
    }
    stopSize = page.watchSize(canvas, (pixels) => {
      worker.post({ type: 'resize', pixels });
      land();
    });
    page.later(land, openingTimes.leaving - remeasuredBeforeLeaving);
    page.later(end, openingTimes.ended + endedAtTheLatest);
  });
}

export function startOpening(
  page: OpeningPage,
  { location, history }: OpeningAddress,
): void {
  if (location.hash !== `#${openingId}`) {
    return;
  }
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  if (!page.reducesMotion) {
    play(page, true);
  }
}

export function replayOpening(page: OpeningPage): void {
  if (!page.document.documentElement.hasAttribute(playing)) {
    play(page, false);
  }
}
