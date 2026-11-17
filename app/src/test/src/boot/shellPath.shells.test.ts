import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { realTimer } from '../../../lib/main/timer';
import { loginShellEnv } from '../../../boot/shellPath';
import { installedGit } from '../../helpers/repositories';
import { removeFolder, tempFolder } from '../../helpers/tempFolders';

function gitShell(gitPath: string): string {
  for (let folder = path.dirname(gitPath); ; folder = path.dirname(folder)) {
    const shell = path.join(folder, 'bin', 'sh.exe');
    if (fs.existsSync(shell)) {
      return shell;
    }
    assert.notStrictEqual(path.dirname(folder), folder, 'no sh.exe beside git');
  }
}

const startsAgain = process.platform === 'win32' ? 2 : 0;

function saidBy(shell: string, env: NodeJS.ProcessEnv): string {
  const { status, signal, stderr, error } = spawnSync(
    shell,
    ['-ilc', 'printf started'],
    { env, input: '', encoding: 'utf8', timeout: 20_000 },
  );
  return `${shell} read nothing; started again it ended with ${status ?? signal ?? error?.message}, saying ${JSON.stringify(stderr)}`;
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
      const env = { ...process.env, HOME: home, SHELL: shell, EDITOR: 'nano' };
      const read = () => loginShellEnv(env, (run) => realTimer(run, 20_000));
      let found = await read();
      for (let again = 0; again < startsAgain && found === undefined; again++) {
        found = await read();
      }
      assert.match(
        found?.PATH ?? '',
        /^\/fastforward-probe:/,
        found === undefined ? saidBy(shell, env) : undefined,
      );
      assert.strictEqual(found?.SSH_AUTH_SOCK, '/probe/agent.sock');
      assert.strictEqual(found?.https_proxy, 'http://probe:3128');
      assert.strictEqual(found?.EDITOR, undefined);
    } finally {
      removeFolder(home);
    }
  });
});
