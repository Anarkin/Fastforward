import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommanderToWebviewOf, TextEncoding } from '../shared/protocol';
import { viewerKeymap, type ViewMode } from './keymap';
import { columnFocusOf } from '../../../ui/columnFocus';
import {
  FindActions,
  FindField,
  SearchButton,
  SearchRow,
} from '../../../ui/search';
import { useViewerFind } from './viewerFind';
import { usePdfPreview } from './pdfPreview';
import { strings, type Sentence } from '../../../shared/strings';
import {
  HexIcon,
  PreviewIcon,
  RealSizeIcon,
  ShowWhitespaceIcon,
  TextIcon,
  WordWrapIcon,
} from '../../../ui/icons';
import { useShell, useShellActions } from '../../../shell/page/store';
import { MenuButton } from '../../../ui/menu';
import { TextBody } from './textBody';
import { ByteBody } from './hexBody';
import { PreviewBody } from './previewBody';
import { firstMode, previewOf } from './previews';
import { encodingMenu, shownEncoding, type EncodingChoice } from './encodings';
import {
  LanguageButton,
  shownLanguage,
  languageChoiceOf,
} from '../../../ui/languageChoice';
import { languageOf } from '../../../ui/languages';
import { startColorer } from '../../../ui/syntax';
import { colorOfFileNamed } from './fileColors';
import { nameOf, PathTitle } from './pathTitle';
import { useCommander, useCommanderActions } from './store';
import { viewerChoices } from './view';
import { viewerKey } from './viewerKeys';

export interface Viewing {
  readonly tab: string;
  readonly size: number | undefined;
  readonly version?: string;
  readonly binary?: boolean;
  readonly hidden?: readonly boolean[];
  readonly detected?: TextEncoding;
  readonly error?: Sentence;
}

export type ToViewer = CommanderToWebviewOf<
  'rows' | 'text' | 'bytes' | 'found' | 'pdfPlace'
>;

const modes: readonly {
  readonly mode: ViewMode;
  readonly title: string;
  readonly icon: React.ReactNode;
}[] = [
  { mode: 'hex', title: strings.commander.viewHex, icon: <HexIcon /> },
  { mode: 'text', title: strings.commander.viewText, icon: <TextIcon /> },
  {
    mode: 'preview',
    title: strings.commander.viewPreview,
    icon: <PreviewIcon />,
  },
];

export function Viewer() {
  useEffect(startColorer, []);
  const file = useCommander((state) => state.view.viewing) ?? '';
  const fileColor = useCommander((state) =>
    colorOfFileNamed(nameOf(state.view.viewing ?? ''), state.view.fileColors),
  );
  const viewing = useCommander(({ viewed, view }) =>
    viewed?.tab === view.tab ? viewed : undefined,
  );
  const choices = useCommander((state) => viewerChoices(state.view));
  const { choose: onChoose } = useCommanderActions();
  const chosen = choices.mode;
  const setChosen = (mode: ViewMode) => onChoose({ mode });
  const encoding = choices.encoding ?? 'auto';
  const setEncoding = (choice: EncodingChoice) =>
    onChoose({ encoding: choice });
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const realSize = useShell((state) => state.imageView.realSize);
  const { changeTextView, changeImageView } = useShellActions();
  const { choice: languageChoice, choose: chooseLanguage } = languageChoiceOf(
    file,
    {
      on: highlightSyntax,
      change: (on) => changeTextView({ highlightSyntax: on }),
    },
    {
      language: choices.language,
      keep: (language) => onChoose({ language }),
    },
  );
  const tab = useCommander((state) => state.view.tab);
  const { placeOf, keepPlace, editViewed } = useCommanderActions();
  const place = useRef(tab === undefined ? 0 : placeOf(tab));
  const onPlace = useCallback(
    (byte: number) => {
      place.current = byte;
      if (tab !== undefined) {
        keepPlace(tab, byte);
      }
    },
    [tab, keepPlace],
  );
  const encodingTrigger = useRef<HTMLButtonElement>(null);
  const languageTrigger = useRef<HTMLButtonElement>(null);
  const preview = previewOf(file);
  const shownModes = modes.filter(
    (each) => each.mode !== 'preview' || preview !== undefined,
  );
  const mode = chosen ?? firstMode(file);
  const shown = shownEncoding(encoding, viewing);
  const readsText = mode === 'text' && shown !== 'bytes';
  const detectedLanguage = languageOf(file);
  const language = shownLanguage(languageChoice, detectedLanguage);
  const showsImage = mode === 'preview' && preview === 'image';
  const toggleRealSize = () => changeImageView({ realSize: !realSize });
  const choose = (wanted: ViewMode) => {
    if (shownModes.some((each) => each.mode === wanted)) {
      setChosen(wanted);
    }
  };
  const finder = useViewerFind(
    viewing,
    mode === 'hex' || shown === 'bytes' ? 'windows-1252' : shown,
  );
  const pdf = usePdfPreview(viewing?.tab);
  const searched =
    mode === 'preview' && preview === 'pdf'
      ? pdf.find
      : { ...finder, matches: finder.matches.length };
  const [finding, setFinding] = useState(false);
  const [focusAsks, setFocusAsks] = useState(0);
  const findInput = useRef<HTMLInputElement>(null);
  const openFind = () => {
    if (mode === 'preview' && preview !== 'pdf') {
      setChosen('text');
    }
    setFinding(true);
    setFocusAsks((count) => count + 1);
  };
  const viewer = useRef<HTMLElement>(null);
  const focusBody = () => columnFocusOf(viewer.current)?.focus();
  const closeFind = () => {
    columnFocusOf(findInput.current)?.focus();
    setFinding(false);
    finder.search('');
    pdf.find.search('');
  };
  useEffect(() => {
    if (focusAsks > 0) {
      findInput.current?.focus();
      findInput.current?.select();
    }
  }, [focusAsks]);

  return (
    <section
      className="column viewer"
      ref={viewer}
      onKeyDown={(event) => {
        const pressed = viewerKey(event, { mode, readsText, showsImage });
        if (pressed === undefined) {
          return;
        }
        event.preventDefault();
        switch (pressed.kind) {
          case 'find':
            openFind();
            return;
          case 'edit':
            if (tab !== undefined) {
              editViewed(
                tab,
                place.current,
                encoding === 'auto' || encoding === 'bytes'
                  ? undefined
                  : encoding,
              );
            }
            return;
          case 'viewAs':
            choose(pressed.mode);
            return;
          case 'encoding':
            encodingTrigger.current?.click();
            return;
          case 'language':
            languageTrigger.current?.click();
            return;
          case 'wrap':
            changeTextView({ wordWrap: !wordWrap });
            return;
          case 'whitespace':
            changeTextView({ showWhitespace: !showWhitespace });
            return;
          case 'realSize':
            toggleRealSize();
        }
      }}
    >
      {finding ? (
        <header className="column-title searching">
          <SearchRow onClose={closeFind}>
            <FindField
              query={searched.query}
              count={searched.count}
              input={findInput}
              keys={viewerKeymap}
              onQuery={searched.search}
              onStep={searched.step}
              onClose={closeFind}
            />
            <FindActions matches={searched.matches} onStep={searched.step} />
          </SearchRow>
        </header>
      ) : (
        <header className="column-title">
          <div className="column-start nav-buttons viewer-actions">
            <div
              className="segmented"
              role="group"
              aria-label={strings.commander.viewAs}
            >
              {shownModes.map(({ mode: each, title, icon }) => (
                <button
                  key={each}
                  className={`nav-button toggle ${mode === each ? 'active' : ''}`}
                  title={title}
                  aria-pressed={mode === each}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(each)}
                >
                  {icon}
                </button>
              ))}
            </div>
            {mode === 'text' && (
              <div className="viewer-encoding">
                <MenuButton
                  title={strings.commander.encoding}
                  trigger={encodingTrigger}
                  onChosen={focusBody}
                  label={strings.commander.encodingShort[shown]}
                  filter={strings.common.findEncoding}
                  items={encodingMenu(encoding, shown, setEncoding)}
                />
              </div>
            )}
            {readsText && (
              <LanguageButton
                choice={languageChoice}
                detected={detectedLanguage}
                single
                choose={chooseLanguage}
                trigger={languageTrigger}
                onChosen={focusBody}
              />
            )}
            {showsImage && <span className="nav-button-space" />}
            {showsImage && (
              <div className="viewer-toggles">
                <button
                  className={`nav-button toggle ${realSize ? 'active' : ''}`}
                  title={strings.commander.realSize}
                  aria-pressed={realSize}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={toggleRealSize}
                >
                  <RealSizeIcon />
                </button>
              </div>
            )}
            {readsText && <span className="nav-button-space" />}
            {readsText && (
              <div className="viewer-toggles">
                <button
                  className={`nav-button toggle ${showWhitespace ? 'active' : ''}`}
                  title={strings.common.showWhitespace}
                  aria-pressed={showWhitespace}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    changeTextView({ showWhitespace: !showWhitespace })
                  }
                >
                  <ShowWhitespaceIcon />
                </button>
                <button
                  className={`nav-button toggle ${wordWrap ? 'active' : ''}`}
                  title={strings.common.wrap}
                  aria-pressed={wordWrap}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => changeTextView({ wordWrap: !wordWrap })}
                >
                  <WordWrapIcon />
                </button>
              </div>
            )}
          </div>
          <div className="column-actions">
            <SearchButton
              title={strings.commander.findInFile}
              onClick={openFind}
            />
          </div>
        </header>
      )}
      <div className="viewer-path">
        <PathTitle
          path={file}
          hidden={viewing?.hidden ?? []}
          color={fileColor}
        />
      </div>
      {viewing === undefined ? (
        <div className="column-body viewer-body" />
      ) : mode === 'preview' && preview !== undefined ? (
        <PreviewBody
          file={file}
          preview={preview}
          viewing={viewing}
          realSize={realSize}
          pdf={pdf.controls}
        />
      ) : mode === 'hex' || shown === 'bytes' ? (
        <ByteBody
          layout={mode === 'hex' ? 'hex' : 'text'}
          viewing={viewing}
          find={finder.find}
          finding={finding}
          place={place}
          onPlace={onPlace}
        />
      ) : (
        <TextBody
          key={shown}
          encoding={shown}
          language={language}
          viewing={viewing}
          find={finder.find}
          finding={finding}
          place={place}
          onPlace={onPlace}
        />
      )}
    </section>
  );
}
