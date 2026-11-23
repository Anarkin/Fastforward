import { editorKeymap } from './keymap';
import { keysOf } from '../../../lib/shared/keymap';
import { labelTip } from '../../../lib/page/tips';
import type { ReactNode, RefObject } from 'react';
import type { EditorSurface } from './surface';
import { strings } from '../../../lib/shared/strings';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { useShell, useShellActions } from '../../../shell/page/store';
import { ShowWhitespaceIcon, WordWrapIcon } from '../../../lib/page/icons';
import { SearchButton } from '../../../lib/page/search';
import { type TextEncoding } from '../../../components/encodings/shared/textEncodings';
import {
  encodingSourceItems,
  endingSourceItems,
  type SourceOpening,
} from './sources';
import { conversionsOf, convertedTo } from './endings';
import {
  endingsLabel,
  linesEnding,
  endingsTitle,
  type EndingsShown,
} from './endingsLabel';
import type { LineEnding } from '../shared/textMarks';
import { MenuButton } from '../../../lib/page/menu';
import { readMenu, savedName, saveMenu } from './encodings';
import { useEditor, useEditorActions } from './store';
import { editedShown } from './state';
import { Toolbar } from '../../../lib/page/toolbar';

export function EditorToolbar({
  view,
  endingsShown,
  language,
  onFind,
}: {
  view: RefObject<EditorSurface | undefined>;
  endingsShown: EndingsShown | undefined;
  language: ReactNode;
  onFind: () => void;
}) {
  const file = useEditor((state) => state.file) ?? '';
  const tab = useEditor((state) => state.tab);
  const edited = useEditor(editedShown);
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const scrolling = useShell((state) => state.scrolling);
  const { changeTextView, openSettings } = useShellActions();
  const { saveIn, reopenIn, editSource, keepEditing } = useEditorActions();
  const reopening = useEditor((state) =>
    tab === undefined ? undefined : state.editings.get(tab)?.reopening,
  );
  const setReopening = (chosen: TextEncoding | 'auto' | undefined) => {
    if (tab !== undefined) {
      keepEditing(tab, { reopening: chosen });
    }
  };
  const readOnly = edited?.readOnly === true;
  const encoding = edited?.encoding;
  const reopen = (chosen: TextEncoding | 'auto') => {
    if (tab === undefined) {
      return;
    }
    if (edited?.changed === true) {
      setReopening(chosen);
    } else {
      reopenIn(tab, chosen);
    }
  };
  const opening: SourceOpening = {
    file: (source) => {
      if (tab !== undefined) {
        editSource(tab, source);
      }
    },
    settings: openSettings,
  };
  const endingSources = edited?.endingSources;
  const encodingSources = edited?.encodingSources;
  const firstSource = encodingSources?.[0];
  const chosenEncoding =
    (firstSource?.kind === 'chosen' && firstSource.encoding) || 'auto';
  const made = edited?.made === true;
  const bom = edited?.bom === true;
  const encodingSourcesShown =
    encodingSources === undefined
      ? []
      : encodingSourceItems(encodingSources, opening);
  const convert = (ending: LineEnding) =>
    view.current?.dispatch(convertedTo(ending));

  return (
    <>
      <header className="column-title">
        <Toolbar className="column-start viewer-actions">
          {tab !== undefined && encoding !== undefined && !readOnly && (
            <>
              {!made && (
                <div className="viewer-encoding editor-encoding">
                  <MenuButton
                    scrolling={scrolling}
                    title={strings.editor.readEncodingTitle}
                    label={strings.editor.readLabel(
                      strings.encodings.short[
                        edited?.onDisk?.encoding ?? encoding
                      ],
                    )}
                    filter={strings.common.findEncoding}
                    items={readMenu(
                      {
                        choice: chosenEncoding,
                        shown: edited?.onDisk?.encoding ?? encoding,
                      },
                      reopen,
                      encodingSourcesShown,
                    )}
                    onChosen={() => view.current?.focus()}
                  />
                </div>
              )}
              <div className="viewer-encoding editor-encoding">
                <MenuButton
                  scrolling={scrolling}
                  title={strings.editor.writeEncodingTitle}
                  label={strings.editor.writeLabel(savedName(encoding, bom))}
                  filter={strings.common.findEncoding}
                  items={saveMenu(
                    { saving: encoding, bom, onDisk: edited?.onDisk },
                    (each, withBom) => saveIn(tab, each, withBom),
                    made ? encodingSourcesShown : [],
                  )}
                  onChosen={() => view.current?.focus()}
                />
              </div>
            </>
          )}
          {endingsShown !== undefined && !readOnly && (
            <div className="viewer-encoding">
              <MenuButton
                scrolling={scrolling}
                title={endingsTitle(endingsShown)}
                label={endingsLabel(endingsShown)}
                items={[
                  ...conversionsOf(endingsShown.counts).map(
                    ({ ending, label, changes }) => ({
                      label,
                      ...(changes
                        ? { onClick: () => convert(ending) }
                        : { disabled: true }),
                    }),
                  ),
                  ...(endingSources === undefined
                    ? []
                    : [
                        { separator: true } as const,
                        ...endingSourceItems(
                          endingSources,
                          linesEnding(endingsShown),
                          opening,
                        ),
                      ]),
                ]}
                onChosen={() => view.current?.focus()}
              />
            </div>
          )}
          {language}
          <Toolbar className="viewer-toggles">
            <button
              className={`nav-button toggle ${showWhitespace ? 'active' : ''}`}
              {...labelTip(strings.common.showWhitespace)}
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
              {...labelTip(strings.common.wrap)}
              aria-pressed={wordWrap}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => changeTextView({ wordWrap: !wordWrap })}
            >
              <WordWrapIcon />
            </button>
          </Toolbar>
        </Toolbar>
        <Toolbar className="column-actions">
          <SearchButton
            title={strings.textFile.findInFile}
            keys={keysOf(editorKeymap.find)}
            onClick={onFind}
          />
        </Toolbar>
      </header>
      {reopening !== undefined && tab !== undefined && (
        <ConfirmPopup
          title={strings.editor.reopenTitle}
          message={strings.editor.reopenAsked}
          lines={strings.editor.overwriteLines(file)}
          confirm={strings.editor.reopen}
          onConfirm={() => {
            setReopening(undefined);
            reopenIn(tab, reopening);
            view.current?.focus();
          }}
          onCancel={() => {
            setReopening(undefined);
            view.current?.focus();
          }}
        />
      )}
    </>
  );
}
