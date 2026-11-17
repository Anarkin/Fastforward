export interface SettingsAccess {
  readonly read: () => string | undefined;
  readonly write: (text: string) => void;
  readonly saving: () => boolean;
  readonly shown: () => Promise<string>;
}

export const resetMark = (count: number) => `'reset ${count}'`;

const paused = (time: number) =>
  new Promise((resolve) => setTimeout(resolve, time));

async function awaited(
  ended: () => boolean | Promise<boolean>,
  what: string,
  pause: number,
  timeout: number,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await ended())) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await paused(pause);
  }
}

export async function shownReset(
  access: SettingsAccess,
  textOf: (count: number) => string,
  first: number,
  {
    tries = 20,
    pause = 20,
    timeout = 30_000,
  }: {
    readonly tries?: number;
    readonly pause?: number;
    readonly timeout?: number;
  } = {},
): Promise<number> {
  for (let count = first; count < first + tries; count += 1) {
    await awaited(
      () => !access.saving(),
      'the app to end saving its settings',
      pause,
      timeout,
    );
    const text = textOf(count);
    access.write(text);
    await awaited(
      async () =>
        access.read() !== text ||
        (await access.shown()).includes(resetMark(count)),
      'the page to load with the settings reset',
      pause,
      timeout,
    );
    if (access.read() === text && !access.saving()) {
      return count;
    }
  }
  throw new Error(
    `The settings were written over each of the ${tries} times they were reset`,
  );
}
