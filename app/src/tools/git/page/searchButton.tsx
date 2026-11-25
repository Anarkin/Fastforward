import { labelTip } from '../../../lib/page/tips';
import { SearchIcon } from '../../../lib/page/icons';

export function SearchButton({
  title,
  onClick,
  disabled = false,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="nav-button search-button"
      {...labelTip(title)}
      disabled={disabled}
      onClick={onClick}
    >
      <SearchIcon />
    </button>
  );
}
