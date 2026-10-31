import { useEffect, useReducer, useRef, useState } from 'react';
import { clicked } from '../../../shell/shared/keymap';
import './style.css';
import { commanderKeymap } from '../shared/keymap';
import {
  sides,
  type CommanderToHost,
  type CommanderToWebview,
  type Side,
} from '../shared/protocol';
import { Pane } from './pane';
import { emptyView, reduceView } from './view';
import { nextSort } from './listing';
import type { ColumnWidths } from '../shared/settings';
import { columnFocusAttribute } from '../../../ui/columnFocus';
import { followDrag } from '../../../ui/followDrag';
import { useBinding } from '../../../ui/shortcuts';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { strings } from '../../../shared/strings';

const minimumShare = 0.15;

export function shareOf(left: number, width: number): number {
  return width <= 0
    ? 0.5
    : Math.min(1 - minimumShare, Math.max(minimumShare, left / width));
}

export function sideToFocus(
  column: Element | undefined,
  focused: Element | null,
): HTMLElement | undefined {
  return column === undefined || column.contains(focused)
    ? undefined
    : (column.querySelector<HTMLElement>(`[${columnFocusAttribute}]`) ??
        undefined);
}

export function CommanderTool({
  active,
  post,
  listen,
}: {
  active: boolean;
  post: (message: CommanderToHost) => void;
  listen: (handler: (message: CommanderToWebview) => void) => () => void;
}) {
  const [view, dispatch] = useReducer(reduceView, emptyView);
  const [drives, setDrives] = useState<readonly string[]>([]);
  const [noAccess, setNoAccess] = useState<{
    readonly side: Side;
    readonly folder: string;
    readonly asAdministrator: boolean;
  }>();
  const [share, setShare] = useState(0.5);
  const [resized, setResized] = useState<{
    readonly from: ColumnWidths;
    readonly widths: ColumnWidths;
  }>();
  const columnWidths =
    resized?.from === view.columns ? resized.widths : view.columns;
  const columns = useRef<HTMLDivElement>(null);
  const triggers = {
    left: useRef<HTMLButtonElement>(null),
    right: useRef<HTMLButtonElement>(null),
  };

  useEffect(
    () =>
      listen((message) => {
        if (message.type === 'drives') {
          setDrives(message.drives);
        } else if (message.type === 'noAccess') {
          setNoAccess({
            side: message.side,
            folder: message.folder,
            asAdministrator: message.asAdministrator,
          });
        } else {
          dispatch(message);
        }
      }),
    [listen],
  );

  const shown = active && view.tab !== undefined;

  useEffect(() => {
    if (!shown) {
      return;
    }
    sideToFocus(
      columns.current?.children[sides.indexOf(view.active)],
      document.activeElement,
    )?.focus();
  }, [shown, view.active]);

  useEffect(() => {
    if (view.tab !== undefined) {
      post({ type: 'activate', tab: view.tab, side: view.active });
    }
  }, [post, view.tab, view.active]);

  const stepActive = (step: -1 | 1) => {
    if (view.tab !== undefined) {
      post({ type: 'step', tab: view.tab, side: view.active, step });
    }
  };
  useBinding(commanderKeymap.history, stepActive, shown);
  useEffect(() => {
    const { tab, active: side } = view;
    if (!shown || tab === undefined) {
      return undefined;
    }
    const onMouseUp = (event: MouseEvent) => {
      const step = clicked(commanderKeymap.history, event);
      if (step !== undefined) {
        event.preventDefault();
        post({ type: 'step', tab, side, step });
      }
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [shown, view, post]);

  useBinding(
    commanderKeymap.showHidden,
    () => post({ type: 'showHidden', shown: !view.showHidden }),
    shown,
  );
  useBinding(
    commanderKeymap.drive,
    (side) => {
      dispatch({ type: 'activate', side });
      triggers[side].current?.click();
    },
    shown && drives.length > 0,
  );

  if (!active) {
    return null;
  }
  const { tab } = view;
  const resizer = <Resizer columns={columns} onShare={setShare} />;
  const openIn = (side: Side) => (name: string) => {
    if (tab !== undefined) {
      post({ type: 'open', tab, side, name });
    }
  };

  return (
    <div className="repository commander">
      <div
        className="columns commander-columns"
        ref={columns}
        data-active-side={view.active}
        style={{
          gridTemplateColumns: `minmax(0, ${share}fr) minmax(0, ${1 - share}fr)`,
        }}
      >
        {sides.map((side) => (
          <Pane
            key={side}
            tab={tab}
            side={side}
            active={side === view.active}
            pane={view.panes[side]}
            columns={columnWidths}
            onResize={(column, width) =>
              setResized({
                from: view.columns,
                widths: { ...columnWidths, [column]: width },
              })
            }
            onResized={(column, width) =>
              post({
                type: 'columns',
                columns: { ...view.columns, [column]: width },
              })
            }
            onReset={(column) => {
              post({
                type: 'columns',
                columns: {
                  ...view.columns,
                  [column]: view.defaultColumns[column],
                },
              });
            }}
            drives={drives}
            driveTrigger={triggers[side]}
            onSelect={(key) => dispatch({ type: 'select', side, key })}
            onOpen={openIn(side)}
            onSort={(column) => {
              const sort = nextSort(
                view.panes[side]?.sort ?? view.sorts[side],
                column,
              );
              dispatch({ type: 'sort', side, sort });
              post({ type: 'sort', side, sort });
            }}
            onActivate={() => dispatch({ type: 'activate', side })}
            onSwitchSide={() => dispatch({ type: 'switchSide' })}
            onDrive={(drive) => {
              if (tab !== undefined) {
                post({ type: 'drive', tab, side, drive });
              }
            }}
            onDrivesOpening={() => post({ type: 'listDrives' })}
            onOpenOnSide={(target, name) => {
              if (tab !== undefined) {
                post({
                  type: 'openOnSide',
                  tab,
                  from: side,
                  side: target,
                  name,
                });
              }
            }}
            onStep={(step) => {
              if (tab !== undefined) {
                post({ type: 'step', tab, side, step });
              }
            }}
            resizer={side === 'left' && resizer}
          />
        ))}
      </div>
      {noAccess !== undefined && (
        <ConfirmPopup
          title={strings.commander.noAccessTitle}
          message={strings.commander.noAccess(noAccess.folder)}
          confirm={strings.confirm.ok}
          cancel={null}
          onConfirm={() => setNoAccess(undefined)}
          onCancel={() => setNoAccess(undefined)}
          extra={
            view.canElevate && noAccess.asAdministrator && tab !== undefined
              ? {
                  label: strings.commander.asAdministrator,
                  onClick: () => {
                    setNoAccess(undefined);
                    post({ type: 'elevate', tab, side: noAccess.side });
                  },
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function Resizer({
  columns,
  onShare,
}: {
  columns: React.RefObject<HTMLDivElement | null>;
  onShare: (share: number) => void;
}) {
  return (
    <div
      className="resizer"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const box = columns.current?.getBoundingClientRect();
        if (box === undefined) {
          return;
        }
        followDrag(
          window,
          (move: PointerEvent) =>
            onShare(shareOf(move.clientX - box.left, box.width)),
          () => document.body.classList.remove('resizing'),
        );
        document.body.classList.add('resizing');
      }}
      onDoubleClick={() => onShare(0.5)}
    />
  );
}
