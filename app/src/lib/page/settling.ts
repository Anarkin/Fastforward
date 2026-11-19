export interface SettleClock {
  readonly now: () => number;
  readonly frame: (run: () => void) => void;
  readonly idle: (run: () => void) => void;
  readonly after: (wait: number, run: () => void) => () => void;
  readonly watch: (root: Node, changed: () => void) => () => void;
}

const pageClock: SettleClock = {
  now: () => performance.now(),
  frame: (run) => {
    requestAnimationFrame(run);
  },
  idle: (run) => {
    requestIdleCallback(run);
  },
  after: (wait, run) => {
    const timer = setTimeout(run, wait);
    return () => clearTimeout(timer);
  },
  watch: (root, changed) => {
    const observer = new MutationObserver(changed);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    return () => observer.disconnect();
  },
};

export const forgottenAfter = 2000;

export const quietFrames = 2;

export const quietTime = 16;

let awaited = 0;

export function settling(clock: SettleClock = pageClock): () => void {
  awaited += 1;
  let done = false;
  const came = () => {
    if (!done) {
      done = true;
      awaited -= 1;
      cancel();
    }
  };
  const cancel = clock.after(forgottenAfter, came);
  return came;
}

const waits = new Map<string, () => void>();

export function arrived(what: string): void {
  waits.get(what)?.();
  waits.delete(what);
}

export function awaiting(what: string, clock: SettleClock = pageClock): void {
  arrived(what);
  waits.set(what, settling(clock));
}

export function whenSettled(
  root: Node,
  within: number,
  clock: SettleClock = pageClock,
): Promise<void> {
  return new Promise((resolve) => {
    let frames = 0;
    let since = clock.now();
    let over = false;
    const busy = () => {
      frames = 0;
      since = clock.now();
    };
    const finish = () => {
      if (!over) {
        over = true;
        unwatch();
        cancel();
        resolve();
      }
    };
    const unwatch = clock.watch(root, busy);
    const cancel = clock.after(within, finish);
    const rested = (asOf: number) => {
      if (over) {
        return;
      }
      if (since === asOf && awaited === 0) {
        finish();
      } else {
        clock.frame(frame);
      }
    };
    const frame = () => {
      if (over) {
        return;
      }
      if (awaited > 0) {
        busy();
      } else {
        frames += 1;
      }
      if (frames >= quietFrames && clock.now() - since >= quietTime) {
        const asOf = since;
        clock.idle(() => rested(asOf));
      } else {
        clock.frame(frame);
      }
    };
    clock.frame(frame);
  });
}
