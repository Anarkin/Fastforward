import * as assert from 'node:assert';
import * as vscode from 'vscode';

function activeTabIsView(): boolean {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return (
    input instanceof vscode.TabInputCustom &&
    input.viewType === 'fastforward.view'
  );
}

// Tab changes reach the extension host asynchronously
async function toggleView(): Promise<void> {
  const wasShown = activeTabIsView();
  await vscode.commands.executeCommand('fastforward.toggleView');
  for (let i = 0; i < 100 && activeTabIsView() === wasShown; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

suite('Extension', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension('anarkin.fastforward');
    assert.ok(extension, 'extension anarkin.fastforward not found');
    await extension.activate();
  });

  suiteTeardown(() =>
    vscode.commands.executeCommand('workbench.action.closeAllEditors'),
  );

  test('registers the toggle view command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('fastforward.toggleView'));
  });

  test('toggles the view in the modal over the previous editor', async () => {
    const document = await vscode.workspace.openTextDocument({
      content: 'previous editor',
    });
    await vscode.window.showTextDocument(document);

    await toggleView();
    assert.ok(activeTabIsView(), 'view not shown');
    assert.strictEqual(vscode.window.tabGroups.all.length, 2);

    await toggleView();
    assert.ok(!activeTabIsView(), 'view not hidden');
    assert.strictEqual(vscode.window.activeTextEditor?.document, document);

    assert.strictEqual(
      vscode.window.tabGroups.all.length,
      1,
      'view did not open in the modal',
    );
  });

  test('show view keeps the view shown', async () => {
    await vscode.commands.executeCommand('fastforward.showView');
    for (let i = 0; i < 100 && !activeTabIsView(); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(activeTabIsView(), 'view not shown');

    await vscode.commands.executeCommand('fastforward.showView');
    assert.ok(activeTabIsView(), 'view hidden by the second show');
  });
});
