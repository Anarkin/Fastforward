import * as path from 'node:path';
import { isSide, type CommanderToHost, type Entry } from '../shared/protocol';
import {
  fillsThumbnail,
  isThumbnailBox,
  type ThumbnailBox,
  isWebp,
  madeThumbnailHeader,
  maxThumbnailBytes,
  thumbnailBoxOf,
  thumbnailSourceOf,
} from '../shared/thumbnails';
import { imageType, maxImageSize } from '../../../lib/shared/images';
import { thumbnailKey } from './thumbnailStore';
import { ArchiveImages } from './archiveImages';
import { fileResponse } from './fileRanges';
import type { ArchiveAccess, OpenedArchive } from './archives';
import { type Pane, type Sides, listedIn } from './sides';
import { archiveItems } from './archiveItems';

export interface Thumbnails {
  readonly read: (key: string) => Promise<Uint8Array | undefined>;
  readonly has: (key: string) => Promise<boolean>;
  readonly full: () => Promise<boolean>;
  readonly write: (key: string, bytes: Uint8Array) => Promise<void>;
}

export interface ServingAccess {
  readonly thumbnails: Thumbnails;
  readonly streamed?: (file: string) => boolean | Promise<boolean>;
  readonly archives?: ArchiveAccess;
}

const storedStatus = 204;
const onlineStatus = 409;
const fullStatus = 507;

export class ThumbnailServing {
  private archiveImages: ArchiveImages | undefined;

  constructor(
    private readonly access: ServingAccess,
    private readonly sides: Sides,
  ) {}

  private encryptedInArchive(listed: {
    readonly pane: Pane;
    readonly name: string;
  }): boolean {
    return (
      listed.pane.archive !== undefined &&
      archiveItems(this.access.archives, listed.pane, [listed.name])
        ?.encrypted === true
    );
  }

  private listedImage(
    tab: unknown,
    side: unknown,
    folder: unknown,
    name: unknown,
  ):
    | {
        readonly file: string;
        readonly entry: Entry;
        readonly type: string;
        readonly pane: Pane;
        readonly name: string;
      }
    | undefined {
    const pane =
      typeof tab === 'string' && isSide(side)
        ? this.sides.panes.get(tab)?.[side]
        : undefined;
    const entry =
      pane !== undefined && pane.folder === folder
        ? listedIn(pane, name)
        : undefined;
    const type = entry && imageType(entry.name);
    return pane === undefined ||
      entry === undefined ||
      typeof name !== 'string' ||
      entry.folder ||
      type === undefined
      ? undefined
      : { file: path.join(pane.folder, name), entry, type, pane, name };
  }

  private thumbnailKeyOf(
    { file, entry }: { readonly file: string; readonly entry: Entry },
    box: number,
    pixelRatio: number,
  ): string {
    return thumbnailKey(
      file,
      entry.size ?? 0,
      entry.modified ?? 0,
      box,
      pixelRatio,
    );
  }

  async saveThumbnail(
    message: Extract<CommanderToHost, { type: 'saveThumbnail' }>,
  ): Promise<void> {
    const listed = this.listedImage(
      message.tab,
      message.side,
      message.folder,
      message.name,
    );
    if (
      listed !== undefined &&
      !this.encryptedInArchive(listed) &&
      isThumbnailBox(message.box, message.pixelRatio) &&
      message.bytes instanceof Uint8Array &&
      message.bytes.length <= maxThumbnailBytes &&
      isWebp(message.bytes)
    ) {
      await this.access.thumbnails
        .write(
          this.thumbnailKeyOf(listed, message.box, message.pixelRatio),
          message.bytes,
        )
        .catch(() => undefined);
    }
  }

  async thumbnail(url: URL): Promise<Response> {
    const source = thumbnailSourceOf(url);
    const listed =
      source &&
      this.listedImage(source.tab, source.side, source.folder, source.name);
    const archived =
      listed?.pane.archive === undefined
        ? undefined
        : archiveItems(this.access.archives, listed.pane, [listed.name]);
    const encrypted = archived?.encrypted === true;
    if (
      listed === undefined ||
      (listed.pane.archive !== undefined && archived === undefined) ||
      (encrypted && !archived.archives.hasPassword(archived.archive.file))
    ) {
      return new Response(null, { status: 404 });
    }
    const boxed = thumbnailBoxOf(url);
    if (fillsThumbnail(url)) {
      const skipped =
        boxed &&
        (await this.notFilled(
          listed,
          boxed,
          archived?.archive.source ?? listed.file,
          encrypted,
        ));
      if (boxed === undefined || skipped !== undefined) {
        return new Response(null, { status: skipped ?? 404 });
      }
    }
    const made =
      boxed === undefined || encrypted
        ? undefined
        : await this.access.thumbnails.read(
            this.thumbnailKeyOf(listed, boxed.box, boxed.pixelRatio),
          );
    if (made !== undefined) {
      return new Response(new Uint8Array(made), {
        headers: { 'content-type': 'image/webp', [madeThumbnailHeader]: '1' },
      });
    }
    if ((listed.entry.size ?? 0) > maxImageSize) {
      return new Response(null, { status: 413 });
    }
    if (archived !== undefined) {
      return this.archivedImage(archived, listed.type);
    }
    return fileResponse(listed.file, listed.type, null).catch(
      () => new Response(null, { status: 404 }),
    );
  }

  private async archivedImage(
    {
      archives,
      archive,
      paths: [item],
      encrypted,
    }: {
      readonly archives: ArchiveAccess;
      readonly archive: OpenedArchive;
      readonly paths: readonly string[];
      readonly encrypted: boolean;
    },
    type: string,
  ): Promise<Response> {
    if (
      item === undefined ||
      (encrypted && !archives.hasPassword(archive.file))
    ) {
      return new Response(null, { status: 404 });
    }
    this.archiveImages ??= new ArchiveImages(archives);
    const bytes = await this.archiveImages.read(archive, item);
    return bytes === undefined
      ? new Response(null, { status: 404 })
      : new Response(new Uint8Array(bytes), {
          headers: { 'content-type': type },
        });
  }

  private async notFilled(
    listed: { readonly file: string; readonly entry: Entry },
    { box, pixelRatio }: ThumbnailBox,
    read: string,
    encrypted: boolean,
  ): Promise<number | undefined> {
    if (
      !encrypted &&
      (await this.access.thumbnails.has(
        this.thumbnailKeyOf(listed, box, pixelRatio),
      ))
    ) {
      return storedStatus;
    }
    if (
      listed.entry.online === true ||
      (await this.access.streamed?.(read)) === true
    ) {
      return onlineStatus;
    }
    return (await this.access.thumbnails.full()) ? fullStatus : undefined;
  }
}
