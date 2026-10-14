import type { ChildProcess } from 'node:child_process';

export async function quitApp(app: ChildProcess, killAfterMs = 5000) {
  if (app.exitCode !== null || app.signalCode !== null) {
    return;
  }
  const exited = new Promise((resolve) => app.once('exit', resolve));
  if (app.connected) {
    app.disconnect();
  }
  const killing = setTimeout(() => app.kill(), killAfterMs);
  await exited;
  clearTimeout(killing);
}
