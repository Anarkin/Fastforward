import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { strings } from '../../../lib/shared/strings';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { useShell, useShellActions } from '../../../shell/page/store';
import { ShowWhitespaceIcon, WordWrapIcon } from '../../../lib/page/icons';
import { SearchButton } from '../../../lib/page/search';
import { type TextEncoding } from '../shared/textEncodings';
import {
  encodingSourceItems,
  endingSourceItems,
  type SourceOpening,
} from './editorSources';
import { conversionsOf, convertedTo } from './editorEndings';
import {
  endingsLabel,
  linesEnding,
  endingsTitle,
  type EndingsShown,
} from './endingsLabel';
import type { LineEnding } from '../shared/textMarks';
import { MenuButton } from '../../../lib/page/menu';
import { readMenu, savedName, saveMenu } from './editorEncodings';
import { useCommander, useCommanderActions } from './store';
import { editedShown } from './editorView';

export function EditorToolbar({
  view,
  endingsShown,
  language,
  onFind,
}: {
  view: RefObject<EditorView | undefined>;
  endingsShown: EndingsShown | undefined;
  language: ReactNode;
  onFind: () => void;
}) {
  const file = useCommander((state) => state.view.editing) ?? '';
  const tab = useCommander((state) => state.view.tab);
  const edited = useCommander(editedShown);
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const scrolling = useShell((state) => state.scrolling);
  const { changeTextView, openSettings } = useShellActions();
  const { saveIn, reopenIn, editSource, keptEditing, keepEditing } =
    useCommanderActions();
  const [reopening, setReopening] = useState<TextEncoding | 'auto' | undefined>(
    () => (tab === undefined ? undefined : keptEditing(tab).reopening),
  );
  useEffect(() => {
    if (tab !== undefined) {
      keepEditing(tab, { reopening });
    }
  }, [tab, reopening, keepEditing]);
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
        <div className="column-start nav-buttons viewer-actions">
          {tab !== undefined && encoding !== undefined && !readOnly && (
            <>
              {!made && (
                <div className="viewer-encoding editor-encoding">
                  <MenuButton
                    scrolling={scrolling}
                    title={strings.editor.readEncodingTitle}
                    label={strings.editor.readLabel(
                      strings.commander.encodingShort[
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
          <span className="nav-button-space" />
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
        </div>
        <div className="column-actions">
          <SearchButton title={strings.commander.findInFile} onClick={onFind} />
        </div>
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
