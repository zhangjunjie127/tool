import { PLAYABLE_SOURCE_ATTRIBUTE } from "./playable-source-locations.js";
import {
  parsePlayableMotionConfig,
  PLAYABLE_MOTION_ATTRIBUTES,
  playableButtonAssetScales,
  type PlayableMotionConfig,
} from "./playable-motion.js";

export interface PlayablePickResult {
  nodeId: string;
  /** A temporary, independently selectable part of a source-backed element. */
  part?: "button-label";
  /** Identifies one of several temporary text parts within the same button. */
  partId?: string;
  /** Original source wording when the preview displays a translated label. */
  sourceText?: string;
  /** `<file>:<line>:<column>` from a preview build, when the element came from surface HTML. */
  source?: string;
  /** CSS path from the surface's shadow root to the element. */
  cssPath: string;
  /** The Signal named by the nearest `data-signal` attribute, such as an Exit button's. */
  signal?: string;
  motion?: PlayableMotionConfig;
  buttonAssetId?: string;
  buttonPressedAssetId?: string;
  buttonAssetScaleX?: number;
  buttonAssetScaleY?: number;
  fontFamily?: string;
  tag: string;
  /** The element shows media: an image, a video, or a `data-media` slot for one. */
  media?: true;
  /** The element's `data-media` value, such as `backdrop` for the Scene's background. */
  mediaSlot?: string;
  text: string;
  /** Bounding box in the sandbox frame's CSS pixels. */
  box: { x: number; y: number; width: number; height: number };
}

export function playableTextPickWithSource(
  pick: PlayablePickResult,
  created: { id: string; nodeId: string; source: string },
): PlayablePickResult {
  return pick.nodeId === created.nodeId &&
    pick.cssPath === `p#${created.id}` &&
    !pick.source
    ? { ...pick, source: created.source }
    : pick;
}

const TEXT_EXCERPT_LIMIT = 120;
const SURFACE_ATTRIBUTE = "data-playable-surface";
const SIGNAL_ATTRIBUTE = "data-signal";
const MEDIA_ATTRIBUTE = "data-media";
const MEDIA_TAGS = new Set(["img", "video", "picture"]);

/** The subset of Element used by the picker, so path logic runs without a DOM. */
export interface PickableElement {
  readonly tagName: string;
  readonly id: string;
  readonly parentElement: PickableElement | null;
  readonly textContent: string | null;
  getAttribute(name: string): string | null;
  getBoundingClientRect(): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PlayableInteractionTarget {
  pick: PlayablePickResult;
  element: PickableElement;
}

/** Finds the nearest source-backed element for transform and delete actions. */
export function describePlayableSourceTarget(
  composedPath: readonly unknown[],
): PlayableInteractionTarget | undefined {
  const elements = composedPath.filter(isPickableElement);
  const surfaceIndex = elements.findIndex(
    (element) => element.getAttribute(SURFACE_ATTRIBUTE) !== null,
  );
  if (surfaceIndex < 1) return undefined;
  const element = elements
    .slice(0, surfaceIndex)
    .find(
      (candidate) => candidate.getAttribute(PLAYABLE_SOURCE_ATTRIBUTE) !== null,
    );
  if (!element) return undefined;
  const pick = describePlayablePick(
    composedPath.slice(composedPath.indexOf(element)),
  );
  return pick?.source ? { pick, element } : undefined;
}

/** Finds an operation target such as an option, QTE, hotspot, or action button. */
export function describePlayableInteraction(
  composedPath: readonly unknown[],
): PlayableInteractionTarget | undefined {
  const elements = composedPath.filter(isPickableElement);
  const surfaceIndex = elements.findIndex(
    (element) => element.getAttribute(SURFACE_ATTRIBUTE) !== null,
  );
  if (surfaceIndex < 1) return undefined;
  const inside = elements.slice(0, surfaceIndex);
  const interaction =
    inside.find((element) => element.getAttribute("data-qte") !== null) ??
    inside.find(isInteractiveElement);
  if (!interaction) return undefined;
  const pick = describePlayablePick(
    composedPath.slice(composedPath.indexOf(interaction)),
  );
  if (!pick || !pick.source) return undefined;
  const entrance =
    inside.find(
      (element) =>
        hasClass(element, "rise") &&
        element.getAttribute(PLAYABLE_SOURCE_ATTRIBUTE) !== null,
    ) ?? interaction;
  if (entrance === interaction) return { pick, element: interaction };
  const entrancePick = describePlayablePick(
    composedPath.slice(composedPath.indexOf(entrance)),
  );
  if (!entrancePick) return { pick, element: interaction };
  return {
    element: entrance,
    pick: { ...entrancePick, signal: pick.signal },
  };
}

/** Finds the source-backed element whose entrance delay can be edited. */
export function describePlayableAppearanceTarget(
  composedPath: readonly unknown[],
): PlayableInteractionTarget | undefined {
  const elements = composedPath.filter(isPickableElement);
  const surfaceIndex = elements.findIndex(
    (element) => element.getAttribute(SURFACE_ATTRIBUTE) !== null,
  );
  if (surfaceIndex < 1) return undefined;
  const inside = elements.slice(0, surfaceIndex);
  if (inside.some((element) => element.tagName.toLowerCase() === "video"))
    return undefined;

  const interaction = describePlayableInteraction(composedPath);
  if (interaction && interaction.pick.tag !== "video") return interaction;

  const sourceTarget = describePlayableSourceTarget(composedPath);
  if (!sourceTarget || sourceTarget.pick.tag === "video") return undefined;
  const entrance =
    inside.find(
      (element) =>
        hasClass(element, "rise") &&
        element.getAttribute(PLAYABLE_SOURCE_ATTRIBUTE) !== null,
    ) ?? sourceTarget.element;
  const entrancePick = describePlayablePick(
    composedPath.slice(composedPath.indexOf(entrance)),
  );
  if (!entrancePick || !entrancePick.source || entrancePick.tag === "video")
    return undefined;
  return { element: entrance, pick: entrancePick };
}

/**
 * Builds the pick result for the element at the start of an event's composed
 * path. Script-created elements have no source attribute, so the nearest
 * annotated ancestor supplies the source location. Returns undefined when the
 * path does not lead into a Playable surface.
 */
export function describePlayablePick(
  composedPath: readonly unknown[],
): PlayablePickResult | undefined {
  const elements = composedPath.filter(isPickableElement);
  const target = elements[0];
  if (!target) return undefined;
  const surface = elements.find(
    (element) => element.getAttribute(SURFACE_ATTRIBUTE) !== null,
  );
  if (!surface || surface === target) return undefined;
  const surfaceIndex = elements.indexOf(surface);
  const inside = elements.slice(0, surfaceIndex);
  const source = inside
    .map((element) => element.getAttribute(PLAYABLE_SOURCE_ATTRIBUTE))
    .find((value): value is string => value !== null);
  const signal = inside
    .map((element) => element.getAttribute(SIGNAL_ATTRIBUTE))
    .find((value): value is string => Boolean(value));
  const rect = target.getBoundingClientRect();
  const tag = target.tagName.toLowerCase();
  const mediaSlot = target.getAttribute(MEDIA_ATTRIBUTE);
  const motion = parsePlayableMotionConfig(target);
  const buttonAssetId =
    target.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.asset) || undefined;
  const buttonPressedAssetId =
    target.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.pressedAsset) || undefined;
  const buttonAssetScales = buttonAssetId
    ? playableButtonAssetScales(target)
    : undefined;
  const media = MEDIA_TAGS.has(tag) || mediaSlot !== null;
  return {
    nodeId: surface.getAttribute(SURFACE_ATTRIBUTE)!,
    ...(source ? { source } : {}),
    cssPath: playableCssPath(target),
    ...(signal ? { signal } : {}),
    ...(motion ? { motion } : {}),
    ...(buttonAssetId ? { buttonAssetId } : {}),
    ...(buttonPressedAssetId ? { buttonPressedAssetId } : {}),
    ...(buttonAssetScales
      ? {
          buttonAssetScaleX: buttonAssetScales.x,
          buttonAssetScaleY: buttonAssetScales.y,
        }
      : {}),
    tag,
    ...(media ? { media: true as const } : {}),
    ...(mediaSlot ? { mediaSlot } : {}),
    text: excerpt(target.textContent ?? ""),
    box: {
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
    },
  };
}

/**
 * CSS path from the surface root: stops at an element with an ID or at the
 * surface host, and uses `:nth-of-type` where siblings share a tag.
 */
export function playableCssPath(element: PickableElement): string {
  const segments: string[] = [];
  let current: PickableElement | null = element;
  while (current) {
    const tag = current.tagName.toLowerCase();
    if (current.id && /^[A-Za-z][\w-]*$/.test(current.id)) {
      segments.unshift(`${tag}#${current.id}`);
      break;
    }
    const host: PickableElement | null = current.parentElement;
    const parent: PickableElement | null =
      host && host.getAttribute(SURFACE_ATTRIBUTE) === null ? host : null;
    const siblings = parent ? childElements(parent) : [];
    const sameTag = siblings.filter(
      (sibling) => sibling.tagName === current!.tagName,
    );
    segments.unshift(
      sameTag.length > 1
        ? `${tag}:nth-of-type(${sameTag.indexOf(current) + 1})`
        : tag,
    );
    current = parent;
  }
  return segments.join(" > ");
}

function childElements(parent: PickableElement): PickableElement[] {
  const children = Reflect.get(parent, "children") as
    ArrayLike<PickableElement> | undefined;
  return children ? Array.from(children) : [];
}

function isPickableElement(value: unknown): value is PickableElement {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "tagName") === "string" &&
    typeof Reflect.get(value, "getAttribute") === "function" &&
    typeof Reflect.get(value, "getBoundingClientRect") === "function"
  );
}

function isInteractiveElement(element: PickableElement): boolean {
  const tag = element.tagName.toLowerCase();
  return (
    ["button", "a", "input", "select", "textarea"].includes(tag) ||
    [
      "data-signal",
      "data-press",
      "data-restart",
      "data-continue",
      "data-back",
    ].some((name) => element.getAttribute(name) !== null)
  );
}

function hasClass(element: PickableElement, name: string): boolean {
  return (element.getAttribute("class") ?? "").split(/\s+/).includes(name);
}

function excerpt(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > TEXT_EXCERPT_LIMIT
    ? `${normalized.slice(0, TEXT_EXCERPT_LIMIT - 1)}…`
    : normalized;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
