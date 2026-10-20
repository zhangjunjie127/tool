import { offsetOf, startTagEnd } from "./playable-text-edit.js";
import { annotatePlayableSourceLocations } from "./playable-source-locations.js";
import type { PlayableSourceLocation } from "./playable-text-edit.js";
import type { PlayableNodeContext } from "./playable-nodes.js";

export type PlayableMotionKind =
  | "countdown"
  | "progress-ring"
  | "progress-bar"
  | "hold-charge"
  | "swipe-button"
  | "button-feedback";
export type PlayableButtonAction = "new-game" | "continue" | "story-map";

export type PlayableMotionMode = "interactive" | "visual";
export type PlayableNoInputMode = "continue" | "wait";
export type PlayableSwipeBehavior = "one-way" | "two-way";
export type PlayableMotionInteraction =
  | "click"
  | "quick-click"
  | "double-click"
  | "multi-click"
  | "swipe-left"
  | "swipe-right"
  | "swipe-up"
  | "swipe-down"
  | "swipe-any"
  | "hold";

export interface PlayableMotionConfig {
  kind: PlayableMotionKind;
  mode: PlayableMotionMode;
  duration: number;
  buttonShape?: "rectangle" | "circle";
  interaction?: PlayableMotionInteraction;
  requiredCount?: number;
  timeoutDuration?: number;
  signal?: string;
  timeoutSignal?: string;
  ringAssetId?: string;
  ringAssetScale?: number;
  barAssetId?: string;
  barAssetScale?: number;
  barAssetOffsetX?: number;
  barAssetOffsetY?: number;
  swipeAssetId?: string;
  swipeStyle?: "base" | "floating";
  swipeBehavior?: PlayableSwipeBehavior;
  ringFill?: "deplete" | "reveal";
  ringRotation?: "clockwise" | "counterclockwise" | "none";
  feedback?: "hover-press" | "bounce-hover-press" | "ripple-hint" | "none";
}

export const PLAYABLE_MOTION_ATTRIBUTES = {
  kind: "data-putenggame-motion",
  mode: "data-putenggame-motion-mode",
  duration: "data-putenggame-motion-duration",
  timeoutDuration: "data-putenggame-motion-timeout-duration",
  signal: "data-putenggame-motion-signal",
  timeoutSignal: "data-putenggame-motion-timeout",
  interaction: "data-putenggame-motion-interaction",
  requiredCount: "data-putenggame-motion-required-count",
  ringAsset: "data-putenggame-motion-ring-asset",
  ringAssetScale: "data-putenggame-motion-ring-asset-scale",
  barAsset: "data-putenggame-motion-bar-asset",
  barAssetScale: "data-putenggame-motion-bar-asset-scale",
  barAssetOffsetX: "data-putenggame-motion-bar-asset-x",
  barAssetOffsetY: "data-putenggame-motion-bar-asset-y",
  swipeAsset: "data-putenggame-motion-swipe-asset",
  swipeStyle: "data-putenggame-motion-swipe-style",
  swipeBehavior: "data-putenggame-motion-swipe-behavior",
  ringFill: "data-putenggame-motion-ring-fill",
  ringRotation: "data-putenggame-motion-ring-rotation",
  feedback: "data-putenggame-motion-feedback",
  buttonShape: "data-putenggame-button-shape",
  continueWithoutInput: "data-putenggame-continue-without-input",
  noInputMode: "data-putenggame-no-input-mode",
  asset: "data-putenggame-button-asset",
  pressedAsset: "data-putenggame-button-pressed-asset",
  assetScale: "data-putenggame-button-asset-scale",
  assetScaleX: "data-putenggame-button-asset-scale-x",
  assetScaleY: "data-putenggame-button-asset-scale-y",
  labelTranslate: "data-putenggame-button-label-translate",
  buttonAction: "data-putenggame-button-action",
} as const;

const PLAYABLE_MOTION_PAUSE_EVENT = "putenggame:motion-pause";
const PLAYABLE_MOTION_RESUME_EVENT = "putenggame:motion-resume";
const PLAYABLE_MULTI_CLICK_GAP_MS = 600;

export const PLAYABLE_BUTTON_PRESET_STYLE = {
  border: "1px solid rgba(226, 242, 255, .9)",
  borderRadius: "6px",
  background:
    "linear-gradient(135deg, rgba(52, 85, 106, .96), rgba(24, 42, 61, .96))",
  color: "#fff",
  font: "inherit",
  cursor: "pointer",
} as const;

export function setPlayableContinueWithoutInput(
  html: string,
  enabled: boolean,
): string | undefined {
  const root = /<[a-z][\w-]*\b[^>]*>/i.exec(html);
  if (!root) return undefined;
  const attribute = PLAYABLE_MOTION_ATTRIBUTES.continueWithoutInput;
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(
    `\\s${escaped}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`,
    "i",
  );
  let opening = root[0].replace(expression, "");
  if (enabled) {
    const close = opening.endsWith("/>") ? "/>" : ">";
    opening = `${opening.slice(0, -close.length).trimEnd()} ${attribute}="true"${close}`;
  }
  return `${html.slice(0, root.index)}${opening}${html.slice(root.index + root[0].length)}`;
}

export function playableContinueWithoutInput(html: string): boolean {
  const root = /<[a-z][\w-]*\b[^>]*>/i.exec(html)?.[0];
  if (!root) return false;
  const attribute = PLAYABLE_MOTION_ATTRIBUTES.continueWithoutInput;
  const match = new RegExp(
    `\\s${attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(?:"true"|'true'|true)(?:\\s|\\/?>)`,
    "i",
  ).exec(root);
  return Boolean(match);
}

export function playableNoInputMode(
  html: string,
): PlayableNoInputMode | undefined {
  const root = /<[a-z][\w-]*\b[^>]*>/i.exec(html)?.[0];
  if (!root) return undefined;
  const attribute = PLAYABLE_MOTION_ATTRIBUTES.noInputMode;
  const match = new RegExp(
    `\\s${attribute}\\s*=\\s*(?:"(continue|wait)"|'(continue|wait)'|(continue|wait))(?=\\s|\\/?>)`,
    "i",
  ).exec(root);
  const explicit = (match?.[1] ?? match?.[2] ?? match?.[3])?.toLowerCase();
  if (explicit === "continue" || explicit === "wait") return explicit;
  return playableContinueWithoutInput(html) ? "continue" : undefined;
}

export function setPlayableNoInputMode(
  html: string,
  mode: PlayableNoInputMode | undefined,
): string | undefined {
  const root = /<[a-z][\w-]*\b[^>]*>/i.exec(html);
  if (!root) return undefined;
  const attributes = [
    PLAYABLE_MOTION_ATTRIBUTES.noInputMode,
    PLAYABLE_MOTION_ATTRIBUTES.continueWithoutInput,
  ];
  let opening = root[0];
  for (const attribute of attributes) {
    const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    opening = opening.replace(
      new RegExp(`\\s${escaped}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`, "i"),
      "",
    );
  }
  if (mode) {
    const close = opening.endsWith("/>") ? "/>" : ">";
    const value = mode === "continue"
      ? ` ${PLAYABLE_MOTION_ATTRIBUTES.continueWithoutInput}="true" ${PLAYABLE_MOTION_ATTRIBUTES.noInputMode}="continue"`
      : ` ${PLAYABLE_MOTION_ATTRIBUTES.noInputMode}="wait"`;
    opening = `${opening.slice(0, -close.length).trimEnd()}${value}${close}`;
  }
  return `${html.slice(0, root.index)}${opening}${html.slice(root.index + root[0].length)}`;
}

export const PLAYABLE_BUTTON_ASSET_SCALE_MIN = 10;
export const PLAYABLE_BUTTON_ASSET_SCALE_MAX = 500;

const MOTION_KINDS = new Set<PlayableMotionKind>([
  "countdown",
  "progress-ring",
  "progress-bar",
  "hold-charge",
  "swipe-button",
  "button-feedback",
]);
const MOTION_INTERACTIONS = new Set<PlayableMotionInteraction>([
  "click",
  "quick-click",
  "double-click",
  "multi-click",
  "swipe-left",
  "swipe-right",
  "swipe-up",
  "swipe-down",
  "swipe-any",
  "hold",
]);

export function parsePlayableMotionConfig(
  element: Pick<HTMLElement, "getAttribute">,
): PlayableMotionConfig | undefined {
  const kind = element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.kind);
  const mode = element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.mode);
  const duration = Number(
    element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.duration),
  );
  const timeoutDuration = Number(
    element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.timeoutDuration),
  );
  if (
    !MOTION_KINDS.has(kind as PlayableMotionKind) ||
    (mode !== "interactive" && mode !== "visual") ||
    !Number.isFinite(duration) ||
    duration < 0.1 ||
    duration > 3600
  )
    return undefined;
  const signal =
    element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.signal) || undefined;
  const timeoutSignal =
    element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.timeoutSignal) || undefined;
  const interaction = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.interaction,
  ) as PlayableMotionInteraction | null;
  const requiredCountValue = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.requiredCount,
  );
  const requiredCount =
    requiredCountValue === null ? undefined : Number(requiredCountValue);
  const ringFill = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.ringFill,
  );
  const ringRotation = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.ringRotation,
  );
  const feedback = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.feedback,
  );
  const buttonShape = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.buttonShape,
  );
  const ringAssetId = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.ringAsset,
  );
  const ringAssetScaleValue = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.ringAssetScale,
  );
  const ringAssetScale =
    ringAssetScaleValue === null ? undefined : Number(ringAssetScaleValue);
  const barAssetId = element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.barAsset);
  const barAssetScaleValue = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.barAssetScale,
  );
  const barAssetScale =
    barAssetScaleValue === null ? undefined : Number(barAssetScaleValue);
  const barAssetOffsetXValue = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.barAssetOffsetX,
  );
  const barAssetOffsetX =
    barAssetOffsetXValue === null ? undefined : Number(barAssetOffsetXValue);
  const barAssetOffsetYValue = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.barAssetOffsetY,
  );
  const barAssetOffsetY =
    barAssetOffsetYValue === null ? undefined : Number(barAssetOffsetYValue);
  const swipeAssetId = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.swipeAsset,
  );
  const swipeStyle = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.swipeStyle,
  );
  const swipeBehavior = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.swipeBehavior,
  );
  if (
    (interaction !== null && !MOTION_INTERACTIONS.has(interaction)) ||
    (requiredCountValue !== null &&
      (!Number.isInteger(requiredCount) ||
        requiredCount! < 2 ||
        requiredCount! > 20)) ||
    (ringFill !== null && ringFill !== "deplete" && ringFill !== "reveal") ||
    (ringRotation !== null &&
      ringRotation !== "clockwise" &&
      ringRotation !== "counterclockwise" &&
      ringRotation !== "none") ||
    (feedback !== null &&
      feedback !== "hover-press" &&
      feedback !== "bounce-hover-press" &&
      feedback !== "ripple-hint" &&
      feedback !== "none") ||
    (buttonShape !== null &&
      buttonShape !== "rectangle" &&
      buttonShape !== "circle") ||
    (kind === "button-feedback" &&
      feedback !== "hover-press" &&
      feedback !== "bounce-hover-press" &&
      feedback !== "ripple-hint") ||
    (ringAssetId !== null && !/^[a-z0-9._-]{1,120}$/i.test(ringAssetId)) ||
    (ringAssetScaleValue !== null &&
      (!Number.isInteger(ringAssetScale) ||
        ringAssetScale! < 25 ||
        ringAssetScale! > 300)) ||
    (barAssetId !== null && !/^[a-z0-9._-]{1,120}$/i.test(barAssetId)) ||
    (barAssetScaleValue !== null &&
      (!Number.isInteger(barAssetScale) ||
        barAssetScale! < 25 ||
        barAssetScale! > 300)) ||
    (barAssetOffsetXValue !== null &&
      (!Number.isInteger(barAssetOffsetX) ||
        barAssetOffsetX! < -100 ||
        barAssetOffsetX! > 100)) ||
    (barAssetOffsetYValue !== null &&
      (!Number.isInteger(barAssetOffsetY) ||
        barAssetOffsetY! < -100 ||
        barAssetOffsetY! > 100)) ||
    (swipeAssetId !== null &&
      !/^[a-z0-9._-]{1,120}$/i.test(swipeAssetId)) ||
    (swipeStyle !== null &&
      swipeStyle !== "base" &&
      swipeStyle !== "floating") ||
    (swipeBehavior !== null &&
      swipeBehavior !== "one-way" &&
      swipeBehavior !== "two-way")
  )
    return undefined;
  return {
    kind: kind as PlayableMotionKind,
    mode,
    duration,
    ...(interaction ? { interaction } : {}),
    ...(requiredCount === undefined ? {} : { requiredCount }),
    ...(Number.isFinite(timeoutDuration) && timeoutDuration >= duration
      ? { timeoutDuration }
      : {}),
    ...(signal ? { signal } : {}),
    ...(timeoutSignal ? { timeoutSignal } : {}),
    ...(ringAssetId ? { ringAssetId } : {}),
    ...(ringAssetScale === undefined ? {} : { ringAssetScale }),
    ...(barAssetId ? { barAssetId } : {}),
    ...(barAssetScale === undefined ? {} : { barAssetScale }),
    ...(barAssetOffsetX === undefined ? {} : { barAssetOffsetX }),
    ...(barAssetOffsetY === undefined ? {} : { barAssetOffsetY }),
    ...(swipeAssetId ? { swipeAssetId } : {}),
    ...(swipeStyle
      ? { swipeStyle: swipeStyle as "base" | "floating" }
      : {}),
    ...(swipeBehavior
      ? { swipeBehavior: swipeBehavior as PlayableSwipeBehavior }
      : {}),
    ...(ringFill ? { ringFill: ringFill as "deplete" | "reveal" } : {}),
    ...(ringRotation
      ? {
          ringRotation: ringRotation as
            | "clockwise"
            | "counterclockwise"
            | "none",
        }
      : {}),
    ...(feedback
      ? {
          feedback: feedback as
            | "hover-press"
            | "bounce-hover-press"
            | "ripple-hint"
            | "none",
        }
      : {}),
    ...(buttonShape
      ? { buttonShape: buttonShape as "rectangle" | "circle" }
      : {}),
  };
}

export function playableButtonAssetScale(value: string | null): number {
  const scale = value === null ? 100 : Number(value);
  return Number.isFinite(scale) &&
    scale >= PLAYABLE_BUTTON_ASSET_SCALE_MIN &&
    scale <= PLAYABLE_BUTTON_ASSET_SCALE_MAX
    ? Math.round(scale)
    : 100;
}

export function playableButtonAssetScales(
  element: Pick<HTMLElement, "getAttribute">,
): { x: number; y: number } {
  const legacy = element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.assetScale);
  return {
    x:
      element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.assetScaleX) === null
        ? playableButtonAssetScale(legacy)
        : playableButtonAssetScale(
            element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.assetScaleX),
          ),
    y:
      element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.assetScaleY) === null
        ? playableButtonAssetScale(legacy)
        : playableButtonAssetScale(
            element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.assetScaleY),
          ),
  };
}

export function playableElementTransformScale(
  element: Pick<HTMLElement, "getAttribute">,
  value: string,
): number {
  const scale = Number.parseFloat(value.trim());
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  if (!element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.asset)) return scale;
  return scale / (playableButtonAssetScales(element).x / 100);
}

export function playableElementRuntimeScale(
  element: Pick<HTMLElement, "getAttribute">,
  scale: number,
): string {
  if (!element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.asset))
    return String(scale);
  const assetScale = playableButtonAssetScales(element);
  return formatScaleAxes(
    scale * (assetScale.x / 100),
    scale * (assetScale.y / 100),
  );
}

function parseScaleAxes(value: string): [number, number] {
  if (!value.trim() || value.trim() === "none") return [1, 1];
  const [x, y = x] = value.trim().split(/\s+/).map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : [1, 1];
}

function formatScaleAxes(x: number, y: number): string {
  return `${Number(x.toFixed(4))} ${Number(y.toFixed(4))}`;
}

export function setPlayableElementAttributes(
  html: string,
  location: Pick<PlayableSourceLocation, "line" | "column">,
  tag: string,
  updates: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const start = offsetOf(html, location.line, location.column);
  if (start === undefined || html[start] !== "<") return undefined;
  const name = /^<([A-Za-z][\w-]*)/.exec(html.slice(start))?.[1];
  if (!name || name.toLowerCase() !== tag.toLowerCase()) return undefined;
  const end = startTagEnd(html, start);
  if (end === undefined) return undefined;

  let next = html.slice(start, end);
  for (const [attribute, value] of Object.entries(updates)) {
    if (!/^data-[a-z0-9-]+$/.test(attribute)) return undefined;
    const escapedName = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(
      `\\s${escapedName}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`,
      "i",
    );
    const existing = expression.exec(next);
    if (existing)
      next = `${next.slice(0, existing.index)}${next.slice(existing.index + existing[0].length)}`;
    if (value !== undefined) {
      const insertAt = /\/\s*>$/.test(next)
        ? next.lastIndexOf("/")
        : next.length - 1;
      next = `${next.slice(0, insertAt)} ${attribute}="${escapeAttribute(value)}"${next.slice(insertAt)}`;
    }
  }
  return `${html.slice(0, start)}${next}${html.slice(end)}`;
}

function playableTagEnd(html: string, from: number): number | undefined {
  let quote: string | undefined;
  for (let index = from; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index + 1;
    }
  }
  return undefined;
}

export function removePlayableSignalAttributes(
  html: string,
  signalIds: ReadonlySet<string>,
): string {
  if (!signalIds.size) return html;

  let output = "";
  let copied = 0;
  let index = 0;
  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open === -1) break;
    if (html.startsWith("<!--", open)) {
      const end = html.indexOf("-->", open + 4);
      index = end === -1 ? html.length : end + 3;
      continue;
    }
    if (/^<\/|^<!|^<\?/.test(html.slice(open, open + 3))) {
      const end = playableTagEnd(html, open);
      index = end ?? html.length;
      continue;
    }
    if (!/[A-Za-z]/.test(html[open + 1] ?? "")) {
      index = open + 1;
      continue;
    }

    const end = playableTagEnd(html, open);
    if (end === undefined) break;
    const tag = html.slice(open, end);
    const withoutSignal = tag.replace(
      /\s(data-signal|data-putenggame-motion-signal|data-putenggame-motion-timeout)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/gi,
      (attribute, _name: string, double: string, single: string, bare: string) =>
        signalIds.has(double ?? single ?? bare) ? "" : attribute,
    );
    if (withoutSignal !== tag) {
      output += html.slice(copied, open) + withoutSignal;
      copied = end;
    }
    index = end;
    const tagName = /^<[A-Za-z][\w-]*/.exec(tag)?.[0].slice(1).toLowerCase();
    if (
      tagName === "script" ||
      tagName === "style" ||
      tagName === "textarea" ||
      tagName === "title"
    ) {
      const close = html.toLowerCase().indexOf(`</${tagName}`, index);
      index = close === -1 ? html.length : close;
    }
  }
  return copied ? output + html.slice(copied) : html;
}

export function insertPlayableMediaElement(
  html: string,
  file: string,
  assetId: string,
  type: "image" | "video",
  id: string,
  loop = true,
): { html: string; source: string } | undefined {
  if (
    !/^[a-z0-9._-]{1,120}$/i.test(assetId) ||
    !/^putenggame-media-[\w-]+$/.test(id) ||
    html.includes(id)
  )
    return undefined;
  const root = /<([A-Za-z][\w-]*)\b[^>]*>/i.exec(html);
  if (!root) return undefined;
  const closingPattern = new RegExp(`<\\/\\s*${root[1]}\\s*>`, "gi");
  let closing: RegExpExecArray | null;
  let lastClosing: RegExpExecArray | null = null;
  while ((closing = closingPattern.exec(html))) lastClosing = closing;
  if (!lastClosing) return undefined;
  const style =
    "position:absolute;left:35cqw;top:30cqh;width:30cqw;max-height:60cqh;object-fit:contain";
  const element =
    type === "image"
      ? `<img id="${id}" data-putenggame-asset="${escapeAttribute(assetId)}" alt="" draggable="false" style="${style}">`
      : `<video id="${id}" data-putenggame-asset="${escapeAttribute(assetId)}" autoplay muted${loop ? " loop" : ""} playsinline style="${style}"></video>`;
  const offset = lastClosing.index;
  const updated = `${html.slice(0, offset)}${element}${html.slice(offset)}`;
  const annotated = annotatePlayableSourceLocations(updated, file);
  const marker = `id="${id}"`;
  const assetOffset = annotated.indexOf(marker);
  const start = annotated.lastIndexOf("<", assetOffset);
  const end = startTagEnd(annotated, start);
  if (assetOffset < 0 || start < 0 || end === undefined) return undefined;
  const source = /\sdata-putenggame-source="([^"]+)"/i.exec(
    annotated.slice(start, end),
  )?.[1];
  return source ? { html: updated, source } : undefined;
}

export function insertPlayableButtonPreset(
  html: string,
  file: string,
  id: string,
  signal: string | undefined,
  label: string,
  config?: PlayableMotionConfig,
  assetId?: string,
  pressedAssetId?: string,
  buttonText = label,
  fontFamily?: string,
  buttonAction?: PlayableButtonAction,
): { html: string; source: string } | undefined {
  const isRippleHint = config?.feedback === "ripple-hint";
  if (
    !/^putenggame-button-[\w-]+$/.test(id) ||
    html.includes(id) ||
    (signal !== undefined && !/^[a-z][a-z0-9-]*$/.test(signal)) ||
    !label.trim() ||
    label.length > 120 ||
    (!buttonText.trim() && !isRippleHint) ||
    buttonText.length > 120 ||
    (fontFamily !== undefined &&
      (!fontFamily.trim() || fontFamily.length > 120))
  )
    return undefined;
  const root = /<([A-Za-z][\w-]*)\b[^>]*>/i.exec(html);
  if (!root) return undefined;
  const closingPattern = new RegExp(`<\\/\\s*${root[1]}\\s*>`, "gi");
  let closing: RegExpExecArray | null;
  let lastClosing: RegExpExecArray | null = null;
  while ((closing = closingPattern.exec(html))) lastClosing = closing;
  if (!lastClosing) return undefined;
  const buttonShape =
    config?.buttonShape ??
    (config?.kind === "progress-ring" ||
    config?.kind === "swipe-button" ||
    config?.feedback === "bounce-hover-press"
      ? "circle"
      : "rectangle");
  const shape =
    isRippleHint
      ? "width:2.2cqw;height:2.2cqw;min-width:0;min-height:0;padding:0;border-radius:50%;aspect-ratio:1;"
      : buttonShape === "circle"
      ? "width:5em;height:5em;min-width:0;min-height:0;padding:0;border-radius:50%;aspect-ratio:1;"
      : `min-width:14cqw;padding:1cqh 2cqw;border-radius:${PLAYABLE_BUTTON_PRESET_STYLE.borderRadius};`;
  const presetStyle = isRippleHint
    ? "border:0.14cqw solid rgba(226,242,255,.9);background:rgba(255,255,255,.14);color:rgba(255,255,255,.9);"
    : `border:${PLAYABLE_BUTTON_PRESET_STYLE.border};background:${PLAYABLE_BUTTON_PRESET_STYLE.background};color:${PLAYABLE_BUTTON_PRESET_STYLE.color};`;
  const safeFontFamily = fontFamily?.replace(/[;"']/g, "").trim();
  const actionAttribute = buttonAction
    ? ` ${PLAYABLE_MOTION_ATTRIBUTES.buttonAction}="${buttonAction}"`
    : "";
  const element = `<button id="${id}" type="button" aria-label="${escapeAttribute(buttonText.trim() || label)}"${signal ? ` data-signal="${signal}"` : ""} data-putenggame-button-preset${actionAttribute}${assetId ? ` ${PLAYABLE_MOTION_ATTRIBUTES.asset}="${escapeAttribute(assetId)}"` : ""}${pressedAssetId ? ` ${PLAYABLE_MOTION_ATTRIBUTES.pressedAsset}="${escapeAttribute(pressedAssetId)}"` : ""}${config ? ` ${motionAttributes(config)}` : ""} style="position:absolute;left:50cqw;top:50cqh;transform:translate(-50%,-50%);${shape}${presetStyle}font:inherit;${safeFontFamily ? `font-family:${escapeAttribute(safeFontFamily)};` : ""}cursor:pointer">${escapeAttribute(buttonText)}</button>`;
  const offset = lastClosing.index;
  const updated = `${html.slice(0, offset)}${element}${html.slice(offset)}`;
  const annotated = annotatePlayableSourceLocations(updated, file);
  const idOffset = annotated.indexOf(`id="${id}"`);
  const start = annotated.lastIndexOf("<", idOffset);
  const end = startTagEnd(annotated, start);
  if (idOffset < 0 || start < 0 || end === undefined) return undefined;
  const source = /\sdata-putenggame-source="([^"]+)"/i.exec(
    annotated.slice(start, end),
  )?.[1];
  return source ? { html: updated, source } : undefined;
}

export function mountPlayableMotionElement(
  element: HTMLElement,
  context: PlayableNodeContext,
  assetUrl?: string,
  pressedAssetUrl?: string,
  ringAssetUrl?: string,
  barAssetUrl?: string,
  _swipeAssetUrl?: string,
): () => void {
  const cleanups: (() => void)[] = [];
  const config = parsePlayableMotionConfig(element);
  if (config?.buttonShape && config.feedback !== "ripple-hint") {
    Object.assign(
      element.style,
      config.buttonShape === "circle"
        ? {
            width: "5em",
            height: "5em",
            minWidth: "0",
            minHeight: "0",
            padding: "0",
            borderRadius: "50%",
            aspectRatio: "1",
          }
        : {
            width: "",
            height: "",
            minWidth: "14cqw",
            minHeight: "",
            padding: "1cqh 2cqw",
            borderRadius: PLAYABLE_BUTTON_PRESET_STYLE.borderRadius,
            aspectRatio: "",
          },
    );
  }
  const assetId = element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.asset);
  const pressedAssetId = element.getAttribute(
    PLAYABLE_MOTION_ATTRIBUTES.pressedAsset,
  );
  if (assetId || pressedAssetId) {
    try {
      cleanups.push(
        mountPlayableButtonAsset(
          element,
          assetId ? (assetUrl ?? context.assets.url(assetId)) : undefined,
          pressedAssetUrl ??
            (pressedAssetId ? context.assets.url(pressedAssetId) : undefined),
          config?.feedback === "hover-press" ||
            config?.feedback === "bounce-hover-press",
        ),
      );
    } catch {
      // An undeclared button asset should not prevent the scene from mounting.
    }
  }
  if (config) {
    if (
      config.feedback === "hover-press" ||
      config.feedback === "bounce-hover-press"
    )
      cleanups.push(
        mountPlayableFeedback(
          element,
          config.feedback === "bounce-hover-press",
        ),
      );
    if (
      config.kind === "button-feedback" &&
      config.feedback === "bounce-hover-press" &&
      config.interaction === "multi-click"
    )
      cleanups.push(mountPlayableMultiClick(element, config, context));
    if (config.feedback === "ripple-hint")
      cleanups.push(mountPlayableRippleHint(element));
    if (config.kind !== "button-feedback")
      cleanups.push(
        mountMotion(
          element,
          config,
          context,
          ringAssetUrl,
          barAssetUrl,
        ),
      );
  }
  return () => cleanups.reverse().forEach((cleanup) => cleanup());
}

function mountPlayableRippleHint(element: HTMLElement): () => void {
  const previousPosition = element.style.position;
  if (element.ownerDocument.defaultView?.getComputedStyle(element).position === "static")
    element.style.position = "relative";

  const animations: Animation[] = [];
  for (let index = 0; index < 2; index += 1) {
    const ring = element.ownerDocument.createElement("span");
    ring.dataset.putenggameRippleHint = "";
    Object.assign(ring.style, {
      position: "absolute",
      inset: "-0.14cqw",
      boxSizing: "border-box",
      border: "0.14cqw solid currentColor",
      borderRadius: "50%",
      pointerEvents: "none",
      zIndex: "1",
    });
    element.append(ring);
    animations.push(
      ring.animate(
        [
          { opacity: 0.8, transform: "scale(1)" },
          { opacity: 0, transform: "scale(2.4)" },
        ],
        {
          duration: 1800,
          iterations: Infinity,
          easing: "ease-out",
          delay: index * 900,
        },
      ),
    );
  }
  return () => {
    animations.forEach((animation) => animation.cancel());
    element.querySelectorAll("[data-putenggame-ripple-hint]").forEach((ring) => ring.remove());
    element.style.position = previousPosition;
  };
}

function mountPlayableButtonAsset(
  element: HTMLElement,
  assetUrl?: string,
  pressedAssetUrl?: string,
  hasMotionFeedback = false,
): () => void {
  const view = element.ownerDocument.defaultView;
  const previous = {
    background: element.style.background,
    backgroundColor: element.style.backgroundColor,
    border: element.style.border,
    backgroundImage: element.style.backgroundImage,
    isolation: element.style.isolation,
    position: element.style.position,
    scale: element.style.scale,
    transition: element.style.transition,
  };
  if (pressedAssetUrl) {
    if (view?.getComputedStyle(element).position === "static")
      element.style.position = "relative";
    element.style.isolation = "isolate";
  }
  const layer = assetUrl
    ? element.ownerDocument.createElement("span")
    : undefined;
  if (layer) {
    layer.dataset.putenggameButtonAssetImage = "";
    Object.assign(layer.style, {
      position: "absolute",
      inset: "0",
      zIndex: "-1",
      overflow: "hidden",
      borderRadius: "inherit",
      pointerEvents: "none",
      ...(pressedAssetUrl ? { visibility: "visible" } : {}),
    });
  }
  const image = assetUrl
    ? element.ownerDocument.createElement("img")
    : undefined;
  if (image) {
    image.src = assetUrl!;
    image.alt = "";
    image.draggable = false;
  }
  const { x, y } = playableButtonAssetScales(element);
  const [authoredScaleX, authoredScaleY] = parseScaleAxes(previous.scale);
  const baseScale = assetUrl
    ? formatScaleAxes(
        authoredScaleX * (x / 100),
        authoredScaleY * (y / 100),
      )
    : previous.scale;
  if (image) {
    Object.assign(image.style, {
      display: "block",
      width: "100%",
      height: "100%",
      objectFit: "contain",
    });
    layer?.append(image);
  }
  let pressedLayer: HTMLSpanElement | undefined;
  if (pressedAssetUrl) {
    pressedLayer = element.ownerDocument.createElement("span");
    pressedLayer.dataset.putenggameButtonPressedImage = "";
    Object.assign(pressedLayer.style, {
      position: "absolute",
      inset: "0",
      zIndex: "-1",
      overflow: "hidden",
      borderRadius: "inherit",
      pointerEvents: "none",
      visibility: "hidden",
    });
    const pressedImage = element.ownerDocument.createElement("img");
    pressedImage.src = pressedAssetUrl;
    pressedImage.alt = "";
    pressedImage.draggable = false;
    Object.assign(pressedImage.style, {
      display: "block",
      width: "100%",
      height: "100%",
      objectFit: "contain",
    });
    pressedLayer.append(pressedImage);
    element.append(pressedLayer);
  }
  let hovered = false;
  let pointerHeld = false;
  let keyboardHeld = false;
  let scaleHeld = false;
  let scaleBeforePress = "";
  const updatePressedState = () => {
    if (!pressedLayer) return;
    const showPressed = hovered || pointerHeld || keyboardHeld;
    pressedLayer.style.visibility = showPressed ? "visible" : "hidden";
    if (layer) layer.style.visibility = showPressed ? "hidden" : "visible";
    else
      element.style.backgroundImage = showPressed
        ? "none"
        : previous.backgroundImage;
    const shouldScale =
      !hasMotionFeedback && (pointerHeld || keyboardHeld);
    if (shouldScale && !scaleHeld) {
      scaleBeforePress = element.style.scale;
      const [scaleX, scaleY] = parseScaleAxes(scaleBeforePress);
      element.style.scale = formatScaleAxes(scaleX * 1.08, scaleY * 1.08);
    } else if (!shouldScale && scaleHeld) {
      element.style.scale = scaleBeforePress;
    }
    scaleHeld = shouldScale;
  };
  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    hovered = true;
    updatePressedState();
  };
  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    hovered = false;
    updatePressedState();
  };
  const onPointerDown = () => {
    pointerHeld = true;
    updatePressedState();
  };
  const onPointerUp = () => {
    pointerHeld = false;
    updatePressedState();
  };
  const onBlur = () => {
    hovered = false;
    pointerHeld = false;
    keyboardHeld = false;
    updatePressedState();
  };
  const onKeyDown = () => {
    keyboardHeld = true;
    updatePressedState();
  };
  const onKeyUp = () => {
    keyboardHeld = false;
    updatePressedState();
  };
  if (pressedLayer) {
    const existingTransition =
      previous.transition || view?.getComputedStyle(element).transition || "";
    if (existingTransition && !existingTransition.includes("scale"))
      element.style.transition = `${existingTransition}, scale 120ms ease`;
    else if (!existingTransition)
      element.style.transition = "scale 120ms ease";
    element.addEventListener("pointerenter", onPointerEnter);
    element.addEventListener("pointerleave", onPointerLeave);
    element.addEventListener("pointerdown", onPointerDown, true);
    view?.addEventListener("pointerup", onPointerUp, true);
    view?.addEventListener("pointercancel", onPointerUp, true);
    view?.addEventListener("blur", onBlur);
    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("keyup", onKeyUp);
  }
  const label = assetUrl ? wrapButtonLabel(element) : undefined;
  const labelTranslate =
    element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.labelTranslate) ?? "";
  if (label) {
    label.style.scale = `${100 / x} ${100 / y}`;
    label.style.translate = labelTranslate;
  }
  if (layer) element.prepend(layer);
  if (assetUrl) {
    element.style.background = "transparent";
    element.style.border = "0";
    element.style.backgroundImage = "none";
    element.style.isolation = "isolate";
    element.style.scale = baseScale || formatScaleAxes(x / 100, y / 100);
  }
  if (view?.getComputedStyle(element).position === "static")
    element.style.position = "relative";
  return () => {
    layer?.remove();
    pressedLayer?.remove();
    element.removeEventListener("pointerenter", onPointerEnter);
    element.removeEventListener("pointerleave", onPointerLeave);
    element.removeEventListener("pointerdown", onPointerDown, true);
    view?.removeEventListener("pointerup", onPointerUp, true);
    view?.removeEventListener("pointercancel", onPointerUp, true);
    view?.removeEventListener("blur", onBlur);
    element.removeEventListener("keydown", onKeyDown);
    element.removeEventListener("keyup", onKeyUp);
    unwrapButtonLabel(label);
    if (assetUrl || pressedAssetUrl) {
      element.style.background = previous.background;
      element.style.backgroundColor = previous.backgroundColor;
      element.style.border = previous.border;
      element.style.backgroundImage = previous.backgroundImage;
    }
    if (assetUrl) {
      element.style.isolation = previous.isolation;
      element.style.position = previous.position;
      element.style.scale = previous.scale;
    }
    if (pressedAssetUrl) element.style.transition = previous.transition;
    if (pressedAssetUrl && !assetUrl) {
      element.style.position = previous.position;
      element.style.isolation = previous.isolation;
      element.style.scale = previous.scale;
    }
  };
}

function mountPlayableFeedback(
  element: HTMLElement,
  bounce = false,
): () => void {
  const view = element.ownerDocument.defaultView;
  if (!view) return () => {};
  const previousTransform = element.style.transform;
  const previousTransition = element.style.transition;
  const previousTransformOrigin = element.style.transformOrigin;
  const previousTransformOriginPriority =
    element.style.getPropertyPriority("transform-origin");
  const previousShape = bounce
    ? {
        width: element.style.width,
        height: element.style.height,
        minWidth: element.style.minWidth,
        padding: element.style.padding,
        borderRadius: element.style.borderRadius,
        aspectRatio: element.style.aspectRatio,
      }
    : undefined;
  if (bounce) {
    Object.assign(element.style, {
      width: "5em",
      height: "5em",
      minWidth: "0",
      padding: "0",
      borderRadius: "50%",
      aspectRatio: "1",
    });
  }
  const animation = bounce
    ? element.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(1.08)" },
          { transform: "scale(1)" },
        ],
        {
          duration: 850,
          iterations: Infinity,
          easing: "ease-in-out",
          composite: "add",
        },
      )
    : undefined;
  const baseTransform =
    previousTransform || view.getComputedStyle(element).transform;
  let hovered = false;
  let pressed = false;
  let feedbackOrigin:
    | { value: string; priority: string }
    | undefined;
  let feedbackCenter: { x: number; y: number } | undefined;
  const update = () => {
    const factor = pressed ? 0.92 : hovered ? 1.08 : 1;
    if (factor === 1) {
      element.style.transform = previousTransform;
      if (feedbackOrigin) {
        element.style.setProperty(
          "transform-origin",
          feedbackOrigin.value,
          feedbackOrigin.priority,
        );
        feedbackOrigin = undefined;
        feedbackCenter = undefined;
      }
    } else {
      if (!feedbackOrigin) {
        const rect = element.getBoundingClientRect();
        feedbackCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        feedbackOrigin = {
          value: element.style.getPropertyValue("transform-origin"),
          priority: element.style.getPropertyPriority("transform-origin"),
        };
      }
      element.style.setProperty(
        "transform-origin",
        "center center",
        "important",
      );
      const scaledTransform =
        `${baseTransform === "none" ? "" : baseTransform} scale(${factor})`.trim();
      element.style.transform = scaledTransform;
      const rect = element.getBoundingClientRect();
      const offsetX = feedbackCenter!.x - (rect.left + rect.width / 2);
      const offsetY = feedbackCenter!.y - (rect.top + rect.height / 2);
      element.style.transform =
        Math.abs(offsetX) < 0.01 && Math.abs(offsetY) < 0.01
          ? scaledTransform
          : `translate(${offsetX}px, ${offsetY}px) ${scaledTransform}`.trim();
    }
    if (animation) {
      if (hovered || pressed) animation.pause();
      else animation.play();
    }
  };
  const enter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    hovered = true;
    update();
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    hovered = false;
    update();
  };
  const down = () => {
    pressed = true;
    update();
  };
  const up = () => {
    pressed = false;
    update();
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") down();
  };
  const keyUp = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") up();
  };
  const transition =
    previousTransition || view.getComputedStyle(element).transition || "";
  element.style.transition = transition.includes("transform")
    ? transition
    : transition
      ? `${transition}, transform 120ms ease`
      : "transform 120ms ease";
  element.style.transformOrigin = "center center";
  element.addEventListener("pointerenter", enter);
  element.addEventListener("pointerleave", leave);
  element.addEventListener("pointerdown", down, true);
  view.addEventListener("pointerup", up);
  view.addEventListener("pointercancel", up);
  element.addEventListener("keydown", keyDown);
  element.addEventListener("keyup", keyUp);
  return () => {
    element.removeEventListener("pointerenter", enter);
    element.removeEventListener("pointerleave", leave);
    element.removeEventListener("pointerdown", down, true);
    view.removeEventListener("pointerup", up);
    view.removeEventListener("pointercancel", up);
    element.removeEventListener("keydown", keyDown);
    element.removeEventListener("keyup", keyUp);
    element.style.transform = previousTransform;
    element.style.transition = previousTransition;
    element.style.setProperty(
      "transform-origin",
      previousTransformOrigin,
      previousTransformOriginPriority,
    );
    animation?.cancel();
    if (previousShape) Object.assign(element.style, previousShape);
  };
}

function mountPlayableMultiClick(
  element: HTMLElement,
  config: PlayableMotionConfig,
  context: PlayableNodeContext,
): () => void {
  const view = element.ownerDocument.defaultView;
  if (!view) return () => {};
  const requiredCount = config.requiredCount ?? 3;
  const signal = config.signal || element.getAttribute("data-signal") || undefined;
  let clickCount = 0;
  let lastClickAt = Number.NEGATIVE_INFINITY;
  let dispatchingSuccessClick = false;
  const onClick = (event: MouseEvent) => {
    if (dispatchingSuccessClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const now = view.performance.now();
    clickCount =
      now - lastClickAt <= PLAYABLE_MULTI_CLICK_GAP_MS ? clickCount + 1 : 1;
    lastClickAt = now;
    if (clickCount < requiredCount) return;
    clickCount = 0;
    if (!signal) return;
    if (element.getAttribute("data-signal") === signal) {
      dispatchingSuccessClick = true;
      element.dispatchEvent(
        new view.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      dispatchingSuccessClick = false;
    } else if (context.navigation.connected(signal)) {
      void context.navigation.emit(signal).catch(() => {});
    }
  };
  element.addEventListener("click", onClick, true);
  return () => element.removeEventListener("click", onClick, true);
}

function wrapButtonLabel(button: HTMLElement): HTMLSpanElement | undefined {
  const textNodes = Array.from(button.childNodes).filter(
    (child): child is Text =>
      child.nodeType === 3 && Boolean(child.textContent?.trim()),
  );
  const first = textNodes[0];
  if (!first) return undefined;
  const label = button.ownerDocument.createElement("span");
  label.dataset.putenggameButtonLabel = "";
  Object.assign(label.style, {
    display: "inline-block",
    transformOrigin: "center",
    verticalAlign: "inherit",
  });
  first.replaceWith(label);
  for (const node of textNodes) label.append(node);
  return label;
}

function unwrapButtonLabel(label: HTMLSpanElement | undefined): void {
  if (!label) return;
  label.replaceWith(...Array.from(label.childNodes));
}

export function updatePlayableButtonLabelScale(button: HTMLElement): void {
  const label = button.querySelector<HTMLElement>(
    "[data-putenggame-button-label]",
  );
  if (!label) return;
  const { x, y } = playableButtonAssetScales(button);
  label.style.scale = `${100 / x} ${100 / y}`;
}

function mountMotion(
  element: HTMLElement,
  config: PlayableMotionConfig,
  context: PlayableNodeContext,
  ringAssetUrl?: string,
  barAssetUrl?: string,
): () => void {
  if (config.kind === "button-feedback") return () => {};
  const view = element.ownerDocument.defaultView!;
  const computedStyle = view.getComputedStyle(element);
  let resolvedRingAssetUrl = ringAssetUrl;
  if (config.ringAssetId && !resolvedRingAssetUrl) {
    try {
      resolvedRingAssetUrl = context.assets.url(config.ringAssetId);
    } catch {
      // A missing optional ring image falls back to the built-in ring.
    }
  }
  let resolvedBarAssetUrl = barAssetUrl;
  if (config.barAssetId && !resolvedBarAssetUrl) {
    try {
      resolvedBarAssetUrl = context.assets.url(config.barAssetId);
    } catch {
      // A missing optional progress image falls back to the built-in fill.
    }
  }
  const previousPosition = element.style.position;
  const previousCursor = element.style.cursor;
  const previousTouchAction = element.style.touchAction;
  const previousUserSelect = element.style.userSelect;
  const previousRingShape =
    config.kind === "progress-ring"
      ? {
          width: element.style.width,
          height: element.style.height,
          minWidth: element.style.minWidth,
          padding: element.style.padding,
          borderRadius: element.style.borderRadius,
          aspectRatio: element.style.aspectRatio,
        }
      : undefined;
  if (computedStyle.position === "static") element.style.position = "relative";
  if (config.mode === "interactive") element.style.cursor = "pointer";
  if (config.kind === "swipe-button") {
    element.style.touchAction = "none";
    element.style.userSelect = "none";
  }
  if (previousRingShape)
    Object.assign(element.style, {
      width: "5em",
      height: "5em",
      minWidth: "0",
      padding: "0",
      borderRadius: "50%",
      aspectRatio: "1",
    });
  const overlay = element.ownerDocument.createElement("span");
  overlay.dataset.putenggameMotionUi = "";
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    display: "grid",
    placeItems: "center",
    pointerEvents: "none",
    zIndex: "1",
    font: "inherit",
  });
  const fillsFromLeft =
    config.mode === "interactive" &&
    (config.kind === "hold-charge" || config.interaction === "hold");
  const track = element.ownerDocument.createElement("span");
  Object.assign(track.style, {
    position: "relative",
    display: "grid",
    placeItems: "center",
    width:
      config.kind === "progress-ring" && !resolvedRingAssetUrl ? "2.8em" : "100%",
    height:
      config.kind === "progress-ring" && !resolvedRingAssetUrl ? "2.8em" : "100%",
    boxSizing: "border-box",
  });
  overlay.append(track);
  let ring: SVGCircleElement | undefined;
  let ringImage: HTMLImageElement | undefined;
  if (config.kind === "progress-ring") {
    if (resolvedRingAssetUrl) {
      ringImage = element.ownerDocument.createElement("img");
      ringImage.dataset.putenggameMotionRing = "";
      ringImage.src = resolvedRingAssetUrl;
      ringImage.alt = "";
      ringImage.draggable = false;
      Object.assign(ringImage.style, {
        width: "100%",
        height: "100%",
        objectFit: "contain",
        transform: `scale(${(config.ringAssetScale ?? 100) / 100})`,
        transformOrigin: "center",
        maskImage: "conic-gradient(from 0deg, #000 0deg, transparent 0deg)",
        WebkitMaskImage:
          "conic-gradient(from 0deg, #000 0deg, transparent 0deg)",
      });
      track.append(ringImage);
    } else if (!element.hasAttribute(PLAYABLE_MOTION_ATTRIBUTES.asset)) {
    const svg = element.ownerDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    svg.setAttribute("viewBox", "0 0 100 100");
    Object.assign(svg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      transform: "rotate(-90deg)",
    });
    const background = element.ownerDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    background.setAttribute("cx", "50");
    background.setAttribute("cy", "50");
    background.setAttribute("r", "44");
    background.setAttribute("fill", "none");
    background.setAttribute("stroke", "currentColor");
    background.setAttribute("stroke-opacity", "0.24");
    background.setAttribute("stroke-width", "8");
    ring = element.ownerDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    ring.setAttribute("cx", "50");
    ring.setAttribute("cy", "50");
    ring.setAttribute("r", "44");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "currentColor");
    ring.setAttribute("stroke-width", "8");
    ring.setAttribute("stroke-dasharray", String(2 * Math.PI * 44));
    ring.setAttribute("stroke-dashoffset", "0");
    ring.setAttribute("stroke-linecap", "round");
    svg.append(background, ring);
    track.append(svg);
    }
  } else if (config.kind === "swipe-button") {
    const swipeDirection =
      config.interaction === "swipe-right" ||
      config.interaction === "swipe-up" ||
      config.interaction === "swipe-down"
        ? config.interaction
        : "swipe-left";
    const verticalSwipe =
      swipeDirection === "swipe-up" || swipeDirection === "swipe-down";
    const startsAtHighPosition =
      swipeDirection === "swipe-left" || swipeDirection === "swipe-up";
    const twoWaySwipe = config.swipeBehavior === "two-way";
    const floatingSwipe =
      config.swipeStyle === "floating" ||
      (!config.swipeStyle && config.buttonShape === "circle");
    const rail = element.ownerDocument.createElement("span");
    rail.dataset.putenggameSwipeRail = "";
    Object.assign(rail.style, {
      position: "absolute",
      inset: verticalSwipe ? "4% 12%" : "12% 4%",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      borderRadius: "999px",
      background: "color-mix(in srgb, currentColor 12%, transparent)",
      boxSizing: "border-box",
      overflow: "hidden",
      visibility: floatingSwipe ? "hidden" : "visible",
    });
    const thumb = element.ownerDocument.createElement("span");
    thumb.dataset.putenggameSwipeThumb = "";
    Object.assign(thumb.style, {
      position: "absolute",
      left: verticalSwipe
        ? "50%"
        : `${twoWaySwipe ? 50 : startsAtHighPosition ? 88 : 12}%`,
      top: verticalSwipe
        ? `${twoWaySwipe ? 50 : startsAtHighPosition ? 88 : 12}%`
        : "50%",
      width: "22%",
      aspectRatio: "1",
      display: "grid",
      placeItems: "center",
      borderRadius: "50%",
      background: "color-mix(in srgb, currentColor 90%, white)",
      color: "currentColor",
      boxShadow: "0 0.15em 0.45em rgba(0, 0, 0, .28)",
      transform: "translate(-50%, -50%)",
      transition: "left 140ms ease-out, top 140ms ease-out",
      boxSizing: "border-box",
      visibility: floatingSwipe ? "hidden" : "visible",
    });
    rail.append(thumb);
    track.append(rail);
  } else {
    const rail = element.ownerDocument.createElement("span");
    Object.assign(rail.style, {
      position: "absolute",
      left: "8%",
      right: "8%",
      bottom: "0.2em",
      height: "0.18em",
      borderRadius: "999px",
      background: "color-mix(in srgb, currentColor 28%, transparent)",
      overflow: "hidden",
    });
    const fill = element.ownerDocument.createElement("span");
    fill.dataset.putenggameMotionFill = "";
    Object.assign(fill.style, {
      display: "block",
      width: "100%",
      height: "100%",
      background: resolvedBarAssetUrl ? "transparent" : "currentColor",
      transformOrigin: fillsFromLeft ? "left center" : "right center",
      transform: `scaleX(${fillsFromLeft ? 0 : 1})`,
    });
    if (resolvedBarAssetUrl) {
      const image = element.ownerDocument.createElement("img");
      image.dataset.putenggameMotionBar = "";
      image.src = resolvedBarAssetUrl;
      image.alt = "";
      image.draggable = false;
      Object.assign(image.style, {
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "fill",
        transform:
          config.barAssetOffsetX || config.barAssetOffsetY
            ? `translate(${config.barAssetOffsetX ?? 0}%, ${config.barAssetOffsetY ?? 0}%) scale(${(config.barAssetScale ?? 100) / 100})`
            : `scale(${(config.barAssetScale ?? 100) / 100})`,
        transformOrigin: "center",
      });
      fill.append(image);
    }
    rail.append(fill);
    track.append(rail);
    if (config.kind === "countdown") {
      const label = element.ownerDocument.createElement("span");
      label.dataset.putenggameMotionLabel = "";
      label.textContent = String(Math.ceil(config.duration));
      track.append(label);
    }
  }
  element.append(overlay);

  let started = view.performance.now();
  const durationMs = config.duration * 1000;
  const timeoutMs =
    config.mode === "interactive"
      ? (config.timeoutDuration ??
          Math.min(
            3600,
            config.interaction || config.kind === "hold-charge"
              ? config.duration * 2
              : config.duration,
          )) * 1000
      : durationMs;
  let frame = 0;
  let finished = false;
  let pausedAt = element.closest("[data-putenggame-awaiting-input]")
    ? view.performance.now()
    : undefined;
  let holding = false;
  let holdStarted = 0;
  let pointerStart: { x: number; y: number } | undefined;
  let pointerPressedAt: number | undefined;
  let clickCount = 0;
  let dispatchingSuccessClick = false;
  const onPause = (event: Event) => {
    const time = (event as CustomEvent<number>).detail;
    pausedAt ??= Number.isFinite(time) ? time : view.performance.now();
  };
  const onResume = (event: Event) => {
    if (pausedAt === undefined) return;
    const time = (event as CustomEvent<number>).detail;
    const resumedAt = Number.isFinite(time) ? time : view.performance.now();
    const pausedFor = resumedAt - pausedAt;
    started += pausedFor;
    if (holding) holdStarted += pausedFor;
    pausedAt = undefined;
  };
  context.root.addEventListener(PLAYABLE_MOTION_PAUSE_EVENT, onPause, true);
  context.root.addEventListener(PLAYABLE_MOTION_RESUME_EVENT, onResume, true);
  const swipeThumb =
    config.kind === "swipe-button"
      ? track.querySelector<HTMLElement>("[data-putenggame-swipe-thumb]")
      : undefined;
  const swipeRail =
    config.kind === "swipe-button"
      ? track.querySelector<HTMLElement>("[data-putenggame-swipe-rail]")
      : undefined;
  const swipeDirection =
    config.interaction === "swipe-right" ||
    config.interaction === "swipe-up" ||
    config.interaction === "swipe-down"
      ? config.interaction
      : "swipe-left";
  const verticalSwipe =
    swipeDirection === "swipe-up" || swipeDirection === "swipe-down";
  const twoWaySwipe = config.swipeBehavior === "two-way";
  const swipePositionProperty = verticalSwipe ? "top" : "left";
  const swipeStartPosition =
    twoWaySwipe
      ? 50
      : swipeDirection === "swipe-left" || swipeDirection === "swipe-up"
        ? 88
        : 12;
  let swipeStartPositionValue = swipeStartPosition;
  const swipeTravelDistance = () => {
    const railRect = swipeRail?.getBoundingClientRect();
    const railSize = verticalSwipe ? railRect?.height ?? 0 : railRect?.width ?? 0;
    const travelRatio = twoWaySwipe ? 0.38 : 0.76;
    return railSize > 0 ? railSize * travelRatio : twoWaySwipe ? 48 : 96;
  };
  const fill = track.querySelector<HTMLElement>(
    "[data-putenggame-motion-fill]",
  );
  const label = track.querySelector<HTMLElement>(
    "[data-putenggame-motion-label]",
  );
  const ringReveals =
    config.ringFill === "reveal" || fillsFromLeft;
  const ringCircumference = 2 * Math.PI * 44;
  const setRingProgress = (progress: number) => {
    if (ring) {
      ring.setAttribute(
        "stroke-dasharray",
        ringReveals
          ? `${ringCircumference * progress} ${ringCircumference}`
          : String(ringCircumference),
      );
      ring.setAttribute(
        "stroke-dashoffset",
        ringReveals ? "0" : String(ringCircumference * progress),
      );
    }
    if (ringImage) {
      const sweep = (ringReveals ? progress : 1 - progress) * 360;
      const startAngle = ringReveals ? -progress * 360 : 0;
      ringImage.style.maskImage = `conic-gradient(from ${startAngle}deg, #000 0deg ${sweep}deg, transparent ${sweep}deg 360deg)`;
      ringImage.style.webkitMaskImage = ringImage.style.maskImage;
      ringImage.style.transform = `rotate(${progress * 360}deg) scale(${(config.ringAssetScale ?? 100) / 100})`;
    }
  };
  setRingProgress(0);
  const update = (now: number) => {
    if (finished) return;
    const elapsed =
      config.mode === "interactive" &&
      (config.kind === "hold-charge" || config.interaction === "hold")
        ? holding
          ? now - holdStarted
          : 0
        : now - started;
    const progress = Math.min(1, Math.max(0, elapsed / durationMs));
    setRingProgress(progress);
    if (label)
      label.textContent = String(
        Math.max(0, Math.ceil(config.duration * (1 - progress))),
      );
    if (fill)
      fill.style.transform = `scaleX(${fillsFromLeft ? progress : 1 - progress})`;
  };
  const emit = (signal: string | undefined) => {
    if (signal && context.navigation.connected(signal))
      void context.navigation.emit(signal).catch(() => {});
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    if (config.mode === "visual") emit(config.signal);
    else if (config.timeoutSignal && context.navigation.connected(config.timeoutSignal))
      void context.navigation.fail(config.timeoutSignal).catch(() => {});
  };
  const succeed = () => {
    if (finished) return;
    finished = true;
    if (
      config.signal &&
      element.getAttribute("data-signal") === config.signal
    ) {
      dispatchingSuccessClick = true;
      element.dispatchEvent(
        new view.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      dispatchingSuccessClick = false;
    } else {
      emit(config.signal);
    }
  };
  const tick = (now: number) => {
    const stage = element.closest<HTMLElement>(
      "[data-putenggame-awaiting-input]",
    );
    if (stage) {
      pausedAt ??= now;
      frame = view.requestAnimationFrame(tick);
      return;
    }
    if (pausedAt !== undefined) {
      const pausedFor = now - pausedAt;
      started += pausedFor;
      if (holding) holdStarted += pausedFor;
      pausedAt = undefined;
    }
    update(now);
    if (finished) return;
    const elapsed =
      config.mode === "interactive" &&
      (config.kind === "hold-charge" || config.interaction === "hold")
        ? holding
          ? now - holdStarted
          : 0
        : now - started;
    const progress = Math.min(1, Math.max(0, elapsed / durationMs));
    if (
      config.mode === "interactive" &&
      (config.kind === "hold-charge" || config.interaction === "hold") &&
      holding &&
      progress >= 1
    ) {
      succeed();
      return;
    }
    if (config.mode === "interactive" && now - started >= timeoutMs) {
      finish();
      return;
    }
    if (config.mode === "visual" && progress >= 1) {
      finish();
      return;
    }
    frame = view.requestAnimationFrame(tick);
  };
  frame = view.requestAnimationFrame(tick);

  const setProgress = (progress: number) => {
    setRingProgress(progress);
    if (fill)
      fill.style.transform = `scaleX(${fillsFromLeft ? progress : 1 - progress})`;
    if (label)
      label.textContent = String(
        Math.max(0, Math.ceil(config.duration * (1 - progress))),
      );
  };
  const pressStart = (event: Event) => {
    if (
      config.mode !== "interactive" ||
      (config.kind !== "hold-charge" && config.interaction !== "hold")
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    holding = true;
    holdStarted = view.performance.now();
    if (typeof PointerEvent !== "undefined" && event instanceof PointerEvent) {
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Capturing is not available for all embedded preview elements.
      }
    }
    setProgress(0);
    view.cancelAnimationFrame(frame);
    context.root.removeEventListener(
      PLAYABLE_MOTION_PAUSE_EVENT,
      onPause,
      true,
    );
    context.root.removeEventListener(
      PLAYABLE_MOTION_RESUME_EVENT,
      onResume,
      true,
    );
    frame = view.requestAnimationFrame(tick);
  };
  const pressEnd = (event: Event) => {
    if (
      config.mode !== "interactive" ||
      (config.kind !== "hold-charge" && config.interaction !== "hold")
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!holding || finished) return;
    holding = false;
    const holdElapsed = Math.min(
      durationMs,
      view.performance.now() - holdStarted,
    );
    if (holdElapsed >= durationMs) succeed();
    else if (config.kind === "hold-charge") {
      setProgress(0);
    }
  };
  const pointerDown = (event: PointerEvent) => {
    pointerStart = { x: event.clientX, y: event.clientY };
    pointerPressedAt = view.performance.now();
    if (swipeThumb) {
      const currentPosition = Number.parseFloat(
        swipeThumb.style[swipePositionProperty],
      );
      swipeStartPositionValue = Number.isFinite(currentPosition)
        ? currentPosition
        : swipeStartPosition;
      swipeThumb.style.transition = "none";
    }
    if (config.interaction?.startsWith("swipe-")) {
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is not available in every embedded preview.
      }
    }
  };
  const pointerMove = (event: PointerEvent) => {
    if (
      !pointerStart ||
      config.mode !== "interactive" ||
      config.kind !== "swipe-button"
    )
      return;
    event.preventDefault();
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    const direction =
      Math.abs(dx) > Math.abs(dy)
        ? dx < 0
          ? "swipe-left"
          : "swipe-right"
        : dy < 0
          ? "swipe-up"
          : "swipe-down";
    const canMove = twoWaySwipe
      ? verticalSwipe
        ? direction === "swipe-up" || direction === "swipe-down"
        : direction === "swipe-left" || direction === "swipe-right"
      : direction === swipeDirection;
    const distance = canMove
      ? verticalSwipe
        ? Math.abs(dy)
        : Math.abs(dx)
      : 0;
    const railRect = swipeRail?.getBoundingClientRect();
    const railSize = verticalSwipe ? railRect?.height ?? 0 : railRect?.width ?? 0;
    const progress = Math.min(
      1,
      distance / (config.interaction === "swipe-any" ? swipeTravelDistance() : 40),
    );
    if (swipeThumb) {
      const movement =
        railSize > 0 ? (distance / railSize) * 100 : progress * 76;
      const sign = twoWaySwipe
        ? (verticalSwipe ? dy : dx) >= 0
          ? 1
          : -1
        : swipeDirection === "swipe-right" || swipeDirection === "swipe-down"
          ? 1
          : -1;
      swipeThumb.style[swipePositionProperty] = `${Math.min(
        88,
        Math.max(12, swipeStartPositionValue + sign * movement),
      )}%`;
    }
  };
  const pointerUp = (event: PointerEvent) => {
    if (!pointerStart || config.mode !== "interactive") return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = undefined;
    const expected = config.interaction;
    if (!expected?.startsWith("swipe-")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const direction =
      Math.abs(dx) > Math.abs(dy)
        ? dx < 0
          ? "swipe-left"
          : "swipe-right"
        : dy < 0
          ? "swipe-up"
          : "swipe-down";
    const canComplete = twoWaySwipe
      ? verticalSwipe
        ? direction === "swipe-up" || direction === "swipe-down"
        : direction === "swipe-left" || direction === "swipe-right"
      : direction === swipeDirection;
    if (
      canComplete &&
      Math.hypot(dx, dy) >=
        (expected === "swipe-any" ? swipeTravelDistance() : 40)
    ) {
      succeed();
    }
  };
  const pointerCancel = () => {
    pointerStart = undefined;
    pointerPressedAt = undefined;
  };
  const click = (event: Event) => {
    if (config.mode !== "interactive" || config.kind === "hold-charge") return;
    if (dispatchingSuccessClick) return;
    if (config.kind === "swipe-button") {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (config.interaction) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (config.interaction === "click") succeed();
      else if (config.interaction === "quick-click") {
        const elapsed =
          pointerPressedAt === undefined
            ? Infinity
            : view.performance.now() - pointerPressedAt;
        pointerPressedAt = undefined;
        if (elapsed <= 250) succeed();
      } else if (config.interaction === "multi-click") {
        clickCount += 1;
        if (clickCount >= (config.requiredCount ?? 3)) succeed();
      }
      return;
    }
    if (finished) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (
      config.signal &&
      element.getAttribute("data-signal") === config.signal
    ) {
      finished = true;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    finished = true;
    emit(config.signal);
  };
  const doubleClick = (event: MouseEvent) => {
    if (
      config.mode !== "interactive" ||
      config.interaction !== "double-click"
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    succeed();
  };
  element.addEventListener("click", click, true);
  element.addEventListener("dblclick", doubleClick, true);
  if (config.mode === "interactive") {
    element.addEventListener("pointerdown", pointerDown, true);
    element.addEventListener("pointermove", pointerMove, true);
    element.addEventListener("pointerup", pointerUp, true);
    element.addEventListener("pointercancel", pointerCancel, true);
    view.addEventListener("pointermove", pointerMove, true);
    view.addEventListener("pointerup", pointerUp, true);
    view.addEventListener("pointercancel", pointerCancel, true);
  }
  if (
    config.mode === "interactive" &&
    (config.kind === "hold-charge" || config.interaction === "hold")
  ) {
    element.addEventListener("pointerdown", pressStart, true);
    element.addEventListener("pointerup", pressEnd, true);
    element.addEventListener("pointercancel", pressEnd, true);
    element.addEventListener("click", pressEnd, true);
  }

  return () => {
    view.cancelAnimationFrame(frame);
    element.removeEventListener("click", click, true);
    element.removeEventListener("dblclick", doubleClick, true);
    element.removeEventListener("pointerdown", pointerDown, true);
    element.removeEventListener("pointermove", pointerMove, true);
    element.removeEventListener("pointerup", pointerUp, true);
    element.removeEventListener("pointercancel", pointerCancel, true);
    view.removeEventListener("pointermove", pointerMove, true);
    view.removeEventListener("pointerup", pointerUp, true);
    view.removeEventListener("pointercancel", pointerCancel, true);
    element.removeEventListener("pointerdown", pressStart, true);
    element.removeEventListener("pointerup", pressEnd, true);
    element.removeEventListener("pointercancel", pressEnd, true);
    element.removeEventListener("click", pressEnd, true);
    overlay.remove();
    element.style.position = previousPosition;
    element.style.cursor = previousCursor;
    element.style.touchAction = previousTouchAction;
    element.style.userSelect = previousUserSelect;
    if (previousRingShape) Object.assign(element.style, previousRingShape);
  };
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function motionAttributes(config: PlayableMotionConfig): string {
  return [
    `${PLAYABLE_MOTION_ATTRIBUTES.kind}="${config.kind}"`,
    `${PLAYABLE_MOTION_ATTRIBUTES.mode}="${config.mode}"`,
    `${PLAYABLE_MOTION_ATTRIBUTES.duration}="${config.duration}"`,
    ...(config.interaction
      ? [
          `${PLAYABLE_MOTION_ATTRIBUTES.interaction}="${config.interaction}"`,
        ]
      : []),
    ...(config.requiredCount === undefined
      ? []
      : [
          `${PLAYABLE_MOTION_ATTRIBUTES.requiredCount}="${config.requiredCount}"`,
        ]),
    ...(config.timeoutDuration === undefined
      ? []
      : [
          `${PLAYABLE_MOTION_ATTRIBUTES.timeoutDuration}="${config.timeoutDuration}"`,
        ]),
    ...(config.signal
      ? [
          `${PLAYABLE_MOTION_ATTRIBUTES.signal}="${escapeAttribute(config.signal)}"`,
        ]
      : []),
    ...(config.timeoutSignal
      ? [
          `${PLAYABLE_MOTION_ATTRIBUTES.timeoutSignal}="${escapeAttribute(config.timeoutSignal)}"`,
        ]
      : []),
    ...(config.ringAssetId
      ? [
          `${PLAYABLE_MOTION_ATTRIBUTES.ringAsset}="${escapeAttribute(config.ringAssetId)}"`,
        ]
      : []),
    ...(config.ringAssetScale === undefined
      ? []
      : [`${PLAYABLE_MOTION_ATTRIBUTES.ringAssetScale}="${config.ringAssetScale}"`]),
    ...(config.barAssetId
      ? [
          `${PLAYABLE_MOTION_ATTRIBUTES.barAsset}="${escapeAttribute(config.barAssetId)}"`,
        ]
      : []),
    ...(config.barAssetScale === undefined
      ? []
      : [`${PLAYABLE_MOTION_ATTRIBUTES.barAssetScale}="${config.barAssetScale}"`]),
    ...(config.barAssetOffsetX === undefined
      ? []
      : [`${PLAYABLE_MOTION_ATTRIBUTES.barAssetOffsetX}="${config.barAssetOffsetX}"`]),
    ...(config.barAssetOffsetY === undefined
      ? []
      : [`${PLAYABLE_MOTION_ATTRIBUTES.barAssetOffsetY}="${config.barAssetOffsetY}"`]),
    ...(config.swipeAssetId
      ? [
          `${PLAYABLE_MOTION_ATTRIBUTES.swipeAsset}="${escapeAttribute(config.swipeAssetId)}"`,
        ]
      : []),
    ...(config.swipeStyle
      ? [`${PLAYABLE_MOTION_ATTRIBUTES.swipeStyle}="${config.swipeStyle}"`]
      : []),
    ...(config.swipeBehavior
      ? [
          `${PLAYABLE_MOTION_ATTRIBUTES.swipeBehavior}="${config.swipeBehavior}"`,
        ]
      : []),
    ...(config.ringFill
      ? [`${PLAYABLE_MOTION_ATTRIBUTES.ringFill}="${config.ringFill}"`]
      : []),
    ...(config.ringRotation
      ? [
          `${PLAYABLE_MOTION_ATTRIBUTES.ringRotation}="${config.ringRotation}"`,
        ]
      : []),
    ...(config.feedback
      ? [`${PLAYABLE_MOTION_ATTRIBUTES.feedback}="${config.feedback}"`]
      : []),
    ...(config.buttonShape
      ? [`${PLAYABLE_MOTION_ATTRIBUTES.buttonShape}="${config.buttonShape}"`]
      : []),
  ].join(" ");
}
