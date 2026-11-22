import { useShell, useShellActions } from './store';

export function useTextViewSettings() {
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const highlightOccurrences = useShell(
    (state) => state.textView.highlightOccurrences,
  );
  const diffCells = useShell((state) => state.textView.diffCells);
  const scrolling = useShell((state) => state.scrolling);
  const { changeTextView } = useShellActions();
  return {
    wordWrap,
    showWhitespace,
    highlightSyntax,
    highlightOccurrences,
    diffCells,
    scrolling,
    changeTextView,
  };
}
