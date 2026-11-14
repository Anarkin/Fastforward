import { BlobTexts } from './blobTexts';
import { readBlobs, readFile } from './files';
import { workingTreeSide } from '../shared/comparisons';
import { isFullHash } from '../shared/hashes';
import type { TabMessage, TextRequest } from '../shared/protocol';
import { changesOf } from './tabState';
import { type Context, uniqueTexts } from './tabContext';
import type { TreePaths } from './treePaths';

export class DiffTexts {
  private readonly blobTexts = new BlobTexts();

  constructor(private readonly treePaths: TreePaths) {}

  async sendTexts(
    context: Context,
    { hash, diff, texts: asked }: Extract<TabMessage, { type: 'loadTexts' }>,
  ): Promise<void> {
    const { gitPath, root } = context;
    const texts = uniqueTexts(asked);
    const fromDisk = (request: TextRequest) =>
      context.tab.area !== 'staged' && request.side === workingTreeSide(hash);
    const blobs = await this.blobTexts.read(
      texts
        .filter((request) => !fromDisk(request) && isFullHash(request.blob))
        .map(({ blob }) => blob),
      (ids) => readBlobs(gitPath, root, ids),
    );
    const read = await Promise.all(
      texts.map(async (request) => {
        if (!fromDisk(request)) {
          return {
            ...request,
            text: isFullHash(request.blob)
              ? blobs.get(request.blob)
              : undefined,
          };
        }
        const onDisk =
          (request.side === 'old'
            ? changesOf(context.tab).get(request.path)?.oldPath
            : undefined) ?? request.path;
        if (!(await this.treePaths.inWorkingTree(context, onDisk))) {
          return { ...request, text: undefined };
        }
        const file = await readFile(gitPath, root, undefined, onDisk);
        return { ...request, text: file.binary ? undefined : file.content };
      }),
    );
    if (context.tab.hash === hash) {
      context.post({ type: 'texts', hash, diff, texts: read });
    }
  }

  async prefetchTexts(
    context: Context,
    hash: string,
    asked: readonly TextRequest[],
  ): Promise<void> {
    const { gitPath, root } = context;
    const texts = uniqueTexts(asked).filter(({ blob }) => isFullHash(blob));
    const blobs = await this.blobTexts.read(
      texts.map(({ blob }) => blob),
      (ids) => readBlobs(gitPath, root, ids),
    );
    const { prefetching } = context.tab;
    if (prefetching?.hash === hash && !prefetching.controller.signal.aborted) {
      context.post({
        type: 'prefetchedTexts',
        hash,
        texts: texts.map((request) => ({
          ...request,
          text: blobs.get(request.blob),
        })),
      });
    }
  }
}
