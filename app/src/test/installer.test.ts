import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeEach, suite, test } from 'vitest';
import { explorerMenuOf } from '../main/explorerMenu';

const appFolder = path.join(__dirname, '..', '..');
const installer = path.join(appFolder, 'build', 'installer.nsh');

function pathScript(): string {
  const defined =
    /^!define FASTFORWARD_PATH_SCRIPT "((?:[^"\n]|\\\r?\n)*)"\r?$/m.exec(
      fs.readFileSync(installer, 'utf8'),
    );
  assert.ok(defined, 'no FASTFORWARD_PATH_SCRIPT in installer.nsh');
  return defined[1].replace(/\\\r?\n/g, '').replaceAll('$$', '$');
}

function uninstallingNotUpdating(): string[] {
  const uninstalling =
    /!macro customUnInstall\s+\$\{ifNot\} \$\{isUpdated\}\r?\n((?:(?!\s*\$\{endIf\}).*\r?\n)*)\s*\$\{endIf\}\s+!macroend/.exec(
      fs.readFileSync(installer, 'utf8'),
    );
  assert.ok(uninstalling, 'no customUnInstall skipping updates');
  return uninstalling[1].split(/\r?\n/).map((line) => line.trim());
}

function reg(...args: string[]): string {
  const ran = spawnSync('reg.exe', args, { encoding: 'utf8' });
  assert.strictEqual(ran.status, 0, ran.stderr);
  return ran.stdout;
}

interface PathValue {
  readonly kind: string;
  readonly value: string;
}

suite.skipIf(process.platform !== 'win32')(
  'Installer on Windows',
  { timeout: 30_000 },
  () => {
    const testKey = `Software\\Fastforward Tests ${randomUUID()}`;
    const environment = `HKCU\\${testKey}\\Environment`;
    const bin = path.join(
      'C:\\Users\\me\\AppData\\Local\\Programs\\fastforward',
      'bin',
    );

    function setPath(value: PathValue | undefined): void {
      reg('add', environment, '/f');
      if (value === undefined) {
        spawnSync('reg.exe', ['delete', environment, '/v', 'Path', '/f']);
        return;
      }
      reg(
        'add',
        environment,
        '/v',
        'Path',
        '/t',
        value.kind,
        '/d',
        value.value,
        '/f',
      );
    }

    function readPath(): PathValue {
      const listed = /^\s+Path\s+(REG_\w+)\s{4}(.*)$/m.exec(
        reg('query', environment, '/v', 'Path'),
      );
      assert.ok(listed, 'no Path');
      return { kind: listed[1], value: listed[2].trimEnd() };
    }

    function change(action: 'add' | 'remove', folder = bin): void {
      const script = pathScript().replace(
        "CreateSubKey('Environment')",
        `CreateSubKey('${testKey}\\Environment')`,
      );
      assert.notStrictEqual(script, pathScript(), 'no Environment key');
      const ran = spawnSync(
        'powershell.exe',
        [
          `-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${script}"`,
        ],
        {
          env: {
            ...process.env,
            FASTFORWARD_BIN: folder,
            FASTFORWARD_PATH_CHANGE: action,
          },
          encoding: 'utf8',
          windowsVerbatimArguments: true,
        },
      );
      assert.strictEqual(ran.status, 0, ran.stderr);
    }

    beforeEach(() => setPath(undefined));

    afterAll(() => {
      spawnSync('reg.exe', ['delete', `HKCU\\${testKey}`, '/f']);
    });

    test('adds its bin folder to the user PATH once, keeping the other folders, their variables unexpanded, and the kind of the value', () => {
      setPath({
        kind: 'REG_EXPAND_SZ',
        value: '%USERPROFILE%\\tools;C:\\other',
      });
      change('add');
      const added = {
        kind: 'REG_EXPAND_SZ',
        value: `%USERPROFILE%\\tools;C:\\other;${bin}`,
      };
      assert.deepStrictEqual(readPath(), added);
      change('add');
      change('add', `${bin.toUpperCase()}\\`);
      assert.deepStrictEqual(readPath(), added);
      setPath({ kind: 'REG_SZ', value: 'C:\\other;' });
      change('add');
      assert.deepStrictEqual(readPath(), {
        kind: 'REG_SZ',
        value: `C:\\other;${bin}`,
      });
    });

    test('makes a user PATH holding only its bin folder when there is none', () => {
      change('add');
      assert.deepStrictEqual(readPath(), {
        kind: 'REG_EXPAND_SZ',
        value: bin,
      });
    });

    test('keeps a PATH longer than an installer string holds, as cutting it to 1024 or 8192 characters would drop folders', () => {
      const long = Array.from(
        { length: 400 },
        (_, index) => `C:\\tools\\folder-number-${index}`,
      ).join(';');
      assert.ok(long.length > 8192);
      setPath({ kind: 'REG_EXPAND_SZ', value: long });
      change('add');
      assert.deepStrictEqual(readPath(), {
        kind: 'REG_EXPAND_SZ',
        value: `${long};${bin}`,
      });
    });

    test('removes only its bin folder, however spelled, leaving the rest of the PATH as it was', () => {
      setPath({
        kind: 'REG_SZ',
        value: `C:\\a;;${bin.toUpperCase()}\\;%X%\\b;${bin}`,
      });
      change('remove');
      assert.deepStrictEqual(readPath(), {
        kind: 'REG_SZ',
        value: 'C:\\a;;%X%\\b',
      });
      change('remove');
      assert.deepStrictEqual(readPath(), {
        kind: 'REG_SZ',
        value: 'C:\\a;;%X%\\b',
      });
    });

    test('adds the bin folder beside Fastforward.exe on installing, removing it on uninstalling but not while updating, which uninstalls the old version first', () => {
      const text = fs.readFileSync(installer, 'utf8');
      assert.match(text, /"\$INSTDIR\\bin"/);
      assert.match(
        text,
        /!macro customInstall\s+!insertmacro fastforwardPath add\s+!macroend/,
      );
      assert.ok(
        uninstallingNotUpdating().includes(
          '!insertmacro fastforwardPath remove',
        ),
      );
    });

    test('removes the Explorer menu the app adds on uninstalling but not while updating, so it stays while the new version is installed', () => {
      const lines = uninstallingNotUpdating();
      const menu = explorerMenuOf('win32', 'Fastforward.exe', () => true);
      assert.ok(menu);
      const keys = new Set(
        menu.map((value) => value.key.replace(/\\command$/, '')),
      );
      assert.strictEqual(keys.size, 2);
      for (const key of keys) {
        assert.ok(lines.includes(`DeleteRegKey HKCU "${key}"`), key);
      }
    });
  },
);
