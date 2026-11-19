import { closeTip } from '../../../lib/page/closeTip';
import { namedFolder } from '../../../lib/shared/sentences';
import { tip } from '../../../lib/page/tips';
import { useEffect, useId, useRef, useState } from 'react';
import {
  cloneName,
  nameProblem,
  targetPath,
  type CloneView,
} from '../shared/clone';
import { strings } from '../../../lib/shared/strings';
import { NameLines, NamedPath, Words } from '../../../lib/page/name';
import { useDismiss } from '../../../lib/page/dismiss';
import { CloseIcon } from '../../../lib/page/icons';
import { moveBetweenButtons } from '../../../lib/page/dialogButtons';
import { useModalDialog } from '../../../lib/page/modalDialog';
import { useDialogDrag } from '../../../lib/page/dialogDrag';
import { useGit, useGitActions } from './store';
import { formProblem } from './cloneForm';

type Form = Extract<CloneView, { readonly kind: 'form' }>;

type Running = Extract<CloneView, { readonly kind: 'running' }>;

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
      className="confirm-body"
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
          className="prompt-input"
          value={url}
          spellCheck={false}
          autoComplete="off"
          onChange={editing(setUrl)}
        />
        <label htmlFor={`${ids}folder`}>{strings.clone.folder}</label>
        <div className="clone-folder">
          <input
            id={`${ids}folder`}
            className="prompt-input"
            value={folder}
            spellCheck={false}
            autoComplete="off"
            onChange={editing(setFolder)}
          />
          <button
            type="button"
            className="confirm-button"
            {...tip(strings.clone.chooseFolder)}
            onClick={() => onChooseFolder(folder)}
          >
            {strings.tabs.browse}
          </button>
        </div>
        <label htmlFor={`${ids}name`}>{strings.clone.name}</label>
        <input
          id={`${ids}name`}
          className="prompt-input"
          value={name}
          placeholder={derived}
          spellCheck={false}
          autoComplete="off"
          onChange={editing(setName)}
        />
        {folder !== '' && nameProblem(named) === undefined && (
          <>
            <label>{strings.clone.target}</label>
            <div
              className="clone-target"
              {...tip([namedFolder(targetPath(folder, named))], {
                at: 'over',
                cut: true,
              })}
            >
              <NamedPath path={targetPath(folder, named)} />
            </div>
          </>
        )}
      </div>
      {message !== undefined && (
        <div className="prompt-problem clone-problem" role="alert">
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
    <div className="confirm-body">
      <div className="clone-running">
        <NameLines
          lines={strings.clone.runningLines(running.url, running.target)}
        />
        <span className="clone-phase">
          {progress?.phase ?? strings.clone.connecting}
        </span>
      </div>
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress?.percent}
      >
        <div
          className="progress-bar-done"
          style={{ width: `${progress?.percent ?? 0}%` }}
        />
      </div>
      <div className="progress-counts">
        <span className="clone-detail">{progress?.detail}</span>
        <span className="clone-percent">
          {progress && strings.clone.percent(progress.percent)}
        </span>
      </div>
      <div className="confirm-buttons" onKeyDown={moveBetweenButtons}>
        <button
          type="button"
          className="confirm-button default"
          onClick={onStop}
        >
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
      kind === 'form' ? '.prompt-input' : '.confirm-button',
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
          <button className="nav-button" {...closeTip} onClick={onClose}>
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
