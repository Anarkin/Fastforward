import { strings } from '../../../lib/shared/strings';
import type { Log } from '../../../shell/main/log';
import type { ShellAccess } from '../../../shell/main/toolContract';
import { imageSourceOf, imageType } from '../shared/images';
import { comparedImage } from './compare';
import type { CompareTabs } from './compareTabs';
import { gitErrorText } from './errorText';
import { readImage } from './files';
import { ImageReads } from './imageReads';
import type { TabWork } from './tabContext';

export class DiffImages {
  private readonly imageReads = new ImageReads();

  constructor(
    private readonly log: Log,
    private readonly gitPath: () => string,
    private readonly shell: () => ShellAccess,
    private readonly tabStates: ReadonlyMap<string, TabWork>,
    private readonly compareTabs: CompareTabs,
  ) {}

  image(url: URL): Promise<Response> {
    return this.shell().track(this.readImage(url));
  }

  private async readImage(url: URL): Promise<Response> {
    const source = imageSourceOf(url);
    const type = source && imageType(source.path);
    const tab = source && this.tabStates.get(source.root);
    const compared =
      source && this.compareTabs.comparisons.get(source.root)?.compared;
    if (
      !source ||
      !type ||
      (tab?.isRepository !== true && compared === undefined)
    ) {
      return new Response(null, { status: 404 });
    }
    try {
      const read = await this.imageReads.read(source, (limit) =>
        compared === undefined
          ? readImage(this.gitPath(), source.root, source, limit)
          : comparedImage(compared, source.path, source.id, limit),
      );
      if (read.kind !== 'image') {
        return new Response(null, {
          status: read.kind === 'tooLarge' ? 413 : 404,
        });
      }
      const { buffer, byteOffset, byteLength } = read.bytes;
      const body =
        buffer instanceof ArrayBuffer
          ? new Uint8Array(buffer, byteOffset, byteLength)
          : new Uint8Array(read.bytes);
      return new Response(body, {
        headers: { 'content-type': type, 'cache-control': 'no-store' },
      });
    } catch (error) {
      this.log.error(strings.log.readingImageFailed(source.path));
      this.log.error(error instanceof Error ? error : gitErrorText(error));
      return new Response(null, { status: 500 });
    }
  }
}
