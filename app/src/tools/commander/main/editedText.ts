import { ChangeSet, RangeSet, Text } from '@codemirror/state';
import type { TextShown } from '../shared/protocol';
import {
  isLineEnding,
  keptMarks,
  marksListed,
  movedMarks,
  strayMarks,
  type EndingMark,
  type KeptMark,
  type LineEnding,
  type StrayEnding,
} from '../shared/textMarks';
import { encodedText, type DecodedText, type EncodedText } from './textCodec';

const maxEditedLength = 64 * 1024 * 1024;

function strayEndingsOf(value: unknown): StrayEnding[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strays: StrayEnding[] = [];
  for (const each of value) {
    if (typeof each !== 'object' || each === null) {
      return undefined;
    }
    const at: unknown = Reflect.get(each, 'at');
    const ending: unknown = Reflect.get(each, 'ending');
    if (
      !Number.isSafeInteger(at) ||
      typeof at !== 'number' ||
      !isLineEnding(ending)
    ) {
      return undefined;
    }
    strays.push({ at, ending });
  }
  return strays;
}

function endingsOf(
  value: unknown,
): { ending: LineEnding; strayEndings: StrayEnding[] } | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const ending: unknown = Reflect.get(value, 'ending');
  const strayEndings = strayEndingsOf(Reflect.get(value, 'strayEndings'));
  return isLineEnding(ending) && strayEndings !== undefined
    ? { ending, strayEndings }
    : undefined;
}

function changesOf(value: unknown, length: number): ChangeSet | undefined {
  try {
    const changes = ChangeSet.fromJSON(value);
    return changes.length === length && changes.newLength <= maxEditedLength
      ? changes
      : undefined;
  } catch {
    return undefined;
  }
}

const isSaved = (value: object): value is Saved =>
  'doc' in value && value.doc instanceof Text;

interface Saved {
  readonly doc: Text;
  readonly ending: LineEnding;
  readonly strays: RangeSet<EndingMark>;
  readonly kept: RangeSet<KeptMark>;
}

export class EditedText {
  private doc: Text;
  private ending: LineEnding;
  private strays: RangeSet<EndingMark>;
  private kept: RangeSet<KeptMark>;
  private last: Saved;
  version = 0;

  constructor(
    private readonly read: DecodedText,
    fallbackEnding: LineEnding = 'lf',
  ) {
    this.doc = Text.of(read.text.split('\n'));
    this.ending = read.ending ?? fallbackEnding;
    this.strays = strayMarks(this.doc, read.strayEndings);
    this.kept = keptMarks(this.doc, read.keptBytes);
    this.last = this.current();
  }

  checkpoint(): object {
    return this.current();
  }

  private current(): Saved {
    return {
      doc: this.doc,
      ending: this.ending,
      strays: this.strays,
      kept: this.kept,
    };
  }

  edit(update: unknown): boolean {
    if (typeof update !== 'object' || update === null) {
      return false;
    }
    if (Reflect.get(update, 'version') !== this.version) {
      return false;
    }
    const sentChanges: unknown = Reflect.get(update, 'changes');
    const sentEndings: unknown = Reflect.get(update, 'endings');
    if (sentChanges === undefined && sentEndings === undefined) {
      return false;
    }
    const changes =
      sentChanges === undefined
        ? undefined
        : changesOf(sentChanges, this.doc.length);
    const endings =
      sentEndings === undefined ? undefined : endingsOf(sentEndings);
    if (
      (sentChanges !== undefined && changes === undefined) ||
      (sentEndings !== undefined && endings === undefined)
    ) {
      return false;
    }
    if (changes !== undefined) {
      this.doc = changes.apply(this.doc);
      this.strays = movedMarks(this.strays, changes);
      this.kept = movedMarks(this.kept, changes);
    }
    if (endings !== undefined) {
      this.ending = endings.ending;
      this.strays = strayMarks(this.doc, endings.strayEndings);
    }
    this.version += 1;
    return true;
  }

  changed(): boolean {
    const { doc, ending, strays, kept } = this.last;
    return !(
      ending === this.ending &&
      doc.length === this.doc.length &&
      doc.eq(this.doc) &&
      RangeSet.eq([strays], [this.strays]) &&
      RangeSet.eq([kept], [this.kept])
    );
  }

  saved(checkpoint: object = this.current()): void {
    if (isSaved(checkpoint)) {
      this.last = checkpoint;
    }
  }

  shown(): TextShown {
    return {
      text: this.doc.toString(),
      version: this.version,
      encoding: this.read.encoding,
      bom: this.read.bom,
      ending: this.ending,
      strayEndings: marksListed(this.strays, (at, { ending }) => ({
        at,
        ending,
      })),
      keptBytes: marksListed(this.kept, (at, { bytes }) => ({ at, bytes })),
    };
  }

  encoded(): EncodedText {
    const shown = this.shown();
    return encodedText(shown);
  }
}
