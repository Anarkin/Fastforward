import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  commandFiles,
  commandPlaceOf,
  commandState,
  installCommand,
  linkAsAdmin,
  pointCommandAt,
  refreshCommand,
  scriptForAppImage,
  syncCommandFiles,
  type CommandFile,
  type CommandFiles,
  type CommandPlace,
  type SyncCommandFiles,
} from '../../main/terminalCommand';
import { removeFolder, tempFolder } from '../repositories';

const script = [
  '#!/bin/sh',
  'fastforward_appimage=',
  'nohup "${fastforward_appimage:-/opt/Fastforward/fastforward}"',
  '',
].join('\n');

class MemoryFiles implements CommandFiles {
  readonly files = new Map<string, CommandFile>();
  readonly written: string[] = [];
  denied = false;

  read(file: string): Promise<CommandFile> {
    return Promise.resolve(this.files.get(file) ?? { kind: 'missing' });
  }

  write(file: string, text: string): Promise<void> {
    this.files.set(file, { kind: 'file', text });
    this.written.push(file);
    return Promise.resolve();
  }

  link(file: string, target: string): Promise<void> {
    if (this.denied) {
      return Promise.reject(
        Object.assign(new Error('permission denied'), { code: 'EACCES' }),
      );
    }
    this.files.set(file, { kind: 'link', target });
    this.written.push(file);
    return Promise.resolve();
  }
}

const bundle = '/Applications/Fastforward.app';
const linked: CommandPlace = {
  kind: 'link',
  path: '/usr/local/bin/ff',
  script: `${bundle}/Contents/Resources/bin/ff`,
};
const appImage = "/home/me/Apps/it's fastforward-18.0.0-linux-x64.AppImage";
const copied: CommandPlace = {
  kind: 'copy',
  path: '/home/me/.local/bin/ff',
  script: '/tmp/.mount_fastfo/resources/bin/ff',
  appImage,
};

const searched = ['/usr/local/bin', '/home/me/.local/bin', '/usr/bin'];

function otherLines(text: string): string[] {
  return text.split('\n').filter((_, index) => index !== 1);
}

function withScript(): MemoryFiles {
  const files = new MemoryFiles();
  files.files.set(copied.script, { kind: 'file', text: script });
  return files;
}

suite('Terminal command', () => {
  test('links ff into /usr/local/bin on macOS, and copies it into ~/.local/bin from an AppImage, naming the AppImage, as its own folder is gone once it quits', () => {
    const options = {
      packaged: true,
      resourcesPath: `${bundle}/Contents/Resources`,
      home: '/Users/me',
      appImage: undefined,
    };
    assert.deepStrictEqual(
      commandPlaceOf({ ...options, platform: 'darwin' }),
      linked,
    );
    assert.deepStrictEqual(
      commandPlaceOf({
        ...options,
        platform: 'linux',
        resourcesPath: '/tmp/.mount_fastfo/resources',
        home: '/home/me',
        appImage,
      }),
      copied,
    );
  });

  test('leaves ff to the installer on Windows and to the package on Linux, as updates then bring it to existing installations and uninstalling takes it away, and to none when run from the source', () => {
    const options = {
      packaged: true,
      resourcesPath: '/opt/Fastforward/resources',
      home: '/home/me',
      appImage: undefined,
    };
    assert.strictEqual(
      commandPlaceOf({ ...options, platform: 'win32' }),
      undefined,
    );
    assert.strictEqual(
      commandPlaceOf({ ...options, platform: 'linux' }),
      undefined,
    );
    assert.strictEqual(
      commandPlaceOf({ ...options, platform: 'darwin', packaged: false }),
      undefined,
    );
  });

  test('names the AppImage in the copy of ff, quoted for the shell, whatever its name holds', () => {
    const named = scriptForAppImage(script, "/a/it's $HOME `x`.AppImage");
    assert.strictEqual(
      named.split('\n')[1],
      "fastforward_appimage='/a/it'\\''s $HOME `x`.AppImage'",
    );
    assert.deepStrictEqual(otherLines(named), otherLines(script));
  });

  test('installs ff where there is none, saying where', async () => {
    const files = withScript();
    assert.deepStrictEqual(
      await installCommand(linked, files, () => true, searched),
      {
        kind: 'installed',
        path: linked.path,
        onPath: true,
      },
    );
    assert.deepStrictEqual(files.files.get(linked.path), {
      kind: 'link',
      target: linked.script,
    });
    assert.deepStrictEqual(
      await installCommand(copied, files, () => true, searched),
      {
        kind: 'installed',
        path: copied.path,
        onPath: true,
      },
    );
    assert.deepStrictEqual(files.files.get(copied.path), {
      kind: 'file',
      text: scriptForAppImage(script, appImage),
    });
  });

  test('says when the folder ff went into is not on the PATH, as ~/.local/bin is on it only once it exists on some systems', async () => {
    const files = withScript();
    assert.deepStrictEqual(
      await installCommand(copied, files, () => true, ['/usr/bin']),
      { kind: 'installed', path: copied.path, onPath: false },
    );
  });

  test('says ff is installed already, writing nothing', async () => {
    const files = withScript();
    files.files.set(linked.path, { kind: 'link', target: linked.script });
    files.files.set(copied.path, {
      kind: 'file',
      text: scriptForAppImage(script, appImage),
    });
    assert.strictEqual(await commandState(linked, files), 'installed');
    assert.strictEqual(await commandState(copied, files), 'installed');
    assert.deepStrictEqual(
      await installCommand(linked, files, () => true, searched),
      {
        kind: 'alreadyInstalled',
        path: linked.path,
      },
    );
    assert.deepStrictEqual(
      await installCommand(copied, files, () => true, searched),
      {
        kind: 'alreadyInstalled',
        path: copied.path,
      },
    );
    assert.deepStrictEqual(files.written, []);
  });

  test('replaces an ff of its own that starts another copy of the app, such as an AppImage since updated or a moved app', async () => {
    const files = withScript();
    files.files.set(linked.path, {
      kind: 'link',
      target: '/Users/me/Downloads/Fastforward.app/Contents/Resources/bin/ff',
    });
    files.files.set(copied.path, {
      kind: 'file',
      text: scriptForAppImage(
        '#!/bin/sh\nfastforward_appimage=\nolder\n',
        '/home/me/Apps/fastforward-17.0.0-linux-x64.AppImage',
      ),
    });
    assert.strictEqual(await commandState(linked, files), 'outdated');
    assert.strictEqual(await commandState(copied, files), 'outdated');
    assert.strictEqual(
      (await installCommand(linked, files, () => true, searched)).kind,
      'installed',
    );
    assert.strictEqual(
      (await installCommand(copied, files, () => true, searched)).kind,
      'installed',
    );
    assert.strictEqual(await commandState(linked, files), 'installed');
    assert.strictEqual(await commandState(copied, files), 'installed');
  });

  test('leaves an ff that is not its own as it is, saying so', async () => {
    const files = withScript();
    files.files.set(linked.path, { kind: 'file', text: '#!/bin/sh\n' });
    files.files.set(copied.path, {
      kind: 'link',
      target: '/usr/local/bin/something',
    });
    for (const place of [linked, copied]) {
      assert.strictEqual(await commandState(place, files), 'taken');
      assert.deepStrictEqual(
        await installCommand(place, files, () => true, searched),
        {
          kind: 'taken',
          path: place.path,
        },
      );
    }
    files.files.set(linked.path, {
      kind: 'link',
      target: '/opt/homebrew/bin/ff',
    });
    files.files.set(copied.path, { kind: 'file', text: '#!/bin/sh\nother\n' });
    assert.strictEqual(await commandState(linked, files), 'taken');
    assert.strictEqual(await commandState(copied, files), 'taken');
    assert.deepStrictEqual(files.written, []);
  });

  test('asks for an administrator to link ff on macOS when /usr/local/bin is not writable, saying nothing once that is cancelled', async () => {
    const files = withScript();
    files.denied = true;
    const asked: string[][] = [];
    assert.deepStrictEqual(
      await installCommand(
        linked,
        files,
        (link, target) => {
          asked.push([link, target]);
          return true;
        },
        searched,
      ),
      { kind: 'installed', path: linked.path, onPath: true },
    );
    assert.deepStrictEqual(asked, [[linked.path, linked.script]]);
    assert.deepStrictEqual(
      await installCommand(linked, files, () => false, searched),
      { kind: 'cancelled' },
    );
  });

  test('fails on any other error linking ff', async () => {
    const files = withScript();
    files.link = () => Promise.reject(new Error('disk full'));
    await assert.rejects(
      installCommand(linked, files, () => true, searched),
      /disk full/,
    );
  });

  test('asks to move the app first when macOS runs it from the disk image or a temporary copy, as ff would lead nowhere once it is gone', async () => {
    for (const from of [
      '/Volumes/Fastforward 18.0.0/Fastforward.app',
      '/private/var/folders/x/T/AppTranslocation/1234/d/Fastforward.app',
    ]) {
      const files = withScript();
      assert.deepStrictEqual(
        await installCommand(
          { ...linked, script: `${from}/Contents/Resources/bin/ff` },
          files,
          () => true,
          searched,
        ),
        { kind: 'notMoved' },
      );
      assert.deepStrictEqual(files.written, []);
    }
  });

  test('points the copy of ff at the AppImage running as it starts, once an update has renamed it, leaving any other ff alone', async () => {
    const files = withScript();
    assert.strictEqual(await refreshCommand(copied, files), false);
    assert.deepStrictEqual(files.written, []);
    files.files.set(copied.path, {
      kind: 'file',
      text: scriptForAppImage(script, '/home/me/Apps/old.AppImage'),
    });
    assert.strictEqual(await refreshCommand(copied, files), true);
    assert.strictEqual(await commandState(copied, files), 'installed');
    assert.strictEqual(await refreshCommand(copied, files), false);
    files.files.set(linked.path, {
      kind: 'link',
      target: '/Users/me/Downloads/Fastforward.app/Contents/Resources/bin/ff',
    });
    assert.strictEqual(await refreshCommand(linked, files), false);
    assert.strictEqual(await commandState(linked, files), 'outdated');
  });

  test('points the copy of ff at the AppImage an update renamed as the app quit, as nothing starts the app again to point it, leaving any other ff alone', () => {
    const updated = '/home/me/Apps/fastforward-19.0.0-linux-x64.AppImage';
    const files = new Map<string, CommandFile>();
    const now: SyncCommandFiles = {
      read: (file) => files.get(file) ?? { kind: 'missing' },
      write: (file, text) => {
        files.set(file, { kind: 'file', text });
      },
    };
    assert.strictEqual(pointCommandAt(copied, updated, now), false);
    assert.strictEqual(files.size, 0);
    files.set(copied.path, {
      kind: 'file',
      text: scriptForAppImage(script, appImage),
    });
    assert.strictEqual(pointCommandAt(copied, updated, now), true);
    assert.deepStrictEqual(files.get(copied.path), {
      kind: 'file',
      text: scriptForAppImage(script, updated),
    });
    const others: CommandFile[] = [
      { kind: 'file', text: scriptForAppImage(script, '/elsewhere.AppImage') },
      { kind: 'file', text: '#!/bin/sh\n' },
      { kind: 'link', target: '/usr/bin/ff' },
    ];
    for (const other of others) {
      files.set(copied.path, other);
      assert.strictEqual(pointCommandAt(copied, updated, now), false);
      assert.deepStrictEqual(files.get(copied.path), other);
    }
    assert.strictEqual(pointCommandAt(linked, updated, now), false);
  });

  test('links ff as an administrator through osascript on macOS, passing the paths as arguments rather than in the script, and tells a cancel from a failure', async () => {
    const ran: (readonly string[])[] = [];
    const asAdmin = linkAsAdmin((file, args) => {
      ran.push([file, ...args]);
      return Promise.resolve();
    });
    assert.strictEqual(
      await asAdmin('/usr/local/bin/ff', "/Applications/it's.app/x/ff"),
      true,
    );
    assert.deepStrictEqual(ran, [
      [
        'osascript',
        '-e',
        'on run argv',
        '-e',
        'do shell script "mkdir -p " & quoted form of item 1 of argv & " && ln -sfn " & quoted form of item 2 of argv & " " & quoted form of item 3 of argv with administrator privileges',
        '-e',
        'end run',
        '/usr/local/bin',
        "/Applications/it's.app/x/ff",
        '/usr/local/bin/ff',
      ],
    ]);
    const cancelled = linkAsAdmin(() =>
      Promise.reject(
        Object.assign(new Error('Command failed: osascript'), {
          stderr: '0:180: execution error: User canceled. (-128)\n',
        }),
      ),
    );
    assert.strictEqual(await cancelled('/usr/local/bin/ff', '/x/ff'), false);
    const failed = linkAsAdmin(() =>
      Promise.reject(
        Object.assign(new Error('Command failed: osascript'), {
          stderr: 'ln: /usr/local/bin/ff: Read-only file system\n',
        }),
      ),
    );
    await assert.rejects(
      async () => failed('/usr/local/bin/ff', '/x/ff'),
      /osascript/,
    );
  });

  test('reads, writes and links ff on the disk, writing it runnable and replacing what was there', async () => {
    const folder = tempFolder('terminal-command');
    try {
      const file = path.join(folder, 'deep', 'bin', 'ff');
      assert.deepStrictEqual(await commandFiles.read(file), {
        kind: 'missing',
      });
      await commandFiles.write(file, 'one');
      await commandFiles.write(file, 'two');
      assert.deepStrictEqual(await commandFiles.read(file), {
        kind: 'file',
        text: 'two',
      });
      assert.deepStrictEqual(syncCommandFiles.read(`${file}.missing`), {
        kind: 'missing',
      });
      syncCommandFiles.write(file, 'three');
      assert.deepStrictEqual(syncCommandFiles.read(file), {
        kind: 'file',
        text: 'three',
      });
      if (process.platform !== 'win32') {
        assert.strictEqual(fs.statSync(file).mode & 0o777, 0o755);
        const link = path.join(folder, 'other', 'ff');
        await commandFiles.link(link, '/nowhere/one');
        await commandFiles.link(link, file);
        assert.deepStrictEqual(await commandFiles.read(link), {
          kind: 'link',
          target: file,
        });
        assert.deepStrictEqual(syncCommandFiles.read(link), {
          kind: 'link',
          target: file,
        });
      }
    } finally {
      removeFolder(folder);
    }
  });
});
