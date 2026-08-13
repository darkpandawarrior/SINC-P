/**
 * Markdown -> HTML, dependency-free.
 *
 * The whole point of this file: a staff account is not a trusted author (the compose
 * form is behind auth, not behind trust), so raw HTML in an announcement or handbook
 * answer must never reach the page. Every character is HTML-escaped FIRST, and every
 * tag this renderer emits is one it built itself from the escaped text — there is no
 * code path where a `<script>` typed into the body survives as a tag. That ordering is
 * the entire security property; it is not a sanitizer bolted on afterwards.
 *
 * Supports the subset that covers a campus announcement or an FAQ answer: headings
 * (# / ## / ###), bold, italic, inline code, links (http/https/relative only — a
 * `javascript:` URI is dropped, not merely flagged), unordered/ordered lists,
 * blockquotes, and paragraphs. No tables, no images, no raw HTML passthrough — none of
 * that has shown up in a 2019 SRS announcement yet, and a real dependency (markdown-it +
 * a sanitizer) is the upgrade the day someone asks for it.
 */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] ?? c)
}

/** Allowlist, not a blocklist — a `javascript:`/`data:` URI simply never matches this
 *  pattern, so there is nothing to specifically detect and reject. */
function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|\/)\S*$/i.test(url)
}

/** Runs on already-escaped text, so every character it starts from is inert. It only
 *  ever wraps that inert text in tags it writes itself. */
function renderInline(escaped: string): string {
  let out = escaped
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const href = isSafeUrl(url) ? url : '#'
    return `<a href="${href}" rel="noopener noreferrer" target="_blank">${label}</a>`
  })
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  return out
}

function renderBlock(rawBlock: string): string {
  const escaped = escapeHtml(rawBlock)
  const lines = escaped.split('\n')

  if (lines.length === 1) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0] ?? '')
    const marker = heading?.[1]
    const content = heading?.[2]
    if (marker !== undefined && content !== undefined) {
      const level = marker.length
      return `<h${level}>${renderInline(content)}</h${level}>`
    }
  }

  if (lines.every((l) => /^[-*]\s+/.test(l))) {
    const items = lines.map((l) => `<li>${renderInline(l.replace(/^[-*]\s+/, ''))}</li>`).join('')
    return `<ul>${items}</ul>`
  }

  if (lines.every((l) => /^\d+\.\s+/.test(l))) {
    const items = lines.map((l) => `<li>${renderInline(l.replace(/^\d+\.\s+/, ''))}</li>`).join('')
    return `<ol>${items}</ol>`
  }

  // '>' becomes '&gt;' by the point we see it here — the escape already ran.
  if (lines.every((l) => l.startsWith('&gt;'))) {
    const inner = lines.map((l) => l.replace(/^&gt;\s?/, '')).join('<br />')
    return `<blockquote><p>${renderInline(inner)}</p></blockquote>`
  }

  return `<p>${renderInline(lines.join('<br />'))}</p>`
}

export function renderMarkdown(raw: string): string {
  const src = raw.replace(/\r\n/g, '\n').trim()
  if (!src) return ''
  return src
    .split(/\n{2,}/)
    .map(renderBlock)
    .join('\n')
}
