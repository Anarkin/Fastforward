import type { ToWebview } from '../shared/protocol';

export interface HeldPicture {
  readonly updateCallbackDone: Promise<unknown>;
  readonly skipTransition: () => void;
}

export interface SwitchingPage {
  readonly startViewTransition?: (update: () => void) => HeldPicture;
}

export interface ShownTab {
  readonly active: () => string | undefined;
  readonly hold: () => number;
  readonly settled: (within: number) => Promise<void>;
}

export function holdingSwitches(
  receive: (message: ToWebview) => void,
  shown: ShownTab,
  page: SwitchingPage,
): (message: ToWebview) => void {
  let held: ToWebview[] | undefined;
  return (message) => {
    if (held !== undefined) {
      held.push(message);
      return;
    }
    const left = shown.active();
    const hold = shown.hold();
    if (
      message.type !== 'tabs' ||
      left === undefined ||
      message.active === undefined ||
      message.active === left ||
      hold <= 0 ||
      page.startViewTransition === undefined
    ) {
      receive(message);
      return;
    }
    held = [message];
    const picture = page.startViewTransition(() => {
      const waiting = held ?? [];
      held = undefined;
      for (const each of waiting) {
        receive(each);
      }
    });
    const shows = () => picture.skipTransition();
    void picture.updateCallbackDone
      .then(() => shown.settled(hold))
      .then(shows, shows);
  };
}
