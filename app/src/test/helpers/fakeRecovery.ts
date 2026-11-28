import type { RecoveryCopies } from '../../lib/main/recoveryCopies';

export function fakeRecovery(left: Record<string, unknown> = {}) {
  const leftBefore = new Map(Object.entries(left));
  const kept = new Map<string, () => unknown>();
  const recovery: RecoveryCopies = {
    keep: (key, copy) => {
      kept.set(key, copy);
    },
    drop: (key) => {
      kept.delete(key);
    },
    take: (key) => {
      const copy = leftBefore.get(key);
      leftBefore.delete(key);
      return copy;
    },
    flush: () => Promise.resolve(),
  };
  const copies = () =>
    Object.fromEntries([...kept].map(([key, copy]) => [key, copy()]));
  return { recovery, copies };
}
