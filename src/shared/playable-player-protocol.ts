import type { CompiledNodeGraph } from "./playable-compiled.js";
import type { JsonObject, NodeGraph } from "./playable-nodes.js";
import type { PlayableTransform, PlayableTranslate } from "./playable-move.js";
import type { PlayablePickResult } from "./playable-picker.js";
import type { PlayableSeen } from "./playable-story-map.js";
import {
  isPlayableGameSettings,
  type PlayableGameSettings,
} from "./playable-settings.js";
import type { PlayableBackdropEffects } from "./playable-backdrop-effects.js";
import {
  PLAYABLE_BUTTON_ASSET_SCALE_MAX,
  PLAYABLE_BUTTON_ASSET_SCALE_MIN,
  type PlayableButtonAction,
  type PlayableMotionConfig,
  type PlayableNoInputMode,
} from "./playable-motion.js";
import type {
  NodeRuntimePolicy,
  NodeRuntimeSnapshot,
  PlayableSave,
} from "./playable-runtime.js";

export interface NodePlayerDefinition {
  version: 1;
  graph: NodeGraph;
  compiled: CompiledNodeGraph;
  graphSignature: string;
}

// `available: false` marks an Interactive Story project whose graph.json is missing.
export type NodeRuntimeResponse =
  { available: true; definition: NodePlayerDefinition } | { available: false };

/**
 * Authoring options for a preview session. The Published Player never sends
 * them, and element picking is only available in sessions that have them.
 */
export interface PlayablePreviewOptions {
  policy?: NodeRuntimePolicy;
  startNodeId?: string;
  previewState?: JsonObject;
}

/**
 * An authoring tool that takes over the preview's input: `select` picks
 * elements to talk about, `text` edits an element's text in place, `move`
 * drags an element to a new place.
 */
export type PlayablePreviewTool = "select" | "text" | "move";

export type PlayablePreviewShortcut =
  | "select"
  | "text"
  | "move"
  | "draw"
  | "toggle-playback";

export type PlayableMediaCommand =
  | { command: "play" }
  | { command: "pause" }
  | { command: "vr-eye-preview"; nodeId: string; eye: "full" | "left" | "right" }
  | {
      command: "set-backdrop";
      nodeId: string;
      sequence: number;
      asset?: {
        assetId: string;
        type: "image" | "video";
        transfer: PlayableAssetTransfer;
        loop?: boolean;
      };
    }
  | { command: "backdrop-loop"; loop: boolean }
  | {
      command: "picture-in-picture-video-loop";
      nodeId: string;
      loop: boolean;
    }
  | { command: "continue-without-input"; nodeId: string; enabled: boolean }
  | {
      command: "no-input-mode";
      nodeId: string;
      mode: PlayableNoInputMode | undefined;
    }
  | {
      command: "insert-media";
      nodeId: string;
      source: string;
      assetId: string;
      type: "image" | "video";
      asset: PlayableAssetTransfer;
      loop?: boolean;
    }
  | {
      command: "insert-button-preset";
      nodeId: string;
      id: string;
      source: string;
      signal?: string;
      label: string;
      buttonText?: string;
      buttonAction?: PlayableButtonAction;
      fontFamily?: string;
      motion?: PlayableMotionConfig;
      assetId?: string;
      asset?: PlayableAssetTransfer;
      pressedAssetId?: string;
      pressedAsset?: PlayableAssetTransfer;
      ringAsset?: PlayableAssetTransfer;
      barAsset?: PlayableAssetTransfer;
      swipeAsset?: PlayableAssetTransfer;
    }
  | {
      command: "button-asset-scale";
      nodeId: string;
      cssPath: string;
      source: string;
      scaleX: number;
      scaleY: number;
    }
  | {
      command: "element-scale-preview";
      nodeId: string;
      cssPath: string;
      source: string;
      scale: number;
    }
  | {
      command: "motion-progress-preview";
      nodeId: string;
      cssPath: string;
      source: string;
      scale: number;
      offsetX?: number;
      offsetY?: number;
      circular?: boolean;
      barLayer?: "bottom" | "top";
      asset: PlayableAssetTransfer;
    }
  | { command: "seek"; time: number };

export interface PlayableMediaState {
  currentTime: number;
  duration: number;
  paused: boolean;
  /** Asset behind the current Scene, when it is a declared video backdrop. */
  backdropAssetId?: string;
}

export interface PlayableVrButton {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  backgroundColor: string;
  holdToCharge?: boolean;
  imageDataUrl?: string;
  pressedImageDataUrl?: string;
}

/** Text the author typed over an element in the preview. */
export interface PlayableTextEdit {
  pick: PlayablePickResult;
  before: string;
  after: string;
  /** Original, untranslated text from the source markup when available. */
  sourceBefore?: string;
  /**
   * The element was written in surface HTML and has a source location.
   */
  inPlace: boolean;
}

/** A new positioned text element committed from the preview. */
export interface PlayableTextCreate {
  id: string;
  nodeId: string;
  text: string;
  x: number;
  y: number;
}

/** A text element selected by the authoring Text tool. */
export interface PlayableTextSelection {
  pick: PlayablePickResult;
  fontFamily: string;
  fontSize: string;
  /** The selected element owns a source location that can be edited directly. */
  inPlace: boolean;
}

/** A font property changed on the selected text element. */
export interface PlayableTextStyleEdit {
  pick: PlayablePickResult;
  property: "fontFamily" | "fontSize";
  value: string;
  inPlace: boolean;
}

export interface PlayableTextStyleCommand extends Omit<
  PlayableTextStyleEdit,
  "inPlace"
> {
  sequence: number;
}

/** A non-video element selected for appearance timing. */
export interface PlayableInteractionSelection {
  pick: PlayablePickResult;
  delaySeconds: number;
  endSeconds?: number;
  /** The selected element owns a source location that can be edited directly. */
  inPlace: boolean;
}

/** A changed appearance delay for a non-video element. */
export interface PlayableInteractionTimingEdit {
  pick: PlayablePickResult;
  delaySeconds: number;
  endSeconds?: number;
  inPlace: boolean;
}

export interface PlayableAppearanceTimingUpdate {
  pick: PlayablePickResult;
  delaySeconds: number;
  endSeconds?: number;
}

export interface PlayableAppearanceTimingCommand {
  sequence: number;
  updates: PlayableAppearanceTimingUpdate[];
}

export interface PlayableMotionCommand {
  sequence: number;
  target:
    | { kind: "element"; pick: PlayablePickResult }
    | { kind: "create"; id: string; nodeId: string; source: string };
  config?: PlayableMotionConfig;
  /** Updates the button's route without remounting the preview. */
  buttonSignal?: string;
  /** Updates the selected button's visible label in the live preview. */
  buttonText?: string;
  assetId?: string;
  assetScaleX?: number;
  assetScaleY?: number;
  asset?: PlayableAssetTransfer;
  pressedAssetId?: string;
  pressedAsset?: PlayableAssetTransfer;
  ringAsset?: PlayableAssetTransfer;
  barAsset?: PlayableAssetTransfer;
  swipeAsset?: PlayableAssetTransfer;
}

/** An element the author dragged in the preview. */
export interface PlayableMove {
  /** The element before it moved. */
  pick: PlayablePickResult;
  /** Moves the visible label without moving the button or its hit area. */
  part?: "button-label";
  /** Where it ends up, from where its layout puts it. */
  translate: PlayableTranslate;
  /**
   * The element was written in surface HTML and no animation of its own
   * overrides `translate`, so the offset can go straight back to its source.
   * Otherwise the Agent makes it.
   */
  inPlace: boolean;
}

/** A visual transform changed on a selected element. */
export interface PlayableTransformEdit {
  pick: PlayablePickResult;
  transform: PlayableTransform;
  inPlace: boolean;
}

/** A selected element removed from the source surface. */
export interface PlayableDeleteEdit {
  pick: PlayablePickResult;
  /** Deletes only the visible label while preserving its button and behavior. */
  part?: "button-label";
  inPlace: boolean;
}

export interface PlayableElementCopy {
  pick: PlayablePickResult;
  /** Sanitized markup persisted to the Scene source. */
  html: string;
  /** Live markup keeps preview-only media URLs so the preview is not reloaded. */
  previewHtml: string;
  ids: string[];
}

export interface PlayableElementClipboardCommand {
  action: "copy" | "paste";
  sequence: number;
}

export type PlayableHistoryCommand = "undo" | "redo";

export interface PlayableAssetTransfer {
  contentType: string;
  bytes: ArrayBuffer;
}

/** A runtime Asset shared with the sandbox without eagerly copying its bytes. */
export interface PlayableRuntimeAsset {
  contentType: string;
  blob: Blob;
}

export type PlayableHostMessage =
  | {
      kind: "putenggame:playable:init";
      instanceId: string;
      definition: NodePlayerDefinition;
      assets: Record<string, PlayableRuntimeAsset>;
      save?: unknown;
      settings?: unknown;
      /** What the player has seen in earlier sessions, for the Story Map. */
      seen?: unknown;
      preview?: PlayablePreviewOptions;
    }
  | {
      kind: "putenggame:playable:assets-result";
      instanceId: string;
      requestId: string;
      assets: Record<string, PlayableRuntimeAsset>;
      error?: string;
    }
  | {
      kind: "putenggame:playable:save-result";
      instanceId: string;
      requestId: string;
      error?: string;
    }
  | {
      kind: "putenggame:playable:settings-save-result";
      instanceId: string;
      requestId: string;
      error?: string;
    }
  | {
      kind: "putenggame:playable:settings-command";
      instanceId: string;
      action: "patch";
      settings: PlayableGameSettings;
    }
  | {
      kind: "putenggame:playable:settings-command";
      instanceId: string;
      action: "save" | "reset" | "discard" | "pause" | "resume";
    }
  | {
      kind: "putenggame:playable:pick-start";
      instanceId: string;
      tool: PlayablePreviewTool;
    }
  | {
      kind: "putenggame:playable:pick-locks";
      instanceId: string;
      picks: PlayablePickResult[];
    }
  | {
      kind: "putenggame:playable:align-elements";
      instanceId: string;
      reference: PlayablePickResult;
      targets: PlayablePickResult[];
    }
  | {
      kind: "putenggame:playable:vr-inspect";
      instanceId: string;
      requestId: string;
      nodeId: string;
      viewport: { width: number; height: number };
    }
  | {
      kind: "putenggame:playable:vr-activate";
      instanceId: string;
      nodeId: string;
      buttonId: string;
    }
  | {
      kind: "putenggame:playable:vr-press";
      instanceId: string;
      nodeId: string;
      buttonId: string;
      phase: "start" | "end";
    }
  | {
      kind: "putenggame:playable:delete-element";
      instanceId: string;
      pick: PlayablePickResult;
    }
  | {
      kind: "putenggame:playable:appearance-timing";
      instanceId: string;
      command: PlayableAppearanceTimingCommand;
    }
  | {
      kind: "putenggame:playable:motion";
      instanceId: string;
      command: PlayableMotionCommand;
    }
  | {
      kind: "putenggame:playable:text-style";
      instanceId: string;
      command: PlayableTextStyleCommand;
    }
  | {
      kind: "putenggame:playable:backdrop-effects";
      instanceId: string;
      effects: PlayableBackdropEffects;
    }
  | {
      kind: "putenggame:playable:text-created-result";
      instanceId: string;
      id: string;
      source?: string;
    }
  | {
      kind: "putenggame:playable:element-paste-result";
      instanceId: string;
      requestId: string;
      sources?: Record<string, string>;
      error?: string;
    }
  | {
      kind: "putenggame:playable:element-clipboard";
      instanceId: string;
      action: "copy" | "paste";
      sequence: number;
    }
  | {
      kind: "putenggame:playable:media-command";
      instanceId: string;
      command: PlayableMediaCommand;
    }
  | { kind: "putenggame:playable:pick-cancel"; instanceId: string };

export type PlayableFrameMessage =
  | {
      kind: "putenggame:playable:assets-request";
      instanceId: string;
      requestId: string;
      assetIds: string[];
    }
  | {
      kind: "putenggame:playable:save";
      instanceId: string;
      requestId: string;
      save: PlayableSave;
    }
  | {
      kind: "putenggame:playable:settings-save";
      instanceId: string;
      requestId: string;
      settings: PlayableGameSettings;
    }
  | {
      kind: "putenggame:playable:settings-change";
      instanceId: string;
      settings: PlayableGameSettings;
    }
  | {
      /** Keep this record; there is no reply, since losing it never stops the game. */
      kind: "putenggame:playable:seen";
      instanceId: string;
      seen: PlayableSeen;
    }
  | {
      kind: "putenggame:playable:snapshot";
      instanceId: string;
      snapshot: NodeRuntimeSnapshot;
    }
  | {
      kind: "putenggame:playable:error";
      instanceId: string;
      error: string;
    }
  | {
      kind: "putenggame:playable:diagnostic";
      instanceId: string;
      error: string;
    }
  | {
      kind: "putenggame:playable:picked";
      instanceId: string;
      pick: PlayablePickResult;
      /** Added to the current selection (a modifier key was held) instead of replacing it. */
      additive: boolean;
    }
  | {
      kind: "putenggame:playable:context-menu";
      instanceId: string;
      x: number;
      y: number;
      viewportWidth: number;
      viewportHeight: number;
    }
  | { kind: "putenggame:playable:delete-selection"; instanceId: string }
  | {
      kind: "putenggame:playable:text-edited";
      instanceId: string;
      edit: PlayableTextEdit;
    }
  | {
      kind: "putenggame:playable:text-created";
      instanceId: string;
      text: PlayableTextCreate;
    }
  | {
      kind: "putenggame:playable:text-selected";
      instanceId: string;
      selection?: PlayableTextSelection;
    }
  | {
      kind: "putenggame:playable:interaction-selected";
      instanceId: string;
      selection: PlayableInteractionSelection;
      /** Added to the current interaction selection when a modifier or marquee was used. */
      additive: boolean;
    }
  | {
      kind: "putenggame:playable:moved";
      instanceId: string;
      move: PlayableMove;
    }
  | {
      kind: "putenggame:playable:transformed";
      instanceId: string;
      edit: PlayableTransformEdit;
    }
  | {
      kind: "putenggame:playable:deleted";
      instanceId: string;
      edit: PlayableDeleteEdit;
    }
  | {
      kind: "putenggame:playable:element-paste";
      instanceId: string;
      requestId: string;
      copies: PlayableElementCopy[];
    }
  | {
      kind: "putenggame:playable:history-command";
      instanceId: string;
      command: PlayableHistoryCommand;
    }
  | {
      kind: "putenggame:playable:media-state";
      instanceId: string;
      state: PlayableMediaState;
    }
  | {
      kind: "putenggame:playable:vr-scene";
      instanceId: string;
      requestId: string;
      nodeId: string;
      buttons: PlayableVrButton[];
    }
  | {
      kind: "putenggame:playable:keyboard-shortcut";
      instanceId: string;
      shortcut: PlayablePreviewShortcut;
    }
  | { kind: "putenggame:playable:activity"; instanceId: string }
  | { kind: "putenggame:playable:pick-cancelled"; instanceId: string };

export function isPlayableHostMessage(
  value: unknown,
): value is PlayableHostMessage {
  if (
    !isRecord(value) ||
    typeof value.kind !== "string" ||
    typeof value.instanceId !== "string"
  )
    return false;
  if (value.kind === "putenggame:playable:init") {
    return (
      isRecord(value.definition) &&
      isRecord(value.assets) &&
      (value.preview === undefined || isRecord(value.preview))
    );
  }
  if (value.kind === "putenggame:playable:assets-result")
    return (
      typeof value.requestId === "string" &&
      isRecord(value.assets) &&
      Object.values(value.assets).every(
        (asset) =>
          isRecord(asset) &&
          typeof asset.contentType === "string" &&
          asset.blob instanceof Blob,
      ) &&
      (value.error === undefined || typeof value.error === "string")
    );
  if (value.kind === "putenggame:playable:pick-start")
    return (
      value.tool === "select" || value.tool === "text" || value.tool === "move"
    );
  if (value.kind === "putenggame:playable:pick-locks")
    return (
      Array.isArray(value.picks) &&
      value.picks.length <= 100 &&
      value.picks.every(
        (pick) =>
          isRecord(pick) &&
          typeof pick.nodeId === "string" &&
          typeof pick.cssPath === "string",
      )
    );
  if (value.kind === "putenggame:playable:align-elements")
    return (
      isRecord(value.reference) &&
      typeof value.reference.nodeId === "string" &&
      typeof value.reference.cssPath === "string" &&
      Array.isArray(value.targets) &&
      value.targets.length <= 100 &&
      value.targets.every(
        (pick) =>
          isRecord(pick) &&
          typeof pick.nodeId === "string" &&
          typeof pick.cssPath === "string",
      )
    );
  if (value.kind === "putenggame:playable:vr-inspect")
    return (
      typeof value.requestId === "string" &&
      typeof value.nodeId === "string" &&
      isRecord(value.viewport) &&
      typeof value.viewport.width === "number" &&
      Number.isFinite(value.viewport.width) &&
      value.viewport.width > 0 &&
      typeof value.viewport.height === "number" &&
      Number.isFinite(value.viewport.height) &&
      value.viewport.height > 0
    );
  if (value.kind === "putenggame:playable:vr-activate")
    return (
      typeof value.nodeId === "string" &&
      typeof value.buttonId === "string" &&
      value.buttonId.length <= 128
    );
  if (value.kind === "putenggame:playable:vr-press")
    return (
      typeof value.nodeId === "string" &&
      typeof value.buttonId === "string" &&
      value.buttonId.length <= 128 &&
      (value.phase === "start" || value.phase === "end")
    );
  if (value.kind === "putenggame:playable:delete-element")
    return (
      isRecord(value.pick) &&
      typeof value.pick.nodeId === "string" &&
      typeof value.pick.cssPath === "string"
    );
  if (value.kind === "putenggame:playable:text-style") {
    const command = value.command;
    return (
      isRecord(command) &&
      typeof command.sequence === "number" &&
      Number.isSafeInteger(command.sequence) &&
      command.sequence > 0 &&
      isRecord(command.pick) &&
      typeof command.pick.nodeId === "string" &&
      typeof command.pick.cssPath === "string" &&
      typeof command.pick.tag === "string" &&
      typeof command.pick.source === "string" &&
      (command.property === "fontFamily" || command.property === "fontSize") &&
      typeof command.value === "string"
    );
  }
  if (value.kind === "putenggame:playable:text-created-result")
    return (
      typeof value.id === "string" &&
      (value.source === undefined || typeof value.source === "string")
    );
  if (value.kind === "putenggame:playable:element-paste-result")
    return (
      typeof value.requestId === "string" &&
      (value.error === undefined || typeof value.error === "string") &&
      (value.sources === undefined ||
        (isRecord(value.sources) &&
          Object.entries(value.sources).every(
            ([id, source]) =>
              /^putenggame-copy-[\w-]+$/.test(id) && typeof source === "string",
          )))
    );
  if (value.kind === "putenggame:playable:element-clipboard")
    return (
      (value.action === "copy" || value.action === "paste") &&
      typeof value.sequence === "number" &&
      Number.isSafeInteger(value.sequence) &&
      value.sequence > 0
    );
  if (value.kind === "putenggame:playable:appearance-timing") {
    const command = value.command;
    return (
      isRecord(command) &&
      typeof command.sequence === "number" &&
      Number.isSafeInteger(command.sequence) &&
      command.sequence > 0 &&
      Array.isArray(command.updates) &&
      command.updates.length > 0 &&
      command.updates.every(
        (update) =>
          isRecord(update) &&
          isRecord(update.pick) &&
          typeof update.pick.nodeId === "string" &&
          typeof update.pick.source === "string" &&
          typeof update.pick.cssPath === "string" &&
          typeof update.pick.tag === "string" &&
          typeof update.delaySeconds === "number" &&
          Number.isFinite(update.delaySeconds) &&
          update.delaySeconds >= 0 &&
          update.delaySeconds <= 3600 &&
          (update.endSeconds === undefined ||
            (typeof update.endSeconds === "number" &&
              Number.isFinite(update.endSeconds) &&
              update.endSeconds > update.delaySeconds &&
              update.endSeconds <= 3600)),
      )
    );
  }
  if (value.kind === "putenggame:playable:motion") {
    const command = value.command;
    if (
      !isRecord(command) ||
      typeof command.sequence !== "number" ||
      !Number.isSafeInteger(command.sequence) ||
      command.sequence < 1 ||
      !isRecord(command.target) ||
      !(
        (command.target.kind === "element" &&
          isRecord(command.target.pick) &&
          typeof command.target.pick.nodeId === "string" &&
          typeof command.target.pick.cssPath === "string" &&
          typeof command.target.pick.tag === "string" &&
          typeof command.target.pick.source === "string") ||
        (command.target.kind === "create" &&
          typeof command.target.id === "string" &&
          typeof command.target.nodeId === "string" &&
          typeof command.target.source === "string")
      ) ||
      (command.config !== undefined &&
        (!isRecord(command.config) ||
          ![
            "countdown",
            "progress-ring",
            "progress-bar",
            "hold-charge",
            "swipe-button",
            "button-feedback",
          ].includes(String(command.config.kind)) ||
          !["interactive", "visual"].includes(String(command.config.mode)) ||
          typeof command.config.duration !== "number" ||
          !Number.isFinite(command.config.duration) ||
          command.config.duration < 0.1 ||
          command.config.duration > 3600 ||
          (command.config.timeoutDuration !== undefined &&
            (typeof command.config.timeoutDuration !== "number" ||
              !Number.isFinite(command.config.timeoutDuration) ||
              command.config.timeoutDuration < command.config.duration ||
              command.config.timeoutDuration > 3600)) ||
          (command.config.signal !== undefined &&
            typeof command.config.signal !== "string") ||
          (command.config.timeoutSignal !== undefined &&
            typeof command.config.timeoutSignal !== "string") ||
          (command.config.interaction !== undefined &&
            ![
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
            ].includes(String(command.config.interaction))) ||
          (command.config.requiredCount !== undefined &&
            (typeof command.config.requiredCount !== "number" ||
              !Number.isInteger(command.config.requiredCount) ||
              command.config.requiredCount < 2 ||
              command.config.requiredCount > 20)) ||
          (command.config.ringAssetId !== undefined &&
            (typeof command.config.ringAssetId !== "string" ||
              !/^[a-z0-9._-]{1,120}$/i.test(command.config.ringAssetId))) ||
          (command.config.ringAssetScale !== undefined &&
            (typeof command.config.ringAssetScale !== "number" ||
              !Number.isInteger(command.config.ringAssetScale) ||
              command.config.ringAssetScale < 25 ||
              command.config.ringAssetScale > 300)) ||
          (command.config.barAssetId !== undefined &&
            (typeof command.config.barAssetId !== "string" ||
              !/^[a-z0-9._-]{1,120}$/i.test(command.config.barAssetId))) ||
          (command.config.barAssetScale !== undefined &&
            (typeof command.config.barAssetScale !== "number" ||
              !Number.isInteger(command.config.barAssetScale) ||
              command.config.barAssetScale < 25 ||
              command.config.barAssetScale > 300)) ||
          (command.config.barAssetOffsetX !== undefined &&
            (typeof command.config.barAssetOffsetX !== "number" ||
              !Number.isInteger(command.config.barAssetOffsetX) ||
              command.config.barAssetOffsetX < -100 ||
              command.config.barAssetOffsetX > 100)) ||
          (command.config.barAssetOffsetY !== undefined &&
            (typeof command.config.barAssetOffsetY !== "number" ||
              !Number.isInteger(command.config.barAssetOffsetY) ||
              command.config.barAssetOffsetY < -100 ||
              command.config.barAssetOffsetY > 100)) ||
          (command.config.swipeAssetId !== undefined &&
            (typeof command.config.swipeAssetId !== "string" ||
              !/^[a-z0-9._-]{1,120}$/i.test(command.config.swipeAssetId))) ||
          (command.config.swipeStyle !== undefined &&
            command.config.swipeStyle !== "base" &&
            command.config.swipeStyle !== "floating") ||
          (command.config.swipeBehavior !== undefined &&
            command.config.swipeBehavior !== "one-way" &&
            command.config.swipeBehavior !== "two-way") ||
          (command.config.ringFill !== undefined &&
            command.config.ringFill !== "deplete" &&
            command.config.ringFill !== "reveal") ||
          (command.config.ringRotation !== undefined &&
            !["clockwise", "counterclockwise", "none"].includes(
              String(command.config.ringRotation),
            )) ||
          (command.config.feedback !== undefined &&
            command.config.feedback !== "hover-press" &&
            command.config.feedback !== "idle-pulse-hover-press" &&
            command.config.feedback !== "bounce-hover-press" &&
            command.config.feedback !== "ripple-hint" &&
            command.config.feedback !== "none") ||
          (command.config.kind === "button-feedback" &&
            command.config.feedback !== "hover-press" &&
            command.config.feedback !== "idle-pulse-hover-press" &&
            command.config.feedback !== "bounce-hover-press" &&
            command.config.feedback !== "ripple-hint"))) ||
      (command.buttonSignal !== undefined &&
        typeof command.buttonSignal !== "string") ||
      (command.buttonText !== undefined &&
        (typeof command.buttonText !== "string" ||
          command.buttonText.length > 120)) ||
      (command.assetId !== undefined && typeof command.assetId !== "string") ||
      (command.assetScaleX !== undefined &&
        (typeof command.assetScaleX !== "number" ||
          !Number.isInteger(command.assetScaleX) ||
          command.assetScaleX < PLAYABLE_BUTTON_ASSET_SCALE_MIN ||
          command.assetScaleX > PLAYABLE_BUTTON_ASSET_SCALE_MAX)) ||
      (command.assetScaleY !== undefined &&
        (typeof command.assetScaleY !== "number" ||
          !Number.isInteger(command.assetScaleY) ||
          command.assetScaleY < PLAYABLE_BUTTON_ASSET_SCALE_MIN ||
          command.assetScaleY > PLAYABLE_BUTTON_ASSET_SCALE_MAX)) ||
      (command.asset !== undefined &&
        (!isRecord(command.asset) ||
          typeof command.asset.contentType !== "string" ||
          !(command.asset.bytes instanceof ArrayBuffer))) ||
      (command.pressedAssetId !== undefined &&
        typeof command.pressedAssetId !== "string") ||
      (command.pressedAsset !== undefined &&
        (!isRecord(command.pressedAsset) ||
          typeof command.pressedAsset.contentType !== "string" ||
          !(command.pressedAsset.bytes instanceof ArrayBuffer))) ||
      (command.ringAsset !== undefined &&
        (!isRecord(command.ringAsset) ||
          typeof command.ringAsset.contentType !== "string" ||
          !(command.ringAsset.bytes instanceof ArrayBuffer))) ||
      (command.barAsset !== undefined &&
        (!isRecord(command.barAsset) ||
          typeof command.barAsset.contentType !== "string" ||
          !(command.barAsset.bytes instanceof ArrayBuffer))) ||
      (command.swipeAsset !== undefined &&
        (!isRecord(command.swipeAsset) ||
          typeof command.swipeAsset.contentType !== "string" ||
          !(command.swipeAsset.bytes instanceof ArrayBuffer)))
    )
      return false;
    return true;
  }
  if (value.kind === "putenggame:playable:backdrop-effects")
    return (
      isRecord(value.effects) &&
      typeof value.effects.vignette === "boolean" &&
      typeof value.effects.grain === "boolean"
    );
  if (value.kind === "putenggame:playable:media-command")
    return (
      isRecord(value.command) &&
      (value.command.command === "play" ||
        value.command.command === "pause" ||
        (value.command.command === "vr-eye-preview" &&
          typeof value.command.nodeId === "string" &&
          (value.command.eye === "full" ||
            value.command.eye === "left" ||
            value.command.eye === "right")) ||
        (value.command.command === "set-backdrop" &&
          typeof value.command.nodeId === "string" &&
          typeof value.command.sequence === "number" &&
          Number.isInteger(value.command.sequence) &&
          value.command.sequence > 0 &&
          (value.command.asset === undefined ||
            (isRecord(value.command.asset) &&
              typeof value.command.asset.assetId === "string" &&
              /^[a-z0-9._-]{1,120}$/i.test(value.command.asset.assetId) &&
              (value.command.asset.type === "image" ||
                value.command.asset.type === "video") &&
              isRecord(value.command.asset.transfer) &&
              typeof value.command.asset.transfer.contentType === "string" &&
              value.command.asset.transfer.bytes instanceof ArrayBuffer &&
              (value.command.asset.loop === undefined ||
                typeof value.command.asset.loop === "boolean")))) ||
        (value.command.command === "insert-media" &&
          typeof value.command.nodeId === "string" &&
          typeof value.command.source === "string" &&
          typeof value.command.assetId === "string" &&
          (value.command.type === "image" || value.command.type === "video") &&
          isRecord(value.command.asset) &&
          typeof value.command.asset.contentType === "string" &&
          value.command.asset.bytes instanceof ArrayBuffer &&
          (value.command.loop === undefined ||
            typeof value.command.loop === "boolean")) ||
        (value.command.command === "picture-in-picture-video-loop" &&
          typeof value.command.nodeId === "string" &&
          typeof value.command.loop === "boolean") ||
        (value.command.command === "insert-button-preset" &&
          typeof value.command.nodeId === "string" &&
          typeof value.command.id === "string" &&
          typeof value.command.source === "string" &&
          (value.command.signal === undefined ||
            typeof value.command.signal === "string") &&
          typeof value.command.label === "string" &&
          (value.command.buttonText === undefined ||
            typeof value.command.buttonText === "string") &&
          (value.command.buttonAction === undefined ||
            value.command.buttonAction === "new-game" ||
            value.command.buttonAction === "continue" ||
            value.command.buttonAction === "story-map") &&
          (value.command.fontFamily === undefined ||
            typeof value.command.fontFamily === "string") &&
          (value.command.assetId === undefined ||
            typeof value.command.assetId === "string") &&
          (value.command.asset === undefined ||
            (isRecord(value.command.asset) &&
              typeof value.command.asset.contentType === "string" &&
              value.command.asset.bytes instanceof ArrayBuffer)) &&
          (value.command.pressedAssetId === undefined ||
            typeof value.command.pressedAssetId === "string") &&
          (value.command.pressedAsset === undefined ||
            (isRecord(value.command.pressedAsset) &&
              typeof value.command.pressedAsset.contentType === "string" &&
              value.command.pressedAsset.bytes instanceof ArrayBuffer)) &&
          (value.command.motion === undefined ||
            isValidPlayableMotionConfig(value.command.motion)) &&
          (value.command.ringAsset === undefined ||
            (isRecord(value.command.ringAsset) &&
              typeof value.command.ringAsset.contentType === "string" &&
              value.command.ringAsset.bytes instanceof ArrayBuffer)) &&
          (value.command.barAsset === undefined ||
            (isRecord(value.command.barAsset) &&
              typeof value.command.barAsset.contentType === "string" &&
              value.command.barAsset.bytes instanceof ArrayBuffer)) &&
          (value.command.swipeAsset === undefined ||
            (isRecord(value.command.swipeAsset) &&
              typeof value.command.swipeAsset.contentType === "string" &&
              value.command.swipeAsset.bytes instanceof ArrayBuffer))) ||
        (value.command.command === "backdrop-loop" &&
          typeof value.command.loop === "boolean") ||
        (value.command.command === "continue-without-input" &&
          typeof value.command.nodeId === "string" &&
          typeof value.command.enabled === "boolean") ||
        (value.command.command === "no-input-mode" &&
          typeof value.command.nodeId === "string" &&
          (value.command.mode === undefined ||
            value.command.mode === "continue" ||
            value.command.mode === "wait")) ||
        (value.command.command === "button-asset-scale" &&
          typeof value.command.nodeId === "string" &&
          typeof value.command.cssPath === "string" &&
          typeof value.command.source === "string" &&
          typeof value.command.scaleX === "number" &&
          Number.isInteger(value.command.scaleX) &&
          value.command.scaleX >= PLAYABLE_BUTTON_ASSET_SCALE_MIN &&
          value.command.scaleX <= PLAYABLE_BUTTON_ASSET_SCALE_MAX &&
          typeof value.command.scaleY === "number" &&
          Number.isInteger(value.command.scaleY) &&
          value.command.scaleY >= PLAYABLE_BUTTON_ASSET_SCALE_MIN &&
          value.command.scaleY <= PLAYABLE_BUTTON_ASSET_SCALE_MAX) ||
        (value.command.command === "element-scale-preview" &&
          typeof value.command.nodeId === "string" &&
          typeof value.command.cssPath === "string" &&
          typeof value.command.source === "string" &&
          typeof value.command.scale === "number" &&
          Number.isFinite(value.command.scale) &&
          value.command.scale >= 0.05 &&
          value.command.scale <= 5) ||
        (value.command.command === "motion-progress-preview" &&
          typeof value.command.nodeId === "string" &&
          typeof value.command.cssPath === "string" &&
          typeof value.command.source === "string" &&
          typeof value.command.scale === "number" &&
          Number.isInteger(value.command.scale) &&
          value.command.scale >= 25 &&
          value.command.scale <= 300 &&
          (value.command.offsetX === undefined ||
            (typeof value.command.offsetX === "number" &&
              Number.isInteger(value.command.offsetX) &&
              value.command.offsetX >= -100 &&
              value.command.offsetX <= 100)) &&
          (value.command.offsetY === undefined ||
            (typeof value.command.offsetY === "number" &&
              Number.isInteger(value.command.offsetY) &&
              value.command.offsetY >= -100 &&
              value.command.offsetY <= 100)) &&
          (value.command.circular === undefined ||
            typeof value.command.circular === "boolean") &&
          (value.command.barLayer === undefined ||
            value.command.barLayer === "bottom" ||
            value.command.barLayer === "top") &&
          isRecord(value.command.asset) &&
          typeof value.command.asset.contentType === "string" &&
          value.command.asset.bytes instanceof ArrayBuffer) ||
        (value.command.command === "seek" &&
          typeof value.command.time === "number" &&
          Number.isFinite(value.command.time) &&
          value.command.time >= 0))
    );
  if (value.kind === "putenggame:playable:pick-cancel") return true;
  if (value.kind === "putenggame:playable:settings-command")
    return value.action === "patch"
      ? isPlayableGameSettings(value.settings)
      : value.action === "save" ||
          value.action === "reset" ||
          value.action === "discard" ||
          value.action === "pause" ||
          value.action === "resume";
  if (value.kind === "putenggame:playable:settings-save-result")
    return (
      typeof value.requestId === "string" &&
      (value.error === undefined || typeof value.error === "string")
    );
  return (
    value.kind === "putenggame:playable:save-result" &&
    typeof value.requestId === "string" &&
    (value.error === undefined || typeof value.error === "string")
  );
}

export function isPlayableFrameMessage(
  value: unknown,
): value is PlayableFrameMessage {
  if (
    !isRecord(value) ||
    typeof value.kind !== "string" ||
    typeof value.instanceId !== "string"
  )
    return false;
  if (value.kind === "putenggame:playable:assets-request")
    return (
      typeof value.requestId === "string" &&
      Array.isArray(value.assetIds) &&
      value.assetIds.length <= 500 &&
      value.assetIds.every(
        (id) => typeof id === "string" && id.length > 0 && id.length <= 128,
      )
    );
  if (value.kind === "putenggame:playable:save")
    return typeof value.requestId === "string" && isRecord(value.save);
  if (value.kind === "putenggame:playable:settings-save")
    return (
      typeof value.requestId === "string" &&
      isPlayableGameSettings(value.settings)
    );
  if (value.kind === "putenggame:playable:settings-change")
    return isPlayableGameSettings(value.settings);
  if (value.kind === "putenggame:playable:seen") return isRecord(value.seen);
  if (value.kind === "putenggame:playable:snapshot")
    return isRecord(value.snapshot);
  if (value.kind === "putenggame:playable:picked")
    return isRecord(value.pick) && typeof value.additive === "boolean";
  if (value.kind === "putenggame:playable:context-menu") {
    const { x, y, viewportWidth, viewportHeight } = value;
    return (
      typeof x === "number" &&
      Number.isFinite(x) &&
      x >= 0 &&
      typeof y === "number" &&
      Number.isFinite(y) &&
      y >= 0 &&
      typeof viewportWidth === "number" &&
      Number.isFinite(viewportWidth) &&
      viewportWidth > 0 &&
      typeof viewportHeight === "number" &&
      Number.isFinite(viewportHeight) &&
      viewportHeight > 0
    );
  }
  if (value.kind === "putenggame:playable:delete-selection") return true;
  if (value.kind === "putenggame:playable:text-edited")
    return (
      isRecord(value.edit) &&
      isRecord(value.edit.pick) &&
      typeof value.edit.before === "string" &&
      typeof value.edit.after === "string" &&
      (value.edit.sourceBefore === undefined ||
        typeof value.edit.sourceBefore === "string") &&
      typeof value.edit.inPlace === "boolean"
    );
  if (value.kind === "putenggame:playable:text-created")
    return (
      isRecord(value.text) &&
      typeof value.text.id === "string" &&
      typeof value.text.nodeId === "string" &&
      typeof value.text.text === "string" &&
      value.text.text.length > 0 &&
      typeof value.text.x === "number" &&
      Number.isFinite(value.text.x) &&
      value.text.x >= 0 &&
      value.text.x <= 100 &&
      typeof value.text.y === "number" &&
      Number.isFinite(value.text.y) &&
      value.text.y >= 0 &&
      value.text.y <= 100
    );
  if (value.kind === "putenggame:playable:text-selected")
    return (
      value.selection === undefined ||
      (isRecord(value.selection) &&
        isRecord(value.selection.pick) &&
        typeof value.selection.fontFamily === "string" &&
        typeof value.selection.fontSize === "string" &&
        typeof value.selection.inPlace === "boolean")
    );
  if (value.kind === "putenggame:playable:interaction-selected")
    return (
      isRecord(value.selection) &&
      isRecord(value.selection.pick) &&
      typeof value.selection.delaySeconds === "number" &&
      Number.isFinite(value.selection.delaySeconds) &&
      value.selection.delaySeconds >= 0 &&
      (value.selection.endSeconds === undefined ||
        (typeof value.selection.endSeconds === "number" &&
          Number.isFinite(value.selection.endSeconds) &&
          value.selection.endSeconds > value.selection.delaySeconds &&
          value.selection.endSeconds <= 3600)) &&
      typeof value.selection.inPlace === "boolean" &&
      typeof value.additive === "boolean"
    );
  if (value.kind === "putenggame:playable:moved")
    return (
      isRecord(value.move) &&
      isRecord(value.move.pick) &&
      isRecord(value.move.translate) &&
      typeof value.move.translate.x === "number" &&
      typeof value.move.translate.y === "number" &&
      (value.move.part === undefined || value.move.part === "button-label") &&
      typeof value.move.inPlace === "boolean"
    );
  if (value.kind === "putenggame:playable:transformed")
    return (
      isRecord(value.edit) &&
      isRecord(value.edit.pick) &&
      isRecord(value.edit.transform) &&
      typeof value.edit.transform.scale === "number" &&
      Number.isFinite(value.edit.transform.scale) &&
      value.edit.transform.scale > 0 &&
      typeof value.edit.transform.rotation === "number" &&
      Number.isFinite(value.edit.transform.rotation) &&
      (value.edit.transform.originX === undefined ||
        (typeof value.edit.transform.originX === "number" &&
          Number.isFinite(value.edit.transform.originX))) &&
      (value.edit.transform.originY === undefined ||
        (typeof value.edit.transform.originY === "number" &&
          Number.isFinite(value.edit.transform.originY))) &&
      typeof value.edit.inPlace === "boolean"
    );
  if (value.kind === "putenggame:playable:deleted")
    return (
      isRecord(value.edit) &&
      isRecord(value.edit.pick) &&
      (value.edit.part === undefined ||
        value.edit.part === "button-label") &&
      typeof value.edit.inPlace === "boolean"
    );
  if (value.kind === "putenggame:playable:element-paste") {
    const copies = value.copies;
    return (
      typeof value.requestId === "string" &&
      Array.isArray(copies) &&
      copies.length > 0 &&
      copies.length <= 32 &&
      copies.reduce(
        (size, copy) =>
          size +
          (isRecord(copy) && typeof copy.html === "string"
            ? copy.html.length
            : Number.POSITIVE_INFINITY) +
          (isRecord(copy) && typeof copy.previewHtml === "string"
            ? copy.previewHtml.length
            : Number.POSITIVE_INFINITY),
        0,
      ) <=
        2 * 1024 * 1024 &&
      copies.every(
        (copy) =>
          isRecord(copy) &&
          isRecord(copy.pick) &&
          typeof copy.pick.nodeId === "string" &&
          typeof copy.pick.source === "string" &&
          typeof copy.pick.tag === "string" &&
          typeof copy.html === "string" &&
          copy.html.length > 0 &&
          copy.html.length <= 256 * 1024 &&
          typeof copy.previewHtml === "string" &&
          copy.previewHtml.length > 0 &&
          copy.previewHtml.length <= 256 * 1024 &&
          Array.isArray(copy.ids) &&
          copy.ids.length > 0 &&
          copy.ids.length <= 512 &&
          copy.ids.every(
            (id) =>
              typeof id === "string" && /^putenggame-copy-[\w-]+$/.test(id),
          ),
      )
    );
  }
  if (value.kind === "putenggame:playable:history-command")
    return value.command === "undo" || value.command === "redo";
  if (value.kind === "putenggame:playable:media-state")
    return (
      isRecord(value.state) &&
      typeof value.state.currentTime === "number" &&
      Number.isFinite(value.state.currentTime) &&
      typeof value.state.duration === "number" &&
      Number.isFinite(value.state.duration) &&
      typeof value.state.paused === "boolean" &&
      (value.state.backdropAssetId === undefined ||
        typeof value.state.backdropAssetId === "string")
    );
  if (value.kind === "putenggame:playable:vr-scene")
    return (
      typeof value.requestId === "string" &&
      typeof value.nodeId === "string" &&
      Array.isArray(value.buttons) &&
      value.buttons.length <= 256 &&
      value.buttons.every(
        (button) =>
          isRecord(button) &&
          typeof button.id === "string" &&
          button.id.length <= 128 &&
          typeof button.label === "string" &&
          button.label.length <= 256 &&
          ["x", "y", "width", "height"].every(
            (key) =>
              typeof button[key] === "number" &&
              Number.isFinite(button[key] as number) &&
              (button[key] as number) >= 0 &&
              (button[key] as number) <= 1,
          ) &&
          typeof button.color === "string" &&
          typeof button.backgroundColor === "string" &&
          (button.holdToCharge === undefined ||
            typeof button.holdToCharge === "boolean") &&
          (button.imageDataUrl === undefined ||
            (typeof button.imageDataUrl === "string" &&
              button.imageDataUrl.length <= 524288)) &&
          (button.pressedImageDataUrl === undefined ||
            (typeof button.pressedImageDataUrl === "string" &&
              button.pressedImageDataUrl.length <= 524288))
      )
    );
  if (value.kind === "putenggame:playable:keyboard-shortcut")
    return (
      value.shortcut === "select" ||
      value.shortcut === "text" ||
      value.shortcut === "move" ||
      value.shortcut === "draw" ||
      value.shortcut === "toggle-playback"
    );
  if (value.kind === "putenggame:playable:activity") return true;
  if (value.kind === "putenggame:playable:pick-cancelled") return true;
  return (
    (value.kind === "putenggame:playable:error" ||
      value.kind === "putenggame:playable:diagnostic") &&
    typeof value.error === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidPlayableMotionConfig(value: unknown): value is PlayableMotionConfig {
  if (!isRecord(value)) return false;
  return (
    [
      "countdown",
      "progress-ring",
      "progress-bar",
      "hold-charge",
      "swipe-button",
      "button-feedback",
    ].includes(String(value.kind)) &&
    ["interactive", "visual"].includes(String(value.mode)) &&
    typeof value.duration === "number" &&
    Number.isFinite(value.duration) &&
    value.duration >= 0.1 &&
    value.duration <= 3600 &&
    (value.timeoutDuration === undefined ||
      (typeof value.timeoutDuration === "number" &&
        Number.isFinite(value.timeoutDuration) &&
        value.timeoutDuration >= value.duration &&
        value.timeoutDuration <= 3600)) &&
    (value.signal === undefined || typeof value.signal === "string") &&
    (value.timeoutSignal === undefined ||
      typeof value.timeoutSignal === "string") &&
    (value.interaction === undefined ||
      [
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
      ].includes(String(value.interaction))) &&
    (value.requiredCount === undefined ||
      (typeof value.requiredCount === "number" &&
        Number.isInteger(value.requiredCount) &&
        value.requiredCount >= 2 &&
        value.requiredCount <= 20)) &&
    (value.ringAssetId === undefined ||
      (typeof value.ringAssetId === "string" &&
        /^[a-z0-9._-]{1,120}$/i.test(value.ringAssetId))) &&
    (value.ringAssetScale === undefined ||
      (typeof value.ringAssetScale === "number" &&
        Number.isInteger(value.ringAssetScale) &&
        value.ringAssetScale >= 25 &&
        value.ringAssetScale <= 300)) &&
    (value.barAssetId === undefined ||
      (typeof value.barAssetId === "string" &&
        /^[a-z0-9._-]{1,120}$/i.test(value.barAssetId))) &&
    (value.barAssetScale === undefined ||
      (typeof value.barAssetScale === "number" &&
        Number.isInteger(value.barAssetScale) &&
        value.barAssetScale >= 25 &&
        value.barAssetScale <= 300)) &&
    (value.barAssetOffsetX === undefined ||
      (typeof value.barAssetOffsetX === "number" &&
        Number.isInteger(value.barAssetOffsetX) &&
        value.barAssetOffsetX >= -100 &&
        value.barAssetOffsetX <= 100)) &&
    (value.barAssetOffsetY === undefined ||
      (typeof value.barAssetOffsetY === "number" &&
        Number.isInteger(value.barAssetOffsetY) &&
        value.barAssetOffsetY >= -100 &&
        value.barAssetOffsetY <= 100)) &&
    (value.swipeAssetId === undefined ||
      (typeof value.swipeAssetId === "string" &&
        /^[a-z0-9._-]{1,120}$/i.test(value.swipeAssetId))) &&
    (value.swipeStyle === undefined ||
      value.swipeStyle === "base" ||
      value.swipeStyle === "floating") &&
    (value.swipeBehavior === undefined ||
      value.swipeBehavior === "one-way" ||
      value.swipeBehavior === "two-way") &&
    (value.ringFill === undefined ||
      value.ringFill === "deplete" ||
      value.ringFill === "reveal") &&
    (value.ringRotation === undefined ||
      ["clockwise", "counterclockwise", "none"].includes(
        String(value.ringRotation),
      )) &&
    (value.feedback === undefined ||
      value.feedback === "hover-press" ||
      value.feedback === "idle-pulse-hover-press" ||
      value.feedback === "bounce-hover-press" ||
      value.feedback === "ripple-hint" ||
      value.feedback === "none") &&
    (value.kind !== "button-feedback" ||
      value.feedback === "hover-press" ||
      value.feedback === "idle-pulse-hover-press" ||
      value.feedback === "bounce-hover-press" ||
      value.feedback === "ripple-hint")
  );
}
