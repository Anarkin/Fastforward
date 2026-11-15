import { useEffect } from 'react';
import { strings } from '../../../lib/shared/strings';
import { useShell, useShellActions } from '../../../shell/page/store';
import { Words } from '../../../lib/page/name';
import { languageOf } from '../../../lib/page/languages';
import { startColorer } from '../../../lib/page/syntax';
import { StatusLine } from './statusLine';
import { findAskOf } from './editorFind';
import { colorOfFileNamed } from './fileColors';
import { viewerChoices } from './view';
import {
  languageChoiceOf,
  shownLanguage,
} from '../../../lib/page/languageMenu';
import { LanguageButton } from '../../../lib/page/languageChoice';
import { nameOf } from './pathNames';
import { PathTitle } from './pathTitle';
import { useCommander, useCommanderActions } from './store';
import { editedShown, useEditorView } from './editorView';
import { useEditorFinding } from './editorFinding';
import { EditorFindBar } from './editorFindBar';
import { EditorToolbar } from './editorToolbar';
import { EditorAsks } from './editorAsks';

export function Editor() {
  useEffect(startColorer, []);
  const file = useCommander((state) => state.view.editing) ?? '';
  const edited = useCommander(editedShown);
  const fileColor = useCommander((state) =>
    colorOfFileNamed(nameOf(state.view.editing ?? ''), state.view.fileColors),
  );
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const scrolling = useShell((state) => state.scrolling);
  const { changeTextView } = useShellActions();
  const choices = useCommander((state) => viewerChoices(state.view));
  const { choose: onChoose } = useCommanderActions();
  const { choice: languageChoice, choose: chooseLanguage } = languageChoiceOf(
    file,
    {
      on: highlightSyntax,
      change: (on) => changeTextView({ highlightSyntax: on }),
    },
    {
      language: choices.language,
      keep: (chosen) => onChoose({ language: chosen }),
    },
  );
  const detectedLanguage = languageOf(file);
  const language = shownLanguage(languageChoice, detectedLanguage);
  const {
    host,
    view,
    endingsShown,
    status,
    findCount,
    findAsk,
    setFindAsk,
    goingToLine,
    setGoingToLine,
    lineCount,
  } = useEditorView(language);
  const finder = useEditorFinding(view, findAsk);

  const mark = edited?.readOnly
    ? strings.editor.readOnlyMark
    : edited?.changed
      ? strings.editor.unsaved
      : edited?.made
        ? strings.editor.newFile
        : undefined;

  return (
    <section className="column viewer editor">
      <EditorFindBar view={view} finder={finder} findCount={findCount}>
        <EditorToolbar
          view={view}
          endingsShown={endingsShown}
          language={
            <LanguageButton
              choice={languageChoice}
              detected={detectedLanguage}
              single
              choose={chooseLanguage}
              onChosen={() => view.current?.focus()}
              scrolling={scrolling}
            />
          }
          onFind={() => setFindAsk(findAskOf(false, view.current?.state))}
        />
      </EditorFindBar>
      <div className="viewer-path editor-path">
        <PathTitle path={file} hidden={[]} color={fileColor} />
        {mark !== undefined && (
          <span
            className={`editor-mark ${edited?.changed ? 'unsaved' : ''}`}
            title={mark}
          >
            {edited?.changed ? strings.symbols.unsaved : mark}
          </span>
        )}
      </div>
      {edited?.error === undefined ? (
        <>
          <div className="column-body editor-body" ref={host} />
          {status !== undefined && <StatusLine>{status}</StatusLine>}
        </>
      ) : (
        <div className="column-body editor-body">
          <div className="viewer-error">
            <Words>{edited.error}</Words>
          </div>
        </div>
      )}
      <EditorAsks
        view={view}
        goingToLine={goingToLine}
        lineCount={lineCount}
        setGoingToLine={setGoingToLine}
      />
    </section>
  );
}
