import type { RefObject } from 'react';
import { strings } from '../../../lib/shared/strings';
import { keyPressed } from '../../../lib/page/shortcuts';
import { gitKeymap } from './keymap';

export function FileFilterField({
  query,
  input,
  onQuery,
  onLeave,
  onClose,
}: {
  query: string;
  input?: RefObject<HTMLInputElement | null>;
  onQuery: (query: string) => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  return (
    <div className={`search-field ${query ? 'active' : ''}`}>
      <input
        ref={input}
        className="search-input"
        placeholder={strings.find.placeholder}
        spellCheck={false}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (keyPressed(gitKeymap.stopFinding, event)) {
            event.preventDefault();
            onClose();
          } else if (keyPressed(gitKeymap.toFiles, event)) {
            event.preventDefault();
            onLeave();
          }
        }}
      />
    </div>
  );
}
