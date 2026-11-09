import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface SevenZipPackage {
  readonly url: string;
  readonly sha256: string;
  readonly unpacked: string;
  readonly program: string;
  readonly files: readonly string[];
}

const release = 'https://github.com/ip7z/7zip/releases/download/26.06';

const sevenZipPackages: Partial<Record<string, SevenZipPackage>> = {
  'win32-x64': {
    url: `${release}/7z2606-x64.msi`,
    sha256: '6dc822569e777d9a3ecd5ffcbc22b55600af87e6c5d9810a64e8566cf5a4af9f',
    unpacked: path.join('Files', '7-Zip'),
    program: '7z.exe',
    files: ['7z.dll', 'License.txt'],
  },
  'darwin-arm64': {
    url: `${release}/7z2606-mac.tar.xz`,
    sha256: 'b6f17920b4240940461dac8ef4009891881ac44d2a5ead625ede2ec8472185dd',
    unpacked: '.',
    program: '7zz',
    files: ['License.txt'],
  },
  'linux-x64': {
    url: `${release}/7z2606-linux-x64.tar.xz`,
    sha256: '2b539cf067b2ad48e1baa5093dbaa8818b73542d1222a0ffde9dc5f2922ea62e',
    unpacked: '.',
    program: '7zz',
    files: ['License.txt'],
  },
};

const stampName = '.sha256';

async function downloaded(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Downloading ${url} failed with ${response.status}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function unpacked(file: string, into: string): void {
  if (file.endsWith('.msi')) {
    const run = spawnSync(
      'msiexec',
      ['/a', `"${file}"`, '/qn', `TARGETDIR="${into}"`],
      { stdio: 'ignore', windowsVerbatimArguments: true },
    );
    if (run.status !== 0) {
      throw new Error(`msiexec could not unpack ${file}: ${run.status}`);
    }
    return;
  }
  execFileSync('tar', ['-xJf', file, '-C', into], { stdio: 'ignore' });
}

export interface SevenZipFetch {
  readonly folder: string;
  readonly target: string;
  readonly packages?: Partial<Record<string, SevenZipPackage>>;
  readonly download?: (url: string) => Promise<Uint8Array>;
  readonly unpack?: (file: string, into: string) => void;
}

export async function ensureSevenZip({
  folder,
  target,
  packages = sevenZipPackages,
  download = downloaded,
  unpack = unpacked,
}: SevenZipFetch): Promise<'present' | 'fetched' | 'unsupported'> {
  const wanted = packages[target];
  if (wanted === undefined) {
    return 'unsupported';
  }
  const files = [wanted.program, ...wanted.files];
  const stamp = path.join(folder, stampName);
  if (
    fs.existsSync(stamp) &&
    fs.readFileSync(stamp, 'utf8') === wanted.sha256 &&
    files.every((file) => fs.existsSync(path.join(folder, file)))
  ) {
    return 'present';
  }
  const bytes = await download(wanted.url);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== wanted.sha256) {
    throw new Error(
      `${wanted.url} has the SHA-256 ${sha256} rather than ${wanted.sha256}, so it is left out.`,
    );
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-7zip-'));
  try {
    const asset = path.join(work, path.posix.basename(wanted.url));
    fs.writeFileSync(asset, bytes);
    const into = path.join(work, 'unpacked');
    fs.mkdirSync(into);
    unpack(asset, into);
    const partial = `${folder}.partial`;
    fs.rmSync(partial, { recursive: true, force: true });
    fs.mkdirSync(partial, { recursive: true });
    for (const file of files) {
      fs.copyFileSync(
        path.join(into, wanted.unpacked, file),
        path.join(partial, file),
      );
    }
    fs.chmodSync(path.join(partial, wanted.program), 0o755);
    fs.writeFileSync(path.join(partial, stampName), wanted.sha256);
    fs.rmSync(folder, { recursive: true, force: true });
    fs.renameSync(partial, folder);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  return 'fetched';
}
