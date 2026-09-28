// Line icons for the tab bar and the toolbar, drawn thin on a 16 pixel grid
// like VS Code's and Chrome's, where text glyphs render heavy and at the
// font's whim; they take the button's text color

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function CloseIcon() {
  return (
    <Icon>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Icon>
  );
}

export function BackIcon() {
  return (
    <Icon>
      <path d="M13 8H3M7.5 3.5L3 8l4.5 4.5" />
    </Icon>
  );
}

export function ForwardIcon() {
  return (
    <Icon>
      <path d="M3 8h10M8.5 3.5L13 8l-4.5 4.5" />
    </Icon>
  );
}

// A circle, open at the top right, where its arrowhead turns it clockwise
export function RefreshIcon() {
  return (
    <Icon>
      <path d="M13 8a5 5 0 1 1-1.46-3.54" />
      <path d="M12 2v3h-3" />
    </Icon>
  );
}
