import { useEffect, useId, useRef, useState } from 'react';
import { strings, type Sentence } from '../../../shared/strings';
import { useDismiss } from '../../../ui/contextMenu';
import { CloseIcon } from '../../../ui/icons';
import { moveBetweenButtons } from '../../../ui/dialogButtons';
import { useDialogDrag, useModalDialog } from '../../../ui/modalDialog';
import { NameLines, Words } from '../../../ui/name';
import { nameProblem } from '../shared/names';
import {
  compresses,
  encrypts,
  firstVolumeOf,
  packFormats,
  packLevels,
  packPasswordProblem,
  smallestVolume,
  zipCiphers,
  type PackFormat,
  type PackLevel,
  type ZipCipher,
} from '../shared/packing';
import { folderKey } from '../shared/paths';
import { otherSide, type Entry } from '../shared/protocol';
import {
  archiveFor,
  folderPart,
  lastPart,
  namedPart,
  volumeBytesOf,
  volumeSizes,
  withFormat,
  withoutTrailing,
} from './packing';
import { useCommander, useCommanderActions } from './store';
import { whatOf } from './transferring';

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

const rootedOnWindows = /^(?:[a-zA-Z]:[\\/]|[\\/]{2}[^\\/])/;

function whole(file: string, platform: string | undefined): boolean {
  const posix = file.startsWith('/');
  if (platform === 'win32') {
    return rootedOnWindows.test(file);
  }
  return platform === undefined ? posix || rootedOnWindows.test(file) : posix;
}

function packProblem({
  archive,
  format,
  password,
  splitting,
  volume,
  platform,
}: {
  readonly archive: string;
  readonly format: PackFormat;
  readonly password: string;
  readonly splitting: boolean;
  readonly volume: string;
  readonly platform: string | undefined;
}): Sentence | undefined {
  if (archive.trim() === '') {
    return strings.commander.noArchive;
  }
  if (!whole(archive.trim(), platform)) {
    return strings.commander.archiveNotWhole;
  }
  const named = nameProblem(lastPart(archive.trim(), platform), platform);
  if (named !== undefined) {
    return named;
  }
  if (encrypts(format) && password !== '') {
    const problem = packPasswordProblem(password, format);
    if (problem !== undefined) {
      return problem;
    }
  }
  if (!splitting) {
    return undefined;
  }
  const bytes = volumeBytesOf(volume);
  return bytes === undefined
    ? strings.commander.volumeUnread
    : bytes < smallestVolume
      ? strings.commander.volumeSmall
      : undefined;
}

function PackForm({
  names,
  folder,
  target,
  targetEntries,
}: {
  names: readonly string[];
  folder: string;
  target: string;
  targetEntries: readonly Entry[] | undefined;
}) {
  const choices = useCommander((state) => state.packChoices);
  const platform = useCommander((state) => state.view.platform);
  const onlyIsFolder = useCommander(
    (state) =>
      names.length === 1 &&
      state.packing !== undefined &&
      state.view.panes[state.packing.side]?.rows.some(
        (row) => row.key === names[0] && row.entry?.folder === true,
      ) === true,
  );
  const { pack, cancelPack } = useCommanderActions();
  const { commander } = strings;
  const ids = useId();
  const field = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<PackFormat>(choices.format);
  const [archive, setArchive] = useState(() =>
    archiveFor(names, folder, target, choices.format, platform, onlyIsFolder),
  );
  const [level, setLevel] = useState<PackLevel>(choices.level);
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [encryptNames, setEncryptNames] = useState(false);
  const [zipCipher, setZipCipher] = useState<ZipCipher>(choices.zipCipher);
  const [splitting, setSplitting] = useState(choices.volume !== undefined);
  const [testing, setTesting] = useState(choices.test);
  const [volume, setVolume] = useState(
    choices.volume ?? volumeSizes[0]?.size ?? '',
  );
  useEffect(() => {
    const typed = field.current;
    if (typed !== null) {
      typed.focus();
      const { start, end } = namedPart(typed.value, platform);
      typed.setSelectionRange(start, end);
    }
  }, [platform]);
  const problem = packProblem({
    archive,
    format,
    password,
    splitting,
    volume,
    platform,
  });
  const named = lastPart(archive.trim(), platform);
  const name = splitting ? firstVolumeOf(named) : named;
  const there =
    folderKey(folderPart(archive.trim(), platform), platform) ===
      folderKey(withoutTrailing(target, platform), platform) &&
    targetEntries?.some(
      (entry) => folderKey(entry.name, platform) === folderKey(name, platform),
    ) === true;
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
      <NameLines lines={commander.packLines(whatOf(names.length, names[0]))} />
      <div className="pack-fields">
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
          onChoose={(chosen) => {
            setFormat(chosen);
            setArchive((typed) => withFormat(typed.trim(), chosen));
          }}
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
  const packing = useCommander((state) => state.packing);
  return packing === undefined ? null : <PackDialog />;
}

function PackDialog() {
  const packing = useCommander((state) => state.packing);
  const targetEntries = useCommander((state) => {
    const other =
      state.packing && state.view.panes[otherSide(state.packing.side)];
    return other?.folder === state.packing?.target
      ? other?.entries
      : state.packing === undefined
        ? undefined
        : state.view.panes[state.packing.side]?.entries;
  });
  const { cancelPack } = useCommanderActions();
  const popup = useRef<HTMLDivElement>(null);
  useDismiss(popup, cancelPack, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  if (packing === undefined) {
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
            title={strings.common.close}
            onClick={cancelPack}
          >
            <CloseIcon />
          </button>
        </div>
        <PackForm
          names={packing.names}
          folder={packing.folder}
          target={packing.target}
          targetEntries={targetEntries}
        />
      </div>
    </div>
  );
}
