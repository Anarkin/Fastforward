import { page } from './commanderAppFixtures';

export const shownState = () =>
  page.evaluate(() => {
    const viewer = document.querySelector('.viewer');
    return JSON.stringify({
      viewing: viewer?.getAttribute('data-file') ?? null,
      text:
        viewer instanceof HTMLElement ? viewer.innerText.slice(0, 300) : null,
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
export const firstViewerRow = async () =>
  (await page.locator('.viewer-rows .viewer-row').first().textContent()) ?? '';
export const findMarks = () =>
  page
    .locator('.viewer-rows .find-match')
    .evaluateAll((elements) =>
      elements.map((element) => [
        element.textContent,
        element.classList.contains('current'),
      ]),
    );
export const findCount = () =>
  page.locator('.viewer .find-field-count').textContent();
export const viewerThumb = () =>
  page.locator('.viewer-thumb').evaluate((element) => {
    const box = element.getBoundingClientRect();
    const track = element.parentElement?.getBoundingClientRect();
    return {
      top: box.top,
      height: box.height,
      fromEnd: (track?.bottom ?? 0) - box.bottom,
    };
  });
