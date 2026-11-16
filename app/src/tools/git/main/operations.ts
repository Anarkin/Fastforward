import type { Upstream } from './branches';
import { gitErrorText } from '../../../lib/main/errorText';
import { plainOf, type Sentence } from '../../../lib/shared/sentences';
import { strings } from '../../../lib/shared/strings';
import type { Log } from '../../../shell/main/log';

export type Notify = (level: 'info' | 'error', message: Sentence) => void;

export interface RepositoryAt {
  readonly gitPath: string;
  readonly root: string;
}

export function say(log: Log, notify: Notify, message: Sentence): void {
  log.info(plainOf(message));
  notify('info', message);
}

type FoundUpstream = Extract<Upstream, { kind: 'found' }>;

export function foundUpstream(
  notify: Notify,
  upstream: Upstream,
): FoundUpstream | undefined {
  if (upstream.kind === 'found') {
    return upstream;
  }
  notify('info', missingUpstream(upstream));
  return undefined;
}

function missingUpstream(upstream: Exclude<Upstream, FoundUpstream>): Sentence {
  if (upstream.kind === 'detached') {
    return strings.messages.detachedUpstream;
  }
  return upstream.kind === 'none'
    ? strings.messages.noUpstream(upstream.branch)
    : strings.messages.upstreamGone(upstream.name, upstream.branch);
}

export function reportFailure(
  log: Log,
  notify: Notify,
  failed: string,
  message: (reason: string) => Sentence,
  error: unknown,
): void {
  log.error(failed);
  log.error(error);
  notify('error', message(gitErrorText(error)));
}
