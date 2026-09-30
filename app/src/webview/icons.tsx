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

export function RefreshIcon() {
  return (
    <Icon>
      <path d="M13 8a5 5 0 1 1-5-5c1.33 0 2.6.53 3.54 1.46L13 6" />
      <path d="M13 3v3h-3" />
    </Icon>
  );
}

export function SoloIcon() {
  return (
    <Icon>
      <path d="M6 1.5v1.3M6 6.2v3.6M6 13.2v1.3" />
      <circle cx="6" cy="4.5" r="1.7" />
      <circle cx="6" cy="11.5" r="1.7" />
      <path d="M6 8.3c3 0 5-1.5 5-4.5V2" opacity="0.35" />
    </Icon>
  );
}

export function MoreIcon() {
  return (
    <Icon>
      <g fill="currentColor" stroke="none">
        <circle cx="8" cy="3.5" r="1.25" />
        <circle cx="8" cy="8" r="1.25" />
        <circle cx="8" cy="12.5" r="1.25" />
      </g>
    </Icon>
  );
}

export function AllFilesIcon() {
  return (
    <Icon>
      <path d="M3 2.5v9.5h4M3 7.5h4" />
      <rect x="7.5" y="5.5" width="5.5" height="4" rx="0.8" />
      <rect x="7.5" y="10" width="5.5" height="4" rx="0.8" />
      <rect x="1.5" y="1" width="5.5" height="3" rx="0.8" />
    </Icon>
  );
}

export function CollapseAllIcon() {
  return (
    <Icon>
      <path d="M2.5 11V3.5a1 1 0 0 1 1-1H11" />
      <rect x="4.5" y="4.5" width="9" height="9" rx="1" />
      <path d="M6.5 9h5" />
    </Icon>
  );
}

export function ExpandAllIcon() {
  return (
    <Icon>
      <path d="M2.5 11V3.5a1 1 0 0 1 1-1H11" />
      <rect x="4.5" y="4.5" width="9" height="9" rx="1" />
      <path d="M6.5 9h5M9 6.5v5" />
    </Icon>
  );
}

export function EntireFileIcon() {
  return (
    <Icon>
      <path d="M8 1.5v4.5M6 3.5l2-2 2 2M8 14.5V10M6 12.5l2 2 2-2" />
      <path d="M3 8h10" opacity="0.5" />
    </Icon>
  );
}

export function IgnoreWhitespaceIcon() {
  return (
    <Icon>
      <path d="M2.5 8.5v2.5h11V8.5" />
      <path d="M3 3l10 10" />
    </Icon>
  );
}

export function PinIcon() {
  return (
    <Icon>
      <path d="M5.5 2h5M6.5 2v4L4 8.5h8L9.5 6V2M8 8.5v5.5" />
    </Icon>
  );
}

export function MatchCaseIcon() {
  return (
    <Icon>
      <path d="M1.5 12l3-8 3 8M2.6 9.3h3.8" />
      <circle cx="11.3" cy="10" r="2" />
      <path d="M13.3 7.5V12" />
    </Icon>
  );
}

export function WholeWordIcon() {
  return (
    <Icon>
      <circle cx="5" cy="7.5" r="1.8" />
      <path d="M6.8 5.7v3.6M9.5 3.5v5.8" />
      <circle cx="11.3" cy="7.5" r="1.8" />
      <path d="M2 11.5v2h12v-2" />
    </Icon>
  );
}

export function PreviousIcon() {
  return (
    <Icon>
      <path d="M4 10l4-4 4 4" />
    </Icon>
  );
}

export function NextIcon() {
  return (
    <Icon>
      <path d="M4 6l4 4 4-4" />
    </Icon>
  );
}
