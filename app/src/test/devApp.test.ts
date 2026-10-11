import * as assert from 'node:assert';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const appFolder = path.join(__dirname, '..', '..');

type App = Pick<EventEmitter, 'once' | 'emit'> & {
  exitCode: number | null;
  signalCode: string | null;
  connected: boolean;
  disconnect(): void;
  kill(): boolean;
};

async function loadQuitApp() {
  const {
    quitApp,
  }: { quitApp: (app: App, killAfterMs?: number) => Promise<void> } =
    await import(pathToFileURL(path.join(appFolder, 'devApp.mjs')).href);
  return quitApp;
}

function fakeApp({ quitsWhenAsked }: { quitsWhenAsked: boolean }) {
  const calls: string[] = [];
  const app: App = Object.assign(new EventEmitter(), {
    exitCode: null,
    signalCode: null,
    connected: true,
    disconnect() {
      calls.push('disconnect');
      if (quitsWhenAsked) {
        app.emit('exit', 0);
      }
    },
    kill() {
      calls.push('kill');
      app.emit('exit', null, 'SIGTERM');
      return true;
    },
  });
  return { app, calls };
}

suite('Dev app', () => {
  test("asks the app to quit by closing its IPC channel rather than killing it, as killing skips its close and will-quit handlers on Windows, losing the window's place and cutting a checkout short", async () => {
    const quitApp = await loadQuitApp();
    const { app, calls } = fakeApp({ quitsWhenAsked: true });
    await quitApp(app, 10_000);
    assert.deepStrictEqual(calls, ['disconnect']);
  });

  test('kills the app once it has not quit within the time given', async () => {
    const quitApp = await loadQuitApp();
    const { app, calls } = fakeApp({ quitsWhenAsked: false });
    await quitApp(app, 10);
    assert.deepStrictEqual(calls, ['disconnect', 'kill']);
  });
});
