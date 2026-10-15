import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isMissing } from '../git/files';

const command = 'ff';
const appImageLine = /^fastforward_appimage=.*$/m;
const bundledScript = `.app/Contents/Resources/bin/${command}`;

export type CommandPlace =
  | {
      readonly kind: 'link';
      readonly path: string;
      readonly script: string;
    }
  | {
      readonly kind: 'copy';
      readonly path: string;
      readonly script: string;
      readonly appImage: string;
    };

export type CommandFile =
  | { readonly kind: 'missing' }
  | { readonly kind: 'link'; readonly target: string }
  | { readonly kind: 'file'; readonly text: string };

export interface CommandFiles {
  read(file: string): Promise<CommandFile>;
  write(file: string, text: string): Promise<void>;
  link(file: string, target: string): Promise<void>;
}

export type CommandState = 'installed' | 'missing' | 'outdated' | 'taken';

export type CommandInstall =
  | {
      readonly kind: 'installed';
      readonly path: string;
      readonly onPath: boolean;
    }
  | { readonly kind: 'alreadyInstalled'; readonly path: string }
  | { readonly kind: 'taken'; readonly path: string }
  | { readonly kind: 'notMoved' }
  | { readonly kind: 'cancelled' };

export type AsAdmin = (
  link: string,
  target: string,
) => boolean | Promise<boolean>;

export function commandPlaceOf(options: {
  readonly platform: NodeJS.Platform;
  readonly packaged: boolean;
  readonly resourcesPath: string;
  readonly home: string;
  readonly appImage: string | undefined;
}): CommandPlace | undefined {
  if (!options.packaged) {
    return undefined;
  }
  const script = path.posix.join(options.resourcesPath, 'bin', command);
  if (options.platform === 'darwin') {
    return {
      kind: 'link',
      path: path.posix.join('/usr/local/bin', command),
      script,
    };
  }
  if (options.platform === 'linux' && options.appImage !== undefined) {
    return {
      kind: 'copy',
      path: path.posix.join(options.home, '.local', 'bin', command),
      script,
      appImage: options.appImage,
    };
  }
  return undefined;
}

export function scriptForAppImage(script: string, appImage: string): string {
  return script.replace(
    appImageLine,
    () => `fastforward_appimage='${appImage.replaceAll("'", "'\\''")}'`,
  );
}

export async function commandState(
  place: CommandPlace,
  files: CommandFiles,
): Promise<CommandState> {
  const found = await files.read(place.path);
  if (found.kind === 'missing') {
    return 'missing';
  }
  if (place.kind === 'link') {
    if (found.kind !== 'link') {
      return 'taken';
    }
    if (found.target === place.script) {
      return 'installed';
    }
    return found.target.endsWith(bundledScript) ? 'outdated' : 'taken';
  }
  if (found.kind !== 'file' || !appImageLine.test(found.text)) {
    return 'taken';
  }
  return found.text === (await appImageScript(place, files))
    ? 'installed'
    : 'outdated';
}

export async function installCommand(
  place: CommandPlace,
  files: CommandFiles,
  asAdmin: AsAdmin,
  searched: readonly string[],
): Promise<CommandInstall> {
  const state = await commandState(place, files);
  if (state === 'installed') {
    return { kind: 'alreadyInstalled', path: place.path };
  }
  if (state === 'taken') {
    return { kind: 'taken', path: place.path };
  }
  if (place.kind === 'copy') {
    await files.write(place.path, await appImageScript(place, files));
    return installed(place, searched);
  }
  if (runsFromMountedImage(place.script)) {
    return { kind: 'notMoved' };
  }
  try {
    await files.link(place.path, place.script);
  } catch (error) {
    if (!isDenied(error)) {
      throw error;
    }
    if (!(await asAdmin(place.path, place.script))) {
      return { kind: 'cancelled' };
    }
  }
  return installed(place, searched);
}

function installed(
  place: CommandPlace,
  searched: readonly string[],
): CommandInstall {
  const folder = path.posix.dirname(place.path);
  return {
    kind: 'installed',
    path: place.path,
    onPath: searched.some(
      (other) => path.posix.normalize(`${other}/`) === `${folder}/`,
    ),
  };
}

export async function refreshCommand(
  place: CommandPlace,
  files: CommandFiles,
): Promise<boolean> {
  if (
    place.kind !== 'copy' ||
    (await commandState(place, files)) !== 'outdated'
  ) {
    return false;
  }
  await files.write(place.path, await appImageScript(place, files));
  return true;
}

async function appImageScript(
  place: Extract<CommandPlace, { kind: 'copy' }>,
  files: CommandFiles,
): Promise<string> {
  const script = await files.read(place.script);
  if (script.kind !== 'file') {
    throw new Error(place.script);
  }
  return scriptForAppImage(script.text, place.appImage);
}

type RunFile = (file: string, args: readonly string[]) => Promise<unknown>;

export function linkAsAdmin(run: RunFile = runFile): AsAdmin {
  return async (link, target) => {
    try {
      await run('osascript', [
        '-e',
        'on run argv',
        '-e',
        'do shell script "mkdir -p " & quoted form of item 1 of argv & " && ln -sfn " & quoted form of item 2 of argv & " " & quoted form of item 3 of argv with administrator privileges',
        '-e',
        'end run',
        path.posix.dirname(link),
        target,
        link,
      ]);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        'stderr' in error &&
        String(error.stderr).includes('(-128)')
      ) {
        return false;
      }
      throw error;
    }
  };
}

function runFile(file: string, args: readonly string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stderr }));
      } else {
        resolve(stdout);
      }
    });
  });
}

function runsFromMountedImage(script: string): boolean {
  return (
    script.startsWith('/Volumes/') || script.includes('/AppTranslocation/')
  );
}

function isDenied(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EACCES' || error.code === 'EPERM')
  );
}

export const commandFiles: CommandFiles = {
  async read(file) {
    try {
      const stats = await fs.promises.lstat(file);
      if (stats.isSymbolicLink()) {
        return { kind: 'link', target: await fs.promises.readlink(file) };
      }
      return {
        kind: 'file',
        text: stats.isFile() ? await fs.promises.readFile(file, 'utf8') : '',
      };
    } catch (error) {
      if (isMissing(error)) {
        return { kind: 'missing' };
      }
      throw error;
    }
  },
  async write(file, text) {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, text, { mode: 0o755 });
    await fs.promises.chmod(file, 0o755);
  },
  async link(file, target) {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.rm(file, { force: true });
    await fs.promises.symlink(target, file);
  },
};
