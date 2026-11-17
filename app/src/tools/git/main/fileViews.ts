import { strings } from '../../../lib/shared/strings';
import type { ShellAccess } from '../../../shell/main/toolContract';
import { gitErrorText } from '../../../lib/main/errorText';
import { viewedFile } from './viewedFiles';
import { blobAt } from './objects';
import type { GitSessions } from './sessions';
import type { Context } from './tabContext';

export class FileViews {
  constructor(
    private readonly gitPath: () => string,
    private readonly viewedFiles: string,
    private readonly shell: () => ShellAccess,
    private readonly sessions: GitSessions,
  ) {}

  async viewFile(
    context: Context,
    file: string,
    blob: string | undefined,
    rev?: string,
  ): Promise<void> {
    const page = context.session?.page;
    if (page === undefined) {
      return;
    }
    const notify = this.sessions.notify(context);
    try {
      const at =
        rev === undefined
          ? blob
          : await blobAt(this.gitPath(), context.root, rev, file);
      const viewed =
        rev !== undefined && at === undefined
          ? ({ kind: 'missing' } as const)
          : await viewedFile(
              this.gitPath(),
              context.root,
              file,
              at,
              this.viewedFiles,
            );
      if (viewed.kind === 'file') {
        await this.shell().openView(page, viewed.file);
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
}
