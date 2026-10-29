import {
  offsetOf,
  startTagEnd,
  type PlayableSourceLocation,
} from "./playable-text-edit.js";

/**
 * Where a moved element sits, as a CSS `translate` from where its layout puts
 * it, in hundredths of the screen: `x` in cqw and `y` in cqh. The Project
 * Style makes each Node's root a size container, so the offset holds at any
 * screen size.
 */
export interface PlayableTranslate {
  x: number;
  y: number;
}

/** Visual transform values written separately from the element's layout. */
export interface PlayableTransform {
  scale: number;
  rotation: number;
  originX?: number;
  originY?: number;
}

export function interactionTimingEditsAreUnchanged(
  current: readonly { delaySeconds: number; endSeconds?: number }[],
  next: readonly { delaySeconds: number; endSeconds?: number }[],
): boolean {
  return (
    current.length === next.length &&
    current.every(
      (selection, index) =>
        selection.delaySeconds === next[index]?.delaySeconds &&
        selection.endSeconds === next[index]?.endSeconds,
    )
  );
}

/** Returns the uniform scale change implied by dragging a corner around a fixed center. */
export function playableCenteredScaleFactor(
  center: { x: number; y: number },
  start: { x: number; y: number },
  current: { x: number; y: number },
): number {
  const startX = start.x - center.x;
  const startY = start.y - center.y;
  const currentX = current.x - center.x;
  const currentY = current.y - center.y;
  const distanceSquared = startX * startX + startY * startY;
  if (!distanceSquared) return 1;
  return Math.max(
    0.05,
    (currentX * startX + currentY * startY) / distanceSquared,
  );
}

/** Adjusts transform-origin so the rendered center stays at its target point. */
export function playableTransformOriginCorrection(
  origin: { x: number; y: number },
  size: { width: number; height: number },
  scale: { x: number; y: number },
  rotation: number,
  transform: { a: number; b: number; c: number; d: number },
  centerDelta: { x: number; y: number },
): { x: number; y: number } {
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const a =
    cosine * scale.x * transform.a - sine * scale.y * transform.b;
  const b =
    sine * scale.x * transform.a + cosine * scale.y * transform.b;
  const c =
    cosine * scale.x * transform.c - sine * scale.y * transform.d;
  const d =
    sine * scale.x * transform.c + cosine * scale.y * transform.d;
  const xx = 1 - a;
  const xy = -c;
  const yx = -b;
  const yy = 1 - d;
  const determinant = xx * yy - xy * yx;
  if (
    !size.width ||
    !size.height ||
    !Number.isFinite(determinant) ||
    Math.abs(determinant) < 0.0001
  )
    return origin;

  const originDeltaX =
    (centerDelta.x * yy - xy * centerDelta.y) / determinant;
  const originDeltaY =
    (xx * centerDelta.y - centerDelta.x * yx) / determinant;
  return {
    x: origin.x + (originDeltaX / size.width) * 100,
    y: origin.y + (originDeltaY / size.height) * 100,
  };
}

/** `translate: 3.5cqw -2cqh`, or undefined for no offset. */
export function playableTranslateValue(
  translate: PlayableTranslate,
): string | undefined {
  const x = roundOffset(translate.x);
  const y = roundOffset(translate.y);
  if (!x && !y) return undefined;
  return `${x ? `${x}cqw` : "0"} ${y ? `${y}cqh` : "0"}`;
}

/** Rounds to hundredths of a cqw or cqh, which is finer than a pixel at any screen size. */
export function roundOffset(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Reads an inline `translate` back as an offset, converting pixels with the
 * screen `size`. Undefined when it holds anything else, such as a percentage
 * of the element or a z offset, which a move cannot keep.
 */
export function parsePlayableTranslate(
  value: string,
  size: { width: number; height: number },
): PlayableTranslate | undefined {
  const text = value.trim();
  if (!text || text === "none") return { x: 0, y: 0 };
  const [first, second, ...rest] = text.match(/calc\([^)]*\)|\S+/gi) ?? [];
  if (rest.length) return undefined;
  const x = readOffset(first!, "cqw", size.width);
  const y = second === undefined ? 0 : readOffset(second, "cqh", size.height);
  return x === undefined || y === undefined ? undefined : { x, y };
}

export function parsePlayableScale(value: string): number {
  const number = Number.parseFloat(value.trim());
  return Number.isFinite(number) && number > 0 ? number : 1;
}

export function parsePlayableRotation(value: string): number {
  const text = value.trim().toLowerCase();
  if (!text || text === "none") return 0;
  const match = /^(-?(?:\d+\.?\d*|\.\d+))deg$/.exec(text);
  if (!match) return 0;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : 0;
}

export function roundScale(value: number): number {
  const rounded = Math.round(Math.max(0.05, Math.min(20, value)) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function roundRotation(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function readOffset(
  token: string,
  unit: "cqw" | "cqh",
  length: number,
): number | undefined {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(cqw|cqh|px)?$/.exec(token);
  if (match) {
    const number = Number(match[1]);
    if (!match[2]) return number === 0 ? 0 : undefined;
    if (match[2] === unit) return number;
    if (match[2] === "px" && length > 0) return (number / length) * 100;
    return undefined;
  }

  const calc = /^calc\(\s*(-?(?:\d+\.?\d*|\.\d+))(cqw|cqh|px)?\s*([+-])\s*(-?(?:\d+\.?\d*|\.\d+))(cqw|cqh|px)?\s*\)$/i.exec(token);
  if (!calc) return undefined;
  const first = readOffset(`${calc[1]}${calc[2] ?? ""}`, unit, length);
  const second = readOffset(`${calc[4]}${calc[5] ?? ""}`, unit, length);
  if (first === undefined || second === undefined) return undefined;
  return first + (calc[3] === "+" ? second : -second);
}

/**
 * Sets the `translate` declaration in the `style` attribute of the element
 * whose start tag is at `location` in surface HTML, and keeps its other
 * declarations. No offset removes the declaration, and the attribute when
 * nothing else is left. The tag must still be a `tag` element, so a stale
 * preview never moves another element. Returns undefined when the edit
 * cannot be made in place.
 */
export function setPlayableElementTranslate(
  html: string,
  location: Pick<PlayableSourceLocation, "line" | "column">,
  tag: string,
  translate: PlayableTranslate,
): string | undefined {
  const start = offsetOf(html, location.line, location.column);
  if (start === undefined || html[start] !== "<") return undefined;
  const name = /^<([A-Za-z][\w-]*)/.exec(html.slice(start))?.[1];
  if (!name || name.toLowerCase() !== tag.toLowerCase()) return undefined;
  const end = startTagEnd(html, start);
  if (end === undefined) return undefined;
  const style = findStyleAttribute(html, start + 1 + name.length, end);
  const declarations = (style?.value ?? "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(
      (declaration) =>
        declaration &&
        declaration.split(":")[0]!.trim().toLowerCase() !== "translate",
    );
  const value = playableTranslateValue(translate);
  if (value) declarations.push(`translate: ${value}`);
  const text = declarations.join("; ");
  if (style) {
    // Without declarations the attribute goes, with the space before it.
    if (!text)
      return `${html.slice(0, style.spaceStart)}${html.slice(style.end)}`;
    const quote = style.quote ?? '"';
    return `${html.slice(0, style.start)}style=${quote}${text}${quote}${html.slice(style.end)}`;
  }
  if (!text) return html;
  const afterName = start + 1 + name.length;
  return `${html.slice(0, afterName)} style="${text}"${html.slice(afterName)}`;
}

/** Sets one inline style declaration on the element at a source location. */
export function setPlayableElementStyle(
  html: string,
  location: Pick<PlayableSourceLocation, "line" | "column">,
  tag: string,
  property:
    | "font-family"
    | "font-size"
    | "background"
    | "border"
    | "border-radius"
    | "width"
    | "height"
    | "min-width"
    | "min-height"
    | "padding"
    | "aspect-ratio"
    | "color"
    | "--delay"
    | "--putenggame-appear-at"
    | "--putenggame-disappear-at"
    | "scale"
    | "rotate"
    | "transform-origin",
  value: string | undefined,
): string | undefined {
  const start = offsetOf(html, location.line, location.column);
  if (start === undefined || html[start] !== "<") return undefined;
  const name = /^<([A-Za-z][\w-]*)/.exec(html.slice(start))?.[1];
  if (!name || name.toLowerCase() !== tag.toLowerCase()) return undefined;
  const end = startTagEnd(html, start);
  if (end === undefined) return undefined;
  const style = findStyleAttribute(html, start + 1 + name.length, end);
  const declarations = (style?.value ?? "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(
      (declaration) =>
        declaration &&
        declaration.split(":")[0]!.trim().toLowerCase() !== property,
    );
  if (value !== undefined) declarations.push(`${property}: ${value}`);
  const text = declarations.join("; ");
  if (style) {
    if (!text)
      return `${html.slice(0, style.spaceStart)}${html.slice(style.end)}`;
    const quote = style.quote ?? '"';
    return `${html.slice(0, style.start)}style=${quote}${text}${quote}${html.slice(style.end)}`;
  }
  const afterName = start + 1 + name.length;
  return `${html.slice(0, afterName)} style="${text}"${html.slice(afterName)}`;
}

/** Sets the element's visual scale and rotation while preserving other styles. */
export function setPlayableElementTransform(
  html: string,
  location: Pick<PlayableSourceLocation, "line" | "column">,
  tag: string,
  transform: PlayableTransform,
): string | undefined {
  if (!Number.isFinite(transform.scale) || transform.scale <= 0)
    return undefined;
  if (!Number.isFinite(transform.rotation)) return undefined;
  const scaled = setPlayableElementStyle(
    html,
    location,
    tag,
    "scale",
    String(roundScale(transform.scale)),
  );
  if (scaled === undefined) return undefined;
  const centered = setPlayableElementStyle(
    scaled,
    location,
    tag,
    "transform-origin",
    `${roundOffset(transform.originX ?? 50)}% ${roundOffset(transform.originY ?? 50)}% !important`,
  );
  return centered === undefined
    ? undefined
    : setPlayableElementStyle(
        centered,
        location,
        tag,
        "rotate",
        `${roundRotation(transform.rotation)}deg`,
      );
}

/** Applies the existing entrance animation and its delay to an element. */
export function setPlayableElementDelay(
  html: string,
  location: Pick<PlayableSourceLocation, "line" | "column">,
  tag: string,
  delaySeconds: number,
): string | undefined {
  if (!Number.isFinite(delaySeconds) || delaySeconds < 0 || delaySeconds > 3600)
    return undefined;
  const withRise = addPlayableElementClass(html, location, tag, "rise");
  if (withRise === undefined) return undefined;
  return setPlayableElementStyle(
    withRise,
    location,
    tag,
    "--delay",
    `${roundDelay(delaySeconds)}s`,
  );
}

/** Persists the visible interval for a non-video overlay, in video seconds. */
export function setPlayableElementTiming(
  html: string,
  location: Pick<PlayableSourceLocation, "line" | "column">,
  tag: string,
  appearAtSeconds: number,
  disappearAtSeconds?: number,
): string | undefined {
  const roundedAppearAt = roundDelay(appearAtSeconds);
  const roundedDisappearAt =
    disappearAtSeconds === undefined
      ? undefined
      : roundDelay(disappearAtSeconds);
  if (
    !Number.isFinite(appearAtSeconds) ||
    appearAtSeconds < 0 ||
    appearAtSeconds > 3600 ||
    (disappearAtSeconds !== undefined &&
      (!Number.isFinite(disappearAtSeconds) ||
        disappearAtSeconds > 3600 ||
        roundedDisappearAt! <= roundedAppearAt))
  )
    return undefined;

  const delayed = setPlayableElementDelay(html, location, tag, appearAtSeconds);
  if (delayed === undefined) return undefined;
  const withAppearance = setPlayableElementStyle(
    delayed,
    location,
    tag,
    "--putenggame-appear-at",
    `${roundedAppearAt}s`,
  );
  return withAppearance === undefined
    ? undefined
    : setPlayableElementStyle(
        withAppearance,
        location,
        tag,
        "--putenggame-disappear-at",
        roundedDisappearAt === undefined ? undefined : `${roundedDisappearAt}s`,
      );
}

function addPlayableElementClass(
  html: string,
  location: Pick<PlayableSourceLocation, "line" | "column">,
  tag: string,
  className: string,
): string | undefined {
  const start = offsetOf(html, location.line, location.column);
  if (start === undefined || html[start] !== "<") return undefined;
  const name = /^<([A-Za-z][\w-]*)/.exec(html.slice(start))?.[1];
  if (!name || name.toLowerCase() !== tag.toLowerCase()) return undefined;
  const end = startTagEnd(html, start);
  if (end === undefined) return undefined;
  const source = html.slice(start, end);
  const match = /\bclass\s*=\s*(["'])(.*?)\1/i.exec(source);
  if (match) {
    const classes = match[2]!.split(/\s+/).filter(Boolean);
    if (classes.includes(className)) return html;
    const valueStart = start + match.index + match[0].indexOf(match[1]!) + 1;
    const valueEnd = valueStart + match[2]!.length;
    return `${html.slice(0, valueStart)}${[...classes, className].join(" ")}${html.slice(valueEnd)}`;
  }
  const afterName = start + 1 + name.length;
  return `${html.slice(0, afterName)} class="${className}"${html.slice(afterName)}`;
}

function roundDelay(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export interface StyleAttribute {
  /** Where the whitespace before the attribute starts. */
  spaceStart: number;
  /** Where the attribute name starts. */
  start: number;
  /** Just past the attribute, after its closing quote. */
  end: number;
  value: string;
  quote?: '"' | "'";
}

/** Scans the attributes of a start tag between `from` and its end for `style`. */
export function findStyleAttribute(
  html: string,
  from: number,
  end: number,
): StyleAttribute | undefined {
  let index = from;
  while (index < end) {
    const spaceStart = index;
    while (index < end && /[\s/]/.test(html[index]!)) index += 1;
    if (index >= end || html[index] === ">") return undefined;
    const start = index;
    while (index < end && !/[\s=/>]/.test(html[index]!)) index += 1;
    const name = html.slice(start, index).toLowerCase();
    const nameEnd = index;
    while (index < end && /\s/.test(html[index]!)) index += 1;
    if (html[index] !== "=") {
      if (name === "style")
        return { spaceStart, start, end: nameEnd, value: "" };
      continue;
    }
    index += 1;
    while (index < end && /\s/.test(html[index]!)) index += 1;
    const quote =
      html[index] === '"' || html[index] === "'"
        ? (html[index] as '"' | "'")
        : undefined;
    let valueStart: number;
    let valueEnd: number;
    if (quote) {
      valueStart = index + 1;
      valueEnd = html.indexOf(quote, valueStart);
      if (valueEnd < 0 || valueEnd >= end) return undefined;
      index = valueEnd + 1;
    } else {
      valueStart = index;
      while (index < end && !/[\s>]/.test(html[index]!)) index += 1;
      valueEnd = index;
    }
    if (name === "style") {
      return {
        spaceStart,
        start,
        end: index,
        value: html.slice(valueStart, valueEnd),
        ...(quote ? { quote } : {}),
      };
    }
  }
  return undefined;
}
