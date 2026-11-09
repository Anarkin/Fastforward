import * as assert from 'node:assert';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, suite, test } from 'vitest';

const appFolder = path.join(__dirname, '..', '..');

interface SevenZipPackage {
  readonly url: string;
  readonly sha256: string;
  readonly unpacked: string;
  readonly program: string;
  readonly files: readonly string[];
}

type EnsureSevenZip = (options: {
  readonly folder: string;
  readonly target: string;
  readonly packages?: Partial<Record<string, SevenZipPackage>>;
  readonly download?: (url: string) => Promise<Uint8Array>;
  readonly unpack?: (file: string, into: string) => void;
}) => Promise<'present' | 'fetched' | 'unsupported'>;

async function loadEnsure(): Promise<EnsureSevenZip> {
  const { ensureSevenZip }: { ensureSevenZip: EnsureSevenZip } = await import(
    pathToFileURL(path.join(appFolder, 'scripts', 'sevenZip.mts')).href
  );
  return ensureSevenZip;
}

const asset = new TextEncoder().encode('the package of 7-Zip');

const packages: Partial<Record<string, SevenZipPackage>> = {
  'linux-x64': {
    url: 'https://example.com/7z-linux-x64.tar.xz',
    sha256: createHash('sha256').update(asset).digest('hex'),
    unpacked: 'inside',
    program: '7zz',
    files: ['License.txt'],
  },
};

const refused = () => Promise.reject(new Error('no download'));

function unpackInto(file: string, into: string): void {
  assert.deepStrictEqual(fs.readFileSync(file), Buffer.from(asset));
  fs.mkdirSync(path.join(into, 'inside'));
  for (const name of ['7zz', 'License.txt', 'readme.txt']) {
    fs.writeFileSync(path.join(into, 'inside', name), name);
  }
}

suite('ensureSevenZip', () => {
  let root: string;
  let folder: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-7zip-fetch-'));
    folder = path.join(root, 'linux-x64');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('downloads the package of the platform, checks its SHA-256 and keeps only the program and the files it names, finding them there afterwards without downloading again', async () => {
    const ensureSevenZip = await loadEnsure();
    const asked: string[] = [];
    const download = (url: string) => {
      asked.push(url);
      return Promise.resolve(asset);
    };

    assert.strictEqual(
      await ensureSevenZip({
        folder,
        target: 'linux-x64',
        packages,
        download,
        unpack: unpackInto,
      }),
      'fetched',
    );
    assert.deepStrictEqual(asked, ['https://example.com/7z-linux-x64.tar.xz']);
    assert.deepStrictEqual(
      fs.readdirSync(folder).toSorted((one, other) => one.localeCompare(other)),
      ['.sha256', '7zz', 'License.txt'],
    );
    assert.strictEqual(
      fs.readFileSync(path.join(folder, '7zz'), 'utf8'),
      '7zz',
    );
    if (process.platform !== 'win32') {
      assert.strictEqual(
        fs.statSync(path.join(folder, '7zz')).mode & 0o111,
        0o111,
      );
    }
    assert.deepStrictEqual(fs.readdirSync(root), ['linux-x64']);

    assert.strictEqual(
      await ensureSevenZip({
        folder,
        target: 'linux-x64',
        packages,
        download,
        unpack: unpackInto,
      }),
      'present',
    );
    assert.strictEqual(asked.length, 1);
  });

  test('downloads again once a file is missing or the package pinned is another', async () => {
    const ensureSevenZip = await loadEnsure();
    let downloads = 0;
    const download = () => {
      downloads++;
      return Promise.resolve(asset);
    };
    const options = {
      folder,
      target: 'linux-x64',
      packages,
      download,
      unpack: unpackInto,
    };
    await ensureSevenZip(options);
    fs.rmSync(path.join(folder, 'License.txt'));
    assert.strictEqual(await ensureSevenZip(options), 'fetched');
    fs.writeFileSync(path.join(folder, '.sha256'), 'an older package');
    assert.strictEqual(await ensureSevenZip(options), 'fetched');
    assert.strictEqual(downloads, 3);
    assert.ok(fs.existsSync(path.join(folder, 'License.txt')));
  });

  test('refuses a download whose SHA-256 is not the one pinned, leaving the folder as it was', async () => {
    const ensureSevenZip = await loadEnsure();
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'kept.txt'), 'kept');

    await assert.rejects(
      ensureSevenZip({
        folder,
        target: 'linux-x64',
        packages,
        download: () =>
          Promise.resolve(new TextEncoder().encode('something else')),
        unpack: () => assert.fail('nothing is unpacked'),
      }),
      /has the SHA-256 [0-9a-f]{64} rather than [0-9a-f]{64}, so it is left out\./,
    );
    assert.deepStrictEqual(fs.readdirSync(folder), ['kept.txt']);
  });

  test('ships the 7-Zip fetched for each platform among its resources, in a folder of its own, without the stamp of the fetch', () => {
    const { build } = JSON.parse(
      fs.readFileSync(path.join(appFolder, 'package.json'), 'utf8'),
    );
    for (const [platform, target] of [
      ['win', 'win32-x64'],
      ['mac', 'darwin-arm64'],
      ['linux', 'linux-x64'],
    ]) {
      assert.deepStrictEqual(
        build[platform].extraResources.filter(
          (resource: { readonly to: string }) => resource.to === '7zip',
        ),
        [
          {
            from: `build/7zip/${target}`,
            to: '7zip',
            filter: ['**/*', '!.sha256'],
          },
        ],
        platform,
      );
    }
  });

  test('pins a package for each platform the app ships for, and none for the others', async () => {
    const ensureSevenZip = await loadEnsure();
    for (const target of ['win32-x64', 'darwin-arm64', 'linux-x64']) {
      await assert.rejects(
        ensureSevenZip({ folder, target, download: refused }),
        /no download/,
      );
    }
    for (const target of ['win32-arm64', 'darwin-x64', 'freebsd-x64']) {
      assert.strictEqual(
        await ensureSevenZip({ folder, target, download: refused }),
        'unsupported',
      );
    }
  });
});
