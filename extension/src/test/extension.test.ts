import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Extension', () => {
  test('registers the hello world command', async () => {
    await vscode.extensions.getExtension('anarkin.fastforward')?.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('fastforward.helloWorld'));
  });
});
