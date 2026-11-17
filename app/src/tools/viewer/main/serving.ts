import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Tab } from '../../../shell/main/toolContract';
import { imageType, maxImageSize } from '../../../lib/shared/images';
import { fileResponse } from '../../../lib/main/fileRanges';
import { viewedFileOf } from '../shared/files';
import { isPdf, pdfType } from '../shared/pdf';
import { onSameVolume } from '../../../lib/main/volumes';

const notFound = () => new Response(null, { status: 404 });

export class Serving {
  constructor(
    private readonly tabs: () => readonly Tab[],
    private readonly copyOf: (tab: Tab) => string | undefined,
  ) {}

  async file(url: URL, range: string | null): Promise<Response> {
    const asked = viewedFileOf(url);
    const viewer =
      asked &&
      this.tabs().find((tab) => tab.id === asked.tab && tab.tool === 'viewer');
    if (asked === undefined || viewer?.root === undefined) {
      return notFound();
    }
    const source =
      asked.file === viewer.root
        ? (this.copyOf(viewer) ?? asked.file)
        : asked.file;
    if (isPdf(asked.file)) {
      return viewer.root === asked.file
        ? fileResponse(source, pdfType, range).catch(notFound)
        : notFound();
    }
    const type = imageType(asked.file);
    if (
      !type ||
      !path.isAbsolute(asked.file) ||
      !onSameVolume(asked.file, viewer.root)
    ) {
      return notFound();
    }
    try {
      const stats = await fs.promises.stat(source);
      if (!stats.isFile()) {
        return notFound();
      }
      if (stats.size > maxImageSize) {
        return new Response(null, { status: 413 });
      }
      const body = await fs.promises.readFile(source);
      return new Response(new Uint8Array(body), {
        headers: { 'content-type': type, 'cache-control': 'no-store' },
      });
    } catch {
      return notFound();
    }
  }
}
