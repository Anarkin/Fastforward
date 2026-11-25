import { useRef, useState } from 'react';
import { LocationsPopup } from './locations';
import { useGit, useGitActions } from './store';
import { useBinding } from '../../../lib/page/shortcuts';
import { gitKeymap } from './keymap';
import { locationsPopupKey } from './navHistory';
import { activeColumnOf, searchingOf } from './selectors';

export function AddressBar() {
  const open = useGit(searchingOf);
  const findsHere = useGit((state) => activeColumnOf(state) === 'commits');
  const { search } = useGitActions();
  const [asked, setAsked] = useState(0);
  useBinding(
    gitKeymap.places,
    () => {
      setAsked((count) => count + 1);
      search(true);
    },
    findsHere,
  );
  const root = useGit((state) => state.tab.root);
  const container = useRef<HTMLDivElement>(null);

  return (
    <div className="address" ref={container}>
      {open && (
        <LocationsPopup
          key={locationsPopupKey(asked, root)}
          anchor={container}
        />
      )}
    </div>
  );
}
