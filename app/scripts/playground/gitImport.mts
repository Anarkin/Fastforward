export const stream: Buffer[] = [];
let mark = 0;
let minute = 0;
const data = (value: string | Buffer) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return [Buffer.from(`data ${bytes.length}\n`), bytes, Buffer.from('\n')];
};
export const write = (...parts: (string | Buffer[])[]) => {
  for (const part of parts) {
    if (Array.isArray(part)) {
      stream.push(...part);
    } else {
      stream.push(Buffer.from(part));
    }
  }
};
const signature = () => {
  minute++;
  return `Playground <playground@example.com> ${1767225600 + minute * 60} +0000`;
};

const sourcePath = (file: string) =>
  /[ "\\\n]/.test(file) ? JSON.stringify(file) : file;

export type Change =
  | { readonly delete: string }
  | { readonly rename: readonly [string, string] }
  | { readonly copy: readonly [string, string] }
  | {
      readonly path: string;
      readonly content: string | Buffer;
      readonly mode?: string;
    };

interface Commit {
  readonly from?: number;
  readonly merges?: readonly number[];
  readonly changes?: readonly Change[];
  readonly message: string;
  readonly author?: string;
}

export function commit(
  ref: string,
  { from, merges = [], changes = [], message, author }: Commit,
) {
  mark++;
  write(
    `commit ${ref}\nmark :${mark}\nauthor ${author ?? signature()}\ncommitter ${author ?? signature()}\n`,
    data(message),
    from ? `from :${from}\n` : '',
    ...merges.map((other) => `merge :${other}\n`),
  );
  for (const change of changes) {
    if ('delete' in change) {
      write(`D ${change.delete}\n`);
    } else if ('rename' in change) {
      write(`R ${sourcePath(change.rename[0])} ${change.rename[1]}\n`);
    } else if ('copy' in change) {
      write(`C ${sourcePath(change.copy[0])} ${change.copy[1]}\n`);
    } else {
      write(
        `M ${change.mode ?? '100644'} inline ${change.path}\n`,
        data(change.content),
      );
    }
  }
  write('\n');
  return mark;
}

export const lightweight = (name: string, at: number) =>
  write(`reset refs/tags/${name}\nfrom :${at}\n\n`);
export const annotated = (name: string, at: number, message: string) =>
  write(`tag ${name}\nfrom :${at}\ntagger ${signature()}\n`, data(message));
export const pointer = (ref: string, at: number) =>
  write(`reset ${ref}\nfrom :${at}\n\n`);
export const searchable = (subject: string, words: readonly string[]) =>
  `${subject}\n\nSearch for: ${words.join(', ')}.\n`;
