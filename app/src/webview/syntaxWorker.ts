import { errorText } from './errors';
import { serveColoring, type FromSyntax, type ToSyntax } from './syntaxEngine';

interface WorkerScope {
  postMessage(message: FromSyntax): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<ToSyntax>) => void,
  ): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  addEventListener(
    type: 'unhandledrejection',
    listener: (event: PromiseRejectionEvent) => void,
  ): void;
}

const scope: WorkerScope = Reflect.get(globalThis, 'self');

// setTimeout waits at least 4 ms once nested, a third of a slice
function promptly(): (run: () => void) => void {
  const channel = new MessageChannel();
  const queued: (() => void)[] = [];
  channel.port1.addEventListener('message', () => queued.shift()?.());
  channel.port1.start();
  return (run) => {
    queued.push(run);
    channel.port2.postMessage(undefined);
  };
}

const post = (message: FromSyntax) => scope.postMessage(message);
const serve = serveColoring(post, promptly());
scope.addEventListener('message', (event) => serve(event.data));
scope.addEventListener('error', (event) =>
  post({ type: 'failed', message: errorText(event.error ?? event.message) }),
);
scope.addEventListener('unhandledrejection', (event) =>
  post({ type: 'failed', message: errorText(event.reason) }),
);
