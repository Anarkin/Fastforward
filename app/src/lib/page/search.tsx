import { SearchIcon } from './icons';

export function SearchButton({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      className="nav-button search-button"
      title={title}
      onClick={onClick}
    >
      <SearchIcon />
    </button>
  );
}
