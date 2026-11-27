import { bytesVersion } from '../../../../../lib/main/fileVersions';
import { ChangeSet } from '@codemirror/state';
import type { Page } from '../../../../../shell/main/toolContract';
import type { ToWebview } from '../../../../../shell/shared/protocol';
import {
  Editing,
  type EditingAccess,
  type EditingMessage,
} from '../../../../../tools/editor/main/editing';
import { KeptBeside, ReadOnlyFile } from '../../../../../lib/main/fileSaving';
import type {
  EditorToWebview,
  EditorToWebviewOf,
} from '../../../../../tools/editor/shared/protocol';
import { plainOf } from '../../../../../lib/shared/sentences';

export class EditorPage implements Page {
  readonly messages: EditorToWebview[] = [];
  disposed = false;

  post(message: ToWebview): void {
    if (message.type === 'tool' && message.tool === 'editor') {
      this.messages.push(message.message);
    }
  }

  last<T extends EditorToWebview['type']>(
    type: T,
  ): EditorToWebviewOf<T> | undefined {
    return this.messages.findLast(
      (message): message is EditorToWebviewOf<T> => message.type === type,
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
  const watchers: { file: string; onChange: () => void }[] = [];
  const held = new Map<string, Promise<void>>();
  const reads: string[] = [];
  const saving: {
    until: Promise<void> | undefined;
    running: number;
    most: number;
    after: ((file: string) => void) | undefined;
  } = { until: undefined, running: 0, most: 0, after: undefined };
  const access: EditingAccess = {
    readFile: async (file) => {
      reads.push(file);
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
    saveFile: async (file, bytes, overwrite) => {
      saving.running += 1;
      saving.most = Math.max(saving.most, saving.running);
      try {
        await saving.until;
      } finally {
        saving.running -= 1;
      }
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
      saving.after?.(file);
      return Promise.resolve('replaced');
    },
    stampOf: (file) => {
      const content = files[file];
      return Promise.resolve(
        content === undefined
          ? undefined
          : bytesVersion(
              typeof content === 'string'
                ? Buffer.from(content, 'latin1')
                : content,
            ),
      );
    },
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
      page.post({ type: 'tool', tool: 'editor', message }),
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
  const changeOnDisk = async (file: string, content: string | Uint8Array) => {
    files[file] = content;
    await touched(file);
  };
  return {
    edits,
    saved,
    saving,
    notices,
    editedSources,
    named,
    showing,
    windows,
    changeOnDisk,
    touched,
    watchers,
    held,
    reads,
  };
}

export const forgedSource = (json: string): EditingMessage => JSON.parse(json);

export const forgedState = (tab: string, state: unknown): EditingMessage =>
  Object.assign(JSON.parse('{"type":"editState","version":0}'), {
    tab,
    state,
  });

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
