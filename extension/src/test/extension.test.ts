import * as assert from 'node:assert';
import * as vscode from 'vscode';

function activeTabIsView(): boolean {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return (
    input instanceof vscode.TabInputWebview &&
    input.viewType.endsWith('fastforward.view')
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

  test('toggles the view over the previous editor', async () => {
    const document = await vscode.workspace.openTextDocument({
      content: 'previous editor',
    });
    await vscode.window.showTextDocument(document);

    await toggleView();
    assert.ok(activeTabIsView(), 'view not shown');

    await toggleView();
    assert.ok(!activeTabIsView(), 'view not hidden');
    assert.strictEqual(vscode.window.activeTextEditor?.document, document);

    await toggleView();
    assert.ok(activeTabIsView(), 'view not shown again');
    assert.strictEqual(
      vscode.window.tabGroups.activeTabGroup.tabs.filter(
        (tab) => tab.input instanceof vscode.TabInputWebview,
      ).length,
      1,
      'view was recreated instead of revealed',
    );
  });
});
