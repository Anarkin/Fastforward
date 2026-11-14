import { useEffect, useId, useRef, useState } from 'react';
import {
  cloneName,
  nameProblem,
  targetPath,
  urlProblem,
  type CloneView,
} from '../shared/clone';
import { strings, type Sentence } from '../../../lib/shared/strings';
import { Words } from '../../../lib/page/name';
import { useDismiss } from '../../../lib/page/contextMenu';
import { CloseIcon } from '../../../lib/page/icons';
import { moveBetweenButtons } from '../../../lib/page/dialogButtons';
import { useDialogDrag, useModalDialog } from '../../../lib/page/modalDialog';
import { useGit, useGitActions } from './store';

export interface ChosenFolder {
  readonly folder: string;
}

export interface CloneTarget {
  readonly folder: string;
  readonly name: string;
  readonly problem?: Sentence;
}

type Form = Extract<CloneView, { readonly kind: 'form' }>;
type Running = Extract<CloneView, { readonly kind: 'running' }>;

export function formProblem(
  url: string,
  folder: string,
  name: string,
  checked: CloneTarget | undefined,
): Sentence | undefined {
  if (url.trim() === '') {
    return undefined;
  }
  return (
    urlProblem(url) ??
    nameProblem(name) ??
    (checked?.folder === folder && checked.name === name
      ? checked.problem
      : undefined)
  );
}

function CloneForm({ form }: { form: Form }) {
  const chosenFolder = useGit((state) => state.clone.folder);
  const checked = useGit((state) => state.clone.target);
  const {
    checkCloneTarget: onCheck,
    chooseCloneFolder: onChooseFolder,
    startClone: onClone,
    closeClone: onCancel,
  } = useGitActions();
  const [url, setUrl] = useState(form.url);
  const [folder, setFolder] = useState(form.folder);
  const [name, setName] = useState(form.name);
  const [edited, setEdited] = useState(false);
  const ids = useId();
  const address = useRef<HTMLInputElement>(null);
  useEffect(() => {
    address.current?.focus();
    address.current?.select();
  }, []);
  useEffect(() => {
    if (chosenFolder !== undefined) {
      setFolder(chosenFolder.folder);
      setEdited(true);
    }
  }, [chosenFolder]);
  const derived = cloneName(url);
  const named = name === '' ? derived : name;
  useEffect(() => {
    if (folder === '' || nameProblem(named) !== undefined) {
      return undefined;
    }
    return onCheck(folder, named);
  }, [folder, named, onCheck]);
  const problem = formProblem(url, folder, named, checked);
  const message = edited ? problem : (form.message ?? problem);
  const ready = url.trim() !== '' && problem === undefined;
  const editing =
    (set: (value: string) => void) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      set(event.target.value);
      setEdited(true);
    };
  return (
    <form
      className="clone-body"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) {
          onClone({ url: url.trim(), folder, name: named });
        }
      }}
    >
      <div className="clone-fields">
        <label htmlFor={`${ids}url`}>{strings.clone.url}</label>
        <input
          id={`${ids}url`}
          ref={address}
          className="clone-input"
          value={url}
          spellCheck={false}
          autoComplete="off"
          onChange={editing(setUrl)}
        />
        <label htmlFor={`${ids}folder`}>{strings.clone.folder}</label>
        <div className="clone-folder">
          <input
            id={`${ids}folder`}
            className="clone-input"
            value={folder}
            spellCheck={false}
            autoComplete="off"
            onChange={editing(setFolder)}
          />
          <button
            type="button"
            className="confirm-button"
            title={strings.clone.chooseFolder}
            onClick={() => onChooseFolder(folder)}
          >
            {strings.tabs.browse}
          </button>
        </div>
        <label htmlFor={`${ids}name`}>{strings.clone.name}</label>
        <input
          id={`${ids}name`}
          className="clone-input"
          value={name}
          placeholder={derived}
          spellCheck={false}
          autoComplete="off"
          onChange={editing(setName)}
        />
      </div>
      {folder !== '' && nameProblem(named) === undefined && (
        <div className="clone-target" title={targetPath(folder, named)}>
          <Words>{strings.clone.into(targetPath(folder, named))}</Words>
        </div>
      )}
      {message !== undefined && (
        <div className="clone-problem" role="alert">
          <Words>{message}</Words>
        </div>
      )}
      <div className="confirm-buttons" onKeyDown={moveBetweenButtons}>
        <button type="button" className="confirm-button" onClick={onCancel}>
          {strings.confirm.cancel}
        </button>
        <button
          type="submit"
          className="confirm-button default"
          disabled={!ready}
        >
          {strings.clone.clone}
        </button>
      </div>
    </form>
  );
}

function CloneRunning({ running }: { running: Running }) {
  const { stopClone: onStop } = useGitActions();
  const { progress } = running;
  return (
    <div className="clone-body">
      <div className="clone-running">
        <span title={running.url}>
          <Words>{strings.clone.cloning(running.url)}</Words>
        </span>
        <span title={running.target}>
          <Words>{strings.clone.intoTarget(running.target)}</Words>
        </span>
      </div>
      <div className="clone-progress">
        <span className="clone-phase">
          {progress?.phase ?? strings.clone.connecting}
        </span>
        <div
          className="clone-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress?.percent}
        >
          <div
            className="clone-bar-done"
            style={{ width: `${progress?.percent ?? 0}%` }}
          />
        </div>
        <span className="clone-percent">
          {progress && strings.clone.percent(progress.percent)}
        </span>
      </div>
      <div className="clone-detail">{progress?.detail}</div>
      <div className="confirm-buttons" onKeyDown={moveBetweenButtons}>
        <button type="button" className="confirm-button" onClick={onStop}>
          {strings.clone.stop}
        </button>
      </div>
    </div>
  );
}

export function ClonePopup() {
  const view = useGit((state) => state.clone.view);
  const formKey = useGit((state) => state.clone.form);
  const { closeClone: onClose } = useGitActions();
  const popup = useRef<HTMLDivElement>(null);
  useDismiss(popup, onClose, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  const kind = view?.kind;
  useEffect(() => {
    const first = popup.current?.querySelector<HTMLElement>(
      kind === 'form' ? '.clone-input' : '.confirm-button',
    );
    first?.focus();
    if (first instanceof HTMLInputElement) {
      first.select();
    }
  }, [kind]);
  if (view === undefined) {
    return null;
  }
  return (
    <div
      className="backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && event.preventDefault()
      }
    >
      <div
        className="shortcuts-popup clone-popup"
        ref={popup}
        {...dialog}
        style={drag.style}
        aria-label={strings.clone.title}
      >
        <div className="shortcuts-title" onPointerDown={drag.onPointerDown}>
          <span>{strings.clone.title}</span>
          <button
            className="nav-button"
            title={strings.common.close}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        {view.kind === 'form' ? (
          <CloneForm key={formKey} form={view} />
        ) : (
          <CloneRunning running={view} />
        )}
      </div>
    </div>
  );
}
