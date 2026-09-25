import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Extension', () => {
  suiteSetup(async () => {
    await vscode.extensions.getExtension('anarkin.fastforward')?.activate();
  });

  test('registers the hello world command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('fastforward.helloWorld'));
  });

  test('runs the hello world command', async () => {
    await vscode.commands.executeCommand('fastforward.helloWorld');
  });
});
