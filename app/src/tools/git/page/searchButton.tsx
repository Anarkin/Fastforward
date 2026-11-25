import { labelTip } from '../../../lib/page/tips';
import { SearchIcon } from '../../../lib/page/icons';

export function SearchButton({
  title,
  keys,
  onClick,
  disabled = false,
}: {
  title: string;
  keys?: string | undefined;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="nav-button search-button"
      {...labelTip(title, { keys })}
      disabled={disabled}
      onClick={onClick}
    >
      <SearchIcon />
    </button>
  );
}
