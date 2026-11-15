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
  const { listenEditor, saveText, reloadEdited } = useCommanderActions();
  const [askingOverwrite, setAskingOverwrite] = useState(false);
  const [askingChanged, setAskingChanged] = useState(false);
  useEffect(
    () =>
      listenEditor((message) => {
        if (message.tab !== tab) {
          return;
        }
        if (message.type === 'askOverwrite') {
          setAskingOverwrite(true);
          return;
        }
        if (message.type === 'askChangedOnDisk') {
          setAskingChanged(true);
        }
      }),
    [listenEditor, tab],
  );

  return (
    <>
      {goingToLine && (
        <PromptPopup
          title={strings.editor.goToLineTitle}
          label={strings.editor.lineNumber(lineCount)}
          confirm={strings.editor.goToLine}
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
      {askingChanged && tab !== undefined && (
        <ConfirmPopup
          title={strings.editor.changedTitle}
          message={strings.editor.changedAsked}
          lines={strings.editor.overwriteLines(file)}
          confirm={strings.editor.saveOver}
          extra={{
            label: strings.editor.readAgain,
            onClick: () => {
              setAskingChanged(false);
              reloadEdited(tab);
              view.current?.focus();
            },
          }}
          onConfirm={() => {
            setAskingChanged(false);
            saveText(tab, { changed: true });
            view.current?.focus();
          }}
          onCancel={() => {
            setAskingChanged(false);
            view.current?.focus();
          }}
        />
      )}
      {askingOverwrite && tab !== undefined && (
        <ConfirmPopup
          title={strings.editor.overwriteTitle}
          message={strings.editor.overwriteAsked}
          lines={strings.editor.overwriteLines(file)}
          confirm={strings.editor.overwrite}
          onConfirm={() => {
            setAskingOverwrite(false);
            saveText(tab, { readOnly: true });
            view.current?.focus();
          }}
          onCancel={() => {
            setAskingOverwrite(false);
            view.current?.focus();
          }}
        />
      )}
    </>
  );
}
