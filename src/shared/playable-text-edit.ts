import { annotatePlayableSourceLocations } from "./playable-source-locations.js";

/** A `<file>:<line>:<column>` source location from a preview build. */
export interface PlayableSourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface PlayableElementCopySource {
  location: Pick<PlayableSourceLocation, "line" | "column">;
  tag: string;
  html: string;
  ids: string[];
}

export interface InsertedPlayableElementCopies {
  html: string;
  sources: Record<string, string>;
}

export function parsePlayableSourceLocation(
  value: string,
): PlayableSourceLocation | undefined {
  const match = /^(.+):(\d+):(\d+)$/.exec(value);
  if (!match) return undefined;
  const line = Number(match[2]);
  const column = Number(match[3]);
  if (line < 1 || column < 1) return undefined;
  return { file: match[1]!, line, column };
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Replaces the text of the element whose start tag is at `location` in
 * surface HTML. `before` is the element's original direct text, not text in
 * child elements. Nested markup is preserved, and stale or script-generated
 * text is never overwritten.
 */
export function replacePlayableElementText(
  html: string,
  location: Pick<PlayableSourceLocation, "line" | "column">,
  before: string,
  after: string,
): string | undefined {
  const start = offsetOf(html, location.line, location.column);
  if (start === undefined || html[start] !== "<") return undefined;
  const tag = /^<([A-Za-z][\w-]*)/.exec(html.slice(start))?.[1];
  if (!tag) return undefined;
  const open = startTagEnd(html, start);
  if (open === undefined || html[open - 2] === "/") return undefined;
  const range = elementRange(html, start, tag);
  if (!range) return undefined;
  const close = html.lastIndexOf("<", range.end - 1);
  if (
    close < open ||
    !new RegExp(`^<\\/\\s*${escapeRegExp(tag)}\\s*>$`, "i").test(
      html.slice(close, range.end),
    )
  )
    return undefined;
  const contents = directTextRanges(html, open, close);
  const sourceText = contents
    .map(({ start: textStart, end }) => decode(html.slice(textStart, end)))
    .join("");
  const opening = html.slice(start, open);
  const buttonLike =
    tag.toLowerCase() === "button" ||
    /\brole\s*=\s*(?:"button"|'button'|button)(?:\s|>)/i.test(opening);
  if (!contents.length && buttonLike && !before.trim()) {
    return after.trim()
      ? `${html.slice(0, close)}${escapeText(after.trim())}${html.slice(close)}`
      : html;
  }
  if (!contents.length || normalize(sourceText) !== normalize(before)) {
    if (!buttonLike) return undefined;
    const textRanges = descendantTextRanges(html, open, close);
    const nestedText = textRanges.find(
      ({ start: textStart, end }) =>
        normalize(decode(html.slice(textStart, end))) === normalize(before),
    ) ?? (() => {
      const visibleTextRanges = textRanges.filter(
        ({ start: textStart, end }) =>
          normalize(decode(html.slice(textStart, end))) !== "",
      );
      return visibleTextRanges.length === 1
        ? visibleTextRanges[0]
        : undefined;
    })();
    if (!nestedText) return undefined;
    const value = html.slice(nestedText.start, nestedText.end);
    const leading = /^\s*/.exec(value)![0];
    const trailing = /\s*$/.exec(value.slice(leading.length))![0];
    return `${html.slice(0, nestedText.start)}${leading}${escapeText(after.trim())}${trailing}${html.slice(nestedText.end)}`;
  }
  const first = contents[0]!;
  const last = contents.at(-1)!;
  const leading = /^\s*/.exec(html.slice(first.start, first.end))![0];
  const trailing = /\s*$/.exec(html.slice(last.start, last.end))![0];
  let next = html;
  for (let index = contents.length - 1; index >= 0; index -= 1) {
    const content = contents[index]!;
    const replacement =
      index === 0
        ? `${leading}${escapeText(after.trim())}${trailing}`
        : "";
    next = `${next.slice(0, content.start)}${replacement}${next.slice(content.end)}`;
  }
  return next;
}

function directTextRanges(
  html: string,
  start: number,
  end: number,
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let cursor = start;
  let depth = 0;
  while (cursor < end) {
    const open = html.indexOf("<", cursor);
    if (open < 0 || open >= end) {
      if (depth === 0 && cursor < end) ranges.push({ start: cursor, end });
      break;
    }
    if (depth === 0 && cursor < open) ranges.push({ start: cursor, end: open });
    if (html.startsWith("<!--", open)) {
      const commentEnd = html.indexOf("-->", open + 4);
      if (commentEnd < 0 || commentEnd >= end) return [];
      cursor = commentEnd + 3;
      continue;
    }
    const tokenEnd = startTagEnd(html, open);
    if (tokenEnd === undefined || tokenEnd > end) return [];
    const token = html.slice(open, tokenEnd);
    if (/^<\//.test(token)) {
      depth = Math.max(0, depth - 1);
    } else if (!/^<!/.test(token) && !/\/\s*>$/.test(token)) {
      const name = /^<([A-Za-z][\w-]*)/.exec(token)?.[1] ?? "";
      if (!isVoidElement(name)) depth += 1;
    }
    cursor = tokenEnd;
  }
  return ranges;
}

/** Inserts a positioned text element into the surface's first root element. */
export function insertPlayableText(
  html: string,
  edit: { id: string; text: string; x: number; y: number },
): { html: string; line: number; column: number } | undefined {
  if (
    !/^putenggame-text-[\w-]+$/.test(edit.id) ||
    html.includes(edit.id) ||
    !edit.text.trim() ||
    !Number.isFinite(edit.x) ||
    !Number.isFinite(edit.y) ||
    edit.x < 0 ||
    edit.x > 100 ||
    edit.y < 0 ||
    edit.y > 100
  )
    return undefined;
  const opening = /<([A-Za-z][\w-]*)\b[^>]*>/i.exec(html);
  if (!opening) return undefined;
  const tag = opening[1]!;
  const closingPattern = new RegExp(`<\\/\\s*${tag}\\s*>`, "gi");
  let closing: RegExpExecArray | null;
  let lastClosing: RegExpExecArray | null = null;
  while ((closing = closingPattern.exec(html))) lastClosing = closing;
  if (!lastClosing) return undefined;
  const offset = lastClosing.index;
  const element = `<p id="${edit.id}" style="position:absolute;left:${roundPosition(edit.x)}cqw;top:${roundPosition(edit.y)}cqh;margin:0">${escapeText(edit.text.trim())}</p>`;
  const next = `${html.slice(0, offset)}${element}${html.slice(offset)}`;
  const line = html.slice(0, offset).split("\n").length;
  const lineStart = html.lastIndexOf("\n", offset - 1) + 1;
  return { html: next, line, column: offset - lineStart + 1 };
}

/** Inserts copied surface elements beside their originals and returns fresh source locations. */
export function insertPlayableElementCopies(
  html: string,
  file: string,
  copies: readonly PlayableElementCopySource[],
): InsertedPlayableElementCopies | undefined {
  if (
    !copies.length ||
    copies.length > 32 ||
    copies.some(
      (copy) =>
        !copy.ids.length ||
        copy.ids.length > 512 ||
        copy.html.length > 256 * 1024 ||
        copy.ids.some((id) => !/^putenggame-copy-[\w-]+$/.test(id)),
    )
  )
    return undefined;

  const allIds = copies.flatMap((copy) => copy.ids);
  if (
    new Set(allIds).size !== allIds.length ||
    allIds.some((id) => html.includes(id))
  )
    return undefined;

  let next = html;
  const ordered = copies.map((copy) => ({
    copy,
    start: offsetOf(html, copy.location.line, copy.location.column),
  }));
  if (ordered.some((item) => item.start === undefined)) return undefined;
  ordered.sort((left, right) => right.start! - left.start!);
  for (const item of ordered) {
    const start = offsetOf(
      next,
      item.copy.location.line,
      item.copy.location.column,
    );
    if (start === undefined) return undefined;
    const range = elementRange(next, start, item.copy.tag);
    const firstTag = /^<([A-Za-z][\w-]*)\b/.exec(item.copy.html)?.[1];
    if (!range || firstTag?.toLowerCase() !== item.copy.tag.toLowerCase())
      return undefined;
    const fragment = item.copy.html.replace(
      /\sdata-putenggame-source\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
      "",
    );
    next = `${next.slice(0, range.end)}${fragment}${next.slice(range.end)}`;
  }

  const annotated = annotatePlayableSourceLocations(next, file);
  const sources: Record<string, string> = {};
  for (const id of allIds) {
    const marker = `id="${id}"`;
    const idOffset = annotated.indexOf(marker);
    if (
      idOffset < 0 ||
      annotated.indexOf(marker, idOffset + marker.length) >= 0
    )
      return undefined;
    const start = annotated.lastIndexOf("<", idOffset);
    const end = startTagEnd(annotated, start);
    if (start < 0 || end === undefined) return undefined;
    const source = /\sdata-putenggame-source="([^"]+)"/i.exec(
      annotated.slice(start, end),
    )?.[1];
    if (!source) return undefined;
    sources[id] = source;
  }
  return { html: next, sources };
}

/** Removes the element at a source location, including its paired contents. */
export function removePlayableElement(
  html: string,
  location: Pick<PlayableSourceLocation, "line" | "column">,
  tag: string,
): string | undefined {
  const start = offsetOf(html, location.line, location.column);
  const range =
    start === undefined ? undefined : elementRange(html, start, tag);
  return range ? `${html.slice(0, start!)}${html.slice(range.end)}` : undefined;
}

/** Removes one selected text node inside a source-backed element. */
export function removePlayableTextPart(
  html: string,
  location: Pick<PlayableSourceLocation, "line" | "column">,
  tag: string,
  text: string,
  sourceText = text,
): string | undefined {
  const start = offsetOf(html, location.line, location.column);
  if (start === undefined || !sourceText.trim()) return undefined;

  const candidates: { start: number; end: number }[] = [];
  const sourceTag = /^<([A-Za-z][\w-]*)/.exec(html.slice(start))?.[1];
  const sourceRange = sourceTag ? elementRange(html, start, sourceTag) : undefined;
  if (!sourceRange) return undefined;
  const searchEnd = sourceRange.end;
  let cursor = start;
  while (cursor < searchEnd) {
    const opening = html.indexOf("<", cursor);
    if (opening < 0 || opening >= searchEnd) break;
    const name = /^<([A-Za-z][\w-]*)/.exec(html.slice(opening))?.[1];
    if (name?.toLowerCase() === tag.toLowerCase()) {
      const range = elementRange(html, opening, tag);
      const open = startTagEnd(html, opening);
      if (range && open !== undefined && !/\/\s*>$/.test(html.slice(opening, open))) {
        const close = html.lastIndexOf("<", range.end - 1);
        for (const part of descendantTextRanges(html, open, close)) {
          if (
            normalize(decode(html.slice(part.start, part.end))) ===
            normalize(sourceText)
          )
            candidates.push(part);
        }
      }
    }
    const tokenEnd = startTagEnd(html, opening);
    if (tokenEnd === undefined) break;
    cursor = tokenEnd;
  }
  if (candidates.length !== 1) return undefined;
  const selected = candidates[0]!;
  const value = html.slice(selected.start, selected.end);
  const leading = /^\s*/.exec(value)![0];
  const trailing = /\s*$/.exec(value.slice(leading.length))![0];
  return `${html.slice(0, selected.start)}${leading}${trailing}${html.slice(selected.end)}`;
}

function elementRange(
  html: string,
  start: number,
  tag: string,
): { end: number } | undefined {
  if (html[start] !== "<") return undefined;
  const name = /^<([A-Za-z][\w-]*)/.exec(html.slice(start))?.[1];
  if (!name || name.toLowerCase() !== tag.toLowerCase()) return undefined;
  const open = startTagEnd(html, start);
  if (open === undefined) return undefined;
  const opening = html.slice(start, open);
  if (isVoidElement(name) || /\/\s*>$/.test(opening)) return { end: open };

  let depth = 1;
  let cursor = open;
  while (cursor < html.length) {
    const next = html.indexOf("<", cursor);
    if (next < 0) return undefined;
    if (html.startsWith("<!--", next)) {
      const endComment = html.indexOf("-->", next + 4);
      if (endComment < 0) return undefined;
      cursor = endComment + 3;
      continue;
    }
    const end = startTagEnd(html, next);
    if (end === undefined) return undefined;
    const token = html.slice(next, end);
    const close = new RegExp(`^<\\/\\s*${escapeRegExp(name)}\\s*>$`, "i").test(
      token,
    );
    if (close) {
      depth -= 1;
      if (!depth) return { end };
    } else if (
      new RegExp(`^<${escapeRegExp(name)}(?:\\s|>)`, "i").test(token) &&
      !/\/\s*>$/.test(token)
    ) {
      depth += 1;
    }
    cursor = end;
  }
  return undefined;
}

function descendantTextRanges(
  html: string,
  start: number,
  end: number,
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let cursor = start;
  while (cursor < end) {
    const open = html.indexOf("<", cursor);
    if (open < 0 || open >= end) {
      if (cursor < end) ranges.push({ start: cursor, end });
      break;
    }
    if (cursor < open) ranges.push({ start: cursor, end: open });
    if (html.startsWith("<!--", open)) {
      const commentEnd = html.indexOf("-->", open + 4);
      if (commentEnd < 0 || commentEnd >= end) return [];
      cursor = commentEnd + 3;
      continue;
    }
    const tokenEnd = startTagEnd(html, open);
    if (tokenEnd === undefined || tokenEnd > end) return [];
    cursor = tokenEnd;
  }
  return ranges;
}

/** The offset of a 1-based line and column in `html`, or undefined past its end. */
export function offsetOf(
  html: string,
  line: number,
  column: number,
): number | undefined {
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    const next = html.indexOf("\n", offset);
    if (next < 0) return undefined;
    offset = next + 1;
  }
  const result = offset + column - 1;
  return result < html.length ? result : undefined;
}

/** The offset just after a start tag's `>`, skipping quoted attribute values. */
export function startTagEnd(html: string, start: number): number | undefined {
  let quote: string | undefined;
  for (let index = start + 1; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index + 1;
    }
  }
  return undefined;
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag.toLowerCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decode(text: string): string {
  return text.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (entity, name: string) => {
      if (name[0] === "#") {
        const code =
          name[1] === "x" || name[1] === "X"
            ? parseInt(name.slice(2), 16)
            : Number(name.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
      }
      return ENTITIES[name.toLowerCase()] ?? entity;
    },
  );
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function escapeText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function roundPosition(value: number): number {
  return Math.round(value * 100) / 100;
}
