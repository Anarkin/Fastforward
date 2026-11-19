import { closeTip } from '../../lib/page/closeTip';
import { tip } from '../../lib/page/tips';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { brand, strings } from '../../lib/shared/strings';
import { useDismiss } from '../../lib/page/dismiss';
import { CloseIcon } from '../../lib/page/icons';
import { useModalDialog } from '../../lib/page/modalDialog';
import { useDialogDrag } from '../../lib/page/dialogDrag';
import { useShell, useShellActions } from './store';
import { aboutText } from './aboutText';

const copiedFor = 1500;

export function CopyButton({
  copied,
  onClick,
  ref,
}: {
  copied: boolean;
  onClick: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      className={`about-copy ${copied ? 'copied' : ''}`}
      {...tip(strings.about.copyTitle)}
      onClick={onClick}
    >
      {copied ? strings.about.copied : strings.about.copy}
    </button>
  );
}

export function AboutPopup() {
  const about = useShell((state) => state.about);
  const { copyText: onCopy, showPopup } = useShellActions();
  const onClose = useCallback(() => showPopup('about', false), [showPopup]);
  const popup = useRef<HTMLDivElement>(null);
  useDismiss(popup, onClose, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  const [copied, setCopied] = useState(false);
  const copying = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => copying.current?.focus(), []);
  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = setTimeout(() => setCopied(false), copiedFor);
    return () => clearTimeout(timer);
  }, [copied]);
  if (about === undefined) {
    return null;
  }
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
          <button className="nav-button" {...closeTip} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="about-body">
          <span className="about-name">{brand}</span>
          <span>{strings.about.version(about.version, about.development)}</span>
          <a href={strings.about.address} target="_blank" rel="noreferrer">
            {strings.about.address}
          </a>
          <span>{strings.about.git(about.git)}</span>
          <span>{about.system}</span>
          <CopyButton
            ref={copying}
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
