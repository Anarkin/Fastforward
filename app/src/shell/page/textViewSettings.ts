import { useShell, useShellActions } from './store';

export function useTextViewSettings() {
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const highlightOccurrences = useShell(
    (state) => state.textView.highlightOccurrences,
  );
  const scrolling = useShell((state) => state.scrolling);
  const { changeTextView } = useShellActions();
  return {
    wordWrap,
    showWhitespace,
    highlightSyntax,
    highlightOccurrences,
    scrolling,
    changeTextView,
  };
}
