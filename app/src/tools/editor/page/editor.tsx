import { tip } from '../../../lib/page/tips';
import { useEffect, useRef } from 'react';
import { useFocusKeeper } from '../../../lib/page/viewFocus';
import { strings } from '../../../lib/shared/strings';
import { useShell, useShellActions } from '../../../shell/page/store';
import { Words } from '../../../lib/page/name';
import { languageOf } from '../../../lib/page/languages';
import { startColorer } from '../../../components/syntax/page/colorer';
import { StatusLine } from '../../../lib/page/statusLine';
import {
  languageChoiceOf,
  shownLanguage,
} from '../../../components/syntax/page/languageMenu';
import { LanguageButton } from '../../../components/syntax/page/languageChoice';
import { PathTitle } from '../../../lib/page/pathTitle';
import { useEditor, useEditorActions } from './store';
import { useEditorView } from './view';
import { editedShown, languageShown } from './state';
import { useEditorFinding } from './finding';
import { EditorFindBar } from './findBar';
import { EditorToolbar } from './toolbar';
import { EditorAsks } from './asks';

export function Editor() {
  useEffect(startColorer, []);
  const file = useEditor((state) => state.file) ?? '';
  const edited = useEditor(editedShown);
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const scrolling = useShell((state) => state.scrolling);
  const { changeTextView } = useShellActions();
  const chosenLanguage = useEditor(languageShown);
  const { chooseLanguage: keepLanguage } = useEditorActions();
  const { choice: languageChoice, choose: chooseLanguage } = languageChoiceOf(
    file,
    {
      on: highlightSyntax,
      change: (on) => changeTextView({ highlightSyntax: on }),
    },
    {
      language: chosenLanguage,
      keep: keepLanguage,
    },
  );
  const detectedLanguage = languageOf(file);
  const language = shownLanguage(languageChoice, detectedLanguage);
  const {
    host,
    view,
    endingsShown,
    indentShown,
    status,
    findCount,
    findAsk,
    goingToLine,
    setGoingToLine,
    lineCount,
    mounts,
  } = useEditorView(language);
  const tab = useEditor((state) => state.tab);
  const finder = useEditorFinding(view, findAsk, tab, mounts);
  const { keepEditing } = useEditorActions();
  const section = useRef<HTMLElement>(null);
  useFocusKeeper(section, (focus) => {
    if (tab !== undefined) {
      keepEditing(tab, { focus });
    }
  });

  const said = edited?.error;

  const mark = edited?.readOnly
    ? strings.editor.readOnlyMark
    : edited?.changed
      ? strings.editor.unsaved
      : edited?.made
        ? strings.editor.newFile
        : undefined;

  return (
    <section className="column viewer editor search-scope" ref={section}>
      <EditorToolbar
        view={view}
        endingsShown={endingsShown}
        indentShown={indentShown}
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
      />
      <div className="path-row editor-path search-area">
        <PathTitle path={file} file />
        {mark !== undefined && (
          <span
            className={`editor-mark ${edited?.changed ? 'unsaved' : ''}`}
            {...tip(mark)}
          >
            {edited?.changed ? strings.symbols.unsaved : mark}
          </span>
        )}
      </div>
      <EditorFindBar view={view} finder={finder} findCount={findCount} />
      {said === undefined ? (
        <>
          <div className="column-body editor-body" ref={host} />
          {status !== undefined && (
            <StatusLine font="monospace">{status}</StatusLine>
          )}
        </>
      ) : (
        <div className="column-body editor-body">
          <div className="viewer-error">
            <Words>{said}</Words>
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
