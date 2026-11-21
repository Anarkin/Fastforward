import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';

const appFolder = path.join(__dirname, '..', '..', '..', '..');

interface IcnsEntry {
  readonly type: string;
  readonly png: Uint8Array;
}

interface Icns {
  readonly icnsOf: (entries: readonly IcnsEntry[]) => Uint8Array;
  readonly entriesOfIcns: (bytes: Uint8Array) => IcnsEntry[];
}

async function loadIcns(): Promise<Icns> {
  const loaded: Icns = await import(
    pathToFileURL(path.join(appFolder, 'scripts', 'icons', 'icns.mts')).href
  );
  return loaded;
}

suite('ICNS', () => {
  test('heads the file and each entry with its type and its length in big-endian bytes, as macOS reads them, and gives the entries back as they were given', async () => {
    const { icnsOf, entriesOfIcns } = await loadIcns();
    const entries = [
      { type: 'icp4', png: Uint8Array.of(1, 2, 3) },
      { type: 'ic10', png: Uint8Array.of(4) },
    ];
    const icns = icnsOf(entries);
    const view = new DataView(icns.buffer, icns.byteOffset, icns.byteLength);
    assert.strictEqual(new TextDecoder().decode(icns.subarray(0, 4)), 'icns');
    assert.strictEqual(view.getUint32(4), icns.byteLength);
    assert.strictEqual(new TextDecoder().decode(icns.subarray(8, 12)), 'icp4');
    assert.strictEqual(view.getUint32(12), 8 + 3);
    assert.deepStrictEqual(entriesOfIcns(icns), entries);
  });
});
