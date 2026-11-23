import type { FromOpeningWorker, ToOpeningWorker } from './openingMessages';
import { OpeningFrames } from './openingFrames';

interface WorkerScope {
  postMessage(message: FromOpeningWorker): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<ToOpeningWorker>) => void,
  ): void;
  requestAnimationFrame(run: () => void): number;
}

const scope: WorkerScope = Reflect.get(globalThis, 'self');

const frames = new OpeningFrames({
  now: () => performance.timeOrigin + performance.now(),
  frame: (run) => scope.requestAnimationFrame(run),
  outline: (path) => new Path2D(path),
  post: (message) => scope.postMessage(message),
});

scope.addEventListener('message', ({ data }) => frames.receive(data));
