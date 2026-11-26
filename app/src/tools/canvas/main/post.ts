import type { Page } from '../../../shell/main/toolContract';
import type { CanvasToWebview } from '../shared/protocol';

export function post(page: Page, message: CanvasToWebview): void {
  page.post({ type: 'tool', tool: 'canvas', message });
}
