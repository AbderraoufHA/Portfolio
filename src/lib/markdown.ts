import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

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
const ALLOWED_ATTRS = {
  a: ['href', 'title', 'rel', 'target'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
  code: ['class'],
  span: ['class'],
  th: ['align'],
  td: ['align'],
  '*': [],
};

/**
 * Markdown -> sanitized HTML.
 * `marked` renders Markdown, then sanitize-html strips every tag and attribute outside
 * the allow-list (including raw HTML blocks and inline scripts), so content committed
 * to the repo can never inject executable markup into the built site.
 */
export function renderMarkdown(markdown: string): string {
  const raw = marked.parse(markdown, { async: false }) as string;
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? '';
        const external = /^https?:\/\//i.test(href);
        return {
          tagName,
          attribs: {
            ...attribs,
            ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
          },
        };
      },
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, loading: 'lazy', decoding: 'async' },
      }),
    },
    exclusiveFilter: (frame) => frame.tag === 'a' && !frame.attribs.href,
  });
}
