import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { viewType } from '../view';
import { waitFor } from './fixtures';

interface LabelFormatter {
  scheme: string;
  formatting: { label: string };
}

function activeTabIsView(): boolean {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputCustom && input.viewType === viewType;
}

async function runUntilShown(command: string, shown: boolean): Promise<void> {
  await vscode.commands.executeCommand(command);
  await waitFor(
    () => activeTabIsView() === shown,
    shown ? 'the view to show' : 'the view to hide',
  );
}

suite('Extension', function () {
  this.timeout(20_000);
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension('anarkin.fastforward');
    assert.ok(extension, 'extension anarkin.fastforward not found');
    await extension.activate();
  });

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
    await runUntilShown('fastforward.toggleView', false);
  });

  test('shows the view with no path next to its title', async () => {
    await runUntilShown('fastforward.showView', true);
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(input instanceof vscode.TabInputCustom);
    const formatters: readonly LabelFormatter[] | undefined =
      vscode.extensions.getExtension('anarkin.fastforward')?.packageJSON
        .contributes.resourceLabelFormatters;
    const formatter = formatters?.find(
      (candidate) => candidate.scheme === input.uri.scheme,
    );
    assert.ok(formatter, `no label formatter for ${input.uri.scheme}`);
    assert.strictEqual(
      formatter.formatting.label.replace('${authority}', input.uri.authority),
      '',
    );
  });
});
