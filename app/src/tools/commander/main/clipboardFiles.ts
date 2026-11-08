import { clipboard, ClipboardItem } from 'electron';
import { filesOfUriList, gnomeCopiedFiles, uriListOf } from './fileUris';

const uriList = 'text/uri-list';
const gnomeFiles =
  'electron application/osclipboard;format="x-special/gnome-copied-files"';

export async function writeClipboardFiles(
  files: readonly string[],
): Promise<void> {
  const list = uriListOf(files);
  if (process.platform === 'linux') {
    const written = await clipboard
      .write([
        new ClipboardItem({
          [uriList]: list,
          [gnomeFiles]: gnomeCopiedFiles(files),
        }),
      ])
      .then(
        () => true,
        () => false,
      );
    if (written) {
      return;
    }
  }
  await clipboard.write([new ClipboardItem({ [uriList]: list })]);
}

export async function readClipboardFiles(): Promise<string[]> {
  for (const item of await clipboard.read()) {
    if (item.types.includes(uriList)) {
      return filesOfUriList(await (await item.getType(uriList)).text());
    }
  }
  return [];
}
