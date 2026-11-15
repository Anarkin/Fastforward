import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';

const appFolder = path.join(__dirname, '..', '..', '..');

suite('Electron fuses', () => {
  test('turns off running the app as Node, NODE_OPTIONS and the inspector flags, and loads it only from its asar, as anything able to start it could run code in it through them', () => {
    const { build } = JSON.parse(
      fs.readFileSync(path.join(appFolder, 'package.json'), 'utf8'),
    );
    assert.deepStrictEqual(
      {
        runAsNode: build.electronFuses.runAsNode,
        enableNodeOptionsEnvironmentVariable:
          build.electronFuses.enableNodeOptionsEnvironmentVariable,
        enableNodeCliInspectArguments:
          build.electronFuses.enableNodeCliInspectArguments,
        onlyLoadAppFromAsar: build.electronFuses.onlyLoadAppFromAsar,
      },
      {
        runAsNode: false,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        onlyLoadAppFromAsar: true,
      },
    );
  });

  test('loads the app only from an asar whose header matches the hash electron-builder writes into the executable on Windows and into Info.plist on macOS, as only loading from the asar still ran an asar edited in the folder of a per-user install', () => {
    const { build } = JSON.parse(
      fs.readFileSync(path.join(appFolder, 'package.json'), 'utf8'),
    );
    assert.strictEqual(
      build.electronFuses.enableEmbeddedAsarIntegrityValidation,
      true,
    );
    assert.notStrictEqual(build.disableAsarIntegrity, true);
  });

  test('turns off the privileges Electron grants pages of file URLs beyond what a browser does, as the app serves its pages from a scheme of its own, so none needs them, and a page of a file URL would read other files through them', () => {
    const { build } = JSON.parse(
      fs.readFileSync(path.join(appFolder, 'package.json'), 'utf8'),
    );
    assert.strictEqual(
      build.electronFuses.grantFileProtocolExtraPrivileges,
      false,
    );
  });
});
