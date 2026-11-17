import { suite, test } from 'vitest';
import { rendered, withClass } from '../../../../helpers/markup';
import { looks } from '../../../shell/page/stylesheetFixtures';

const button = (className: string) =>
  rendered(
    <div className={className}>
      <button className="nav-button menu-button-trigger labelled">
        <span className="menu-button-label">0123456</span>
      </button>
    </div>,
  );

suite('Style of the versions', () => {
  test('keeps the menu of the versions of a file as wide as 1000 pixels, so a long subject reads, but no wider than the window, cutting a longer one short rather than widening the menu', () => {
    const menu = rendered(
      <div className="version-button">
        <div className="menu filtered-menu">
          <button className="menu-item">a subject long enough</button>
        </div>
      </div>,
    );
    looks(withClass(menu, 'menu'), {
      'max-width': 'min(1000px, calc(100vw - 32px))',
    });
    looks(withClass(menu, 'menu-item'), {
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'white-space': 'nowrap',
    });
  });

  test('draws the details of a menu item dimmed and in the font of names, so their columns line up', () => {
    const item = rendered(
      <button className="menu-item">
        <span className="menu-detail">917d84c</span>
      </button>,
    );
    looks(withClass(item, 'menu-detail'), {
      'white-space': 'pre',
      color: 'var(--muted-foreground)',
      'font-family': 'var(--monospace-font-family)',
      'font-size': 'var(--monospace-font-size)',
    });
  });

  test('draws the hash on the button of the versions in the font of names, as the menu draws hashes, and its other names in the font of the buttons', () => {
    looks(
      withClass(button('version-button version-hash'), 'menu-button-label'),
      {
        'font-family': 'var(--monospace-font-family)',
        'font-size': 'var(--monospace-font-size)',
      },
    );
    looks(withClass(button('version-button'), 'menu-button-label'), {
      'font-family': undefined,
    });
  });
});
