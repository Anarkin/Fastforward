import * as path from 'node:path';

const ownIconExtensions: ReadonlySet<string> = new Set([
  'exe',
  'ico',
  'lnk',
  'url',
  'cur',
  'ani',
  'scr',
  'msc',
]);

const maxIcons = 2000;

export function iconKey(file: string, platform: NodeJS.Platform): string {
  const extension = path.extname(file).slice(1).toLowerCase();
  return platform === 'win32' && ownIconExtensions.has(extension)
    ? `file:${file}`
    : `extension:${extension}`;
}

export class Icons {
  private readonly cache = new Map<string, Promise<Uint8Array>>();

  constructor(
    private readonly load: (file: string) => Promise<Uint8Array>,
    private readonly platform: NodeJS.Platform,
  ) {}

  of(file: string): Promise<Uint8Array> {
    const key = iconKey(file, this.platform);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    if (this.cache.size >= maxIcons) {
      this.cache.clear();
    }
    const loading = this.load(file);
    this.cache.set(key, loading);
    loading.catch(() => this.cache.delete(key));
    return loading;
  }
}
