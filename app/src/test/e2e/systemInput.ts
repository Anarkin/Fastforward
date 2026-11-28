import type { ElectronApplication, Page } from 'playwright-core';
import { waitFor } from '../helpers/fixtures';

type SystemEvent = Electron.MouseInputEvent | Electron.KeyboardInputEvent;

export async function inFront(
  app: ElectronApplication,
  page: Page,
): Promise<void> {
  const window = await app.browserWindow(page);
  await app.evaluate((electron) => electron.app.focus({ steal: true }));
  await window.evaluate((shown) => shown.focus());
  await waitFor(
    () => window.evaluate((shown) => shown.isFocused()),
    'the window to be in front',
  );
}

async function systemInput(
  app: ElectronApplication,
  page: Page,
  events: readonly SystemEvent[],
): Promise<void> {
  const window = await app.browserWindow(page);
  await window.evaluate((shown, all) => {
    for (const each of all) {
      shown.webContents.sendInputEvent(each);
    }
  }, events);
}

export function systemDoubleClick(
  app: ElectronApplication,
  page: Page,
  at: { readonly x: number; readonly y: number },
): Promise<void> {
  const point = { x: Math.round(at.x), y: Math.round(at.y) };
  return systemInput(app, page, [
    { type: 'mouseMove', ...point },
    ...[1, 2].flatMap((clickCount): SystemEvent[] => [
      { type: 'mouseDown', ...point, button: 'left', clickCount },
      { type: 'mouseUp', ...point, button: 'left', clickCount },
    ]),
  ]);
}

const clipboardKeys = { copy: 'C', cut: 'X', paste: 'V' } as const;

export async function systemClipboard(
  app: ElectronApplication,
  page: Page,
  act: keyof typeof clipboardKeys,
): Promise<void> {
  if (process.platform === 'darwin') {
    const window = await app.browserWindow(page);
    await window.evaluate((shown, asked) => shown.webContents[asked](), act);
    return;
  }
  const keyCode = clipboardKeys[act];
  await systemInput(app, page, [
    { type: 'keyDown', keyCode: 'Control', modifiers: ['control'] },
    { type: 'keyDown', keyCode, modifiers: ['control'] },
    { type: 'keyUp', keyCode, modifiers: ['control'] },
    { type: 'keyUp', keyCode: 'Control' },
  ]);
}
