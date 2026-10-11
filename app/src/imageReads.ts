import type { ImageRead } from './git/files';
import { maxImageSize, type ImageSource } from './shared/images';
import { Slots } from './shared/slots';

export const smallImageSize = 8 * 1024 * 1024;
export const smallImagesReadAtOnce = 8;
const largeImagesReadAtOnce = 2;

const readOf = ({ root, path, id, disk, revision }: ImageSource) =>
  JSON.stringify([
    root,
    path,
    disk,
    revision,
    disk || revision !== undefined ? '' : id,
  ]);

export class ImageReads {
  private readonly small = new Slots<ImageRead>(smallImagesReadAtOnce);
  private readonly large = new Slots<ImageRead>(largeImagesReadAtOnce);

  async read(
    source: ImageSource,
    read: (limit: number) => Promise<ImageRead>,
  ): Promise<ImageRead> {
    const key = readOf(source);
    const image = await this.small.run(key, () => read(smallImageSize));
    return image.kind === 'tooLarge'
      ? this.large.run(key, () => read(maxImageSize))
      : image;
  }
}
