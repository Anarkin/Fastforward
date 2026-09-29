import * as vscode from 'vscode';
import { aheadBehind, fastForward } from './git/branches';
import type { Repository } from './git/git';
import { listRefs } from './git/repository';
import type { CheckoutTarget } from './shared/protocol';
import { withoutRemote } from './shared/refNames';

export interface RepositoryAt {
  readonly gitPath: string;
  readonly repository: Repository;
  readonly root: string;
}

export async function checkout(
  log: vscode.LogOutputChannel,
  at: RepositoryAt,
  target: CheckoutTarget,
): Promise<boolean> {
  const { repository } = at;
  const label = target.kind === 'commit' ? target.hash : target.name;
  try {
    if (target.kind === 'remote') {
      const local = withoutRemote(target.name);
      const refs = await listRefs(repository);
      if (refs.some((ref) => ref.kind === 'branch' && ref.name === local)) {
        await repository.checkout(local);
        await catchUp(log, at, local, target.name);
      } else {
        await repository.createBranch(local, true, target.name);
        await repository.setBranchUpstream(local, target.name);
      }
    } else {
      await repository.checkout(
        target.kind === 'commit'
          ? target.hash
          : target.kind === 'tag'
            ? `refs/tags/${target.name}`
            : target.name,
      );
    }
    log.info(`Checked out ${target.kind} ${label}`);
    return true;
  } catch (error) {
    const details = gitErrorText(error);
    log.error(`Checking out ${target.kind} ${label} failed`);
    log.error(details);
    void vscode.window.showErrorMessage(
      `Fastforward: couldn't check out ${label}. ${details}`,
    );
    return false;
  }
}

async function catchUp(
  log: vscode.LogOutputChannel,
  { gitPath, root }: RepositoryAt,
  local: string,
  remote: string,
): Promise<void> {
  const { ahead, behind } = await aheadBehind(
    gitPath,
    root,
    `refs/heads/${local}`,
    `refs/remotes/${remote}`,
  );
  if (behind === 0) {
    return;
  }
  if (ahead > 0) {
    log.info(`${local} and ${remote} have diverged, not fast-forwarding`);
    void vscode.window.showInformationMessage(
      `Fastforward: switched to ${local}, which has diverged from ${remote}; pull to combine them.`,
    );
    return;
  }
  try {
    await fastForward(gitPath, root, `refs/remotes/${remote}`);
    log.info(`Fast-forwarded ${local} to ${remote}`);
  } catch (error) {
    const details = gitErrorText(error);
    log.error(`Fast-forwarding ${local} to ${remote} failed`);
    log.error(details);
    void vscode.window.showErrorMessage(
      `Fastforward: switched to ${local}, but couldn't fast-forward it to ${remote}. ${details}`,
    );
  }
}

export async function fetchAll(
  log: vscode.LogOutputChannel,
  repository: Repository,
): Promise<void> {
  try {
    await repository.fetch({ all: true, prune: true });
    log.info('Fetched every remote');
  } catch (error) {
    const details = gitErrorText(error);
    log.error('fetch failed');
    log.error(details);
    void vscode.window.showErrorMessage(
      `Fastforward: couldn't fetch. ${details}`,
    );
  }
}

function gitErrorText(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const { stderr } = error;
    if (typeof stderr === 'string' && stderr.trim()) {
      return stderr.trim();
    }
  }
  return error instanceof Error ? error.message : String(error);
}
