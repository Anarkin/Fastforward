import type { ColumnName } from '../../tools/git/page/activeColumn';
import { Column } from '../../tools/git/page/column';
import { ContextMenu } from '../../shell/page/contextMenu';
import { tabsStore } from './componentFixtures';
import { SearchButton } from '../../lib/page/search';
import { Notices } from '../../shell/page/notices';
import { MenuButton } from '../../lib/page/menu';
import { AppMenu } from '../../shell/page/appMenu';
import { TabBar } from '../../shell/page/tabBar';
import { createShellStore, ShellStore } from '../../shell/page/store';
import { AboutPopup } from '../../shell/page/aboutPopup';
import { ShortcutsPopup } from '../../shell/page/shortcutsPopup';
import { PathTitle } from '../../tools/commander/page/pathTitle';
import { noop } from './fixtures';

export function ColumnShown({ start }: { readonly start: React.ReactNode }) {
  return <Column start={start}>{null}</Column>;
}

export function Columns({
  className,
  active,
}: {
  readonly className: string;
  readonly active?: ColumnName;
}) {
  return (
    <div className={className} data-active-column={active}>
      {[0, 1, 2].map((index) => (
        <Column key={index} index={index < 2 ? index : undefined}>
          {null}
        </Column>
      ))}
    </div>
  );
}

export function MenuButtonShown(
  props: Partial<React.ComponentProps<typeof MenuButton>>,
) {
  return <MenuButton title="" items={[]} {...props} />;
}

export function TabBarShown() {
  return (
    <ShellStore
      value={tabsStore(
        [
          { id: '/a', tool: 'git', root: '/a', name: 'a' },
          { id: '/x/b', tool: 'git', root: '/x/b', name: 'b', folder: 'x' },
        ],
        '/a',
        false,
      )}
    >
      <TabBar menu={<AppMenu />} />
    </ShellStore>
  );
}

export function TabBarIn({
  maximized,
  adding = false,
}: {
  readonly maximized: boolean;
  readonly adding?: boolean;
}) {
  return (
    <div {...(maximized ? { 'data-maximized': '' } : {})}>
      <ShellStore
        value={tabsStore(
          [
            { id: '/a', tool: 'git', root: '/a', name: 'a' },
            { id: '/b', tool: 'git', root: '/b', name: 'b' },
          ],
          '/a',
          adding,
        )}
      >
        <TabBar />
      </ShellStore>
    </div>
  );
}

export function ContextMenuShown() {
  return (
    <ContextMenu
      menu={{
        x: 0,
        y: 0,
        items: [
          { label: 'Check out' },
          { separator: true },
          { label: 'Delete', disabled: true },
        ],
      }}
      onClose={noop}
    />
  );
}

export function NoticesShown({ level }: { readonly level?: string }) {
  return (
    <ShellStore
      value={createShellStore(noop, {
        notices: [
          {
            id: 1,
            level: level === 'info' ? 'info' : 'error',
            message: 'failed',
            shownAt: 0,
          },
        ],
      })}
    >
      <Notices />
    </ShellStore>
  );
}

export function AboutPopupShown() {
  return (
    <ShellStore
      value={createShellStore(noop, {
        about: {
          version: '1.0.0',
          development: false,
          git: '2.52.0',
          system: 'Linux 6.8.0, x64',
        },
      })}
    >
      <AboutPopup />
    </ShellStore>
  );
}

export function ShortcutsPopupShown() {
  return (
    <ShellStore
      value={tabsStore([{ id: '1', tool: 'git', name: 'repo' }], '1')}
    >
      <ShortcutsPopup />
    </ShellStore>
  );
}

export function SearchButtonShown() {
  return <SearchButton title="Search" onClick={noop} />;
}

export function PathTitleShown({
  hidden,
  color,
}: {
  readonly hidden: readonly boolean[];
  readonly color?: string;
}) {
  return <PathTitle path="C:/cache/notes.txt" hidden={hidden} color={color} />;
}
