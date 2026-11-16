import { useShell, useShellActions } from './store';

export function useTextViewSettings() {
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const scrolling = useShell((state) => state.scrolling);
  const { changeTextView } = useShellActions();
  return {
    wordWrap,
    showWhitespace,
    highlightSyntax,
    scrolling,
    changeTextView,
  };
}
