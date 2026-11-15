import { strings } from '../../../lib/shared/strings';
import type { ShellAccess } from '../../../shell/main/toolContract';
import { gitErrorText } from './errorText';
import { viewedFile } from './viewedFiles';
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
  ): Promise<void> {
    const page = context.session?.page;
    if (page === undefined) {
      return;
    }
    const notify = this.sessions.notify(context);
    try {
      const viewed = await viewedFile(
        this.gitPath(),
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
}
