import { strings } from '../../../lib/shared/strings';

export function Twisty({ open }: { open: boolean }) {
  return (
    <span className="twisty">
      {open ? strings.symbols.open : strings.symbols.closed}
    </span>
  );
}
