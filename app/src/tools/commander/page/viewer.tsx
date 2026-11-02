import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CommanderToHost,
  CommanderToWebviewOf,
  TextEncoding,
} from '../shared/protocol';
import { viewerKeymap, type ViewMode } from '../shared/keymap';
import { keyPressed } from '../../../ui/shortcuts';
import { columnFocusOf } from '../../../ui/columnFocus';
import {
  FindActions,
  FindField,
  SearchButton,
  SearchRow,
} from '../../../ui/search';
import { useViewerFind } from './viewerFind';
import { usePdfPreview } from './pdfPreview';
import { strings } from '../../../shared/strings';
import {
  HexIcon,
  PreviewIcon,
  ShowWhitespaceIcon,
  SyntaxIcon,
  TextIcon,
  WordWrapIcon,
} from '../../../ui/icons';
import { useTextView } from '../../../ui/textView';
import { MenuButton } from '../../../ui/menu';
import { TextBody } from './textBody';
import { ByteBody } from './hexBody';
import { PreviewBody } from './previewBody';
import { firstMode, previewOf } from './previews';
import {
  encodingChoices,
  shownEncoding,
  type EncodingChoice,
} from './encodings';

export interface Viewing {
  readonly tab: string;
  readonly size: number | undefined;
  readonly binary?: boolean;
  readonly detected?: TextEncoding;
  readonly error?: string;
}

export type ToViewer = CommanderToWebviewOf<
  'rows' | 'text' | 'bytes' | 'found' | 'pdfPlace'
>;

const modes: readonly {
  readonly mode: ViewMode;
  readonly title: string;
  readonly icon: React.ReactNode;
}[] = [
  { mode: 'text', title: strings.commander.viewText, icon: <TextIcon /> },
  { mode: 'hex', title: strings.commander.viewHex, icon: <HexIcon /> },
  {
    mode: 'preview',
    title: strings.commander.viewPreview,
    icon: <PreviewIcon />,
  },
];

export function Viewer({
  file,
  viewing,
  post,
  listen,
}: {
  file: string;
  viewing: Viewing | undefined;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: ToViewer) => void) => () => void;
}) {
  const [chosen, setChosen] = useState<ViewMode>();
  const [encoding, setEncoding] = useState<EncodingChoice>('auto');
  const place = useRef(0);
  const onPlace = useCallback((byte: number) => {
    place.current = byte;
  }, []);
  const encodingTrigger = useRef<HTMLButtonElement>(null);
  const preview = previewOf(file);
  const shownModes = modes.filter(
    (each) => each.mode !== 'preview' || preview !== undefined,
  );
  const mode = chosen ?? firstMode(file);
  const shown = shownEncoding(encoding, viewing);
  const textView = useTextView();
  const { wordWrap, showWhitespace, highlightSyntax } = textView.view;
  const readsText = mode === 'text' && shown !== 'bytes';
  const changeView = (changed: Partial<typeof textView.view>) =>
    textView.change({ ...textView.view, ...changed });
  const choose = (wanted: ViewMode) => {
    if (shownModes.some((each) => each.mode === wanted)) {
      setChosen(wanted);
    }
  };
  const finder = useViewerFind(
    viewing,
    mode === 'hex' || shown === 'bytes' ? 'windows-1252' : shown,
    post,
    listen,
  );
  const pdf = usePdfPreview(viewing?.tab, post, listen);
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
      onKeyDown={(event) => {
        if (keyPressed(viewerKeymap.find, event) !== undefined) {
          event.preventDefault();
          openFind();
          return;
        }
        const wanted = keyPressed(viewerKeymap.viewAs, event);
        if (wanted !== undefined) {
          event.preventDefault();
          choose(wanted);
          return;
        }
        if (
          mode === 'text' &&
          keyPressed(viewerKeymap.encoding, event) !== undefined
        ) {
          event.preventDefault();
          encodingTrigger.current?.click();
          return;
        }
        if (readsText && keyPressed(viewerKeymap.wrap, event) !== undefined) {
          event.preventDefault();
          changeView({ wordWrap: !wordWrap });
          return;
        }
        if (
          readsText &&
          keyPressed(viewerKeymap.showWhitespace, event) !== undefined
        ) {
          event.preventDefault();
          changeView({ showWhitespace: !showWhitespace });
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
                  icon={
                    <span className="viewer-encoding-label">
                      {strings.commander.encodingShort[shown]}
                    </span>
                  }
                  items={encodingChoices.map((choice) => ({
                    label: strings.commander.encodings[choice],
                    checked: choice === encoding,
                    onClick: () => setEncoding(choice),
                  }))}
                />
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
                    changeView({ showWhitespace: !showWhitespace })
                  }
                >
                  <ShowWhitespaceIcon />
                </button>
                <button
                  className={`nav-button toggle ${wordWrap ? 'active' : ''}`}
                  title={strings.common.wrap}
                  aria-pressed={wordWrap}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => changeView({ wordWrap: !wordWrap })}
                >
                  <WordWrapIcon />
                </button>
                <button
                  className={`nav-button toggle ${highlightSyntax ? 'active' : ''}`}
                  title={strings.common.highlightSyntax}
                  aria-pressed={highlightSyntax}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    changeView({ highlightSyntax: !highlightSyntax })
                  }
                >
                  <SyntaxIcon />
                </button>
              </div>
            )}
          </div>
          <span className="column-name">{file}</span>
          <div className="column-actions">
            <SearchButton
              title={strings.commander.findInFile}
              onClick={openFind}
            />
          </div>
        </header>
      )}
      {viewing === undefined ? (
        <div className="column-body viewer-body" />
      ) : mode === 'preview' && preview !== undefined ? (
        <PreviewBody
          file={file}
          preview={preview}
          viewing={viewing}
          post={post}
          listen={listen}
          pdf={pdf.controls}
        />
      ) : mode === 'hex' || shown === 'bytes' ? (
        <ByteBody
          layout={mode === 'hex' ? 'hex' : 'text'}
          viewing={viewing}
          find={finder.find}
          place={place}
          onPlace={onPlace}
          post={post}
          listen={listen}
        />
      ) : (
        <TextBody
          key={shown}
          file={file}
          encoding={shown}
          viewing={viewing}
          find={finder.find}
          place={place}
          onPlace={onPlace}
          post={post}
          listen={listen}
        />
      )}
    </section>
  );
}
