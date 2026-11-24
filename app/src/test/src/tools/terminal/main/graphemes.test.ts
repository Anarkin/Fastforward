import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { build } from 'esbuild';
import { suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('The widths of graphemes in the terminal', () => {
  test('loads the add-on of grapheme widths whatever the pool of Node buffers holds, putting the pool size back, as it read its table through the whole pool and threw Data error once the bytes before its own were not what it expected', async () => {
    const folder = tempFolder('graphemes');
    try {
      const bundle = path.join(folder, 'graphemes.cjs');
      await build({
        entryPoints: [
          path.join(
            __dirname,
            '..',
            '..',
            '..',
            '..',
            '..',
            'tools',
            'terminal',
            'main',
            'graphemes.ts',
          ),
        ],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile: bundle,
        logLevel: 'silent',
      });
      const script = path.join(folder, 'load.cjs');
      fs.writeFileSync(
        script,
        `Buffer.from(new Array(16).fill(0));
const before = Buffer.poolSize;
const { UnicodeGraphemesAddon } = require(${JSON.stringify(bundle)});
process.stdout.write(JSON.stringify({ loaded: typeof UnicodeGraphemesAddon, poolKept: Buffer.poolSize === before }));`,
      );
      const told = execFileSync(process.execPath, [script], {
        encoding: 'utf8',
      });
      assert.deepStrictEqual(JSON.parse(told), {
        loaded: 'function',
        poolKept: true,
      });
    } finally {
      removeFolder(folder);
    }
  });
});
