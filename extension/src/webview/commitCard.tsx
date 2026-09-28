import { formatDateTime } from './dates';

// The selected commit, for the address bar's peek
export interface CardCommit {
  readonly hash: string;
  readonly message: string;
  readonly author: string;
  readonly email: string;
  // Milliseconds since the epoch
  readonly date: number;
}

// What a commit message says after its subject, without the blank line git
// puts between them
export function commitBody(message: string): string {
  return message.split('\n').slice(1).join('\n').replace(/^\n+/, '');
}

// Under the address bar's subject: the description on the left, starting
// where the subject does, as an invisible copy of the hash takes the hash's
// room; a frame around it reaches up behind the bar, so the subject and the
// description read as one; the full hash, the author and the date on the
// right
export function CommitDetails({ commit }: { commit: CardCommit }) {
  const body = commitBody(commit.message);
  return (
    <div className="commit-card">
      <span className="address-hash commit-card-indent" aria-hidden="true">
        {commit.hash.slice(0, 7)}
      </span>
      {body ? (
        <div className="commit-card-frame">
          <pre className="commit-card-body">{body}</pre>
        </div>
      ) : (
        <div className="commit-card-frame empty" />
      )}
      <div className="commit-card-info">
        <div className="commit-card-hash">{commit.hash}</div>
        <div>
          {commit.author} &lt;{commit.email}&gt;
        </div>
        <div>{formatDateTime(commit.date)}</div>
      </div>
    </div>
  );
}
