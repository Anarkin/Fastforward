import { labelTip } from '../../../lib/page/tips';
import { useEffect, useId, useRef } from 'react';
import { strings } from '../../../lib/shared/strings';
import { useDismiss } from '../../../lib/page/dismiss';
import { CloseIcon } from '../../../lib/page/icons';
import { moveBetweenButtons } from '../../../lib/page/dialogButtons';
import { useModalDialog } from '../../../lib/page/modalDialog';
import { useDialogDrag } from '../../../lib/page/dialogDrag';
import { Words } from '../../../lib/page/name';
import {
  compresses,
  encrypts,
  packFormats,
  packLevels,
  zipCiphers,
  type PackLevel,
  type ZipCipher,
} from '../shared/packing';
import { sides } from '../shared/sides';
import {
  archiveThere,
  namedPart,
  packProblem,
  volumeBytesOf,
  volumeSizes,
  withFormat,
} from './packing';
import { useCommander, useCommanderActions } from './store';
import { whatOf } from './items';

function Choices<Choice extends string>({
  label,
  choices,
  chosen,
  named,
  onChoose,
}: {
  label: string;
  choices: readonly Choice[];
  chosen: Choice | undefined;
  named: (choice: Choice) => string;
  onChoose: (choice: Choice) => void;
}) {
  return (
    <div className="pack-choices" role="radiogroup" aria-label={label}>
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          role="radio"
          className="confirm-button pack-choice"
          aria-checked={choice === chosen}
          onClick={() => onChoose(choice)}
        >
          {named(choice)}
        </button>
      ))}
    </div>
  );
}

function PackForm({ names }: { names: readonly string[] }) {
  const platform = useCommander((state) => state.view.platform);
  const form = useCommander((state) => state.packing?.form);
  const folder = useCommander((state) => state.packing?.folder);
  const what = whatOf(names.length, names[0], folder);
  const fresh = useCommander((state) => state.packing?.fresh === true);
  const { pack, cancelPack, keepPackForm } = useCommanderActions();
  const { commander } = strings;
  const ids = useId();
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const typed = field.current;
    if (typed !== null && fresh) {
      typed.focus();
      const { start, end } = namedPart(typed.value, platform);
      typed.setSelectionRange(start, end);
    } else {
      typed?.focus();
    }
  }, [platform, fresh]);
  const there = useCommander((state) =>
    sides.some((side) =>
      archiveThere(
        state.view.panes[side],
        form?.archive.trim() ?? '',
        form?.splitting === true,
        platform,
      ),
    ),
  );
  if (form === undefined) {
    return null;
  }
  const {
    format,
    archive,
    level,
    password,
    shown,
    encryptNames,
    zipCipher,
    splitting,
    testing,
    volume,
  } = form;
  const setArchive = (typed: string) => keepPackForm({ archive: typed });
  const setLevel = (chosen: PackLevel) => keepPackForm({ level: chosen });
  const setPassword = (typed: string) => keepPackForm({ password: typed });
  const setShown = (on: boolean) => keepPackForm({ shown: on });
  const setEncryptNames = (on: boolean) => keepPackForm({ encryptNames: on });
  const setZipCipher = (chosen: ZipCipher) =>
    keepPackForm({ zipCipher: chosen });
  const setSplitting = (on: boolean) => keepPackForm({ splitting: on });
  const setTesting = (on: boolean) => keepPackForm({ testing: on });
  const setVolume = (typed: string) => keepPackForm({ volume: typed });
  const problem = packProblem({
    archive,
    format,
    password,
    splitting,
    volume,
    platform,
  });
  const encrypted = encrypts(format) && password !== '';
  return (
    <form
      className="confirm-body"
      onSubmit={(event) => {
        event.preventDefault();
        if (problem !== undefined) {
          return;
        }
        const volumeBytes = splitting ? volumeBytesOf(volume) : undefined;
        pack({
          archive: archive.trim(),
          format,
          level,
          ...(encrypted && { password }),
          ...(encrypted && format === '7z' && { encryptNames }),
          ...(encrypted && format === 'zip' && { zipCipher }),
          ...(volumeBytes !== undefined && { volume, volumeBytes }),
          test: testing,
          ...(there && { replace: true }),
        });
      }}
    >
      <div className="pack-fields">
        <span />
        <span className="pack-what">
          <Words>{'text' in what ? what.text : [what]}</Words>
        </span>
        <label htmlFor={`${ids}archive`}>{commander.packArchive}</label>
        <input
          id={`${ids}archive`}
          ref={field}
          className="prompt-input"
          value={archive}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setArchive(event.target.value)}
        />
        <span>{commander.packFormat}</span>
        <Choices
          label={commander.packFormat}
          choices={packFormats}
          chosen={format}
          named={(each) => commander.packFormats[each]}
          onChoose={(chosen) =>
            keepPackForm({
              format: chosen,
              archive: withFormat(archive.trim(), chosen),
            })
          }
        />
        {compresses(format) && (
          <>
            <span>{commander.packLevel}</span>
            <Choices
              label={commander.packLevel}
              choices={packLevels}
              chosen={level}
              named={(each) => commander.packLevels[each]}
              onChoose={setLevel}
            />
          </>
        )}
        {encrypts(format) && (
          <>
            <label htmlFor={`${ids}password`}>{commander.packPassword}</label>
            <div className="pack-password">
              <input
                id={`${ids}password`}
                className="prompt-input"
                type={shown ? 'text' : 'password'}
                value={password}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => setPassword(event.target.value)}
              />
              <label className="pack-check">
                <input
                  type="checkbox"
                  checked={shown}
                  onChange={(event) => setShown(event.target.checked)}
                />
                {commander.showPassword}
              </label>
            </div>
          </>
        )}
        {encrypted && format === '7z' && (
          <label className="pack-check pack-wide">
            <input
              type="checkbox"
              checked={encryptNames}
              onChange={(event) => setEncryptNames(event.target.checked)}
            />
            {commander.encryptNames}
          </label>
        )}
        {encrypted && format === 'zip' && (
          <>
            <span>{commander.zipCipher}</span>
            <Choices
              label={commander.zipCipher}
              choices={zipCiphers}
              chosen={zipCipher}
              named={(each) => commander.zipCiphers[each]}
              onChoose={setZipCipher}
            />
            <span className="pack-note pack-wide">
              {commander.zipCipherNote}
            </span>
          </>
        )}
        <label className="pack-check pack-wide">
          <input
            type="checkbox"
            checked={splitting}
            onChange={(event) => setSplitting(event.target.checked)}
          />
          {commander.splitVolumes}
        </label>
        {splitting && (
          <>
            <label htmlFor={`${ids}volume`}>{commander.volumeSize}</label>
            <div className="pack-volume">
              <input
                id={`${ids}volume`}
                className="prompt-input"
                value={volume}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => setVolume(event.target.value)}
              />
              <Choices
                label={commander.volumeSize}
                choices={volumeSizes.map((each) => each.size)}
                chosen={volumeSizes.find((each) => each.size === volume)?.size}
                named={(size) =>
                  volumeSizes.find((each) => each.size === size)?.label ?? size
                }
                onChoose={setVolume}
              />
            </div>
          </>
        )}
        <label className="pack-check pack-wide">
          <input
            type="checkbox"
            checked={testing}
            onChange={(event) => setTesting(event.target.checked)}
          />
          {commander.testOncePacked}
        </label>
      </div>
      {problem === undefined ? (
        there && <div className="pack-note">{commander.archiveThere}</div>
      ) : (
        <div className="prompt-problem" role="alert">
          <Words>{problem}</Words>
        </div>
      )}
      <div className="confirm-buttons" onKeyDown={moveBetweenButtons}>
        <button type="button" className="confirm-button" onClick={cancelPack}>
          {strings.confirm.cancel}
        </button>
        <button
          type="submit"
          className="confirm-button default"
          disabled={problem !== undefined}
        >
          {commander.packConfirm}
        </button>
      </div>
    </form>
  );
}

export function PackPopup() {
  const packing = useCommander((state) => state.packing !== undefined);
  return packing ? <PackDialog /> : null;
}

function PackDialog() {
  const names = useCommander((state) => state.packing?.names);
  const { cancelPack } = useCommanderActions();
  const popup = useRef<HTMLDivElement>(null);
  useDismiss(popup, cancelPack, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  if (names === undefined) {
    return null;
  }
  const title = strings.commander.packTitle;
  return (
    <div
      className="backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && event.preventDefault()
      }
    >
      <div
        className="shortcuts-popup confirm-popup pack-popup"
        ref={popup}
        {...dialog}
        style={drag.style}
        aria-label={title}
      >
        <div className="shortcuts-title" onPointerDown={drag.onPointerDown}>
          <span>{title}</span>
          <button
            className="nav-button"
            {...labelTip(strings.common.close)}
            onClick={cancelPack}
          >
            <CloseIcon />
          </button>
        </div>
        <PackForm names={names} />
      </div>
    </div>
  );
}
