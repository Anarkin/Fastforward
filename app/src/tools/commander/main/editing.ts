import type { Notice, Page } from '../../../shell/main/shell';
import { strings, type Sentence } from '../../../shared/strings';
import type {
  CommanderToHost,
  CommanderToWebview,
  TextEncoding,
} from '../shared/protocol';
import { EditedText } from './editedText';
import { NoRoomToSave, ReadOnlyFile, type Saved } from './fileSaving';
import { reasonOf } from './reasons';
import { decodedText } from './textCodec';
import { byteOrderMarkOf, isUtf8, looksBinary, utf16Order } from './textRows';

const maxEditedBytes = 50 * 1024 * 1024;

const maxKeptState = 16 * 1024 * 1024;

const maxUnencodableNamed = 5;

export interface EditingAccess {
  readonly readFile: (file: string) => Promise<Buffer>;
  readonly readStart: (file: string) => Promise<Buffer>;
  readonly statFile: (
    file: string,
  ) => Promise<{ readonly folder: boolean; readonly size: number } | undefined>;
  readonly stampOf: (file: string) => Promise<string | undefined>;
  readonly watch: (file: string, onChange: () => void) => () => void;
  readonly saveFile: (
    file: string,
    bytes: Uint8Array,
    overwriteReadOnly: boolean,
  ) => Promise<Saved>;
  readonly codePage: () => Promise<TextEncoding>;
  readonly readOnly: (file: string) => boolean;
}

export interface EditingShell {
  post(page: Page, message: CommanderToWebview): void;
  notice(page: Page, notice: Notice): void;
  namesChanged(page: Page): void;
  pagesShowing(tab: string): readonly Page[];
}

export type EditingMessage = Extract<
  CommanderToHost,
  {
    readonly type:
      'readEdited' | 'editText' | 'editState' | 'saveText' | 'reloadEdited';
  }
>;

export interface Overwriting {
  readonly readOnly?: boolean;
  readonly changed?: boolean;
}

interface Read {
  readonly text: EditedText | undefined;
  readonly error?: Sentence;
  readonly made: boolean;
  readonly stamp: string | undefined;
}

interface Opened {
  readonly file: string;
  readonly readOnly: boolean;
  read: Read;
  changed: boolean;
  outside: boolean;
  saving: boolean;
  kept?: { readonly version: number; readonly state: unknown };
  stop: () => void;
}

const isMissing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

function textEncodingOf(start: Buffer): TextEncoding | undefined {
  return byteOrderMarkOf(start) ?? utf16Order(start);
}

const startBytes = 64 * 1024;

const noWatching = () => {};

export class Editing {
  private readonly opened = new Map<string, Opened>();
  private readonly opening = new Map<string, Promise<Opened>>();

  constructor(
    private readonly access: EditingAccess,
    private readonly shell: EditingShell,
  ) {}

  async refusal(file: string): Promise<Sentence | undefined> {
    const stat = await this.access.statFile(file);
    if (stat === undefined) {
      return undefined;
    }
    if (stat.folder) {
      return strings.editor.folder(file);
    }
    if (stat.size > maxEditedBytes) {
      return strings.editor.tooLarge(file);
    }
    const start = await this.access.readStart(file);
    return looksBinary(start) && textEncodingOf(start) === undefined
      ? strings.editor.binary(file)
      : undefined;
  }

  async show(page: Page, tab: string, file: string): Promise<void> {
    const opened = await this.open(tab, file);
    this.postEditing(page, tab, opened);
  }

  private postEditing(page: Page, tab: string, opened: Opened): void {
    const { read } = opened;
    this.shell.post(page, {
      type: 'editing',
      tab,
      file: opened.file,
      ...(read.text !== undefined && { version: read.text.version }),
      ...(opened.changed && { changed: true }),
      ...(opened.readOnly && { readOnly: true }),
      ...(read.made && { made: true }),
      ...(read.error !== undefined && { error: read.error }),
    });
  }

  private async open(tab: string, file: string): Promise<Opened> {
    const known = this.opened.get(tab);
    if (known !== undefined && known.file === file) {
      return known;
    }
    const pending = this.opening.get(tab);
    if (pending !== undefined) {
      return pending;
    }
    const loading = this.load(file, 0).then((read): Opened => ({
      file,
      readOnly: this.access.readOnly(file),
      read,
      changed: false,
      outside: false,
      saving: false,
      stop: noWatching,
    }));
    this.opening.set(tab, loading);
    try {
      const opened = await loading;
      if (this.opening.get(tab) === loading) {
        known?.stop();
        opened.stop = this.access.watch(file, () => {
          void this.changedOnDisk(tab, opened);
        });
        this.opened.set(tab, opened);
      }
      return opened;
    } finally {
      if (this.opening.get(tab) === loading) {
        this.opening.delete(tab);
      }
    }
  }

  private async load(file: string, version: number): Promise<Read> {
    const stamp = await this.access.stampOf(file);
    let bytes: Buffer;
    try {
      bytes = await this.access.readFile(file);
    } catch (error) {
      if (isMissing(error)) {
        return {
          text: new EditedText(
            decodedText(new Uint8Array(), 'utf-8'),
            'lf',
            version,
          ),
          made: true,
          stamp: undefined,
        };
      }
      return {
        text: undefined,
        error: strings.commander.couldNotRead(file, reasonOf(error)),
        made: false,
        stamp,
      };
    }
    const start = bytes.subarray(0, startBytes);
    const marked = textEncodingOf(start);
    const refusal =
      bytes.length > maxEditedBytes
        ? strings.editor.tooLarge(file)
        : looksBinary(start) && marked === undefined
          ? strings.editor.binary(file)
          : undefined;
    if (refusal !== undefined) {
      return { text: undefined, error: refusal, made: false, stamp };
    }
    const encoding =
      marked ?? (isUtf8(bytes) ? 'utf-8' : await this.access.codePage());
    return {
      text: new EditedText(decodedText(bytes, encoding), 'lf', version),
      made: false,
      stamp,
    };
  }

  private async changedOnDisk(tab: string, opened: Opened): Promise<void> {
    if (opened.saving) {
      return;
    }
    const stamp = await this.access.stampOf(opened.file);
    if (
      this.opened.get(tab) !== opened ||
      opened.saving ||
      stamp === opened.read.stamp
    ) {
      return;
    }
    if (!opened.changed) {
      await this.readAgain(tab, opened);
      return;
    }
    if (!opened.outside) {
      opened.outside = true;
      for (const page of this.shell.pagesShowing(tab)) {
        this.shell.notice(page, {
          level: 'info',
          message: strings.editor.changedOutside(opened.file),
        });
      }
    }
  }

  private async readAgain(tab: string, opened: Opened): Promise<void> {
    const version = (opened.read.text?.version ?? 0) + 1;
    const read = await this.load(opened.file, version);
    if (this.opened.get(tab) !== opened) {
      return;
    }
    opened.read = read;
    opened.outside = false;
    opened.kept = undefined;
    for (const page of this.shell.pagesShowing(tab)) {
      this.changedTo(page, tab, opened, false);
      this.postEditing(page, tab, opened);
      if (read.text !== undefined) {
        this.shell.post(page, {
          type: 'editedText',
          tab,
          shown: read.text.shown(),
          reloaded: true,
        });
      }
    }
  }

  async receive(page: Page, message: EditingMessage): Promise<void> {
    const opened = this.opened.get(message.tab);
    const text = opened?.read.text;
    if (opened === undefined || text === undefined) {
      return;
    }
    switch (message.type) {
      case 'readEdited':
        this.sendText(page, message.tab, opened, text);
        return;
      case 'editText':
        this.edit(page, message.tab, opened, text, message.update);
        return;
      case 'editState':
        if (
          message.version === text.version &&
          (JSON.stringify(message.state)?.length ?? 0) <= maxKeptState
        ) {
          opened.kept = { version: message.version, state: message.state };
        }
        return;
      case 'saveText':
        await this.save(page, message.tab, {
          readOnly: message.overwriteReadOnly === true,
          changed: message.overwriteChanged === true,
        });
        return;
      case 'reloadEdited':
        await this.readAgain(message.tab, opened);
        return;
      default:
        message satisfies never;
    }
  }

  private sendText(
    page: Page,
    tab: string,
    opened: Opened,
    text: EditedText,
  ): void {
    const { kept } = opened;
    this.shell.post(page, {
      type: 'editedText',
      tab,
      shown: text.shown(),
      ...(kept !== undefined &&
        kept.version === text.version && { state: kept.state }),
    });
  }

  private edit(
    page: Page,
    tab: string,
    opened: Opened,
    text: EditedText,
    update: unknown,
  ): void {
    if (opened.readOnly || !text.edit(update)) {
      opened.kept = undefined;
      this.sendText(page, tab, opened, text);
      return;
    }
    this.changedTo(page, tab, opened, text.changed());
  }

  private changedTo(
    page: Page,
    tab: string,
    opened: Opened,
    changed: boolean,
  ): void {
    if (opened.changed === changed) {
      return;
    }
    opened.changed = changed;
    this.shell.post(page, { type: 'textChanged', tab, changed });
    this.shell.namesChanged(page);
  }

  private ask(
    page: Page,
    tab: string,
    file: string,
    message: CommanderToWebview,
  ): void {
    if (this.shell.pagesShowing(tab).includes(page)) {
      this.shell.post(page, message);
    } else {
      this.shell.notice(page, {
        level: 'error',
        message: strings.editor.askedInTab(file),
      });
    }
  }

  async save(
    page: Page,
    tab: string,
    overwriting: Overwriting = {},
  ): Promise<boolean> {
    const opened = this.opened.get(tab);
    const text = opened?.read.text;
    if (opened === undefined || text === undefined) {
      return false;
    }
    const { file } = opened;
    if (opened.readOnly) {
      this.shell.notice(page, {
        level: 'error',
        message: strings.editor.readOnly(file),
      });
      return false;
    }
    if (
      overwriting.changed !== true &&
      (opened.outside ||
        (await this.access.stampOf(file)) !== opened.read.stamp)
    ) {
      this.ask(page, tab, file, { type: 'askChangedOnDisk', tab });
      return false;
    }
    const checkpoint = text.checkpoint();
    const written = text.encoded();
    if (!('bytes' in written)) {
      const characters = [
        ...new Set(written.unencodable.map(({ character }) => character)),
      ].slice(0, maxUnencodableNamed);
      this.shell.notice(page, {
        level: 'error',
        message: strings.editor.unencodable(
          file,
          text.shown().encoding,
          characters,
        ),
      });
      return false;
    }
    opened.saving = true;
    try {
      await this.access.saveFile(
        file,
        written.bytes,
        overwriting.readOnly === true,
      );
    } catch (error) {
      opened.saving = false;
      if (error instanceof ReadOnlyFile) {
        this.ask(page, tab, file, { type: 'askOverwrite', tab });
      } else {
        this.shell.notice(page, {
          level: 'error',
          message:
            error instanceof NoRoomToSave
              ? strings.editor.noRoom(file)
              : strings.editor.couldNotSave(file, reasonOf(error)),
        });
      }
      return false;
    }
    text.saved(checkpoint);
    opened.read = {
      ...opened.read,
      made: false,
      stamp: await this.access.stampOf(file),
    };
    opened.saving = false;
    opened.outside = false;
    this.changedTo(page, tab, opened, text.changed());
    return true;
  }

  unsaved(tab: string): boolean {
    return this.opened.get(tab)?.changed === true;
  }

  closed(tab: string): void {
    this.opened.get(tab)?.stop();
    this.opened.delete(tab);
    this.opening.delete(tab);
  }
}
