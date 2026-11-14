import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Tab } from '../../../shell/main/toolContract';
import { imageType, maxImageSize } from '../../../lib/shared/images';
import { viewedFileOf } from '../shared/files';
import { fileResponse } from './fileRanges';
import { isPdf, pdfType } from '../shared/pdf';
import type { Icons } from './icons';
import { onSameVolume } from './volumes';
import { iconSourceOf, iconTicketOf, viewerOfIcon } from '../shared/icons';
import { type Sides, listedIn } from './sides';

export class Serving {
  constructor(
    private readonly sides: Sides,
    private readonly icons: Icons,
    private readonly tabs: () => readonly Tab[],
  ) {}

  async file(url: URL, range: string | null): Promise<Response> {
    const asked = viewedFileOf(url);
    if (asked !== undefined && isPdf(asked.file)) {
      const viewer = this.tabs().some(
        (tab) =>
          tab.id === asked.tab && tab.view === true && tab.root === asked.file,
      );
      return viewer
        ? fileResponse(asked.file, pdfType, range).catch(
            () => new Response(null, { status: 404 }),
          )
        : new Response(null, { status: 404 });
    }
    const viewer =
      asked &&
      this.tabs().find((tab) => tab.id === asked.tab && tab.view === true);
    const type = asked && imageType(asked.file);
    if (
      !asked ||
      viewer?.root === undefined ||
      !type ||
      !path.isAbsolute(asked.file) ||
      !onSameVolume(asked.file, viewer.root)
    ) {
      return new Response(null, { status: 404 });
    }
    try {
      const stats = await fs.promises.stat(asked.file);
      if (!stats.isFile()) {
        return new Response(null, { status: 404 });
      }
      if (stats.size > maxImageSize) {
        return new Response(null, { status: 413 });
      }
      const body = await fs.promises.readFile(asked.file);
      return new Response(new Uint8Array(body), {
        headers: { 'content-type': type, 'cache-control': 'no-store' },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  }

  async icon(url: URL): Promise<Response> {
    const viewer = viewerOfIcon(url);
    if (viewer !== undefined) {
      const tab = this.tabs().find(
        (each) =>
          each.id === viewer.tab &&
          (each.view === true || each.edit === true) &&
          each.root === viewer.file,
      );
      return tab?.root === undefined
        ? new Response(null, { status: 404 })
        : this.iconResponse(tab.root);
    }
    const source = iconSourceOf(url);
    const pane = source && this.sides.panes.get(source.tab)?.[source.side];
    const entry = listedIn(pane, source?.name);
    if (
      source === undefined ||
      pane === undefined ||
      pane.folder !== source.folder ||
      entry === undefined ||
      entry.folder
    ) {
      return new Response(null, { status: 404 });
    }
    return this.iconResponse(
      path.join(pane.folder, source.name),
      iconTicketOf(url),
    );
  }

  private async iconResponse(file: string, ticket?: string): Promise<Response> {
    try {
      const png = await this.icons.of(file, ticket);
      return new Response(Buffer.from(png), {
        headers: { 'content-type': 'image/png' },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  }
}
