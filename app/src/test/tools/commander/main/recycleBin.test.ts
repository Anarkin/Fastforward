import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  recycleBinOff,
  type Hive,
  type WindowsRegistry,
} from '../../../../tools/commander/main/recycleBin';

const volume = '\\\\?\\Volume{8de1f156-3fe2-4ea7-bccb-aa8d9ecd1b79}\\';
const volumeKey =
  'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\BitBucket\\Volume\\{8de1f156-3fe2-4ea7-bccb-aa8d9ecd1b79}';
const policyKey =
  'Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer';

function registry(
  values: Partial<Record<`${Hive} ${string} ${string}`, number>>,
  volumes: Record<string, string> = { 'D:\\photos': volume },
): WindowsRegistry & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    volumeOf: (folder) => {
      asked.push(folder);
      return Promise.resolve(volumes[folder]);
    },
    number: (hive, key, name) => values[`${hive} ${key} ${name}`],
  };
}

suite('Commander Recycle Bin', () => {
  test('says the Recycle Bin is turned off for a folder on a volume set to remove files at once, and on for one set to keep them or never set', async () => {
    const off = registry({ [`currentUser ${volumeKey} NukeOnDelete`]: 1 });
    assert.strictEqual(await recycleBinOff(off, 'D:\\photos'), true);
    assert.deepStrictEqual(off.asked, ['D:\\photos']);

    const kept = registry({ [`currentUser ${volumeKey} NukeOnDelete`]: 0 });
    assert.strictEqual(await recycleBinOff(kept, 'D:\\photos'), false);
    assert.strictEqual(await recycleBinOff(registry({}), 'D:\\photos'), false);
  });

  test('says it is on where the volume is unknown, as on a share, keeping the Recycle Bin wherever it is not known to be off', async () => {
    const off = registry({ [`currentUser ${volumeKey} NukeOnDelete`]: 1 }, {});
    assert.strictEqual(await recycleBinOff(off, '\\\\server\\share'), false);
  });

  test('says it is off on every volume once the policy turns it off, the machine policy before the user one', async () => {
    for (const [values, off] of [
      [{ [`currentUser ${policyKey} NoRecycleFiles`]: 1 }, true],
      [{ [`localMachine ${policyKey} NoRecycleFiles`]: 1 }, true],
      [
        {
          [`localMachine ${policyKey} NoRecycleFiles`]: 0,
          [`currentUser ${policyKey} NoRecycleFiles`]: 1,
        },
        false,
      ],
      [
        {
          [`localMachine ${policyKey} NoRecycleFiles`]: 1,
          [`currentUser ${policyKey} NoRecycleFiles`]: 0,
        },
        true,
      ],
    ] as const) {
      const asked = registry(values, {});
      assert.strictEqual(await recycleBinOff(asked, 'D:\\photos'), off);
    }
    const unrestricted = registry({
      [`localMachine ${policyKey} NoRecycleFiles`]: 0,
      [`currentUser ${volumeKey} NukeOnDelete`]: 1,
    });
    assert.strictEqual(await recycleBinOff(unrestricted, 'D:\\photos'), true);
  });
});
