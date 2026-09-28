import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { waitFor } from './fixtures';

function activeTabIsView(): boolean {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return (
    input instanceof vscode.TabInputCustom &&
    input.viewType === 'fastforward.view'
  );
}

// Tab changes reach the extension host asynchronously
async function runUntilShown(command: string, shown: boolean): Promise<void> {
  await vscode.commands.executeCommand(command);
  await waitFor(
    () => activeTabIsView() === shown,
    shown ? 'the view to show' : 'the view to hide',
    5000,
  );
}

suite('Extension', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension('anarkin.fastforward');
    assert.ok(extension, 'extension anarkin.fastforward not found');
    await extension.activate();
  });

  // Each test starts with no editors, the view included
  teardown(() =>
    vscode.commands.executeCommand('workbench.action.closeAllEditors'),
  );

  test('toggles the view in the modal over the previous editor', async () => {
    const document = await vscode.workspace.openTextDocument({
      content: 'previous editor',
    });
    await vscode.window.showTextDocument(document);

    await runUntilShown('fastforward.toggleView', true);
    assert.strictEqual(vscode.window.tabGroups.all.length, 2);

    await runUntilShown('fastforward.toggleView', false);
    assert.strictEqual(vscode.window.activeTextEditor?.document, document);
    assert.strictEqual(
      vscode.window.tabGroups.all.length,
      1,
      'view did not open in the modal',
    );
  });

  test('show view keeps the view shown', async () => {
    await runUntilShown('fastforward.showView', true);
    await vscode.commands.executeCommand('fastforward.showView');
    assert.ok(activeTabIsView(), 'view hidden by the second show');
  });
});
