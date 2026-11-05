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

const maxDropped = 5000;

export function iconKey(file: string, platform: NodeJS.Platform): string {
  const extension = path.extname(file).slice(1).toLowerCase();
  return platform === 'win32' && ownIconExtensions.has(extension)
    ? `file:${file}`
    : `extension:${extension}`;
}

class IconDropped extends Error {}

interface Asked {
  readonly key: string;
  readonly file: string;
  readonly ticket: string | undefined;
  readonly resolve: (icon: Uint8Array) => void;
  readonly reject: (error: unknown) => void;
}

export class Icons {
  private readonly cache = new Map<string, Promise<Uint8Array>>();
  private readonly waiting: Asked[] = [];
  private readonly dropped = new Set<string>();
  private readonly started = new Set<string>();
  private loading = 0;

  constructor(
    private readonly load: (file: string) => Promise<Uint8Array>,
    private readonly platform: NodeJS.Platform,
    private readonly atOnce = 4,
  ) {}

  of(file: string, ticket?: string): Promise<Uint8Array> {
    const key = iconKey(file, this.platform);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    if (ticket !== undefined && this.dropped.delete(ticket)) {
      return Promise.reject(new IconDropped());
    }
    return new Promise((resolve, reject) => {
      this.waiting.push({ key, file, ticket, resolve, reject });
      this.next();
    });
  }

  drop(tickets: readonly string[]): void {
    for (const ticket of tickets) {
      const index = this.waiting.findIndex((asked) => asked.ticket === ticket);
      if (index >= 0) {
        this.waiting.splice(index, 1)[0]?.reject(new IconDropped());
      } else if (!this.started.has(ticket)) {
        if (this.dropped.size >= maxDropped) {
          this.dropped.clear();
        }
        this.dropped.add(ticket);
      }
    }
  }

  private next(): void {
    while (this.loading < this.atOnce) {
      const asked = this.waiting.pop();
      if (asked === undefined) {
        return;
      }
      const cached = this.cache.get(asked.key);
      if (cached !== undefined) {
        cached.then(asked.resolve, asked.reject);
        continue;
      }
      if (this.cache.size >= maxIcons) {
        this.cache.clear();
      }
      const loading = this.load(asked.file);
      this.cache.set(asked.key, loading);
      this.loading += 1;
      if (asked.ticket !== undefined) {
        this.started.add(asked.ticket);
      }
      void loading
        .then(asked.resolve, (error: unknown) => {
          this.cache.delete(asked.key);
          asked.reject(error);
        })
        .finally(() => {
          this.loading -= 1;
          if (asked.ticket !== undefined) {
            this.started.delete(asked.ticket);
          }
          this.next();
        });
    }
  }
}
