import * as assert from 'node:assert';
import { exitedWith, gitConfigArgs, gitEnv } from '../git/run';

suite('Running git', () => {
  test('takes only the exit codes asked for as success', () => {
    assert.ok(exitedWith({ code: 1 }, [0, 1]));
    assert.ok(!exitedWith({ code: 128 }, [0, 1]));
    assert.ok(!exitedWith({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }, [0]));
  });

  test('fails a git killed by a signal, whose output may be cut short', () => {
    assert.ok(!exitedWith({ code: null }, [0]));
    assert.ok(!exitedWith({}, [0]));
  });

  test('runs git without its optional locks or index refresh, and without prompting for credentials', () => {
    const env = gitEnv();
    assert.strictEqual(env.GIT_OPTIONAL_LOCKS, '0');
    assert.strictEqual(env.GIT_TERMINAL_PROMPT, '0');
    assert.ok(gitConfigArgs.includes('diff.autoRefreshIndex=false'));
  });

  test('takes paths literally unless asked for pathspec magic', () => {
    assert.strictEqual(gitEnv().GIT_LITERAL_PATHSPECS, '1');
    assert.strictEqual(gitEnv(true).GIT_LITERAL_PATHSPECS, '0');
  });
});
