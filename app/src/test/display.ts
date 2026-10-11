import * as assert from 'node:assert';

export function assertDisplay(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): void {
  assert.ok(
    platform !== 'linux' || env.DISPLAY || env.WAYLAND_DISPLAY,
    'There is no display to start the app on; run the tests with xvfb-run -a npm test',
  );
}
