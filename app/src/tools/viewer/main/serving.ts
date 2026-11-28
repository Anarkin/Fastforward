import { fs } from '../../../lib/main/files';
import * as path from 'node:path';
import type { Tab } from '../../../shell/main/toolContract';
import { imageType, maxImageSize } from '../../../lib/shared/images';
import { fileResponse } from '../../../lib/main/fileRanges';
import { viewedFileOf } from '../shared/files';
import { isPdf, pdfType } from '../shared/pdf';
import { onSameVolume } from '../../../lib/main/volumes';

const notFound = () => new Response(null, { status: 404 });

async function imagesRootOf(viewed: string): Promise<string> {
  const folder = path.dirname(viewed);
  for (let at = folder; ; at = path.dirname(at)) {
    if (
      await fs.promises.stat(path.join(at, '.git')).then(
        () => true,
        () => false,
      )
    ) {
      return at;
    }
    if (path.dirname(at) === at) {
      return folder;
    }
  }
}

const isWithin = (root: string, file: string): boolean => {
  const relative = path.relative(root, file);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
};

async function shownBy(viewed: string, image: string): Promise<boolean> {
  const root = await imagesRootOf(viewed);
  const [realRoot, real] = await Promise.all([
    fs.promises.realpath(root).catch(() => root),
    fs.promises.realpath(image).catch(() => undefined),
  ]);
  return real !== undefined && isWithin(realRoot, real);
}

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
      !onSameVolume(asked.file, viewer.root) ||
      (asked.file !== viewer.root && !(await shownBy(viewer.root, asked.file)))
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
