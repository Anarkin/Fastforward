import { iconUrl, type IconSource } from '../shared/icons';
import { whenStayed } from './iconAsks';
import type { CommanderActions } from './state';

export type IconTickets = Pick<
  CommanderActions,
  'iconTicketOf' | 'iconCame' | 'dropIcon'
>;

interface Closed {
  close(): void;
}

export type IconShown<Image extends Closed = ImageBitmap> =
  Image | 'failed' | undefined;

export interface IconLoads<Image extends Closed = ImageBitmap> {
  readonly fetch: (url: string, signal: AbortSignal) => Promise<Blob>;
  readonly decode: (blob: Blob) => Promise<Image>;
  readonly ticket: () => string;
}

export const pageIconLoads: IconLoads = {
  fetch: async (url, signal) => {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`No icon at ${url}`);
    }
    return response.blob();
  },
  decode: (blob) => createImageBitmap(blob),
  ticket: () => crypto.randomUUID(),
};

interface Asked {
  readonly ticket: string;
  readonly fresh: boolean;
  readonly stop: AbortController;
}

const mostIconsKept = 5000;

export class PaneIcons<Image extends Closed = ImageBitmap> {
  private readonly images = new Map<string, Image | 'failed'>();
  private readonly waiting = new Map<string, () => void>();
  private readonly asked = new Map<string, Asked>();
  private gone = false;

  constructor(
    private readonly tickets: IconTickets,
    private readonly came: () => void,
    private readonly loads: IconLoads<Image>,
  ) {}

  shown(source: IconSource): IconShown<Image> {
    const url = iconUrl(source);
    const image = this.images.get(url);
    if (image !== undefined) {
      this.images.delete(url);
      this.images.set(url, image);
      return image;
    }
    if (!this.waiting.has(url) && !this.asked.has(url)) {
      const ticket = this.tickets.iconTicketOf(url);
      if (ticket === undefined) {
        this.waiting.set(
          url,
          whenStayed(() => {
            this.waiting.delete(url);
            this.ask(source, url, this.loads.ticket(), true);
          }),
        );
      } else {
        this.ask(source, url, ticket, false);
      }
    }
    return undefined;
  }

  keep(urls: ReadonlySet<string>): void {
    for (const [url, stop] of this.waiting) {
      if (!urls.has(url)) {
        stop();
        this.waiting.delete(url);
      }
    }
    for (const [url, asked] of this.asked) {
      if (!urls.has(url)) {
        this.drop(url, asked);
      }
    }
  }

  revive(): void {
    this.gone = false;
  }

  dispose(): void {
    this.gone = true;
    this.keep(new Set());
    for (const image of this.images.values()) {
      if (image !== 'failed') {
        image.close();
      }
    }
    this.images.clear();
  }

  private drop(url: string, asked: Asked): void {
    this.asked.delete(url);
    asked.stop.abort();
    if (asked.fresh) {
      this.tickets.dropIcon(asked.ticket);
    }
  }

  private ask(
    source: IconSource,
    url: string,
    ticket: string,
    fresh: boolean,
  ): void {
    const asked = { ticket, fresh, stop: new AbortController() };
    this.asked.set(url, asked);
    void this.loads
      .fetch(iconUrl(source, ticket), asked.stop.signal)
      .then((blob) => this.loads.decode(blob))
      .then(
        (image) => {
          if (this.asked.get(url) !== asked || this.gone) {
            image.close();
            return;
          }
          this.asked.delete(url);
          this.tickets.iconCame(url, ticket);
          this.kept(url, image);
        },
        () => {
          if (this.asked.get(url) !== asked || this.gone) {
            return;
          }
          this.asked.delete(url);
          this.kept(url, 'failed');
        },
      );
  }

  private kept(url: string, image: Image | 'failed'): void {
    this.images.set(url, image);
    if (this.images.size > mostIconsKept) {
      const [oldest] = this.images;
      if (oldest !== undefined) {
        this.images.delete(oldest[0]);
        if (oldest[1] !== 'failed') {
          oldest[1].close();
        }
      }
    }
    this.came();
  }
}
