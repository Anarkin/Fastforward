import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { unpacked, unpackedKoffi } from '../../../../lib/main/unpacked';

suite('Files unpacked from the asar', () => {
  test('loads koffi in a worker from where the app keeps it unpacked from its asar, as a worker can read no asar', () => {
    assert.strictEqual(
      unpacked(
        path.join(
          'C:',
          'Fastforward',
          'resources',
          'app.asar',
          'node_modules',
          'koffi',
          'index.cjs',
        ),
      ),
      path.join(
        'C:',
        'Fastforward',
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'koffi',
        'index.cjs',
      ),
    );
    const outside = path.join(
      'C:',
      'app',
      'node_modules',
      'koffi',
      'index.cjs',
    );
    assert.strictEqual(unpacked(outside), outside);
  });

  test('finds koffi where it is installed, by a whole path a worker can load it from', () => {
    const koffi = unpackedKoffi();

    assert.ok(path.isAbsolute(koffi));
    assert.ok(fs.existsSync(koffi));
  });
});
