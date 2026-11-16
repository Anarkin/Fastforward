import { ChangeSet } from '@codemirror/state';
import type { Page } from '../../../../../shell/main/toolContract';
import type { ToWebview } from '../../../../../shell/shared/protocol';
import {
  Editing,
  type EditingAccess,
  type EditingMessage,
} from '../../../../../tools/commander/main/editing';
import {
  KeptBeside,
  ReadOnlyFile,
} from '../../../../../tools/commander/main/fileSaving';
import type {
  CommanderToWebview,
  CommanderToWebviewOf,
} from '../../../../../tools/commander/shared/protocol';
import { plainOf } from '../../../../../lib/shared/sentences';

export class EditorPage implements Page {
  readonly messages: CommanderToWebview[] = [];
  disposed = false;

  post(message: ToWebview): void {
    if (message.type === 'tool' && message.tool === 'commander') {
      this.messages.push(message.message);
    }
  }

  last<T extends CommanderToWebview['type']>(
    type: T,
  ): CommanderToWebviewOf<T> | undefined {
    return this.messages.findLast(
      (message): message is CommanderToWebviewOf<T> => message.type === type,
    );
  }
}

export const settled = async () => {
  for (let round = 0; round < 5; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

export function editing(
  files: Record<string, string | Uint8Array> = {},
  textDefaults?: EditingAccess['textDefaults'],
  endingSources?: EditingAccess['endingSources'],
) {
  const saved: { file: string; bytes: string; overwrite: boolean }[] = [];
  const notices: string[] = [];
  const editedSources: string[] = [];
  const named: Page[] = [];
  const showing: Page[] = [];
  const windows = new Map<string, Page>();
  const stamps = new Map<string, number>();
  const watchers: { file: string; onChange: () => void }[] = [];
  let stamped = 0;
  const held = new Map<string, Promise<void>>();
  const access: EditingAccess = {
    readFile: async (file) => {
      await held.get(file);
      const content = files[file];
      return content === undefined
        ? Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
        : Promise.resolve(
            typeof content === 'string'
              ? Buffer.from(content, 'latin1')
              : Buffer.from(content),
          );
    },
    readStart: (file) => access.readFile(file),
    statFile: (file) => {
      const content = files[file];
      return Promise.resolve(
        content === undefined
          ? undefined
          : { folder: file.endsWith('/'), size: content.length },
      );
    },
    saveFile: (file, bytes, overwrite) => {
      if (file.includes('read-only') && !overwrite) {
        return Promise.reject(new ReadOnlyFile(file));
      }
      if (file.includes('kept-beside')) {
        return Promise.reject(
          new KeptBeside(`.${file}.saving-1`, new Error('It is busy.')),
        );
      }
      saved.push({
        file,
        bytes: Buffer.from(bytes).toString('latin1'),
        overwrite,
      });
      files[file] = Buffer.from(bytes);
      stamps.set(file, ++stamped);
      return Promise.resolve('replaced');
    },
    stampOf: (file) =>
      Promise.resolve(
        files[file] === undefined ? undefined : String(stamps.get(file) ?? 0),
      ),
    watch: (file, onChange) => {
      const watcher = { file, onChange };
      watchers.push(watcher);
      return () => {
        watchers.splice(watchers.indexOf(watcher), 1);
      };
    },
    codePage: () => Promise.resolve('windows-1252'),
    readOnly: (file) => file.endsWith('.defaults.json'),
    ...(textDefaults !== undefined && { textDefaults }),
    ...(endingSources !== undefined && { endingSources }),
  };
  const edits = new Editing(access, {
    post: (page, message) =>
      page.post({ type: 'tool', tool: 'commander', message }),
    notice: (_page, notice) => notices.push(plainOf(notice.message)),
    namesChanged: (page) => named.push(page),
    pagesShowing: () => showing,
    holds: (page, tab) => (windows.get(tab) ?? page) === page,
    openEdit: (_page, file) => {
      editedSources.push(file);
      return Promise.resolve();
    },
  });
  const touched = async (file: string) => {
    for (const watcher of watchers.filter((each) => each.file === file)) {
      watcher.onChange();
    }
    await settled();
  };
  const changeOnDisk = async (file: string, content: string) => {
    files[file] = content;
    stamps.set(file, ++stamped);
    await touched(file);
  };
  return {
    edits,
    saved,
    notices,
    editedSources,
    named,
    showing,
    windows,
    changeOnDisk,
    touched,
    watchers,
    held,
  };
}

export const forgedSource = (json: string): EditingMessage => JSON.parse(json);

export function editFrom(
  page: EditorPage,
  tab: string,
  spec: Parameters<typeof ChangeSet.of>[0],
): {
  readonly type: 'editText';
  readonly tab: string;
  readonly update: unknown;
} {
  const shown = page.last('editedText')?.shown;
  if (shown === undefined) {
    throw new Error('No text');
  }
  return {
    type: 'editText',
    tab,
    update: {
      version: page.last('editing')?.version ?? shown.version,
      changes: ChangeSet.of(spec, shown.text.length).toJSON(),
    },
  };
}
