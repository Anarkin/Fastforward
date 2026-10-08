import type { DOMPurify } from 'dompurify';
import type MarkdownIt from 'markdown-it';
import type { StateCore } from 'markdown-it';

// What GitHub keeps of the HTML in Markdown, after its html-pipeline
// sanitization filter, leaving out forms and what loads other documents
const allowedTags = [
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

const allowedAttributes = [
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

type ImageResolver = (src: string) => string | undefined;

const noImages: ImageResolver = () => undefined;

export type Render = (text: string, image: ImageResolver) => string;

export function markdownRenderer(
  purify: DOMPurify,
  markdownIt: typeof MarkdownIt,
): Render {
  const markdown = markdownIt({ html: true, linkify: true });
  markdown.core.ruler.after('inline', 'task_lists', taskLists);
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
    if (node.tagName === 'A') {
      const href = node.getAttribute('href');
      if (href !== null && !/^(?:https?|mailto):/i.test(href)) {
        node.removeAttribute('href');
      }
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    } else if (node.tagName === 'IMG') {
      const src = node.getAttribute('src');
      const resolved = src === null ? undefined : resolve(src);
      if (resolved === undefined) {
        node.removeAttribute('src');
      } else {
        node.setAttribute('src', resolved);
      }
    }
  });
  return (text, image) => {
    resolve = image;
    let fragment: DocumentFragment;
    try {
      fragment = purify.sanitize(markdown.render(text), {
        ALLOWED_TAGS: allowedTags,
        ALLOWED_ATTR: allowedAttributes,
        ALLOWED_URI_REGEXP: allowedUris,
        RETURN_DOM_FRAGMENT: true,
      });
    } finally {
      resolve = noImages;
    }
    const document = fragment.ownerDocument;
    for (const input of fragment.querySelectorAll('input')) {
      if (input.getAttribute('type') === 'checkbox') {
        input.setAttribute('disabled', '');
        input.removeAttribute('value');
      } else {
        input.remove();
      }
    }
    for (const img of fragment.querySelectorAll('img:not([src])')) {
      const alt = document.createElement('span');
      alt.className = 'markdown-alt';
      alt.textContent = img.getAttribute('alt');
      img.replaceWith(alt);
    }
    const html = document.createElement('div');
    html.append(fragment);
    return html.innerHTML;
  };
}
