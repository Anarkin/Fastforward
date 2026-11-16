import { useEffect, useState, type RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { strings } from '../../../lib/shared/strings';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { PromptPopup } from '../../../shell/page/promptPopup';
import { useCommander, useCommanderActions } from './store';

export function EditorAsks({
  view,
  goingToLine,
  lineCount,
  setGoingToLine,
}: {
  view: RefObject<EditorView | undefined>;
  goingToLine: boolean;
  lineCount: number;
  setGoingToLine: (going: boolean) => void;
}) {
  const file = useCommander((state) => state.view.editing) ?? '';
  const tab = useCommander((state) => state.view.tab);
  const { saveText, reloadEdited, answerEditorAsk, keptEditing, keepEditing } =
    useCommanderActions();
  const [typedLine] = useState(() =>
    tab === undefined ? undefined : keptEditing(tab).goingToLine,
  );
  useEffect(() => {
    if (tab !== undefined && !goingToLine) {
      keepEditing(tab, { goingToLine: undefined });
    }
  }, [tab, goingToLine, keepEditing]);
  const asking = useCommander((state) =>
    tab === undefined ? undefined : state.editorAsks.get(tab),
  );
  const answer = (then: (shown: string) => void) => {
    if (tab !== undefined) {
      answerEditorAsk(tab);
      then(tab);
    }
    view.current?.focus();
  };

  return (
    <>
      {goingToLine && (
        <PromptPopup
          title={strings.editor.goToLineTitle}
          label={strings.editor.lineNumber(lineCount)}
          confirm={strings.editor.goToLine}
          typed={typedLine}
          onTyped={(typed) => {
            if (tab !== undefined) {
              keepEditing(tab, { goingToLine: typed });
            }
          }}
          problemOf={(typed) =>
            /^\d+$/.test(typed) &&
            Number(typed) >= 1 &&
            Number(typed) <= lineCount
              ? undefined
              : strings.editor.noSuchLine(lineCount)
          }
          onConfirm={(typed) => {
            setGoingToLine(false);
            const shown = view.current;
            if (shown !== undefined) {
              const { from } = shown.state.doc.line(Number(typed));
              shown.dispatch({
                selection: { anchor: from },
                scrollIntoView: true,
              });
              shown.focus();
            }
          }}
          onCancel={() => {
            setGoingToLine(false);
            view.current?.focus();
          }}
        />
      )}
      {asking === 'changed' && (
        <ConfirmPopup
          title={strings.editor.changedTitle}
          message={strings.editor.changedAsked}
          lines={strings.editor.overwriteLines(file)}
          confirm={strings.editor.saveOver}
          extra={{
            label: strings.editor.readAgain,
            onClick: () => answer(reloadEdited),
          }}
          onConfirm={() =>
            answer((shown) => saveText(shown, { changed: true }))
          }
          onCancel={() => answer(() => undefined)}
        />
      )}
      {asking === 'overwrite' && (
        <ConfirmPopup
          title={strings.editor.overwriteTitle}
          message={strings.editor.overwriteAsked}
          lines={strings.editor.overwriteLines(file)}
          confirm={strings.editor.overwrite}
          onConfirm={() =>
            answer((shown) => saveText(shown, { readOnly: true }))
          }
          onCancel={() => answer(() => undefined)}
        />
      )}
    </>
  );
}
