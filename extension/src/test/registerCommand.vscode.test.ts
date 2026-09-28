import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { registerCommand } from '../registerCommand';
import { recordingLog, withMessageStub } from './stub';

suite('registerCommand', () => {
  const channel = vscode.window.createOutputChannel('Fastforward Test', {
    log: true,
  });

  suiteTeardown(() => channel.dispose());

  test('runs the callback', async () => {
    const { log, info, error } = recordingLog(channel);
    let ran = false;
    const command = registerCommand(log, 'fastforward.test.ok', () => {
      ran = true;
    });
    try {
      await vscode.commands.executeCommand('fastforward.test.ok');
      assert.ok(ran);
      assert.deepStrictEqual(info, [['Running fastforward.test.ok']]);
      assert.deepStrictEqual(error, []);
    } finally {
      command.dispose();
    }
  });

  test('passes command arguments to the callback', async () => {
    const { log } = recordingLog(channel);
    let received: unknown[] = [];
    const command = registerCommand(log, 'fastforward.test.args', (...args) => {
      received = args;
    });
    try {
      await vscode.commands.executeCommand('fastforward.test.args', 1, 'two');
      assert.deepStrictEqual(received, [1, 'two']);
    } finally {
      command.dispose();
    }
  });

  test('logs and reports errors from the callback', async () => {
    const { log, error } = recordingLog(channel);
    const boom = new Error('boom');
    const command = registerCommand(log, 'fastforward.test.fail', () => {
      throw boom;
    });
    try {
      await withMessageStub('showErrorMessage', async (messages) => {
        await vscode.commands.executeCommand('fastforward.test.fail');
        assert.deepStrictEqual(error, [
          ['fastforward.test.fail failed'],
          [boom],
        ]);
        assert.deepStrictEqual(messages, [
          'Fastforward: fastforward.test.fail failed, see the Fastforward output for details',
        ]);
      });
    } finally {
      command.dispose();
    }
  });

  test('logs non-Error values thrown by the callback as strings', async () => {
    const { log, error } = recordingLog(channel);
    const command = registerCommand(log, 'fastforward.test.failString', () => {
      throw 'boom';
    });
    try {
      await withMessageStub('showErrorMessage', async (messages) => {
        await vscode.commands.executeCommand('fastforward.test.failString');
        assert.deepStrictEqual(error, [
          ['fastforward.test.failString failed'],
          ['boom'],
        ]);
        assert.strictEqual(messages.length, 1);
      });
    } finally {
      command.dispose();
    }
  });
});
