import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { withMessageStub } from './stub';

suite('Extension', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension('anarkin.fastforward');
    assert.ok(extension, 'extension anarkin.fastforward not found');
    await extension.activate();
  });

  test('registers the hello world command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('fastforward.helloWorld'));
  });

  test('runs the hello world command', async () => {
    await withMessageStub('showInformationMessage', async (messages) => {
      await vscode.commands.executeCommand('fastforward.helloWorld');
      assert.deepStrictEqual(messages, ['Hello from Fastforward']);
    });
  });
});
