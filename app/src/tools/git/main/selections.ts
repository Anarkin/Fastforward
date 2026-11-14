import type { TabMessage } from '../shared/protocol';
import type { CommitNavigation } from './commitNavigation';
import type { Diffs } from './diffs';
import type { GitStorage } from './storage';
import { notInHistory, type Context } from './tabContext';
import { pickable, select, stillThere, unselect } from './tabState';

export type SelectionMessage = Extract<
  TabMessage,
  {
    readonly type:
      | 'selectCommit'
      | 'selectFile'
      | 'loadTree'
      | 'loadTexts'
      | 'prefetchDiff'
      | 'prefetchTexts'
      | 'loadFileDiff';
  }
>;

export class Selections {
  constructor(
    private readonly storage: GitStorage,
    private readonly diffs: Diffs,
    private readonly commitNavigation: () => CommitNavigation,
    private readonly save: (saving: Promise<void>) => void,
  ) {}

  async receive(context: Context, message: SelectionMessage): Promise<void> {
    switch (message.type) {
      case 'selectCommit':
        context.tab.prefetching?.controller.abort();
        context.tab.selection = message.selection;
        if (message.hash === undefined) {
          unselect(context.tab);
          this.remember(context);
          return;
        }
        if (!pickable(context.tab, message.hash)) {
          notInHistory(context, message.hash);
          return;
        }
        this.commitNavigation().visit(context, message.hash, message.replace);
        select(context.tab, message.hash);
        this.remember(context);
        await this.diffs.sendCommit(context);
        return;
      case 'selectFile':
        if (this.isSelected(context, message.hash)) {
          context.tab.path = message.path;
          context.tab.area = message.area;
          this.remember(context);
          await this.diffs.sendDiff(context, message.hash);
        }
        return;
      case 'loadTree':
        if (this.isSelected(context, message.hash)) {
          await this.diffs.sendTree(context, message.hash);
        }
        return;
      case 'loadTexts':
        if (this.isSelected(context, message.hash)) {
          await this.diffs.sendTexts(context, message);
        }
        return;
      case 'prefetchDiff':
        await this.diffs.prefetchDiff(context, message.hash);
        return;
      case 'prefetchTexts':
        if (context.tab.prefetching?.hash === message.hash) {
          await this.diffs.prefetchTexts(context, message.hash, message.texts);
        }
        return;
      case 'loadFileDiff':
        if (this.isSelected(context, message.hash)) {
          await this.diffs.sendFileDiff(
            context,
            message.hash,
            message.path,
            message.diff,
          );
        }
        return;
      default:
        return message satisfies never;
    }
  }

  remember({ root, tab }: Context): void {
    this.save(
      this.storage.setSelection(
        root,
        tab.hash === undefined
          ? undefined
          : { hash: tab.hash, path: tab.path, area: tab.area },
      ),
    );
  }

  private known(context: Context, hash: string): boolean {
    if (stillThere(context.tab)(hash)) {
      return true;
    }
    notInHistory(context, hash);
    return false;
  }

  private isSelected(context: Context, hash: string): boolean {
    return this.known(context, hash) && hash === context.tab.hash;
  }
}
