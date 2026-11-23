import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { appIconDrawing } from '../../../../shell/page/appIconDrawing';
import {
  openingPose,
  openingTimes,
  type OpeningPose,
} from '../../../../shell/page/openingMotion';

const window = { width: 1600, height: 1000 };
const landing = { x: 24, y: 19, size: 20 };
const icon = appIconDrawing();

function folderTop(pose: OpeningPose): number {
  return pose.y - pose.radius + (2 * pose.radius * icon.tabTop) / icon.size;
}

function covers(pose: OpeningPose): boolean {
  return [
    [0, 0],
    [window.width, 0],
    [0, window.height],
    [window.width, window.height],
  ].every(
    ([x = 0, y = 0]) => Math.hypot(x - pose.x, y - pose.y) <= pose.radius,
  );
}

function near(actual: number, expected: number, what: string): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `${what} is ${actual}, not ${expected}`,
  );
}

suite('Opening motion', () => {
  test('opens on nothing but sky, the top of the folder on the bottom edge of the window, the sky around the disc as blue as its own', () => {
    const pose = openingPose(0, window, landing);
    near(folderTop(pose), window.height, 'the top of the folder');
    near(pose.x, window.width / 2, 'the middle of the disc');
    assert.ok(pose.radius > Math.hypot(window.width, window.height) / 2);
    assert.strictEqual(pose.opacity, 1);
  });

  test('raises the folder into the window as it draws back, never sinking, until the disc stands in the middle of the window just covering it', () => {
    const tops = Array.from({ length: 56 }, (_, step) =>
      folderTop(openingPose((step * openingTimes.risen) / 55, window, landing)),
    );
    assert.ok(
      tops.every((top, step) => step === 0 || top < (tops[step - 1] ?? 0)),
    );
    const risen = openingPose(openingTimes.risen, window, landing);
    near(risen.x, window.width / 2, 'the middle of the disc');
    near(risen.y, window.height / 2, 'the middle of the disc');
    near(risen.radius, Math.hypot(window.width, window.height) / 2, 'radius');
    assert.ok(covers({ ...risen, radius: risen.radius + 1e-6 }));
  });

  test('draws back to the logo in the middle of the window, as wide as a quarter of its shorter side, within 64 and 192 pixels', () => {
    for (const [size, diameter] of [
      [{ width: 1600, height: 1000 }, 192],
      [{ width: 1000, height: 600 }, 150],
      [{ width: 300, height: 200 }, 64],
    ] as const) {
      const pose = openingPose(openingTimes.pulledBack, size, landing);
      near(pose.x, size.width / 2, 'the middle of the logo');
      near(pose.y, size.height / 2, 'the middle of the logo');
      near(2 * pose.radius, diameter, 'the width of the logo');
    }
  });

  test('holds the logo still from the moment it is drawn back until it leaves, so it is seen before it moves', () => {
    assert.deepStrictEqual(
      openingPose(openingTimes.leaving, window, landing),
      openingPose(openingTimes.pulledBack, window, landing),
    );
  });

  test('lands on the icon of the title bar, its middle and its size, settled only once the opening has ended', () => {
    const before = openingPose(openingTimes.ended - 1, window, landing);
    assert.ok(!before.settled);
    const landed = openingPose(openingTimes.ended, window, landing);
    assert.deepStrictEqual(landed, {
      x: landing.x,
      y: landing.y,
      radius: landing.size / 2,
      opacity: 1,
      settled: true,
    });
    assert.deepStrictEqual(
      openingPose(openingTimes.ended + 500, window, landing),
      landed,
    );
  });

  test('fades the logo away in the middle of the window when there is no icon of the title bar to land on', () => {
    const pose = openingPose(openingTimes.ended, window, undefined);
    assert.strictEqual(pose.opacity, 0);
    assert.ok(pose.settled);
    near(pose.x, window.width / 2, 'the middle of the logo');
  });

  test('moves on without a jump from one stage to the next', () => {
    for (const time of [
      openingTimes.risen,
      openingTimes.pulledBack,
      openingTimes.leaving,
      openingTimes.ended,
    ]) {
      const before = openingPose(time - 0.01, window, landing);
      const after = openingPose(time, window, landing);
      assert.ok(Math.abs(before.x - after.x) < 0.5, `x at ${time}`);
      assert.ok(Math.abs(before.y - after.y) < 0.5, `y at ${time}`);
      assert.ok(
        Math.abs(before.radius - after.radius) < 0.5,
        `radius at ${time}`,
      );
    }
  });

  test('fades the sky only once the folder has risen, and has faded it before the logo leaves for the title bar', () => {
    assert.ok(openingTimes.skyFading >= openingTimes.risen);
    assert.ok(openingTimes.skyFaded > openingTimes.skyFading);
    assert.ok(openingTimes.skyFaded <= openingTimes.leaving);
  });
});
