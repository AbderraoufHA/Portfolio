/**
 * Admin-only Markdown preview.
 *
 * The public site renders Markdown at build time with `sanitize-html`. The admin uses
 * marked + DOMPurify so the writer sees the same allow-list without pulling the
 * Node-oriented sanitizer into the browser bundle. Both paths must stay in sync — if a
 * tag is added to `src/lib/markdown.ts`, add it here too.
 */
import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'del',
  's',
  'code',
  'pre',
  'blockquote',
  'hr',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'span',
  'sup',
  'sub',
  'kbd',
  'mark',
];

const ALLOWED_ATTR = [
  'href',
  'title',
  'rel',
  'target',
  'src',
  'alt',
  'width',
  'height',
  'loading',
  'decoding',
  'class',
  'align',
];

let hooked = false;

function ensureHook(): void {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (!href || href.startsWith('javascript:')) {
        node.removeAttribute('href');
        return;
      }
      if (/^https?:\/\//i.test(href)) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy');
      node.setAttribute('decoding', 'async');
    }
  });
}

export function renderPreview(markdown: string): string {
  ensureHook();
  const raw = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['style'],
  });
}

export function wordCount(markdown: string): number {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~-]/g, ' ');
  return plain.split(/\s+/).filter(Boolean).length;
}

export function readingMinutes(markdown: string): number {
  return Math.max(1, Math.round(wordCount(markdown) / 220));
}
