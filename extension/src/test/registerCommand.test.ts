import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { registerCommand } from '../registerCommand';

suite('registerCommand', () => {
  const log = vscode.window.createOutputChannel('Fastforward Test', {
    log: true,
  });

  suiteTeardown(() => log.dispose());

  test('runs the callback', async () => {
    let ran = false;
    const command = registerCommand(log, 'fastforward.test.ok', () => {
      ran = true;
    });
    try {
      await vscode.commands.executeCommand('fastforward.test.ok');
      assert.ok(ran);
    } finally {
      command.dispose();
    }
  });

  test('catches errors from the callback', async () => {
    const command = registerCommand(log, 'fastforward.test.fail', () => {
      throw new Error('boom');
    });
    try {
      await vscode.commands.executeCommand('fastforward.test.fail');
    } finally {
      command.dispose();
    }
  });

  test('catches non-Error values thrown by the callback', async () => {
    const command = registerCommand(log, 'fastforward.test.failString', () => {
      throw 'boom';
    });
    try {
      await vscode.commands.executeCommand('fastforward.test.failString');
    } finally {
      command.dispose();
    }
  });
});
