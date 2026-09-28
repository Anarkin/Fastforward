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

// A question mark in a circle
export function HelpIcon() {
  return (
    <Icon>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M6.3 6.4a1.75 1.75 0 1 1 2.5 1.6c-.5.25-.8.6-.8 1.15v.35M8 11.3v.05" />
    </Icon>
  );
}

// A circle, open at the top right, running into the corner of the arrowhead
// that turns it clockwise
export function RefreshIcon() {
  return (
    <Icon>
      <path d="M13 8a5 5 0 1 1-5-5c1.33 0 2.6.53 3.54 1.46L13 6" />
      <path d="M13 3v3h-3" />
    </Icon>
  );
}
