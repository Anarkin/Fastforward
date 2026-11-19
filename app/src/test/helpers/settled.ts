import { whenSettled, type SettleClock } from '../../lib/page/settling';
import { posingAsElement } from './fixtures';

export async function settledNow(): Promise<boolean> {
  let now = 0;
  let waiting: (() => void)[] = [];
  let settled = false;
  const later = (run: () => void) => {
    waiting.push(run);
  };
  const clock: SettleClock = {
    now: () => now,
    frame: later,
    idle: later,
    after: () => () => undefined,
    watch: () => () => undefined,
  };
  void whenSettled(posingAsElement({}), 0, clock).then(() => {
    settled = true;
  });
  for (let turn = 0; turn < 20 && waiting.length > 0; turn++) {
    now += 20;
    const due = waiting;
    waiting = [];
    for (const run of due) {
      run();
    }
    await Promise.resolve();
  }
  return settled;
}
