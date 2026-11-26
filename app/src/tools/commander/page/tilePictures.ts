import { iconUrl, type IconSource } from '../shared/icons';
import type { PaneIcons } from './paneIcons';
import type { PaneImages } from './paneImages';
import { thumbnailKey } from './thumbnailCache';
import type { TileLook } from './tileLooks';
import type { TileLooks } from './tileProbes';
import type { ShownTile, TilePicture } from './tileRecords';
import type { TileThumbnails } from './tileThumbnails';

export interface TileMode {
  readonly across: number;
  readonly tileWidth: number;
  readonly thumbnailSize: number;
  readonly count: number;
  readonly tileOf: (index: number) => TileLook | undefined;
  readonly thumbnailOf: (index: number) => string | undefined;
  readonly thumbnails: TileThumbnails;
  readonly made: (index: number, made: Blob, pixelRatio: number) => void;
}

type Shown = Pick<ShownTile, 'picture' | 'pictureKind'>;

export interface TilePictures {
  readonly of: (look: TileLook, index: number) => Shown;
  readonly thumbnailKeys: ReadonlySet<string>;
  readonly decoded: ReadonlySet<string>;
}

export function tilePicturesOf({
  tiles,
  icons,
  images,
  sourceOf,
  tileLooks,
  scale,
  iconUrls,
}: {
  readonly tiles: TileMode;
  readonly icons: PaneIcons;
  readonly images: PaneImages;
  readonly sourceOf: (index: number) => IconSource | undefined;
  readonly tileLooks: TileLooks;
  readonly scale: number;
  readonly iconUrls: Set<string>;
}): TilePictures {
  const thumbnailKeys = new Set<string>();
  const decoded = new Set<string>();
  const none: Pick<ShownTile, 'picture' | 'pictureKind'> = {
    picture: undefined,
    pictureKind: 'none',
  };
  const iconOf = (
    look: TileLook,
    index: number,
  ): Pick<ShownTile, 'picture' | 'pictureKind'> => {
    const source = sourceOf(index);
    if (source !== undefined) {
      iconUrls.add(iconUrl(source));
      const system = icons.shown(source);
      if (system !== undefined && system !== 'failed') {
        return {
          picture: {
            image: system,
            key: iconUrl(source),
            width: tileLooks.iconSize,
            height: tileLooks.iconSize,
          },
          pictureKind: 'system',
        };
      }
    }
    const url = tileLooks.genericOf(look.folder);
    const image = images.get(url);
    return image === undefined || url === undefined
      ? none
      : {
          picture: {
            image,
            key: url,
            width: tileLooks.genericSize,
            height: tileLooks.genericSize,
          },
          pictureKind: 'generic',
        };
  };
  const of = (
    look: TileLook,
    index: number,
  ): Pick<ShownTile, 'picture' | 'pictureKind'> => {
    const url = tiles.thumbnailOf(index);
    if (look.image === 'raster' && url !== undefined) {
      thumbnailKeys.add(thumbnailKey(url, tiles.thumbnailSize, scale));
      const thumbnail = tiles.thumbnails.shown(
        url,
        tiles.thumbnailSize,
        scale,
        (made, pixelRatio) => tiles.made(index, made, pixelRatio),
      );
      if (thumbnail === null) {
        return iconOf(look, index);
      }
      if (thumbnail === undefined) {
        return none;
      }
      decoded.add(thumbnail.url);
      const image = images.get(thumbnail.url);
      return image === undefined
        ? none
        : {
            picture: {
              image,
              key: thumbnail.url,
              width: thumbnail.width,
              height: thumbnail.height,
            },
            pictureKind: 'thumbnail',
          };
    }
    if (look.image === 'vector' && url !== undefined) {
      decoded.add(url);
      if (images.failed(url)) {
        return iconOf(look, index);
      }
      const image = images.get(url);
      if (image === undefined) {
        return none;
      }
      const fit = Math.min(
        1,
        tiles.thumbnailSize / (image.naturalWidth || 1),
        tiles.thumbnailSize / (image.naturalHeight || 1),
      );
      const picture: TilePicture = {
        image,
        key: url,
        width: image.naturalWidth * fit,
        height: image.naturalHeight * fit,
      };
      return { picture, pictureKind: 'thumbnail' };
    }
    return iconOf(look, index);
  };
  return { of, thumbnailKeys, decoded };
}
