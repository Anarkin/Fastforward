import { viewerMarks, viewerTexts } from './cellsSeen';
import { page } from './commanderAppFixtures';

export const shownState = () =>
  page.evaluate(() => {
    const viewer = document.querySelector('.viewer');
    return JSON.stringify({
      viewing: viewer?.getAttribute('data-file') ?? null,
      text:
        viewer instanceof HTMLElement ? viewer.innerText.slice(0, 300) : null,
      rows: [...(viewer?.querySelectorAll('.cell-rows') ?? [])].flatMap(
        (host) =>
          host instanceof HTMLElement
            ? (host.seenRows?.() ?? []).slice(0, 6).map(({ text }) => text)
            : [],
      ),
      selected: [...document.querySelectorAll('.commander-row.selected')].map(
        (row) => row.textContent,
      ),
      focused: document.activeElement?.className ?? null,
    });
  });
export const closeViewer = async () => {
  if (await page.locator('.viewer').isVisible()) {
    await page.keyboard.press('Escape');
    await page
      .locator('.viewer')
      .waitFor({ state: 'detached' })
      .catch(() => undefined);
  }
};
export const rowTexts = () => viewerTexts(page);
export const firstViewerRow = async () => (await rowTexts())[0] ?? '';
export const findMarks = () => viewerMarks(page);
export const findCount = () =>
  page.locator('.viewer .search-count').textContent();
