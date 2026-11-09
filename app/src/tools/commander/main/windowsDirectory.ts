export const listDirectory = 0x1;
export const shareAll = 0x7;
export const openExisting = 3;
export const backupSemantics = 0x02000000;
export const invalidHandle = 0xffff_ffff_ffff_ffffn;

export const fullDirectoryInformation = 2;
export const noMoreFiles = 0x8000_0006 | 0;
export const noSuchFile = 0xc000_000f | 0;
export const pageSize = 64 * 1024;

export const hiddenAttribute = 0x2;
export const directoryAttribute = 0x10;
const reparsePointAttribute = 0x400;
const linkTags: ReadonlySet<number> = new Set([
  0xa000_000c, 0xa000_0003, 0xa000_001d,
]);

export const createFileSignature =
  'void *CreateFileW(const char16_t *name, uint32_t access, uint32_t share, void *security, uint32_t disposition, uint32_t flags, void *template)';
export const closeHandleSignature = 'bool CloseHandle(void *handle)';
export const queryDirectorySignature =
  'int32_t NtQueryDirectoryFile(void *handle, void *event, void *apc, void *context, void *status, void *page, uint32_t length, int kind, bool single, void *name, bool restart)';

export const record = {
  next: 0,
  modified: 24,
  size: 40,
  attributes: 56,
  nameLength: 60,
  reparseTag: 64,
  name: 68,
};

const dot = 0x2e;

export function isLink(attributes: number, reparseTag: number): boolean {
  return (attributes & reparsePointAttribute) !== 0 && linkTags.has(reparseTag);
}

export function nameAt(page: Buffer, start: number): string {
  const nameStart = start + record.name;
  return page.toString(
    'utf16le',
    nameStart,
    nameStart + page.readUInt32LE(start + record.nameLength),
  );
}

function isDots(page: Buffer, start: number): boolean {
  const length = page.readUInt32LE(start + record.nameLength);
  const first = page.readUInt16LE(start + record.name);
  return (
    (length === 2 && first === dot) ||
    (length === 4 &&
      first === dot &&
      page.readUInt16LE(start + record.name + 2) === dot)
  );
}

export function eachOnPage(page: Buffer, take: (start: number) => void): void {
  for (let start = 0; ;) {
    if (!isDots(page, start)) {
      take(start);
    }
    const next = page.readUInt32LE(start + record.next);
    if (next === 0) {
      return;
    }
    start += next;
  }
}
