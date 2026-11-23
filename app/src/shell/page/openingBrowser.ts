import type { FromOpeningWorker, ToOpeningWorker } from './openingMessages';
import { openingTimes } from './openingMotion';
import type { OpeningPage } from './openingStart';

export function browserOpening(): OpeningPage {
  return {
    document,
    reducesMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    firstFrame: (run) => {
      requestAnimationFrame(run);
    },
    fadeSky: (sky, startedAt) => {
      const fade = sky.animate([{ opacity: 1 }, { opacity: 0 }], {
        delay: openingTimes.skyFading,
        duration: openingTimes.skyFaded - openingTimes.skyFading,
        easing: 'ease-in-out',
        fill: 'forwards',
      });
      fade.startTime = startedAt;
    },
    draw: (canvas) => {
      const worker = new Worker(new URL('openingWorker.js', location.href), {
        type: 'module',
      });
      return {
        begin: (startedAt, pixels) => {
          const offscreen = canvas.transferControlToOffscreen();
          const start: ToOpeningWorker = {
            type: 'start',
            canvas: offscreen,
            startedAt: performance.timeOrigin + startedAt,
            pixels,
          };
          worker.postMessage(start, [offscreen]);
        },
        post: (message) => worker.postMessage(message),
        listen: (heard, failed) => {
          worker.addEventListener(
            'message',
            ({ data }: MessageEvent<FromOpeningWorker>) => heard(data),
          );
          worker.addEventListener('error', failed);
        },
        stop: () => worker.terminate(),
      };
    },
    watchSize: (canvas, sized) => {
      const observer = new ResizeObserver(([entry]) => {
        const [pixels] = entry?.devicePixelContentBoxSize ?? [];
        if (entry !== undefined && pixels !== undefined) {
          sized({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
            pixelWidth: pixels.inlineSize,
            pixelHeight: pixels.blockSize,
          });
        }
      });
      observer.observe(canvas, { box: 'device-pixel-content-box' });
      return () => observer.disconnect();
    },
    watchTree: (root, changed) => {
      const observer = new MutationObserver(changed);
      observer.observe(root, { childList: true, subtree: true });
      return () => observer.disconnect();
    },
    later: (run, milliseconds) => {
      setTimeout(run, milliseconds);
    },
    showWindow: () => window.fastforward.showWindow(),
  };
}
