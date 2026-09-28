import { formatDateTime } from './dates';

// The selected commit, for the address bar's peek
export interface CardCommit {
  readonly hash: string;
  readonly message: string;
  readonly author: string;
  readonly email: string;
  // Milliseconds since the epoch
  readonly date: number;
  readonly committer: string;
  readonly committerEmail: string;
  readonly committed: number;
}

// What a commit message says after its subject, without the blank line git
// puts between them
export function commitBody(message: string): string {
  return message.split('\n').slice(1).join('\n').replace(/^\n+/, '');
}

// Under the address bar's subject: the description on the left, starting
// where the subject does, as an invisible copy of the hash takes the hash's
// room; a frame around it reaches up behind the bar, so the subject and the
// description read as one; on the right, a table of the full hash, the
// author and the date, and the committer and the commit's date where they
// differ, as after a rebase or a cherry-pick
export function CommitDetails({ commit }: { commit: CardCommit }) {
  const body = commitBody(commit.message);
  const otherCommitter =
    commit.committer !== commit.author ||
    commit.committerEmail !== commit.email;
  // As shown, to the minute, so seconds apart don't read as the same twice
  const otherDate =
    formatDateTime(commit.committed) !== formatDateTime(commit.date);
  return (
    <div className="commit-card">
      <span className="address-hash commit-card-indent" aria-hidden="true">
        {commit.hash.slice(0, 7)}
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
          {commit.author} &lt;{commit.email}&gt;
        </dd>
        <dt>{otherDate ? 'Authored' : 'Date'}</dt>
        <dd>{formatDateTime(commit.date)}</dd>
        {otherCommitter && (
          <>
            <dt>Committer</dt>
            <dd>
              {commit.committer} &lt;{commit.committerEmail}&gt;
            </dd>
          </>
        )}
        {otherDate && (
          <>
            <dt>Committed</dt>
            <dd>{formatDateTime(commit.committed)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
