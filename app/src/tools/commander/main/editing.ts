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
}

export type EditingMessage = Extract<
  CommanderToHost,
  { readonly type: 'readEdited' | 'editText' | 'editState' | 'saveText' }
>;

interface Opened {
  readonly file: string;
  readonly text: EditedText | undefined;
  readonly error?: Sentence;
  readonly readOnly: boolean;
  made: boolean;
  changed: boolean;
  kept?: { readonly version: number; readonly state: unknown };
}

const isMissing = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

function textEncodingOf(start: Buffer): TextEncoding | undefined {
  return byteOrderMarkOf(start) ?? utf16Order(start);
}

const startBytes = 64 * 1024;

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
    this.shell.post(page, {
      type: 'editing',
      tab,
      file: opened.file,
      ...(opened.text !== undefined && { version: opened.text.version }),
      ...(opened.changed && { changed: true }),
      ...(opened.readOnly && { readOnly: true }),
      ...(opened.made && { made: true }),
      ...(opened.error !== undefined && { error: opened.error }),
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
    const loading = this.load(file);
    this.opening.set(tab, loading);
    try {
      const opened = await loading;
      if (this.opening.get(tab) === loading) {
        this.opened.set(tab, opened);
      }
      return opened;
    } finally {
      if (this.opening.get(tab) === loading) {
        this.opening.delete(tab);
      }
    }
  }

  private async load(file: string): Promise<Opened> {
    const readOnly = this.access.readOnly(file);
    let bytes: Buffer;
    try {
      bytes = await this.access.readFile(file);
    } catch (error) {
      if (isMissing(error)) {
        return {
          file,
          text: new EditedText(decodedText(new Uint8Array(), 'utf-8')),
          readOnly,
          made: true,
          changed: false,
        };
      }
      return {
        file,
        text: undefined,
        error: strings.commander.couldNotRead(file, reasonOf(error)),
        readOnly,
        made: false,
        changed: false,
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
      return {
        file,
        text: undefined,
        error: refusal,
        readOnly,
        made: false,
        changed: false,
      };
    }
    const encoding =
      marked ?? (isUtf8(bytes) ? 'utf-8' : await this.access.codePage());
    return {
      file,
      text: new EditedText(decodedText(bytes, encoding)),
      readOnly,
      made: false,
      changed: false,
    };
  }

  async receive(page: Page, message: EditingMessage): Promise<void> {
    const opened = this.opened.get(message.tab);
    if (opened?.text === undefined) {
      return;
    }
    switch (message.type) {
      case 'readEdited':
        this.sendText(page, message.tab, opened, opened.text);
        return;
      case 'editText':
        this.edit(page, message.tab, opened, opened.text, message.update);
        return;
      case 'editState':
        if (
          message.version === opened.text.version &&
          (JSON.stringify(message.state)?.length ?? 0) <= maxKeptState
        ) {
          opened.kept = { version: message.version, state: message.state };
        }
        return;
      case 'saveText':
        await this.save(page, message.tab, message.overwriteReadOnly === true);
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

  async save(page: Page, tab: string, overwrite = false): Promise<boolean> {
    const opened = this.opened.get(tab);
    const text = opened?.text;
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
    try {
      await this.access.saveFile(file, written.bytes, overwrite);
    } catch (error) {
      if (error instanceof ReadOnlyFile) {
        this.shell.post(page, { type: 'askOverwrite', tab });
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
    opened.made = false;
    this.changedTo(page, tab, opened, text.changed());
    return true;
  }

  unsaved(tab: string): boolean {
    return this.opened.get(tab)?.changed === true;
  }

  closed(tab: string): void {
    this.opened.delete(tab);
    this.opening.delete(tab);
  }
}
