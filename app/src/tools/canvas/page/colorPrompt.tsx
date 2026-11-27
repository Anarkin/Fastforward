import { PromptPopup } from '../../../shell/page/promptPopup';
import { strings } from '../../../lib/shared/strings';
import { coloringShown } from './state';
import { useCanvas, useCanvasActions } from './store';

const hexColor = /^#[\da-f]{6}$/i;

export function ColorPrompt() {
  const tab = useCanvas((state) => state.tab);
  const coloring = useCanvas(coloringShown);
  const { keepColorTyped, answerColor } = useCanvasActions();
  if (tab === undefined || coloring === undefined) {
    return null;
  }
  return (
    <PromptPopup
      title={strings.canvas.customColorTitle}
      label={strings.canvas.customColorLabel}
      confirm={strings.canvas.customColorConfirm}
      initial="#"
      problemOf={(value) =>
        hexColor.test(value) ? undefined : strings.canvas.notAColor
      }
      typed={coloring.typed}
      onTyped={(typed) => {
        keepColorTyped(tab, typed);
      }}
      onConfirm={(color) => {
        answerColor(tab, color);
      }}
      onCancel={() => {
        answerColor(tab, undefined);
      }}
    />
  );
}
