import { keysOf } from '../../../lib/shared/keymap';
import { labelTip } from '../../../lib/page/tips';
import { useCallback, useEffect, useRef, useState } from 'react';
import { viewerKeymap, type ViewMode } from './keymap';
import { columnFocusOf } from '../../../lib/page/columnFocus';
import { focusBack, useFocusKeeper } from '../../../lib/page/viewFocus';
import { useRestore } from '../../../lib/page/restore';
import { SearchButton } from '../../../lib/page/search';
import { useViewerFind } from './find';
import { ViewerFindBar } from './findBar';
import { usePdfPreview } from './pdfPreview';
import { strings } from '../../../lib/shared/strings';
import {
  HexIcon,
  PreviewIcon,
  RealSizeIcon,
  ShowWhitespaceIcon,
  TextIcon,
  WordWrapIcon,
} from '../../../lib/page/icons';
import { useShell, useShellActions } from '../../../shell/page/store';
import { MenuButton } from '../../../lib/page/menu';
import { TextBody } from './textBody';
import { ByteBody } from './hexBody';
import { PreviewBody } from './previewBody';
import { firstMode, previewKinds, previewOf } from './previews';
import {
  encodingMenu,
  shownEncoding,
  type EncodingChoice,
} from '../../../components/encodings/page/encodings';
import {
  shownLanguage,
  languageChoiceOf,
} from '../../../components/syntax/page/languageMenu';
import { LanguageButton } from '../../../components/syntax/page/languageChoice';
import { languageOf } from '../../../lib/page/languages';
import { startColorer } from '../../../components/syntax/page/colorer';
import { PathTitle } from '../../../lib/page/pathTitle';
import { fileLooks } from './fileLooks';
import { useViewer, useViewerActions } from './store';
import { choicesOf } from './state';
import { ViewedVersionButton } from './versionButton';
import { viewerKey } from './keys';
import { Toolbar } from '../../../lib/page/toolbar';

const modes: readonly {
  readonly mode: ViewMode;
  readonly title: string;
  readonly icon: React.ReactNode;
}[] = [
  { mode: 'hex', title: strings.viewer.viewHex, icon: <HexIcon /> },
  { mode: 'text', title: strings.viewer.viewText, icon: <TextIcon /> },
  {
    mode: 'preview',
    title: strings.viewer.viewPreview,
    icon: <PreviewIcon />,
  },
];

export function Viewer() {
  useEffect(startColorer, []);
  const file = useViewer((state) => state.file) ?? '';
  const viewing = useViewer(({ viewed, tab }) =>
    viewed?.tab === tab ? viewed : undefined,
  );
  const choices = useViewer(choicesOf);
  const { choose: onChoose } = useViewerActions();
  const chosen = choices.mode;
  const setChosen = (mode: ViewMode) => onChoose({ mode });
  const encoding = choices.encoding ?? 'auto';
  const setEncoding = (choice: EncodingChoice) =>
    onChoose({ encoding: choice });
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const realSize = useShell((state) => state.imageView.realSize);
  const scrolling = useShell((state) => state.scrolling);
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
  const tab = useViewer((state) => state.tab);
  const {
    placeOf,
    keepPlace,
    editViewed,
    keptViewer,
    keepViewer,
    compareVersions,
  } = useViewerActions();
  const place = useCallback(
    () => (tab === undefined ? 0 : placeOf(tab)),
    [tab, placeOf],
  );
  const onPlace = useCallback(
    (byte: number) => {
      if (tab !== undefined) {
        keepPlace(tab, byte);
      }
    },
    [tab, keepPlace],
  );
  const encodingTrigger = useRef<HTMLButtonElement>(null);
  const languageTrigger = useRef<HTMLButtonElement>(null);
  const versionTrigger = useRef<HTMLButtonElement>(null);
  const preview = previewOf(file);
  const available = (each: ViewMode) =>
    each !== 'preview' || preview !== undefined;
  const mode = chosen ?? firstMode(file);
  const shown = shownEncoding(encoding, viewing);
  const readsText = mode === 'text' && shown !== 'bytes';
  const detectedLanguage = languageOf(file);
  const language = shownLanguage(languageChoice, detectedLanguage);
  const showsImage = mode === 'preview' && preview === 'image';
  const showsCode = mode === 'preview' && preview === 'markdown';
  const toggleRealSize = () => changeImageView({ realSize: !realSize });
  const choose = (wanted: ViewMode) => {
    if (available(wanted)) {
      setChosen(wanted);
    }
  };
  const finder = useViewerFind(
    tab,
    viewing,
    mode === 'hex' || shown === 'bytes' ? 'windows-1252' : shown,
  );
  const pdf = usePdfPreview(viewing?.tab);
  const inPdf = mode === 'preview' && preview === 'pdf';
  const searched = inPdf ? pdf.find : finder;
  const finding = useViewer(
    (state) => tab !== undefined && state.tabViews.get(tab)?.finding === true,
  );
  const setFinding = (open: boolean) => {
    if (tab !== undefined) {
      keepViewer(tab, { finding: open });
    }
  };
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
  useFocusKeeper(viewer, (focus) => {
    if (tab !== undefined) {
      keepViewer(tab, { focus });
    }
  });
  const bodyShown = viewing !== undefined;
  useRestore(
    tab === undefined ? undefined : keptViewer(tab).focus,
    () => bodyShown && viewer.current !== null,
    (focus) => viewer.current !== null && focusBack(viewer.current, focus),
    { key: tab },
  );
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
        const pressed = viewerKey(event, {
          mode,
          readsText,
          showsImage,
          showsCode,
        });
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
                place(),
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
          case 'version':
            versionTrigger.current?.click();
            return;
          case 'compareVersions':
            compareVersions();
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
        <ViewerFindBar
          searched={searched}
          inPdf={inPdf}
          input={findInput}
          onClose={closeFind}
        />
      ) : (
        <header className="column-title">
          <Toolbar className="column-start viewer-actions">
            <Toolbar role="group" aria-label={strings.viewer.viewAs}>
              {modes.map(({ mode: each, title, icon }) => (
                <button
                  key={each}
                  className={`nav-button toggle ${mode === each ? 'active' : ''}`}
                  {...labelTip(title, {
                    keys: keysOf(viewerKeymap.viewAs, each),
                    ...(each === 'preview' && {
                      note: available(each)
                        ? undefined
                        : strings.viewer.noPreview,
                      rows: previewKinds(),
                    }),
                  })}
                  disabled={!available(each)}
                  aria-pressed={mode === each}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(each)}
                >
                  {icon}
                </button>
              ))}
            </Toolbar>
            {mode === 'text' && (
              <div className="viewer-encoding">
                <MenuButton
                  scrolling={scrolling}
                  title={strings.encodings.encoding}
                  keys={keysOf(viewerKeymap.encoding)}
                  trigger={encodingTrigger}
                  onChosen={focusBody}
                  label={strings.encodings.short[shown]}
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
                keys={keysOf(viewerKeymap.language)}
                choose={chooseLanguage}
                trigger={languageTrigger}
                onChosen={focusBody}
                scrolling={scrolling}
              />
            )}
            <ViewedVersionButton
              trigger={versionTrigger}
              onChosen={focusBody}
            />
            {showsImage && (
              <Toolbar className="viewer-toggles">
                <button
                  className={`nav-button toggle ${realSize ? 'active' : ''}`}
                  {...labelTip(strings.viewer.realSize, {
                    keys: keysOf(viewerKeymap.realSize),
                  })}
                  aria-pressed={realSize}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={toggleRealSize}
                >
                  <RealSizeIcon />
                </button>
              </Toolbar>
            )}
            {(readsText || showsCode) && (
              <Toolbar className="viewer-toggles">
                <button
                  className={`nav-button toggle ${showWhitespace ? 'active' : ''}`}
                  {...labelTip(strings.common.showWhitespace, {
                    keys: keysOf(viewerKeymap.showWhitespace),
                  })}
                  aria-pressed={showWhitespace}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    changeTextView({ showWhitespace: !showWhitespace })
                  }
                >
                  <ShowWhitespaceIcon />
                </button>
                {readsText && (
                  <button
                    className={`nav-button toggle ${wordWrap ? 'active' : ''}`}
                    {...labelTip(strings.common.wrap, {
                      keys: keysOf(viewerKeymap.wrap),
                    })}
                    aria-pressed={wordWrap}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => changeTextView({ wordWrap: !wordWrap })}
                  >
                    <WordWrapIcon />
                  </button>
                )}
              </Toolbar>
            )}
          </Toolbar>
          <Toolbar className="column-actions">
            <SearchButton
              title={strings.textFile.findInFile}
              keys={keysOf(viewerKeymap.find)}
              onClick={openFind}
            />
          </Toolbar>
        </header>
      )}
      <div className="viewer-path">
        <PathTitle path={file} file looks={fileLooks(viewing?.hidden ?? [])} />
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
          onPlace={onPlace}
        />
      ) : (
        <TextBody
          key={shown}
          encoding={shown}
          language={language}
          viewing={viewing}
          find={finder.find}
          place={place}
          onPlace={onPlace}
        />
      )}
    </section>
  );
}
