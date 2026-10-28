import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { realTimer } from '../../tools/git/main/autoFetch';
import { loginShellEnv } from '../../main/shellPath';
import { installedGit, removeFolder, tempFolder } from '../repositories';

function gitShell(gitPath: string): string {
  for (let folder = path.dirname(gitPath); ; folder = path.dirname(folder)) {
    const shell = path.join(folder, 'bin', 'sh.exe');
    if (fs.existsSync(shell)) {
      return shell;
    }
    assert.notStrictEqual(path.dirname(folder), folder, 'no sh.exe beside git');
  }
}

suite('Login shell environment', () => {
  test("reads the PATH and what git, ssh and proxies use that the user's login shell profile sets, which an app started from the macOS Dock or a Linux launcher lacks, even when the profile waits for input", async () => {
    const shell =
      process.platform === 'win32'
        ? gitShell(await installedGit())
        : '/bin/bash';
    const home = tempFolder('shell');
    try {
      for (const profile of ['.bash_profile', '.profile']) {
        fs.writeFileSync(
          path.join(home, profile),
          'read answer\nPATH="/fastforward-probe:$PATH"\nexport SSH_AUTH_SOCK=/probe/agent.sock\nexport https_proxy=http://probe:3128\nexport EDITOR=probe\n',
        );
      }
      const found = await loginShellEnv(
        { ...process.env, HOME: home, SHELL: shell, EDITOR: 'nano' },
        (run) => realTimer(run, 20_000),
      );
      assert.match(found?.PATH ?? '', /^\/fastforward-probe:/);
      assert.strictEqual(found?.SSH_AUTH_SOCK, '/probe/agent.sock');
      assert.strictEqual(found?.https_proxy, 'http://probe:3128');
      assert.strictEqual(found?.EDITOR, undefined);
    } finally {
      removeFolder(home);
    }
  });
});
