import { strings } from '../../../lib/shared/strings';
import { imageSourceOf, imageType } from '../../../lib/shared/imageSources';
import { gitErrorText } from '../../../lib/main/errorText';
import { ImageReads } from '../../../lib/main/imageReads';
import type { Log } from '../../../shell/main/log';
import type { Compared } from '../../../shell/main/savedTabs';
import { comparedImageRoute } from '../shared/images';
import { comparedImage } from './compare';

export class ComparedImages {
  private readonly imageReads = new ImageReads();

  constructor(
    private readonly log: Log,
    private readonly comparedOf: (tab: string) => Compared | undefined,
  ) {}

  async image(url: URL): Promise<Response> {
    const source = imageSourceOf(url, comparedImageRoute);
    const type = source && imageType(source.path);
    const compared = source && this.comparedOf(source.root);
    if (!source || !type || compared === undefined) {
      return new Response(null, { status: 404 });
    }
    try {
      const read = await this.imageReads.read(source, (limit) =>
        comparedImage(compared, source.path, source.id, limit),
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
