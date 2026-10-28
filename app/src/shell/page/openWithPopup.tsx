import { useEffect, useRef } from 'react';
import type { ToWebviewOf } from '../shared/protocol';
import { strings } from '../../shared/strings';
import type { ToolId } from '../shared/tools';
import { keymap } from '../shared/keymap';
import { nextMenuItem, useDismiss } from '../../ui/contextMenu';
import { keyPressed } from '../../ui/shortcuts';
import { CloseIcon, ToolIcon } from '../../ui/icons';
import { useDialogDrag, useModalDialog } from '../../ui/modalDialog';

function moveBetweenTools(event: React.KeyboardEvent<HTMLElement>): void {
  const move = keyPressed(keymap.menuItem, event);
  if (move === undefined) {
    return;
  }
  const tools = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      '.open-with-tool:not(:disabled)',
    ),
  );
  const next = nextMenuItem(
    move,
    tools.findIndex(
      (tool) => tool === event.currentTarget.ownerDocument.activeElement,
    ),
    tools.length,
  );
  if (next !== undefined) {
    event.preventDefault();
    tools[next].focus();
  }
}

export function OpenWithPopup({
  choice,
  onOpen,
  onClose,
}: {
  choice: ToWebviewOf<'chooseTool'>;
  onOpen: (tool: ToolId) => void;
  onClose: () => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  useDismiss(popup, onClose, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  const { picked } = choice;
  useEffect(() => {
    popup.current
      ?.querySelector<HTMLElement>(`[data-tool="${picked}"]`)
      ?.focus();
  }, [picked]);
  return (
    <div
      className="backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && event.preventDefault()
      }
    >
      <div
        className="shortcuts-popup open-with-popup"
        ref={popup}
        {...dialog}
        style={drag.style}
        aria-label={strings.openWith.title}
      >
        <div className="shortcuts-title" onPointerDown={drag.onPointerDown}>
          <span>{strings.openWith.title}</span>
          <button
            className="nav-button"
            title={strings.common.close}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="open-with-body">
          <div className="open-with-folders">
            {choice.folders.map((folder) => (
              <span key={folder} title={folder}>
                {folder}
              </span>
            ))}
          </div>
          <div className="open-with-tools" onKeyDown={moveBetweenTools}>
            {choice.choices.map(({ tool, fits }) => (
              <button
                key={tool}
                data-tool={tool}
                className="open-with-tool"
                disabled={!fits}
                onClick={() => onOpen(tool)}
              >
                <ToolIcon tool={tool} />
                <span>{strings.tools[tool]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
