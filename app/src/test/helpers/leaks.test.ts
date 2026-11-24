import * as assert from 'node:assert';
import { act } from 'react';
import { suite, test } from 'vitest';
import { leaksSince, stateNow } from './leaks';

const os = process.getBuiltinModule('node:os');

suite('What a test file leaves behind for the files after it', () => {
  test('is nothing once it put back everything it changed', () => {
    const before = stateNow();
    const { platform } = os;
    Reflect.set(os, 'platform', () => 'plan9');
    Reflect.set(globalThis, 'leftBehind', 1);
    process.env.FASTFORWARD_LEAK_TEST = '1';
    Reflect.set(os, 'platform', platform);
    Reflect.deleteProperty(globalThis, 'leftBehind');
    delete process.env.FASTFORWARD_LEAK_TEST;
    assert.deepStrictEqual(leaksSince(before), []);
  });

  test('names the globals, environment variables, working folder and exports of built-in modules it left changed, as a file sharing its modules with the next one broke that one', () => {
    const before = stateNow();
    const { platform } = os;
    const { setTimeout } = globalThis;
    const folder = process.cwd();
    try {
      Reflect.set(globalThis, 'leftBehind', 1);
      Reflect.set(globalThis, 'setTimeout', () => 0);
      process.env.FASTFORWARD_LEAK_TEST = '1';
      Reflect.set(os, 'platform', () => 'plan9');
      process.chdir(os.tmpdir());
      assert.deepStrictEqual(leaksSince(before), [
        'the global leftBehind',
        'the global setTimeout',
        'the environment variable FASTFORWARD_LEAK_TEST',
        'the working folder',
        'platform of node:os',
      ]);
    } finally {
      Reflect.deleteProperty(globalThis, 'leftBehind');
      Reflect.set(globalThis, 'setTimeout', setTimeout);
      delete process.env.FASTFORWARD_LEAK_TEST;
      Reflect.set(os, 'platform', platform);
      process.chdir(folder);
    }
  });

  test('names an act of React it left open, as an act never awaited held back the updates of every file after it in the worker', async () => {
    const before = stateNow();
    const open = act(async () => {});
    try {
      assert.deepStrictEqual(leaksSince(before), [
        'an act of React, never awaited',
      ]);
    } finally {
      await open;
    }
    assert.deepStrictEqual(leaksSince(before), []);
  });
});
