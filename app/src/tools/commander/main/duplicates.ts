import type { Hashed } from './contentHash';

const headBytes = 64 * 1024;

export interface Compared {
  readonly key: string;
  readonly file: string;
  readonly size: number;
  readonly modified: number | undefined;
}

export interface ContentReader {
  hash(
    file: string,
    bytes: number | undefined,
    signal: AbortSignal,
  ): Promise<Hashed | undefined>;
}

export interface DuplicatesOptions {
  readonly head?: number;
  readonly skip?: (file: string) => Promise<boolean>;
}

type Groups = readonly (readonly string[])[];

interface Known {
  readonly size: number;
  readonly modified: number | undefined;
  skipped?: Promise<boolean>;
  start?: Promise<Hashed | undefined>;
  whole?: Promise<Hashed | undefined>;
}

interface Read {
  readonly compared: Compared;
  readonly hashed: Hashed;
}

function grouped<T>(items: readonly T[], keyOf: (item: T) => string | number) {
  const groups = new Map<string | number, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [item]);
    } else {
      group.push(item);
    }
  }
  return [...groups.values()];
}

function oncePerFile(reads: readonly Read[]): Read[] {
  const seen = new Set<string>();
  return reads.filter(({ hashed }) => {
    if (hashed.id === undefined) {
      return true;
    }
    if (seen.has(hashed.id)) {
      return false;
    }
    seen.add(hashed.id);
    return true;
  });
}

export class Duplicates {
  private readonly known = new Map<string, Known>();
  private readonly head: number;
  private shown: Groups = [];
  private generation = 0;
  private running: Promise<void> = Promise.resolve();
  private busy = false;
  private stopped = false;
  private closed = false;
  private reads = new AbortController();

  constructor(
    private readonly reader: ContentReader,
    private readonly onChange: () => void,
    private readonly options: DuplicatesOptions = {},
  ) {
    this.head = options.head ?? headBytes;
  }

  get groups(): Groups {
    return this.shown;
  }

  get reading(): boolean {
    return this.busy;
  }

  look(files: readonly Compared[]): void {
    if (this.closed) {
      return;
    }
    const generation = ++this.generation;
    this.busy = !this.stopped;
    this.running = this.run(generation, files);
  }

  stop(): void {
    this.stopped = true;
    this.reads.abort();
  }

  forget(): void {
    this.reads.abort();
    this.known.clear();
    this.stopped = false;
    this.reads = new AbortController();
  }

  close(): void {
    this.closed = true;
    this.generation++;
    this.reads.abort();
    this.shown = [];
    this.busy = false;
  }

  idle(): Promise<void> {
    return this.running;
  }

  private async run(
    generation: number,
    files: readonly Compared[],
  ): Promise<void> {
    const found: (readonly string[])[] = [];
    const current = () => generation === this.generation;
    const confirm = (group: readonly string[]) => {
      if (!current()) {
        return;
      }
      found.push(group);
      this.shown = found;
      this.onChange();
    };
    const bySize = grouped(
      files.filter((file) => file.size > 0),
      (file) => file.size,
    ).filter((group) => group.length > 1);
    await Promise.all(bySize.map((group) => this.sameSize(group, confirm)));
    if (current()) {
      this.shown = found;
      this.busy = false;
      this.onChange();
    }
  }

  private async sameSize(
    group: readonly Compared[],
    confirm: (group: readonly string[]) => void,
  ): Promise<void> {
    const starts = await this.readAll(group, 'start');
    for (const sameStart of grouped(starts, (read) => read.hashed.hash)) {
      const distinct = oncePerFile(sameStart);
      if (distinct.length < 2) {
        continue;
      }
      if (distinct[0].compared.size <= this.head) {
        confirm(distinct.map((read) => read.compared.key));
        continue;
      }
      const wholes = await this.readAll(
        distinct.map((read) => read.compared),
        'whole',
      );
      for (const same of grouped(wholes, (read) => read.hashed.hash)) {
        if (same.length > 1) {
          confirm(same.map((read) => read.compared.key));
        }
      }
    }
  }

  private async readAll(
    files: readonly Compared[],
    part: 'start' | 'whole',
  ): Promise<Read[]> {
    const reads = await Promise.all(
      files.map(async (compared) => {
        const hashed = await this.read(compared, part);
        return hashed === undefined ? undefined : { compared, hashed };
      }),
    );
    return reads.filter((read) => read !== undefined);
  }

  private async read(
    { file, size, modified }: Compared,
    part: 'start' | 'whole',
  ): Promise<Hashed | undefined> {
    let known = this.known.get(file);
    if (known?.size !== size || known.modified !== modified) {
      known = { size, modified };
      this.known.set(file, known);
    }
    const entry = known;
    entry.skipped ??=
      this.options.skip?.(file).catch(() => true) ?? Promise.resolve(false);
    if (await entry.skipped) {
      return undefined;
    }
    const cached = entry[part];
    if (cached !== undefined) {
      return cached;
    }
    if (this.stopped || this.closed) {
      return undefined;
    }
    const { signal } = this.reads;
    const reading = this.reader
      .hash(file, part === 'start' ? this.head : undefined, signal)
      .catch(() => undefined);
    entry[part] = reading;
    const hashed = await reading;
    if (signal.aborted && entry[part] === reading) {
      entry[part] = undefined;
    }
    return hashed;
  }
}
