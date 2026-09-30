import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Storage } from './storage';

export async function pickRepositories(
  rootOf: (folder: string) => Promise<string | undefined>,
  storage: Storage,
): Promise<string[]> {
  const recent = storage.recent.filter((root) => !storage.hasTab(root));
  if (recent.length > 0) {
    const browse: vscode.QuickPickItem = {
      label: '$(folder-opened) Browse...',
      alwaysShow: true,
    };
    const picked = await vscode.window.showQuickPick(
      [
        ...recent.map((root) => ({
          label: path.basename(root),
          description: root,
        })),
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        browse,
      ],
      {
        placeHolder: 'Open a repository in a new tab',
        matchOnDescription: true,
      },
    );
    if (!picked) {
      return [];
    }
    if (picked !== browse && picked.description) {
      const root = await checkRepository(rootOf, storage, picked.description);
      return root ? [root] : [];
    }
  }
  return browseRepositories(rootOf, storage);
}

async function browseRepositories(
  rootOf: (folder: string) => Promise<string | undefined>,
  storage: Storage,
): Promise<string[]> {
  const folders =
    (await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: true,
      openLabel: 'Open Repositories',
    })) ?? [];
  const roots = await Promise.all(
    folders.map((folder) => checkRepository(rootOf, storage, folder.fsPath)),
  );
  return roots.filter((root) => root !== undefined);
}

async function checkRepository(
  rootOf: (folder: string) => Promise<string | undefined>,
  storage: Storage,
  folder: string,
): Promise<string | undefined> {
  const root = await rootOf(folder);
  if (!root) {
    await storage.removeRecent(folder);
    void vscode.window.showErrorMessage(
      `Fastforward: ${folder} is not in a git repository`,
    );
    return undefined;
  }
  return root;
}
