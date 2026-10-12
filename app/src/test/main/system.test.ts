import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { prettyName, systemOf } from '../../main/system';

suite('System', () => {
  test('names Windows 11 from build 22000 on, and Windows 10 below it, as both report version 10.0', () => {
    assert.strictEqual(
      systemOf({ platform: 'win32', release: '10.0.26300', arch: 'x64' }),
      'Windows 11, build 26300, x64',
    );
    assert.strictEqual(
      systemOf({ platform: 'win32', release: '10.0.19045', arch: 'x64' }),
      'Windows 10, build 19045, x64',
    );
  });

  test('names macOS by its own version, not the Darwin one the kernel reports', () => {
    assert.strictEqual(
      systemOf({
        platform: 'darwin',
        release: '24.1.0',
        systemVersion: '15.1.0',
        arch: 'arm64',
      }),
      'macOS 15.1.0, arm64',
    );
  });

  test('names Linux by its distribution and kernel, or the kernel alone', () => {
    assert.strictEqual(
      systemOf({
        platform: 'linux',
        release: '6.8.0-45-generic',
        distribution: 'Ubuntu 24.04.1 LTS',
        arch: 'x64',
      }),
      'Ubuntu 24.04.1 LTS, Linux 6.8.0-45-generic, x64',
    );
    assert.strictEqual(
      systemOf({ platform: 'linux', release: '6.8.0', arch: 'arm64' }),
      'Linux 6.8.0, arm64',
    );
  });

  test('names any other system by its platform and release', () => {
    assert.strictEqual(
      systemOf({ platform: 'freebsd', release: '14.1', arch: 'x64' }),
      'freebsd 14.1, x64',
    );
  });

  test("reads the distribution's name from os-release, quoted or not", () => {
    assert.strictEqual(
      prettyName(
        'NAME="Ubuntu"\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\nID=ubuntu\n',
      ),
      'Ubuntu 24.04.1 LTS',
    );
    assert.strictEqual(prettyName('PRETTY_NAME=Arch\n'), 'Arch');
    assert.strictEqual(prettyName('NAME=Other\n'), undefined);
  });
});
