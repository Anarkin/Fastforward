import { createContext, useContext } from 'react';
import type { TextView } from '../shell/shared/protocol';

export const defaultTextView: TextView = {
  wordWrap: true,
  showWhitespace: true,
  highlightSyntax: true,
};

export const TextViewContext = createContext<{
  readonly view: TextView;
  readonly change: (view: TextView) => void;
}>({ view: defaultTextView, change: () => undefined });

export function useTextView() {
  return useContext(TextViewContext);
}
