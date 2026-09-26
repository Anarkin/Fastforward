import { useEffect, useMemo, useState } from 'react';
import {
  workingTreeHash,
  type CommitInfo,
  type FileChange,
  type RefInfo,
  type ToExtension,
  type ToWebview,
} from '../protocol';
import { parsePatch, type DiffFile } from './diff';

interface Props {
  post: (message: ToExtension) => void;
}

interface Repository {
  name: string;
  head: string | undefined;
  refs: readonly RefInfo[];
}

export function App({ post }: Props) {
  const [repository, setRepository] = useState<Repository>();
  const [ref, setRef] = useState<string>();
  const [commits, setCommits] = useState<readonly CommitInfo[]>([]);
  // Number of uncommitted files, undefined until the extension reports it
  const [workingTree, setWorkingTree] = useState<number>();
  const [hash, setHash] = useState<string>();
  const [files, setFiles] = useState<readonly FileChange[]>([]);
  const [path, setPath] = useState<string>();
  const [patch, setPatch] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    const onMessage = (event: MessageEvent<ToWebview>) => {
      const message = event.data;
      switch (message.type) {
        case 'repository':
          setRepository(message);
          break;
        case 'commits':
          setRef(message.ref);
          setCommits(message.commits);
          break;
        case 'workingTree':
          setWorkingTree(message.files);
          break;
        case 'files':
          setHash(message.hash);
          setFiles(message.files);
          break;
        case 'diff':
          setHash(message.hash);
          setPath(message.path);
          setPatch(message.patch);
          break;
        case 'error':
          setError(message.message);
          break;
      }
    };
    window.addEventListener('message', onMessage);
    post({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, [post]);

  const refsByCommit = useMemo(() => {
    const map = new Map<string, RefInfo[]>();
    for (const info of repository?.refs ?? []) {
      map.set(info.commit, [...(map.get(info.commit) ?? []), info]);
    }
    return map;
  }, [repository]);

  const commit = commits.find((c) => c.hash === hash);

  const selectRef = (name: string | undefined) => {
    setRef(name);
    post({ type: 'selectRef', ref: name });
  };
  const selectCommit = (next: string) => {
    setHash(next);
    setFiles([]);
    setPath(undefined);
    setPatch('');
    post({ type: 'selectCommit', hash: next });
  };
  const selectFile = (next: string | undefined) => {
    if (!hash) {
      return;
    }
    setPath(next);
    post({ type: 'selectFile', hash, path: next });
  };

  return (
    <div className="columns">
      <Locations repository={repository} selected={ref} onSelect={selectRef} />
      <Commits
        commits={commits}
        workingTree={workingTree}
        refsByCommit={refsByCommit}
        selected={hash}
        onSelect={selectCommit}
      />
      <Files files={files} selected={path} onSelect={selectFile} />
      <Diff
        workingTree={hash === workingTreeHash}
        commit={commit}
        refs={commit ? (refsByCommit.get(commit.hash) ?? []) : []}
        files={files}
        patch={patch}
        error={error}
      />
    </div>
  );
}

function Column({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="column">
      <header className="column-title">{title}</header>
      <div className="column-body">{children}</div>
    </section>
  );
}

function Locations({
  repository,
  selected,
  onSelect,
}: {
  repository: Repository | undefined;
  selected: string | undefined;
  onSelect: (ref: string | undefined) => void;
}) {
  const refs = repository?.refs ?? [];
  const byKind = (kind: RefInfo['kind']) =>
    refs.filter((r) => r.kind === kind).map((r) => r.name);
  return (
    <Column title="Locations">
      <div
        className={`row head ${selected === undefined ? 'selected' : ''}`}
        onClick={() => onSelect(undefined)}
      >
        HEAD{repository?.head ? ` (${repository.head})` : ''}
      </div>
      <RefGroup
        title="Branches"
        names={byKind('branch')}
        selected={selected}
        onSelect={onSelect}
        open
      />
      <RefGroup
        title="Remotes"
        names={byKind('remote')}
        selected={selected}
        onSelect={onSelect}
      />
      <RefGroup
        title="Tags"
        names={byKind('tag')}
        selected={selected}
        onSelect={onSelect}
      />
    </Column>
  );
}

interface TreeNode {
  name: string;
  ref: string | undefined;
  children: Map<string, TreeNode>;
}

// Branch names like feat/foo are shown as folders, like Fork does
function buildTree(names: readonly string[]): TreeNode {
  const root: TreeNode = { name: '', ref: undefined, children: new Map() };
  for (const name of names) {
    let node = root;
    for (const part of name.split('/')) {
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, ref: undefined, children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
    node.ref = name;
  }
  return root;
}

function RefGroup({
  title,
  names,
  selected,
  onSelect,
  open = false,
}: {
  title: string;
  names: readonly string[];
  selected: string | undefined;
  onSelect: (ref: string) => void;
  open?: boolean;
}) {
  const tree = useMemo(() => buildTree(names), [names]);
  return (
    <TreeFolder
      label={`${title.toUpperCase()} (${names.length})`}
      node={tree}
      depth={0}
      selected={selected}
      onSelect={onSelect}
      initiallyOpen={open}
      group
    />
  );
}

function TreeFolder({
  label,
  node,
  depth,
  selected,
  onSelect,
  initiallyOpen,
  group = false,
}: {
  label: string;
  node: TreeNode;
  depth: number;
  selected: string | undefined;
  onSelect: (ref: string) => void;
  initiallyOpen: boolean;
  group?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const children = [...node.children.values()].toSorted(
    (a, b) =>
      Number(b.children.size > 0) - Number(a.children.size > 0) ||
      a.name.localeCompare(b.name),
  );
  return (
    <>
      <div
        className={`row folder ${group ? 'group' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => setOpen(!open)}
      >
        <span className="twisty">{open ? '▾' : '▸'}</span>
        {label}
      </div>
      {open &&
        children.map((child) =>
          child.children.size > 0 ? (
            <TreeFolder
              key={child.name}
              label={child.name}
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              initiallyOpen={false}
            />
          ) : (
            <div
              key={child.name}
              className={`row leaf ${child.ref === selected ? 'selected' : ''}`}
              style={{ paddingLeft: 8 + (depth + 1) * 14 + 12 }}
              title={child.ref}
              onClick={() => child.ref && onSelect(child.ref)}
            >
              {child.name}
            </div>
          ),
        )}
    </>
  );
}

function formatDate(time: number): string {
  const date = new Date(time);
  const days = (Date.now() - time) / 86_400_000;
  const clock = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (days < 6) {
    return `${date.toLocaleDateString(undefined, { weekday: 'short' })}, ${clock}`;
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function RefBadges({ refs }: { refs: readonly RefInfo[] }) {
  return (
    <>
      {refs.map((r) => (
        <span key={`${r.kind}:${r.name}`} className={`badge ${r.kind}`}>
          {r.name}
        </span>
      ))}
    </>
  );
}

function Commits({
  commits,
  workingTree,
  refsByCommit,
  selected,
  onSelect,
}: {
  commits: readonly CommitInfo[];
  workingTree: number | undefined;
  refsByCommit: Map<string, RefInfo[]>;
  selected: string | undefined;
  onSelect: (hash: string) => void;
}) {
  const onKeyDown = (event: React.KeyboardEvent) => {
    const step =
      event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) {
      return;
    }
    event.preventDefault();
    const hashes = [
      ...(workingTree ? [workingTreeHash] : []),
      ...commits.map((c) => c.hash),
    ];
    const index = hashes.indexOf(selected ?? '');
    const next = hashes[Math.max(0, Math.min(hashes.length - 1, index + step))];
    if (next) {
      onSelect(next);
    }
  };
  const scrollIfSelected = (hash: string) => (element: HTMLElement | null) => {
    if (element && hash === selected) {
      element.scrollIntoView({ block: 'nearest' });
    }
  };
  return (
    <Column title="Commits">
      <div className="list" tabIndex={0} onKeyDown={onKeyDown}>
        {workingTree !== undefined && (
          <div
            className={`commit working-tree ${workingTree === 0 ? 'empty' : ''} ${selected === workingTreeHash ? 'selected' : ''}`}
            onClick={() => workingTree > 0 && onSelect(workingTreeHash)}
            ref={scrollIfSelected(workingTreeHash)}
          >
            <div className="commit-line">
              <span className="subject">
                {workingTree > 0 ? 'Uncommitted changes' : 'No changes'}
              </span>
              {workingTree > 0 && <span className="count">{workingTree}</span>}
            </div>
            <div className="commit-line secondary">
              <span className="author">
                {workingTree > 0
                  ? 'Staged, unstaged and untracked files'
                  : 'The working tree is clean'}
              </span>
            </div>
          </div>
        )}
        {commits.map((commit) => (
          <div
            key={commit.hash}
            className={`commit ${commit.hash === selected ? 'selected' : ''}`}
            onClick={() => onSelect(commit.hash)}
            ref={scrollIfSelected(commit.hash)}
          >
            <div className="commit-line">
              <span className="subject">{commit.subject}</span>
              {commit.files > 0 && (
                <span className="count">{commit.files}</span>
              )}
            </div>
            <div className="commit-line secondary">
              <span className="author">{commit.authorName}</span>
              <span className="refs">
                <RefBadges refs={refsByCommit.get(commit.hash) ?? []} />
              </span>
              <span className="date">{formatDate(commit.authorDate)}</span>
            </div>
          </div>
        ))}
      </div>
    </Column>
  );
}

function Files({
  files,
  selected,
  onSelect,
}: {
  files: readonly FileChange[];
  selected: string | undefined;
  onSelect: (path: string | undefined) => void;
}) {
  return (
    <Column title="Files">
      {files.length > 0 && (
        <div
          className={`row group ${selected === undefined ? 'selected' : ''}`}
          onClick={() => onSelect(undefined)}
        >
          CHANGES ({files.length})
        </div>
      )}
      {files.map((file) => (
        <div
          key={file.path}
          className={`row file ${file.path === selected ? 'selected' : ''}`}
          title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
          onClick={() =>
            onSelect(file.path === selected ? undefined : file.path)
          }
        >
          <span className={`status status-${file.status}`}>{file.status}</span>
          <span className="path">{file.path}</span>
        </div>
      ))}
    </Column>
  );
}

function Diff({
  workingTree,
  commit,
  refs,
  files,
  patch,
  error,
}: {
  workingTree: boolean;
  commit: CommitInfo | undefined;
  refs: readonly RefInfo[];
  files: readonly FileChange[];
  patch: string;
  error: string | undefined;
}) {
  const diffFiles = useMemo(() => parsePatch(patch), [patch]);
  const stats = useMemo(() => {
    const byPath = new Map(files.map((file) => [file.path, file]));
    const total = files.reduce(
      (sum, file) => ({
        insertions: sum.insertions + file.insertions,
        deletions: sum.deletions + file.deletions,
      }),
      { insertions: 0, deletions: 0 },
    );
    return { byPath, total };
  }, [files]);

  return (
    <Column title="Diff">
      {error && <div className="error">{error}</div>}
      {workingTree && (
        <div className="summary">
          <dl>
            <dt>Changes</dt>
            <dd>Uncommitted changes against HEAD</dd>
            <dt>Stats</dt>
            <dd>
              {files.length} files changed{' '}
              <span className="deletions">-{stats.total.deletions}</span>{' '}
              <span className="insertions">+{stats.total.insertions}</span>
            </dd>
          </dl>
        </div>
      )}
      {commit && (
        <div className="summary">
          <dl>
            <dt>Commit</dt>
            <dd className="mono">{commit.hash}</dd>
            <dt>Author</dt>
            <dd>
              {commit.authorName} &lt;{commit.authorEmail}&gt;
            </dd>
            <dt>Date</dt>
            <dd>{new Date(commit.authorDate).toLocaleString()}</dd>
            <dt>Parents</dt>
            <dd className="mono">
              {commit.parents.map((p) => p.slice(0, 7)).join(', ')}
            </dd>
            {refs.length > 0 && (
              <>
                <dt>Refs</dt>
                <dd>
                  <RefBadges refs={refs} />
                </dd>
              </>
            )}
            <dt>Stats</dt>
            <dd>
              {files.length} files changed{' '}
              <span className="deletions">-{stats.total.deletions}</span>{' '}
              <span className="insertions">+{stats.total.insertions}</span>
            </dd>
          </dl>
          <pre className="message">{commit.message}</pre>
        </div>
      )}
      {diffFiles.map((file) => (
        <FileDiff
          key={file.path}
          file={file}
          change={stats.byPath.get(file.path)}
        />
      ))}
    </Column>
  );
}

function FileDiff({
  file,
  change,
}: {
  file: DiffFile;
  change: FileChange | undefined;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="file-diff">
      <div className="file-header" onClick={() => setOpen(!open)}>
        <span className="twisty">{open ? '▾' : '▸'}</span>
        <span className="path">{file.path}</span>
        {change && (
          <>
            <span className="deletions">-{change.deletions}</span>
            <span className="insertions">+{change.insertions}</span>
          </>
        )}
      </div>
      {open && file.binary && <div className="binary">Binary file</div>}
      {open &&
        file.hunks.map((hunk, index) => (
          <table key={index} className="hunk">
            <tbody>
              <tr className="hunk-header">
                <td colSpan={3}>{hunk.header}</td>
              </tr>
              {hunk.lines.map((line, lineIndex) => (
                <tr key={lineIndex} className={line.kind}>
                  <td className="number">{line.oldNumber}</td>
                  <td className="number">{line.newNumber}</td>
                  <td className="code">{line.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </div>
  );
}
