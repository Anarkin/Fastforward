import { messageOf } from '../../lib/shared/errors';
import { fs } from '../../lib/main/files';
import { isObject } from '../../lib/main/json';
import { readText } from './readText';
import { isHeld } from '../../lib/main/fileSaving';
import { writeAtomically } from '../../lib/main/textFiles';
import { strings } from '../../lib/shared/strings';
import type { Sentence } from '../../lib/shared/sentences';

export interface Store {
  get(key: string): unknown;
  update(key: string, value: unknown): Promise<void>;
}

interface Change {
  readonly keys: readonly string[];
  readonly value: unknown;
}

function changesOf(
  keys: readonly string[],
  before: unknown,
  after: unknown,
): Change[] {
  if (!isObject(after) || (before !== undefined && !isObject(before))) {
    return [{ keys, value: after }];
  }
  const was = isObject(before) ? before : {};
  return [...new Set([...Object.keys(was), ...Object.keys(after)])]
    .filter((key) => was[key] !== after[key])
    .flatMap((key) => changesOf([...keys, key], was[key], after[key]));
}

function withChange(
  values: Record<string, unknown>,
  { keys, value }: Change,
): Record<string, unknown> {
  const [key, ...rest] = keys;
  const result = { ...values };
  const inner =
    rest.length === 0
      ? value
      : withChange(isObject(values[key]) ? values[key] : {}, {
          keys: rest,
          value,
        });
  if (inner === undefined) {
    delete result[key];
  } else {
    result[key] = inner;
  }
  return result;
}

export class JsonFileStore implements Store {
  readonly problems: readonly Sentence[];
  private values: Record<string, unknown>;
  private unreadable: boolean;
  private readonly changedUnread = new Map<string, Change>();
  private writing: Promise<void> = Promise.resolve();
  private waiting = false;

  constructor(
    private readonly file: string,
    private readonly read: Reader = readText,
  ) {
    const { values, problem } = readJson(file, read, heldAtStart);
    this.values = values ?? {};
    this.unreadable = values === undefined;
    this.problems = problem === undefined ? [] : [problem];
  }

  get readable(): boolean {
    return !this.unreadable;
  }

  get(key: string): unknown {
    return this.values[key];
  }

  update(key: string, value: unknown): Promise<void> {
    if (this.unreadable) {
      this.changeUnread(key, value);
    } else if (value === undefined) {
      delete this.values[key];
    } else {
      this.values[key] = value;
    }
    return this.save();
  }

  private save(): Promise<void> {
    if (!this.waiting && !this.unreadable) {
      this.waiting = true;
      this.writing = this.writing
        .catch(() => undefined)
        .then(() => {
          this.waiting = false;
          return writeAtomically(
            this.file,
            JSON.stringify(this.values, undefined, 2),
          );
        });
    }
    return this.writing;
  }

  saved(): Promise<void> {
    return this.writing.catch(() => undefined);
  }

  private changeUnread(key: string, value: unknown): void {
    for (const change of changesOf([key], this.values[key], value)) {
      const id = JSON.stringify(change.keys);
      this.changedUnread.delete(id);
      this.changedUnread.set(id, change);
    }
    const { values } = readJson(this.file, this.read);
    this.unreadable = values === undefined;
    this.values = [...this.changedUnread.values()].reduce(
      withChange,
      values ?? {},
    );
    if (!this.unreadable) {
      this.changedUnread.clear();
    }
  }
}

type Reader = (file: string) => string | Error | undefined;

const heldAtStart = { tries: 20, every: 100 };

function readWhileHeld(
  file: string,
  read: Reader,
  { tries, every }: { readonly tries: number; readonly every: number },
): ReturnType<Reader> {
  let text = read(file);
  for (let tried = 1; tried < tries && isHeld(text); tried += 1) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, every);
    text = read(file);
  }
  return text;
}

function readJson(
  file: string,
  read: Reader,
  holding = { tries: 1, every: 0 },
): {
  values: Record<string, unknown> | undefined;
  problem?: Sentence;
} {
  const text = readWhileHeld(file, read, holding);
  if (text === undefined) {
    return { values: {} };
  }
  if (text instanceof Error) {
    return {
      values: undefined,
      problem: strings.state.unreadable(text.message),
    };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (isObject(parsed)) {
      return { values: { ...parsed } };
    }
  } catch {}
  const copy = `${file}.corrupt`;
  try {
    fs.copyFileSync(file, copy);
  } catch (error) {
    return {
      values: {},
      problem: strings.state.notPutAside(messageOf(error)),
    };
  }
  return { values: {}, problem: strings.state.putAside(copy) };
}
