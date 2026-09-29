import { Fragment } from 'react';
import { shortHash } from '../shared/hashes';
import type { CommitInfo, RefInfo } from '../shared/protocol';
import { HeadBubble, RefBubble } from './bubbles';
import { formatDateTime } from './dates';

export type CardCommit = Pick<
  CommitInfo,
  | 'hash'
  | 'subject'
  | 'message'
  | 'authorName'
  | 'authorEmail'
  | 'authorDate'
  | 'committerName'
  | 'committerEmail'
  | 'commitDate'
> & {
  readonly refs: readonly RefInfo[];
  readonly detachedHead: boolean;
};

function commitBody(message: string): string {
  return message.split('\n').slice(1).join('\n').replace(/^\n+/, '');
}

function LaterRow({
  label,
  same,
  children,
}: {
  label: string;
  same: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt>{label}</dt>
      {same ? <dd className="same">same</dd> : <dd>{children}</dd>}
    </>
  );
}

export function CommitDetails({ commit }: { commit: CardCommit }) {
  const body = commitBody(commit.message);
  const sameCommitter =
    commit.committerName === commit.authorName &&
    commit.committerEmail === commit.authorEmail;
  const bubbles = [
    ...(commit.detachedHead
      ? [{ key: 'HEAD', element: <HeadBubble commit={commit.hash} /> }]
      : []),
    ...commit.refs.map((ref) => ({
      key: `${ref.kind}:${ref.name}`,
      element: <RefBubble info={ref} />,
    })),
  ];
  const sameDate =
    formatDateTime(commit.commitDate) === formatDateTime(commit.authorDate);
  return (
    <div className="commit-card">
      <span className="address-hash commit-card-indent" aria-hidden="true">
        {shortHash(commit.hash)}
      </span>
      <div className="commit-card-text">
        {body ? (
          <div className="commit-card-frame">
            <pre className="commit-card-body">{body}</pre>
          </div>
        ) : (
          <div className="commit-card-frame empty" />
        )}
      </div>
      <dl className="commit-card-info">
        <dt>Commit</dt>
        <dd className="commit-card-hash">{commit.hash}</dd>
        <dt>Author</dt>
        <dd>
          {commit.authorName} &lt;{commit.authorEmail}&gt;
        </dd>
        <LaterRow label="Committer" same={sameCommitter}>
          {commit.committerName} &lt;{commit.committerEmail}&gt;
        </LaterRow>
        <dt>Authored</dt>
        <dd>{formatDateTime(commit.authorDate)}</dd>
        <LaterRow label="Committed" same={sameDate}>
          {formatDateTime(commit.commitDate)}
        </LaterRow>
        {bubbles.map((bubble, i) => (
          <Fragment key={bubble.key}>
            <dt className={i === 0 ? 'first-bubble' : undefined} />
            <dd className={i === 0 ? 'first-bubble' : undefined}>
              {bubble.element}
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
