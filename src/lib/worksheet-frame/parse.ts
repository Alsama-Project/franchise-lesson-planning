// The frame processing pipeline — parse ONCE, scope ONCE.
//
// An uploaded (or built-in default) frame is a COMPLETE HTML document: <!DOCTYPE>,
// <head>, an external font <link>, an `@page` rule, bare `*`/`html`/`body`/`a`
// selectors and a <style> block. That is what a design tool produces. This module
// turns it into something safe to render inside the pane, WITHOUT pushing a fragment
// contract back onto the uploader:
//
//   1. Parse the document; keep the <style> contents and the <body> contents.
//   2. Scope the CSS to a single root container the pane owns (FRAME_ROOT_SELECTOR):
//        · html / body / :root      → the root container
//        · *                        → descendants of the root container
//        · every other selector     → prefixed with the root container
//        · @media (print) blocks    → preserved, their inner rules scoped the same way
//        · @page                    → HOISTED verbatim (document-level, replaces the
//                                     app's default while a frame is active)
//   3. Strip active content: <script>/<iframe>/<object>, on…= handlers, javascript:
//      URLs, external <link>/@import, @font-face (fonts come from the app).
//   4. Map the design's font families onto the app's self-hosted faces, so an Arabic
//      page never depends on a font <link> we just stripped (teachers work on
//      unreliable connections — a fontless Arabic page is unusable).
//
// The result ({ bodyHtml, css }) is cached per frame by the caller; this transform is
// the load-bearing part of the branch and does not run on every render.
//
// NOT client-safe by intent: it pulls in postcss + node-html-parser. Only the SERVER
// (load-plan / resolve) and the unit tests import it; the client receives the parsed
// { bodyHtml, css } and never sees these dependencies. `renderWorksheetFrame` (the
// pure string substitution both renderers share) stays in `frame.ts`, client-safe.

import { parse as parseHtml, type HTMLElement } from 'node-html-parser';
import postcss, { type ChildNode, type Rule } from 'postcss';
import { FRAME_ROOT_SELECTOR, type ParsedFrame } from './frame';

/** Elements that execute code or embed external content — removed wholesale. Upload
 *  validation already REJECTS a frame carrying these (see validateFrameHtml); the
 *  strip here is the defence-in-depth backstop for the render path and the built-in
 *  defaults, so a bad frame can never reach the DOM even if validation is bypassed. */
const ACTIVE_TAGS = ['script', 'iframe', 'object'];

/** Split a selector list on TOP-LEVEL commas only (never inside `:is(a, b)` etc.). */
function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of selector) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Rewrite one complex selector to live under the root container. `html`/`body`/
 *  `:root` become the container itself; `*` its descendants; a leading `html`/`body`
 *  token is replaced by the container; everything else is prefixed with it. */
function scopeOnePart(part: string, root: string): string {
  if (part === 'html' || part === 'body' || part === ':root') return root;
  if (part === '*') return `${root} *`;
  // A leading `html `/`body ` descendant (e.g. `html:lang(ar) body`, `body .x`): drop
  // the document-root token and anchor the remainder under the container.
  const lead = part.match(/^(html|body)(\b[^\s]*)?(\s+)(.*)$/);
  if (lead) return `${root} ${lead[4]}`;
  // A compound on html/body (e.g. `body.rtl`): fuse onto the container.
  const compound = part.match(/^(html|body)([.:#\[].*)$/);
  if (compound) return `${root}${compound[2]}`;
  return `${root} ${part}`;
}

function scopeSelector(selector: string, root: string): string {
  const scoped = splitSelectorList(selector).map((p) => scopeOnePart(p, root));
  // Dedupe (e.g. `html, body` both collapse to the root) while keeping order.
  return [...new Set(scoped)].join(', ');
}

/** Scope every style rule under a container, in place. Recurses into @media/@supports;
 *  hoists @page out (collected by the caller); drops @import/@font-face. Returns the
 *  hoisted @page rules as strings. */
function scopeRules(nodes: ChildNode[], root: string, hoisted: string[]): void {
  for (const node of [...nodes]) {
    if (node.type === 'rule') {
      (node as Rule).selector = scopeSelector((node as Rule).selector, root);
    } else if (node.type === 'atrule') {
      const name = node.name.toLowerCase().replace(/^-\w+-/, '');
      if (name === 'page') {
        hoisted.push(node.toString());
        node.remove();
      } else if (name === 'import' || name === 'font-face') {
        // External fonts / stylesheets come from the app, never the frame.
        node.remove();
      } else if (name === 'media' || name === 'supports') {
        // Preserve the at-rule; scope the rules inside it the same way.
        if ('nodes' in node && node.nodes) scopeRules(node.nodes as ChildNode[], root, hoisted);
      }
      // @keyframes and other at-rules carry no scopable selectors — left as-is.
    }
  }
}

/** Map the design's font families onto the app's self-hosted faces (Sora +
 *  IBM Plex Sans Arabic), so a stripped font <link> never leaves an Arabic page
 *  fontless. Runs on the final CSS string so it also reaches `@page` margin boxes. */
function mapFontFamilies(css: string): string {
  return css
    .replace(/["']?Noto Sans Arabic["']?/g, 'var(--font-ibm-plex-arabic)')
    .replace(/["']?\bSora\b["']?/g, 'var(--font-sora)');
}

/** Scope a frame's raw CSS to the root container and hoist its `@page`. */
function scopeCss(rawCss: string, root: string): string {
  const ast = postcss.parse(rawCss);
  const hoisted: string[] = [];
  scopeRules(ast.nodes as ChildNode[], root, hoisted);
  const scoped = ast.toString();
  // @page hoisted AFTER the scoped rules so, injected in document order after the
  // app's stylesheet, its page size/margins win while a frame is active.
  return mapFontFamilies([scoped, ...hoisted].filter((s) => s.trim()).join('\n'));
}

/** Remove active content from a parsed body: script/iframe/object elements, external
 *  <link> and <style> (style is extracted separately), `on…=` handlers, `javascript:`
 *  URLs. Mutates in place. */
function scrubBody(body: HTMLElement): void {
  for (const el of body.querySelectorAll([...ACTIVE_TAGS, 'link', 'style'].join(','))) {
    el.remove();
  }
  for (const el of body.querySelectorAll('*')) {
    for (const attr of Object.keys(el.attributes)) {
      const value = el.getAttribute(attr) ?? '';
      if (/^on/i.test(attr) || /javascript:/i.test(value)) el.removeAttribute(attr);
    }
  }
}

/**
 * Parse and scope a complete frame document into the shared { bodyHtml, css }
 * representation. Assumes the HTML has passed {@link validateFrameHtml} (marker
 * present, no active content); the strip here is defence-in-depth, not a substitute
 * for that rejection.
 */
export function parseFrame(html: string): ParsedFrame {
  const doc = parseHtml(html, { comment: false });

  // Concatenate every <style> block (head + body) as the frame's CSS.
  const rawCss = doc
    .querySelectorAll('style')
    .map((s) => s.textContent)
    .join('\n');

  const htmlEl = doc.querySelector('html');
  const body = doc.querySelector('body');
  const bodyEl = body ?? doc; // a fragment with no <body> → treat the whole thing as body
  scrubBody(bodyEl);

  // Direction/lang live on <html> (or <body>) and would be lost when the body is
  // extracted — carry them to the root container so an Arabic frame stays RTL and its
  // Arabic font rule (`:lang(ar)`) still fires.
  const dir = body?.getAttribute('dir') ?? htmlEl?.getAttribute('dir') ?? undefined;
  const lang = htmlEl?.getAttribute('lang') ?? body?.getAttribute('lang') ?? undefined;

  return {
    bodyHtml: bodyEl.innerHTML.trim(),
    css: scopeCss(rawCss, FRAME_ROOT_SELECTOR),
    ...(dir ? { dir } : {}),
    ...(lang ? { lang } : {}),
  };
}

// ── Per-frame cache ─────────────────────────────────────────────────────────────
// The transform is not cheap (two parsers); a frame's HTML is stable (a stored row or
// a built-in default string), so parse each distinct frame at most once per process.
const CACHE = new Map<string, ParsedFrame>();

/** Parse a frame, memoised by its exact HTML. */
export function parseFrameCached(html: string): ParsedFrame {
  const hit = CACHE.get(html);
  if (hit) return hit;
  const parsed = parseFrame(html);
  CACHE.set(html, parsed);
  return parsed;
}
