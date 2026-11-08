import type { FromFlatWorker, ToFlatWorker } from './flatMessages';
import { FlatSorter } from './flatOrder';

interface WorkerScope {
  postMessage(
    message: FromFlatWorker,
    options: { readonly transfer: Transferable[] },
  ): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<ToFlatWorker>) => void,
  ): void;
}

const scope: WorkerScope = Reflect.get(globalThis, 'self');

const sorter = new FlatSorter(
  (answer, transfer) => scope.postMessage(answer, { transfer }),
  (run) => setTimeout(run, 0),
);

scope.addEventListener('message', ({ data }) => sorter.receive(data));
