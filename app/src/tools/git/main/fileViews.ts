import { strings } from '../../../lib/shared/strings';
import type { Log } from '../../../shell/main/log';
import type { ShellAccess } from '../../../shell/main/shell';
import { imageSourceOf, imageType } from '../shared/images';
import { comparedImage } from './compare';
import type { CompareTabs } from './compareTabs';
import { gitErrorText } from './errorText';
import { readImage, viewedFile } from './files';
import { ImageReads } from './imageReads';
import type { GitSessions } from './sessions';
import type { Context, TabWork } from './tabContext';

export class FileViews {
  private readonly imageReads = new ImageReads();

  constructor(
    private readonly log: Log,
    private readonly gitPath: string,
    private readonly viewedFiles: string,
    private readonly shell: () => ShellAccess,
    private readonly tabStates: ReadonlyMap<string, TabWork>,
    private readonly compareTabs: CompareTabs,
    private readonly sessions: GitSessions,
  ) {}

  async viewFile(
    context: Context,
    file: string,
    blob: string | undefined,
  ): Promise<void> {
    const page = context.session?.page;
    if (page === undefined) {
      return;
    }
    const notify = this.sessions.notify(context);
    try {
      const viewed = await viewedFile(
        this.gitPath,
        context.root,
        file,
        blob,
        this.viewedFiles,
      );
      if (viewed.kind === 'file') {
        await this.shell().openView(page, 'commander', viewed.file);
      } else {
        notify(
          'error',
          viewed.kind === 'tooLarge'
            ? strings.diff.viewTooLarge(file)
            : strings.diff.viewMissing(file),
        );
      }
    } catch (error) {
      notify('error', strings.diff.couldNotView(file, gitErrorText(error)));
    }
  }

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
          ? readImage(this.gitPath, source.root, source, limit)
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
