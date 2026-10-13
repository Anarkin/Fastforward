import { useEffect, useRef, useState } from 'react';
import type { AboutInfo } from '../shared/protocol';
import { brand, strings } from '../shared/strings';
import { useDismiss } from './contextMenu';
import { CloseIcon } from './icons';
import { useDialogDrag, useModalDialog } from './modalDialog';

const copiedFor = 1500;

export function aboutText({
  version,
  development,
  git,
  system,
}: AboutInfo): string {
  return [
    brand,
    strings.about.version(version, development),
    strings.about.git(git),
    system,
    strings.about.address,
  ].join('\n');
}

export function CopyButton({
  copied,
  onClick,
}: {
  copied: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`about-copy ${copied ? 'copied' : ''}`}
      title={strings.about.copyTitle}
      onClick={onClick}
    >
      {copied ? strings.about.copied : strings.about.copy}
    </button>
  );
}

export function AboutPopup({
  about,
  onCopy,
  onClose,
}: {
  about: AboutInfo;
  onCopy: (text: string) => void;
  onClose: () => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  useDismiss(popup, onClose, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = setTimeout(() => setCopied(false), copiedFor);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div
      className="backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && event.preventDefault()
      }
    >
      <div
        className="shortcuts-popup about-popup"
        ref={popup}
        {...dialog}
        style={drag.style}
        aria-label={strings.about.title}
      >
        <div className="shortcuts-title" onPointerDown={drag.onPointerDown}>
          <span>{strings.about.title}</span>
          <button
            className="nav-button"
            title={strings.common.close}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="about-body">
          <span className="about-name">{brand}</span>
          <span>{strings.about.version(about.version, about.development)}</span>
          <span>{strings.about.git(about.git)}</span>
          <span>{about.system}</span>
          <a href={strings.about.address} target="_blank" rel="noreferrer">
            {strings.about.address}
          </a>
          <CopyButton
            copied={copied}
            onClick={() => {
              onCopy(aboutText(about));
              setCopied(true);
            }}
          />
        </div>
      </div>
    </div>
  );
}
