import type { Page } from '../../../shell/main/toolContract';
import type { Side } from '../shared/protocol';
import { repositoriesIn } from './repositories';
import type { Pane, Sides } from './sides';
import { post } from './post';
import type { CommanderAccess } from './commanderAccess';

export type SideRepositoriesAccess = Pick<
  CommanderAccess,
  'isRepository' | 'inRepository'
>;

export class SideRepositories {
  constructor(
    private readonly access: SideRepositoriesAccess,
    private readonly sides: Sides,
  ) {}

  async findRepositories(
    page: Page,
    tab: string,
    side: Side,
    pane: Pane,
    again: boolean,
  ): Promise<void> {
    const asked = ++pane.repositoriesAsked;
    const { folder } = pane;
    const folders = new Map(
      (pane.entries ?? [])
        .filter((entry) => entry.folder)
        .map((entry) => [entry.name, entry.modified]),
    );
    const looked =
      again && pane.looked?.folder === folder ? pane.looked.folders : undefined;
    const unchanged = (name: string) =>
      looked?.has(name) === true && looked.get(name) === folders.get(name);
    const kept = [...pane.repositories].filter(
      (name) => folders.has(name) && unchanged(name),
    );
    const [names, inside] = await Promise.all([
      repositoriesIn(
        folder,
        [...folders.keys()].filter((name) => !unchanged(name)),
        this.access.isRepository,
        () => pane.repositoriesAsked === asked,
      ),
      this.inRepository(folder),
    ]);
    if (pane.repositoriesAsked !== asked) {
      return;
    }
    pane.looked = { folder, folders };
    const found = new Set([...kept, ...names]);
    pane.repositories = found;
    if (this.sides.shown.get(page)?.tab === tab) {
      post(page, {
        type: 'repositories',
        tab,
        side,
        folder,
        names: [...folders.keys()].filter((name) => found.has(name)),
        ...(inside && { inRepository: true }),
      });
    }
  }

  private async inRepository(folder: string): Promise<boolean> {
    return (
      (await this.access.inRepository?.(folder).catch(() => false)) ?? false
    );
  }
}
