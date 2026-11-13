import type { Notice, Page } from '../../../shell/main/shell';
import { strings, type Sentence } from '../../../shared/strings';
import {
  isTextEncoding,
  type CommanderToHost,
  type CommanderToWebview,
  type EncodingSource,
  type EndingSource,
  type TextEncoding,
  type TextShown,
} from '../shared/protocol';
import { EditedText } from './editedText';
import { NoRoomToSave, ReadOnlyFile, type Saved } from './fileSaving';
import { reasonOf } from './reasons';
import type { TextDefaults } from './textDefaults';
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
  readonly textDefaults?: (
    file: string,
    asksGit: boolean,
  ) => Promise<TextDefaults>;
  readonly endingSources?: (file: string) => Promise<readonly EndingSource[]>;
}

export interface EditingShell {
  post(page: Page, message: CommanderToWebview): void;
  notice(page: Page, notice: Notice): void;
  namesChanged(page: Page): void;
  pagesShowing(tab: string): readonly Page[];
  openEdit(page: Page, file: string): Promise<void>;
}

export type EditingMessage = Extract<
  CommanderToHost,
  {
    readonly type:
      | 'readEdited'
      | 'editText'
      | 'editState'
      | 'saveText'
      | 'reloadEdited'
      | 'saveIn'
      | 'reopenIn'
      | 'editSource';
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
  readonly rules?: TextRules;
  readonly startAt?: number;
  readonly encodings?: readonly EncodingSource[];
}

export interface ViewedStart {
  readonly byte: number;
  readonly encoding?: TextEncoding;
}

type TextRules = Pick<
  TextShown,
  'indent' | 'fallbackIndent' | 'trimTrailingWhitespace' | 'insertFinalNewline'
>;

const shownOf = (read: Read, text: EditedText): TextShown => ({
  ...text.shown(),
  ...read.rules,
});

const rulesOf = (defaults: TextDefaults | undefined) =>
  defaults === undefined
    ? {}
    : {
        rules: {
          ...(defaults.indent !== undefined && { indent: defaults.indent }),
          fallbackIndent: defaults.fallbackIndent,
          ...(defaults.trimTrailingWhitespace === true && {
            trimTrailingWhitespace: true,
          }),
          ...(defaults.insertFinalNewline === true && {
            insertFinalNewline: true,
          }),
        } satisfies TextRules,
      };

interface Opened {
  readonly file: string;
  readonly readOnly: boolean;
  read: Read;
  chosen?: TextEncoding;
  endings?: readonly EndingSource[];
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
  private readonly starts = new Map<string, ViewedStart>();

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

  startAt(tab: string, start: ViewedStart): void {
    this.starts.set(tab, start);
  }

  async show(page: Page, tab: string, file: string): Promise<void> {
    const opened = await this.open(tab, file);
    this.postEditing(page, tab, opened);
    void this.findSources(tab, opened);
  }

  private async findSources(tab: string, opened: Opened): Promise<void> {
    const { endingSources } = this.access;
    if (endingSources === undefined) {
      return;
    }
    let endings: readonly EndingSource[];
    try {
      endings = await endingSources(opened.file);
    } catch {
      return;
    }
    if (this.opened.get(tab) !== opened) {
      return;
    }
    opened.endings = endings;
    for (const page of this.shell.pagesShowing(tab)) {
      this.postEditing(page, tab, opened);
    }
  }

  private postEditing(page: Page, tab: string, opened: Opened): void {
    const { read } = opened;
    const target = read.text?.target();
    const readAs = read.text?.readAs();
    this.shell.post(page, {
      type: 'editing',
      tab,
      file: opened.file,
      ...(read.text !== undefined && { version: read.text.version }),
      ...(target !== undefined && { encoding: target.encoding }),
      ...(target?.bom === true && { bom: true }),
      ...(readAs !== undefined && readAs !== target?.encoding && { readAs }),
      ...(opened.changed && { changed: true }),
      ...(opened.readOnly && { readOnly: true }),
      ...(read.made && { made: true }),
      ...(read.error !== undefined && { error: read.error }),
      ...(opened.endings !== undefined && { endingSources: opened.endings }),
      ...(read.encodings !== undefined && { encodingSources: read.encodings }),
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
    const start = this.starts.get(tab);
    this.starts.delete(tab);
    const loading = this.load(file, 0, start?.encoding, start?.byte).then(
      (read): Opened => ({
        file,
        readOnly: this.access.readOnly(file),
        read,
        ...(start?.encoding !== undefined && { chosen: start.encoding }),
        changed: false,
        outside: false,
        saving: false,
        stop: noWatching,
      }),
    );
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

  private async load(
    file: string,
    version: number,
    chosen?: TextEncoding,
    startByte?: number,
  ): Promise<Read> {
    const stamp = await this.access.stampOf(file);
    let bytes: Buffer;
    try {
      bytes = await this.access.readFile(file);
    } catch (error) {
      if (isMissing(error)) {
        const defaults = await this.access.textDefaults?.(file, true);
        return {
          text: new EditedText(
            {
              ...decodedText(new Uint8Array(), defaults?.encoding ?? 'utf-8'),
              bom: defaults?.bom ?? false,
            },
            defaults?.ending ?? 'lf',
            version,
          ),
          made: true,
          stamp: undefined,
          ...rulesOf(defaults),
          ...(defaults !== undefined && { encodings: defaults.charsets }),
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
    const bom = byteOrderMarkOf(start);
    const order = bom === undefined ? utf16Order(start) : undefined;
    const valid = isUtf8(bytes);
    const codePage = await this.access.codePage();
    const encoding = chosen ?? bom ?? order ?? (valid ? 'utf-8' : codePage);
    const decoded = decodedText(bytes, encoding);
    const defaults = await this.access.textDefaults?.(
      file,
      decoded.ending === undefined,
    );
    return {
      text: new EditedText(decoded, defaults?.ending ?? 'lf', version),
      made: false,
      stamp,
      ...rulesOf(defaults),
      encodings: [
        { kind: 'chosen', ...(chosen !== undefined && { encoding: chosen }) },
        { kind: 'bom', ...(bom !== undefined && { encoding: bom }) },
        { kind: 'utf16', ...(order !== undefined && { encoding: order }) },
        { kind: 'utf8', ...(valid && { encoding: 'utf-8' }) },
        { kind: 'codePage', encoding: codePage },
      ],
      ...(startByte !== undefined && {
        startAt: Math.min(
          decodedText(bytes.subarray(0, startByte), encoding).text.length,
          decoded.text.length,
        ),
      }),
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

  private async readAgain(
    tab: string,
    opened: Opened,
    choice: TextEncoding | 'auto' = opened.chosen ?? 'auto',
  ): Promise<void> {
    const chosen = choice === 'auto' ? undefined : choice;
    const version = (opened.read.text?.version ?? 0) + 1;
    const read = await this.load(opened.file, version, chosen);
    if (this.opened.get(tab) !== opened) {
      return;
    }
    opened.read = read;
    opened.chosen = chosen;
    opened.outside = false;
    opened.kept = undefined;
    for (const page of this.shell.pagesShowing(tab)) {
      this.changedTo(page, tab, opened, false);
      this.postEditing(page, tab, opened);
      if (read.text !== undefined) {
        this.shell.post(page, {
          type: 'editedText',
          tab,
          shown: shownOf(read, read.text),
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
      case 'saveIn':
        this.saveIn(page, message.tab, opened, text, message);
        return;
      case 'reopenIn':
        if (message.encoding === 'auto' || isTextEncoding(message.encoding)) {
          await this.readAgain(message.tab, opened, message.encoding);
        }
        return;
      case 'editSource':
        if (
          [...(opened.endings ?? []), ...(opened.read.encodings ?? [])]
            .flatMap((source) =>
              'file' in source && source.file !== undefined
                ? [source.file]
                : [],
            )
            .some((file) => file === message.file)
        ) {
          await this.shell.openEdit(page, message.file);
        }
        return;
      default:
        message satisfies never;
    }
  }

  private saveIn(
    page: Page,
    tab: string,
    opened: Opened,
    text: EditedText,
    { encoding, bom }: { readonly encoding: unknown; readonly bom: unknown },
  ): void {
    if (!isTextEncoding(encoding) || typeof bom !== 'boolean') {
      return;
    }
    const tried = text.saveIn(encoding, bom);
    if (!('bytes' in tried)) {
      const characters = [
        ...new Set(tried.unencodable.map(({ character }) => character)),
      ].slice(0, maxUnencodableNamed);
      this.shell.notice(page, {
        level: 'error',
        message: strings.editor.unencodable(opened.file, encoding, characters),
      });
      return;
    }
    for (const shownIn of this.shell.pagesShowing(tab)) {
      this.postEditing(shownIn, tab, opened);
    }
    this.changedTo(page, tab, opened, text.changed());
  }

  private sendText(
    page: Page,
    tab: string,
    opened: Opened,
    text: EditedText,
  ): void {
    const { kept, read } = opened;
    this.shell.post(page, {
      type: 'editedText',
      tab,
      shown: shownOf(read, text),
      ...(kept !== undefined && kept.version === text.version
        ? { state: kept.state }
        : read.startAt !== undefined && { at: read.startAt }),
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
    const target = text.target().encoding;
    if (opened.chosen !== undefined || target !== text.readAs()) {
      opened.chosen = target;
    }
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
    this.starts.delete(tab);
    this.opened.get(tab)?.stop();
    this.opened.delete(tab);
    this.opening.delete(tab);
  }
}
