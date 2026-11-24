import { characterTipText } from '../../../components/cells/page/characterNames';
import { characterTip } from '../../../lib/page/tips';
import type { DOMPurify } from 'dompurify';
import type MarkdownIt from 'markdown-it';
import type { StateCore } from 'markdown-it';
import { controlCharacters } from '../../../lib/page/invisibles';
import { strings } from '../../../lib/shared/strings';

const tagsGitHubKeeps = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'br',
  'b',
  'i',
  'strong',
  'em',
  'a',
  'pre',
  'code',
  'img',
  'tt',
  'div',
  'ins',
  'del',
  'sup',
  'sub',
  'p',
  'picture',
  'ol',
  'ul',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'blockquote',
  'dl',
  'dt',
  'dd',
  'kbd',
  'q',
  'samp',
  'var',
  'hr',
  'ruby',
  'rt',
  'rp',
  'li',
  'tr',
  'td',
  'th',
  's',
  'strike',
  'summary',
  'details',
  'caption',
  'figure',
  'figcaption',
  'abbr',
  'bdo',
  'cite',
  'dfn',
  'mark',
  'small',
  'span',
  'time',
  'wbr',
  'input',
];

const attributesGitHubKeeps = [
  'href',
  'src',
  'alt',
  'title',
  'cite',
  'abbr',
  'align',
  'aria-describedby',
  'aria-hidden',
  'aria-label',
  'aria-labelledby',
  'axis',
  'border',
  'cellpadding',
  'cellspacing',
  'char',
  'charoff',
  'checked',
  'clear',
  'colspan',
  'color',
  'compact',
  'datetime',
  'dir',
  'disabled',
  'headers',
  'height',
  'hreflang',
  'hspace',
  'lang',
  'nowrap',
  'open',
  'role',
  'rowspan',
  'rules',
  'scope',
  'span',
  'start',
  'summary',
  'type',
  'valign',
  'value',
  'vspace',
  'width',
];

const allowedUris =
  /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

const languageClass = /^language-[\w#+.-]+$/;

const taskMarker = /^\[([ xX])\][ \t]/;

function taskLists(state: StateCore): void {
  const { tokens } = state;
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i];
    const first = inline.children?.[0];
    if (
      inline.type !== 'inline' ||
      tokens[i - 1].type !== 'paragraph_open' ||
      tokens[i - 2].type !== 'list_item_open' ||
      first?.type !== 'text'
    ) {
      continue;
    }
    const marker = taskMarker.exec(first.content);
    if (!marker) {
      continue;
    }
    first.content = first.content.slice(marker[0].length);
    const box = new state.Token('html_inline', '', 0);
    box.content = `<input type="checkbox" disabled${marker[1] === ' ' ? '' : ' checked'}> `;
    inline.children?.unshift(box);
  }
}

const controlClass = 'control-character';

function signedControls(text: ChildNode, shown: string): void {
  const owner = text.ownerDocument;
  if (owner === null) {
    return;
  }
  const parts = owner.createDocumentFragment();
  let at = 0;
  for (const found of shown.matchAll(controlCharacters())) {
    parts.append(shown.slice(at, found.index));
    const control = owner.createElement('span');
    control.className = controlClass;
    control.dataset.real = found[0];
    control.setAttribute('data-tip', characterTipText(found[0]));
    control.setAttribute(characterTip, '');
    control.textContent = strings.symbols.invisible;
    parts.append(control);
    at = found.index + found[0].length;
  }
  parts.append(shown.slice(at));
  text.replaceWith(parts);
}

function signedTexts(node: Node, inCode = false): void {
  for (const child of Array.from(node.childNodes)) {
    const shown = child.nodeValue ?? '';
    if (child.nodeType !== child.TEXT_NODE) {
      signedTexts(child, inCode || child.nodeName === 'PRE');
    } else if (!inCode && controlCharacters().test(shown)) {
      signedControls(child, shown);
    }
  }
}

const cellAlignment = /^text-align:(left|center|right)$/;

function tableAlignments(state: StateCore): void {
  for (const token of state.tokens) {
    const style =
      token.type === 'th_open' || token.type === 'td_open'
        ? token.attrGet('style')
        : null;
    const align =
      typeof style === 'string' ? cellAlignment.exec(style)?.[1] : undefined;
    if (align !== undefined) {
      token.attrs = (token.attrs ?? []).filter(([name]) => name !== 'style');
      token.attrSet('align', align);
    }
  }
}

export const linkAttribute = 'data-link';

export const anchorAttribute = 'data-anchor';

const linkScheme = /^[a-z][a-z\d+.-]*:/i;

const leftOutOfAnchors = /[^\p{L}\p{M}\p{N}\p{Pc} -]/gu;

const anchorOf = (heading: string): string =>
  heading
    .trim()
    .toLowerCase()
    .replace(leftOutOfAnchors, '')
    .replaceAll(' ', '-');

function anchoredHeadings(fragment: DocumentFragment): void {
  const taken = new Map<string, number>();
  for (const heading of fragment.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const anchor = anchorOf(heading.textContent);
    const times = taken.get(anchor) ?? 0;
    taken.set(anchor, times + 1);
    heading.setAttribute(
      anchorAttribute,
      times === 0 ? anchor : `${anchor}-${String(times)}`,
    );
  }
}

export const imagePath = 'data-path';

type ImageResolver = (src: string) => string | undefined;

const noImages: ImageResolver = () => undefined;

export type Render = (text: string, image: ImageResolver) => string;

export function markdownRenderer(
  purify: DOMPurify,
  markdownIt: typeof MarkdownIt,
): Render {
  const markdown = markdownIt({ html: true, linkify: true });
  markdown.core.ruler.after('inline', 'task_lists', taskLists);
  markdown.core.ruler.push('table_alignments', tableAlignments);
  let resolve = noImages;
  purify.addHook('uponSanitizeAttribute', (node, event) => {
    if (
      event.attrName === 'class' &&
      node.tagName === 'CODE' &&
      languageClass.test(event.attrValue)
    ) {
      event.forceKeepAttr = true;
    }
  });
  purify.addHook('afterSanitizeAttributes', (node) => {
    const title = node.getAttribute('title');
    if (title !== null) {
      node.removeAttribute('title');
      node.setAttribute('data-tip', title);
    }
    if (node.tagName === 'A') {
      const href = node.getAttribute('href');
      if (href !== null && !/^(?:https|mailto):/i.test(href)) {
        node.removeAttribute('href');
        if (!linkScheme.test(href) && !href.startsWith('//')) {
          node.setAttribute(linkAttribute, href);
        }
      }
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    } else if (node.tagName === 'IMG') {
      const src = node.getAttribute('src');
      const path = src === null ? undefined : resolve(src);
      node.removeAttribute('src');
      node.removeAttribute(imagePath);
      if (path !== undefined) {
        node.setAttribute(imagePath, path);
      }
    }
  });
  return (text, image) => {
    resolve = image;
    let fragment: DocumentFragment;
    try {
      fragment = purify.sanitize(markdown.render(text), {
        ALLOWED_TAGS: tagsGitHubKeeps,
        ALLOWED_ATTR: attributesGitHubKeeps,
        ALLOW_DATA_ATTR: false,
        ALLOWED_URI_REGEXP: allowedUris,
        RETURN_DOM_FRAGMENT: true,
      });
    } finally {
      resolve = noImages;
    }
    const document = fragment.ownerDocument;
    anchoredHeadings(fragment);
    for (const input of fragment.querySelectorAll('input')) {
      if (input.getAttribute('type') === 'checkbox') {
        input.setAttribute('disabled', '');
        input.removeAttribute('value');
      } else {
        input.remove();
      }
    }
    for (const img of fragment.querySelectorAll(`img:not([${imagePath}])`)) {
      const alt = document.createElement('span');
      alt.className = 'markdown-alt';
      alt.textContent = img.getAttribute('alt');
      img.replaceWith(alt);
    }
    signedTexts(fragment);
    const html = document.createElement('div');
    html.append(fragment);
    return html.innerHTML;
  };
}
