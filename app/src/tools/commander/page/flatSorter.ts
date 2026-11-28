import type { FromFlatWorker, ToFlatWorker } from './flatMessages';
import { FlatOrder } from './flatOrder';

export class FlatSorter {
  private readonly panes = new Map<
    string,
    { readonly walk: number; readonly order: FlatOrder; batch: number }
  >();
  private readonly due = new Set<string>();
  private scheduled = false;

  constructor(
    private readonly post: (
      answer: FromFlatWorker,
      transfer: Transferable[],
    ) => void,
    private readonly schedule: (run: () => void) => void,
  ) {}

  receive(message: ToFlatWorker): void {
    if (message.type === 'drop') {
      this.panes.delete(message.pane);
      this.due.delete(message.pane);
      return;
    }
    if (message.type === 'start') {
      this.panes.set(message.pane, {
        walk: message.walk,
        order: new FlatOrder(message.choices),
        batch: 0,
      });
    } else {
      const kept = this.panes.get(message.pane);
      if (kept?.walk !== message.walk) {
        return;
      }
      if (message.type === 'files') {
        kept.order.put(message.folders, message.freed);
        kept.batch = message.batch;
      } else {
        kept.order.choose(message.choices);
      }
    }
    this.due.add(message.pane);
    if (!this.scheduled) {
      this.scheduled = true;
      this.schedule(() => this.answer());
    }
  }

  private answer(): void {
    this.scheduled = false;
    const due = [...this.due];
    this.due.clear();
    for (const pane of due) {
      const kept = this.panes.get(pane);
      if (kept === undefined) {
        continue;
      }
      const { order, shown, query, options } = kept.order.result();
      this.post(
        {
          type: 'order',
          pane,
          walk: kept.walk,
          batch: kept.batch,
          query,
          options,
          order,
          shown,
        },
        shown === undefined ? [order.buffer] : [order.buffer, shown.buffer],
      );
    }
  }
}
