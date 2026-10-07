import * as assert from 'node:assert';
import type { Timer } from '../autoFetch';

export function fakeTimer() {
  const pending: { run: () => void; ms: number; cancelled: boolean }[] = [];
  const timer: Timer = (run, ms) => {
    const entry = { run, ms, cancelled: false };
    pending.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };
  const waiting = () => pending.filter((entry) => !entry.cancelled);
  const fire = async () => {
    const [next] = waiting();
    assert.ok(next, 'a timer is waiting');
    next.cancelled = true;
    next.run();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { timer, waiting, fire };
}
