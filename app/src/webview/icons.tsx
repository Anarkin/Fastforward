function Icon({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      className={className === undefined ? 'icon' : `icon ${className}`}
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

export function AddIcon() {
  return (
    <Icon>
      <path d="M8 3.5v9M3.5 8h9" />
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

export function HomeIcon() {
  return (
    <Icon>
      <path d="M2.5 7.5L8 2.5l5.5 5" />
      <path d="M4 6.5v7h3v-4h2v4h3v-7" />
    </Icon>
  );
}

export function PullIcon() {
  return (
    <Icon>
      <path d="M8 2.5v8M4.5 7L8 10.5 11.5 7" />
      <path d="M3 13.5h10" />
    </Icon>
  );
}

export function PushIcon() {
  return (
    <Icon>
      <path d="M8 13.5v-8M4.5 9L8 5.5 11.5 9" />
      <path d="M3 2.5h10" />
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

export function MenuIcon() {
  return (
    <Icon className="menu-icon">
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
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

export function WhitespaceChangesIcon() {
  return (
    <Icon>
      <path d="M2.5 8.5v2.5h11V8.5" />
    </Icon>
  );
}

export function ShowWhitespaceIcon() {
  return (
    <Icon>
      <path d="M3 5.5h.01M6 5.5h.01M9 5.5h.01M12 5.5h.01M3 10.5h9M10 8.5l2 2-2 2" />
    </Icon>
  );
}

export function WordWrapIcon() {
  return (
    <Icon>
      <path d="M2.5 4h11M2.5 8h9a2 2 0 0 1 0 4H8M9.5 10.5 8 12l1.5 1.5M2.5 12H5" />
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

export function ImageIcon() {
  return (
    <Icon>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <circle cx="6" cy="6.5" r="1" />
      <path d="M2.5 11l3.5-3.5 3 3 1.5-1.5 3 3" />
    </Icon>
  );
}

export function PreviewIcon() {
  return (
    <Icon>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </Icon>
  );
}

export function InlineIcon() {
  return (
    <Icon>
      <rect x="2" y="2.5" width="12" height="11" rx="1" />
      <path d="M4.5 6h7M4.5 10h7" />
    </Icon>
  );
}

export function SideBySideIcon() {
  return (
    <Icon>
      <rect x="2" y="2.5" width="12" height="11" rx="1" />
      <path d="M8 2.5v11M4 6h2.5M9.5 10H12" />
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
