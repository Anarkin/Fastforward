import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { gitEnv, realGit } from '../../../../../tools/git/main/gitCommand';
import { withEnv } from '../../../../helpers/repositories';

suite('Running git', () => {
  test('runs git without prompting for credentials', () => {
    assert.strictEqual(gitEnv().GIT_TERMINAL_PROMPT, '0');
  });

  test('lets git fill its output buffer instead of flushing it after every commit', () => {
    assert.strictEqual(gitEnv().GIT_FLUSH, '0');
  });

  test('takes paths literally unless asked for pathspec magic', () => {
    assert.strictEqual(gitEnv().GIT_LITERAL_PATHSPECS, '1');
    assert.strictEqual(gitEnv(true).GIT_LITERAL_PATHSPECS, '0');
  });

  test('leaves out the pathspec settings and the repository the environment names, as git refuses them with literal paths and the app reads the repository it opened', async () => {
    const inherited = {
      GIT_GLOB_PATHSPECS: '1',
      GIT_NOGLOB_PATHSPECS: '1',
      GIT_ICASE_PATHSPECS: '1',
      GIT_DIR: 'elsewhere',
      GIT_WORK_TREE: 'elsewhere',
      GIT_INDEX_FILE: 'elsewhere',
      GIT_OBJECT_DIRECTORY: 'elsewhere',
      GIT_COMMON_DIR: 'elsewhere',
    };
    await withEnv(inherited, () => {
      for (const env of [gitEnv(), gitEnv(true)]) {
        assert.deepStrictEqual(
          Object.keys(inherited).filter((name) => name in env),
          [],
        );
      }
      return Promise.resolve();
    });
  });

  test('leaves out the config the environment adds, the askpass of VS Code and what ties git to the git or the app it was started from, as they come from the app the app was started from, not from the user', async () => {
    const inherited = {
      GIT_CONFIG_PARAMETERS: "'core.fsmonitor'='true'",
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'core.askPass',
      GIT_CONFIG_VALUE_0: 'elsewhere',
      GIT_CONFIG_KEY_1: 'core.hooksPath',
      GIT_CONFIG_VALUE_1: 'elsewhere',
      GIT_ASKPASS: 'askpass.sh',
      VSCODE_GIT_ASKPASS_NODE: 'node',
      VSCODE_GIT_ASKPASS_MAIN: 'askpass-main.js',
      VSCODE_GIT_ASKPASS_EXTRA_ARGS: '',
      VSCODE_GIT_IPC_HANDLE: 'handle',
      GIT_EXEC_PATH: 'elsewhere',
      GIT_NAMESPACE: 'elsewhere',
      GIT_ALTERNATE_OBJECT_DIRECTORIES: 'elsewhere',
      GIT_QUARANTINE_PATH: 'elsewhere',
      GIT_SHALLOW_FILE: 'elsewhere',
      GIT_REFLOG_ACTION: 'elsewhere',
    };
    await withEnv(inherited, () => {
      for (const env of [gitEnv(), gitEnv(true)]) {
        assert.deepStrictEqual(
          Object.keys(inherited).filter((name) => name in env),
          [],
        );
      }
      return Promise.resolve();
    });
  });

  test('keeps the askpass the user set and the files of config they chose, as their own git takes them', async () => {
    const theirs = {
      GIT_ASKPASS: 'askpass.sh',
      SSH_ASKPASS: 'ssh-askpass.sh',
      GIT_CONFIG_GLOBAL: 'global',
      GIT_SSH_COMMAND: 'ssh -i key',
    };
    await withEnv(theirs, () => {
      const env = gitEnv();
      assert.deepStrictEqual(
        Object.fromEntries(
          Object.keys(theirs).map((name) => [name, env[name]]),
        ),
        theirs,
      );
      return Promise.resolve();
    });
  });

  test("runs the real git Git for Windows' launcher starts, with the MSYSTEM and the PATH the launcher gives it, as the launcher's own process slowed each git's start", () => {
    const root = 'C:\\Program Files\\Git';
    const present = new Set([
      `${root}\\usr\\bin\\sh.exe`,
      `${root}\\ucrt64\\bin\\git.exe`,
      `${root}\\mingw64\\bin\\git.exe`,
    ]);
    const exists = (file: string) => present.has(file);
    assert.deepStrictEqual(
      realGit(
        `${root}\\cmd\\git.exe`,
        { Path: 'C:\\Windows', USERPROFILE: 'C:\\Users\\me' },
        'win32',
        exists,
      ),
      {
        command: `${root}\\ucrt64\\bin\\git.exe`,
        env: {
          MSYSTEM: 'UCRT64',
          Path: `${root}\\ucrt64\\bin;${root}\\usr\\bin;C:\\Users\\me\\bin;C:\\Windows`,
        },
      },
    );
    present.add('H:\\home');
    assert.strictEqual(
      realGit(
        `${root}\\cmd\\git.exe`,
        {
          Path: 'C:\\Windows',
          HOMEDRIVE: 'H:',
          HOMEPATH: '\\home',
          USERPROFILE: 'C:\\Users\\me',
        },
        'win32',
        exists,
      )?.env.Path,
      `${root}\\ucrt64\\bin;${root}\\usr\\bin;H:\\home\\bin;C:\\Windows`,
    );
    present.delete(`${root}\\ucrt64\\bin\\git.exe`);
    assert.deepStrictEqual(
      realGit(
        `${root}\\CMD\\Git.exe`,
        { PATH: 'C:\\Windows', HOME: 'D:\\home', MSYSTEM: 'MINGW32' },
        'win32',
        exists,
      ),
      {
        command: `${root}\\mingw64\\bin\\git.exe`,
        env: {
          MSYSTEM: 'MINGW64',
          PATH: `${root}\\mingw64\\bin;${root}\\usr\\bin;D:\\home\\bin;C:\\Windows`,
        },
      },
    );
  });

  test('runs git as found when it is no launcher of a Git for Windows it knows, or outside Windows', () => {
    const root = 'C:\\Program Files\\Git';
    assert.strictEqual(
      realGit(`${root}\\bin\\git.exe`, {}, 'win32', () => true),
      undefined,
    );
    assert.strictEqual(
      realGit(`${root}\\cmd\\git.exe`, {}, 'win32', () => false),
      undefined,
    );
    assert.strictEqual(
      realGit(
        `${root}\\cmd\\git.exe`,
        {},
        'win32',
        (file) => !file.endsWith('sh.exe'),
      ),
      undefined,
    );
    assert.strictEqual(
      realGit('/usr/bin/git', {}, 'linux', () => true),
      undefined,
    );
  });
});
