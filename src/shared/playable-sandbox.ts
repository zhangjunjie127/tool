import type { CompiledPlayableSurface } from "./playable-compiled.js";
import type { PlayableCleanup, PlayableNodeContext } from "./playable-nodes.js";
import {
  describePlayableSourceTarget,
  describePlayableAppearanceTarget,
  describePlayablePick,
  type PlayablePickResult,
} from "./playable-picker.js";
import {
  parsePlayableRotation,
  parsePlayableTranslate,
  playableCenteredScaleFactor,
  playableTransformOriginCorrection,
  roundRotation,
  roundScale,
  playableTranslateValue,
  roundOffset,
  type PlayableTransform,
  type PlayableTranslate,
} from "./playable-move.js";
import type {
  PlayableDeleteEdit,
  PlayableElementCopy,
  PlayableHistoryCommand,
  PlayableMove,
  PlayablePreviewTool,
  PlayableTextEdit,
  PlayableTextCreate,
  PlayableTextSelection,
  PlayableInteractionSelection,
  PlayableAppearanceTimingUpdate,
  PlayableMotionCommand,
  PlayableMediaCommand,
  PlayableMediaState,
  PlayableTextStyleCommand,
  PlayableTransformEdit,
  PlayableVrButton,
} from "./playable-player-protocol.js";
import { playableOriginalText } from "./playable-text-source.js";
import {
  PLAYABLE_BACKDROP_GRAIN_VARIABLE,
  PLAYABLE_BACKDROP_VIGNETTE_VARIABLE,
  type PlayableBackdropEffects,
} from "./playable-backdrop-effects.js";
import {
  PLAYABLE_BUTTON_PRESET_STYLE,
  mountPlayableMotionElement,
  PLAYABLE_MOTION_ATTRIBUTES,
  PLAYABLE_EDITOR_FEEDBACK_ANIMATION_ID,
  PLAYABLE_MOTION_HOLDING_ATTRIBUTE,
  PLAYABLE_MOTION_TIMING_UPDATE_EVENT,
  circularHoldChargeAssetFrame,
  playableButtonAssetScales,
  playableElementRuntimeScale,
  playableElementTransformScale,
  updatePlayableButtonLabelScale,
} from "./playable-motion.js";
import { PLAYABLE_SOURCE_ATTRIBUTE } from "./playable-source-locations.js";
import { cssFontFamilyName } from "./playable-fonts.js";
import { createPlayableSettingsService } from "./playable-settings.js";
import type {
  PlayableMountedSurface,
  PlayableSurfaceHost,
} from "./playable-runtime.js";

export const PLAYABLE_SANDBOX_CSP =
  "default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data: blob:; style-src 'unsafe-inline'; script-src 'self' blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const PLAYABLE_IFRAME_SANDBOX = "allow-scripts";

export interface PlayableSurfaceModule {
  mount(context: PlayableNodeContext): unknown;
}

export type PlayableModuleLoader = (javascript: string) => Promise<unknown>;

export class DocumentPlayableSurfaceHost implements PlayableSurfaceHost {
  readonly #document: Document;
  readonly #loadModule: PlayableModuleLoader;
  readonly #projectRoot: HTMLElement;
  readonly #nodeLayer: HTMLElement;
  #picking?: {
    stop: () => void;
    refresh: () => void;
    delete: (pick: PlayablePickResult) => void;
    copy: () => void;
    paste: () => Promise<void>;
    setLockedPicks: (picks: readonly PlayablePickResult[]) => void;
    alignToCenter: (
      reference: PlayablePickResult,
      targets: readonly PlayablePickResult[],
    ) => void;
  };
  #mediaListener?: (state: PlayableMediaState) => void;
  #vrButtonIds = new WeakMap<HTMLButtonElement, string>();
  #nextVrButtonId = 0;
  #mediaBindings = new WeakSet<HTMLVideoElement>();
  #vrBackdropStyles = new WeakMap<HTMLVideoElement, {
    width: string;
    height: string;
    objectFit: string;
    transform: string;
    transformOrigin: string;
  }>();
  #vrBackdropOverflow = new WeakMap<HTMLElement, string>();
  #mediaObservers: MutationObserver[] = [];
  #motionCleanups = new WeakMap<HTMLElement, () => void>();
  #motionContexts = new WeakMap<HTMLElement, PlayableNodeContext>();
  #motionContextsBySurface = new Map<string, PlayableNodeContext>();
  #buttonPresetCleanups = new WeakMap<HTMLElement, () => void>();
  #motionAssetUrlsByElement = new WeakMap<HTMLElement, string>();
  #ringMotionAssetUrlsByElement = new WeakMap<HTMLElement, string>();
  #barMotionAssetUrlsByElement = new WeakMap<HTMLElement, string>();
  #swipeMotionAssetUrlsByElement = new WeakMap<HTMLElement, string>();
  #pressedMotionAssetUrlsByElement = new WeakMap<HTMLElement, string>();
  #motionAssetUrls = new Set<string>();
  #surfaceStartedAt = new WeakMap<HTMLElement, number>();
  #surfacePausedAt = new WeakMap<HTMLElement, number>();
  #pausedAnimations = new WeakMap<HTMLElement, Animation[]>();
  #pausedVideos = new WeakMap<HTMLElement, HTMLVideoElement[]>();
  #timingTimer?: number;
  #backdropEffects?: PlayableBackdropEffects;
  #globalFontFamily?: string;
  #globalFontFamilyOverridden = false;
  #playerPaused = false;

  constructor(
    document: Document,
    loadModule: PlayableModuleLoader = loadPlayableModule,
  ) {
    this.#document = document;
    this.#loadModule = loadModule;
    assertPlayableSandboxDocument(document);
    installPlayableSandboxCsp(document);
    const scaffold = createSandboxScaffold(document);
    this.#projectRoot = scaffold.projectRoot;
    this.#nodeLayer = scaffold.nodeLayer;
  }

  mountNode(
    surface: CompiledPlayableSurface,
    context: Omit<PlayableNodeContext, "root">,
    onBackdropVideoEnded?: () => void,
  ): Promise<PlayableMountedSurface> {
    return this.#mount(this.#nodeLayer, surface, context, onBackdropVideoEnded).then(
      (mounted) => {
        if (this.#playerPaused) {
          const host = [
            ...this.#nodeLayer.querySelectorAll<HTMLElement>(
              "[data-playable-surface]",
            ),
          ].find((candidate) => candidate.dataset.playableSurface === surface.id);
          if (host?.shadowRoot)
            this.#pauseSurface(host, host.shadowRoot);
        }
        return mounted;
      },
    );
  }

  setMediaStateListener(
    listener: ((state: PlayableMediaState) => void) | undefined,
  ): void {
    this.#mediaListener = listener;
    this.#syncMedia();
  }

  setPlayerPaused(paused: boolean): void {
    if (this.#playerPaused === paused) return;
    this.#playerPaused = paused;
    for (const host of this.#nodeLayer.querySelectorAll<HTMLElement>(
      "[data-playable-surface]",
    )) {
      const root = host.shadowRoot;
      if (!root) continue;
      const stage = this.#stage(root);
      if (paused) this.#pauseSurface(host, root);
      else if (stage && !stage.hasAttribute("data-putenggame-awaiting-input"))
        this.#resumeSurface(host, root, stage);
    }
  }

  inspectVrButtons(
    nodeId: string,
    viewport: { width: number; height: number },
  ): PlayableVrButton[] {
    const surface = [...this.#nodeLayer.querySelectorAll<HTMLElement>(
      "[data-playable-surface]",
    )].find((candidate) => candidate.dataset.playableSurface === nodeId);
    const root = surface?.shadowRoot;
    if (!surface || !root) return [];
    const bounds = surface.getBoundingClientRect();
    const view = this.#document.defaultView;
    if (!bounds.width || !bounds.height || !view) return [];
    return [...root.querySelectorAll<HTMLButtonElement>("button")]
      .flatMap((button) => {
        const rect = button.getBoundingClientRect();
        const style = view.getComputedStyle(button);
        if (!rect.width || !rect.height || style.display === "none" || style.visibility === "hidden")
          return [];
        let id = this.#vrButtonIds.get(button);
        if (!id) {
          id = `vr-button-${++this.#nextVrButtonId}`;
          this.#vrButtonIds.set(button, id);
        }
        const imageDataUrl = buttonImageDataUrl(button);
        const pressedImageDataUrl = buttonImageDataUrl(
          button,
          "[data-putenggame-button-pressed-image] img",
        );
        const position = (value: number, size: number) =>
          Math.max(0, Math.min(1, value / size));
        return [{
          id,
          label: (button.getAttribute("aria-label") || button.textContent || button.title || "Button").trim().slice(0, 256),
          x: position(rect.left - bounds.left, bounds.width),
          y: position(rect.top - bounds.top, bounds.height),
          width: position(rect.width, bounds.width),
          height: position(rect.height, bounds.height),
          color: style.color.slice(0, 128),
          backgroundColor: style.backgroundColor.slice(0, 128),
          ...(button.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.kind) ===
          "hold-charge"
            ? { holdToCharge: true }
            : {}),
          ...(imageDataUrl ? { imageDataUrl } : {}),
          ...(pressedImageDataUrl ? { pressedImageDataUrl } : {}),
        }];
      })
      .slice(0, 256);
  }

  activateVrButton(nodeId: string, buttonId: string): void {
    const surface = [...this.#nodeLayer.querySelectorAll<HTMLElement>(
      "[data-playable-surface]",
    )].find((candidate) => candidate.dataset.playableSurface === nodeId);
    const button = [...(surface?.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
      .find((candidate) => this.#vrButtonIds.get(candidate) === buttonId);
    if (button && !button.disabled) button.click();
  }

  pressVrButton(
    nodeId: string,
    buttonId: string,
    phase: "start" | "end",
  ): void {
    const surface = [...this.#nodeLayer.querySelectorAll<HTMLElement>(
      "[data-playable-surface]",
    )].find((candidate) => candidate.dataset.playableSurface === nodeId);
    const button = [...(surface?.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
      .find((candidate) => this.#vrButtonIds.get(candidate) === buttonId);
    const view = button?.ownerDocument.defaultView;
    if (!button || button.disabled || !view) return;
    const type = phase === "start" ? "pointerdown" : "pointerup";
    const event = view.PointerEvent
      ? new view.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: -1,
          pointerType: "xr",
          isPrimary: true,
          button: 0,
          buttons: phase === "start" ? 1 : 0,
        })
      : new view.Event(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
        });
    button.dispatchEvent(event);
  }

  controlMedia(command: PlayableMediaCommand): void {
    if (command.command === "vr-eye-preview") {
      const surface = [...this.#nodeLayer.querySelectorAll<HTMLElement>(
        "[data-playable-surface]",
      )].find((candidate) => candidate.dataset.playableSurface === command.nodeId);
      const backdrop = surface?.shadowRoot?.querySelector<HTMLElement>(
        '[data-media="backdrop"]',
      );
      const video = backdrop?.querySelector<HTMLVideoElement>("video");
      if (!backdrop || !video) return;
      const original = this.#vrBackdropStyles.get(video);
      if (command.eye === "full") {
        if (original) Object.assign(video.style, original);
        this.#vrBackdropStyles.delete(video);
        const overflow = this.#vrBackdropOverflow.get(backdrop);
        if (overflow !== undefined) backdrop.style.overflow = overflow;
        this.#vrBackdropOverflow.delete(backdrop);
        return;
      }
      if (!original) {
        this.#vrBackdropOverflow.set(backdrop, backdrop.style.overflow);
        this.#vrBackdropStyles.set(video, {
          width: video.style.width,
          height: video.style.height,
          objectFit: video.style.objectFit,
          transform: video.style.transform,
          transformOrigin: video.style.transformOrigin,
        });
      }
      backdrop.style.overflow = "hidden";
      Object.assign(video.style, {
        width: "200%",
        height: "100%",
        objectFit: "fill",
        transform: command.eye === "left" ? "translateX(0)" : "translateX(-50%)",
        transformOrigin: "left center",
      });
      return;
    }
    if (command.command === "set-backdrop") {
      const surface = [
        ...this.#nodeLayer.querySelectorAll<HTMLElement>(
          "[data-playable-surface]",
        ),
      ].find(
        (candidate) => candidate.dataset.playableSurface === command.nodeId,
      );
      const root = surface?.shadowRoot;
      const backdrop = root?.querySelector<HTMLElement>(
        '[data-media="backdrop"]',
      );
      if (!backdrop) return;
      const currentAssetId = backdrop.getAttribute("data-asset");
      const currentType = backdrop.getAttribute("data-type");
      const nextAsset = command.asset;
      if (
        nextAsset &&
        currentAssetId === nextAsset.assetId &&
        currentType === nextAsset.type
      ) {
        if (nextAsset.type === "video") {
          const video = backdrop.querySelector("video");
          if (video) video.loop = nextAsset.loop ?? false;
        }
        if (nextAsset.loop) backdrop.setAttribute("data-loop", "true");
        else backdrop.removeAttribute("data-loop");
        return;
      }
      const previousVideo = backdrop.querySelector<HTMLVideoElement>("video");
      previousVideo?.pause();
      const previousUrl = backdrop.dataset.putenggameBackdropUrl;
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
        this.#motionAssetUrls.delete(previousUrl);
        delete backdrop.dataset.putenggameBackdropUrl;
      }
      if (!nextAsset) {
        backdrop.removeAttribute("data-asset");
        backdrop.removeAttribute("data-type");
        backdrop.removeAttribute("data-loop");
        backdrop.replaceChildren();
        this.#syncMedia();
        return;
      }
      const url = URL.createObjectURL(
        new Blob([nextAsset.transfer.bytes], {
          type: nextAsset.transfer.contentType,
        }),
      );
      this.#motionAssetUrls.add(url);
      backdrop.dataset.putenggameBackdropUrl = url;
      backdrop.setAttribute("data-asset", nextAsset.assetId);
      backdrop.setAttribute("data-type", nextAsset.type);
      if (nextAsset.loop) backdrop.setAttribute("data-loop", "true");
      else backdrop.removeAttribute("data-loop");
      if (nextAsset.type === "image") {
        const image = this.#document.createElement("img");
        image.src = url;
        image.alt = "";
        backdrop.replaceChildren(image);
      } else {
        const video = this.#document.createElement("video");
        video.src = url;
        video.playsInline = true;
        video.loop = nextAsset.loop ?? false;
        backdrop.replaceChildren(video);
        void video.play?.().catch(() => {
          video.muted = true;
          return video.play?.();
        }).catch(() => {});
      }
      this.#syncMedia();
      return;
    }
    if (command.command === "insert-button-preset") {
      const surface = [
        ...this.#nodeLayer.querySelectorAll<HTMLElement>(
          "[data-playable-surface]",
        ),
      ].find(
        (candidate) => candidate.dataset.playableSurface === command.nodeId,
      );
      const root = surface?.shadowRoot;
      const context = this.#motionContextsBySurface.get(command.nodeId);
      if (!root || !context) return;
      const element = this.#document.createElement("button");
      element.id = command.id;
      element.type = "button";
      element.textContent = command.buttonText ?? command.label;
      element.setAttribute(PLAYABLE_SOURCE_ATTRIBUTE, command.source);
      if (command.signal) element.setAttribute("data-signal", command.signal);
      element.setAttribute("data-putenggame-button-preset", "");
      if (command.buttonAction)
        element.setAttribute(
          PLAYABLE_MOTION_ATTRIBUTES.buttonAction,
          command.buttonAction,
        );
      if (command.buttonAction === "back")
        element.setAttribute(
          PLAYABLE_MOTION_ATTRIBUTES.showAfterVideoEnd,
          "",
        );
      Object.assign(element.style, {
        position: "absolute",
        left: "50cqw",
        top: "50cqh",
        transform: "translate(-50%, -50%)",
        ...(command.buttonAction === "back"
          ? {
              width: "14cqw",
              height: "auto",
              minWidth: "0",
              minHeight: "0",
              padding: "0",
              borderRadius: "0",
              aspectRatio: "auto",
            }
          : { minWidth: "14cqw", padding: "1cqh 2cqw" }),
        ...PLAYABLE_BUTTON_PRESET_STYLE,
      });
      if (command.fontFamily) element.style.fontFamily = command.fontFamily;
      if (command.motion) {
        element.setAttribute(
          PLAYABLE_MOTION_ATTRIBUTES.kind,
          command.motion.kind,
        );
        element.setAttribute(
          PLAYABLE_MOTION_ATTRIBUTES.mode,
          command.motion.mode,
        );
        element.setAttribute(
          PLAYABLE_MOTION_ATTRIBUTES.duration,
          String(command.motion.duration),
        );
      }
      (
        root.querySelector<HTMLElement>(".stage") ??
        root.firstElementChild ??
        root
      ).append(element);
      this.#buttonPresetCleanups.set(
        element,
        this.#bindButtonPreset(element, context),
      );
      if (command.motion)
        this.updateMotion({
          sequence: 0,
          target: {
            kind: "create",
            id: command.id,
            nodeId: command.nodeId,
            source: command.source,
          },
          config: command.motion,
          ...(command.assetId ? { assetId: command.assetId } : {}),
          ...(command.asset ? { asset: command.asset } : {}),
          ...(command.pressedAssetId
            ? { pressedAssetId: command.pressedAssetId }
            : {}),
          ...(command.pressedAsset
            ? { pressedAsset: command.pressedAsset }
            : {}),
          ...(command.motion.ringAssetId && command.ringAsset
            ? { ringAsset: command.ringAsset }
            : {}),
          ...(command.motion.barAssetId && command.barAsset
            ? { barAsset: command.barAsset }
            : {}),
          ...(command.motion.swipeAssetId && command.swipeAsset
            ? { swipeAsset: command.swipeAsset }
            : {}),
        });
      this.#updateTimedVisibility();
      this.#picking?.refresh();
      return;
    }
    if (command.command === "insert-media") {
      const surface = [
        ...this.#nodeLayer.querySelectorAll<HTMLElement>(
          "[data-playable-surface]",
        ),
      ].find(
        (candidate) => candidate.dataset.playableSurface === command.nodeId,
      );
      const root = surface?.shadowRoot;
      if (!root) return;
      const element = this.#document.createElement(
        command.type === "image" ? "img" : "video",
      );
      element.setAttribute(PLAYABLE_SOURCE_ATTRIBUTE, command.source);
      element.setAttribute("data-putenggame-asset", command.assetId);
      Object.assign(element.style, {
        position: "absolute",
        left: "35cqw",
        top: "30cqh",
        width: "30cqw",
        maxHeight: "60cqh",
        objectFit: "contain",
      });
      const url = URL.createObjectURL(
        new Blob([command.asset.bytes], { type: command.asset.contentType }),
      );
      this.#motionAssetUrls.add(url);
      if (command.type === "image") {
        const image = element as HTMLImageElement;
        image.alt = "";
        image.draggable = false;
        image.src = url;
      } else {
        const video = element as HTMLVideoElement;
        video.autoplay = true;
        video.muted = true;
        video.loop = command.loop ?? true;
        video.playsInline = true;
        video.src = url;
        void video.play().catch(() => {});
      }
      (
        root.querySelector<HTMLElement>(".stage") ??
        root.firstElementChild ??
        root
      ).append(element);
      this.#picking?.refresh();
      this.#syncMedia();
      return;
    }
    if (command.command === "backdrop-loop") {
      for (const host of this.#nodeLayer.querySelectorAll<HTMLElement>(
        "[data-playable-surface]",
      )) {
        const video = host.shadowRoot?.querySelector<HTMLVideoElement>(
          '[data-media="backdrop"] video',
        );
        if (video) video.loop = command.loop;
      }
      return;
    }
    if (command.command === "picture-in-picture-video-loop") {
      for (const host of this.#nodeLayer.querySelectorAll<HTMLElement>(
        "[data-playable-surface]",
      )) {
        if (host.dataset.playableSurface !== command.nodeId) continue;
        for (const video of
          host.shadowRoot?.querySelectorAll<HTMLVideoElement>(
            'video[id^="putenggame-media-"]',
          ) ?? [])
          video.loop = command.loop;
      }
      return;
    }
    if (command.command === "continue-without-input") {
      for (const host of this.#nodeLayer.querySelectorAll<HTMLElement>(
        "[data-playable-surface]",
      )) {
        const root = host.shadowRoot;
        if (host.dataset.playableSurface !== command.nodeId || !root) continue;
        const stage =
          root.querySelector<HTMLElement>("main, .stage") ??
          [...root.children].find(
            (element): element is HTMLElement =>
              element instanceof HTMLElement && element.tagName !== "STYLE",
          );
        if (!stage) return;
        this.#setNoInputMode(
          host,
          root,
          stage,
          command.enabled ? "continue" : undefined,
        );
        return;
      }
      return;
    }
    if (command.command === "no-input-mode") {
      for (const host of this.#nodeLayer.querySelectorAll<HTMLElement>(
        "[data-playable-surface]",
      )) {
        const root = host.shadowRoot;
        if (host.dataset.playableSurface !== command.nodeId || !root) continue;
        const stage = this.#stage(root);
        if (stage)
          this.#setNoInputMode(host, root, stage, command.mode);
        return;
      }
      return;
    }
    if (command.command === "button-asset-scale") {
      const host = [
        ...this.#nodeLayer.querySelectorAll<HTMLElement>(
          "[data-playable-surface]",
        ),
      ].find(
        (candidate) => candidate.dataset.playableSurface === command.nodeId,
      );
      const root = host?.shadowRoot;
      if (!root) return;
      try {
        const element = root.querySelector<HTMLElement>(command.cssPath);
        if (
          element?.tagName.toLowerCase() !== "button" ||
          element.getAttribute(PLAYABLE_SOURCE_ATTRIBUTE) !== command.source
        )
          return;
        const previousAssetScale = playableButtonAssetScales(element);
        const [renderedScaleX, renderedScaleY] = parseScaleAxes(
          element.style.scale,
        );
        const frameScaleX = renderedScaleX / (previousAssetScale.x / 100);
        const frameScaleY = renderedScaleY / (previousAssetScale.y / 100);
        if (!element.querySelector("[data-putenggame-button-asset-image] img"))
          return;
        element.setAttribute(
          PLAYABLE_MOTION_ATTRIBUTES.assetScaleX,
          String(command.scaleX),
        );
        element.setAttribute(
          PLAYABLE_MOTION_ATTRIBUTES.assetScaleY,
          String(command.scaleY),
        );
        element.style.scale = `${frameScaleX * (command.scaleX / 100)} ${frameScaleY * (command.scaleY / 100)}`;
        updatePlayableButtonLabelScale(element);
        this.#picking?.refresh();
      } catch {
        return;
      }
      return;
    }
    if (command.command === "element-scale-preview") {
      const host = [
        ...this.#nodeLayer.querySelectorAll<HTMLElement>(
          "[data-playable-surface]",
        ),
      ].find(
        (candidate) => candidate.dataset.playableSurface === command.nodeId,
      );
      const root = host?.shadowRoot;
      if (!root) return;
      try {
        const element = root.querySelector<HTMLElement>(command.cssPath);
        if (
          !element ||
          element.getAttribute(PLAYABLE_SOURCE_ATTRIBUTE) !== command.source
        )
          return;
        element.style.scale = playableElementRuntimeScale(
          element,
          command.scale,
        );
        this.#picking?.refresh();
      } catch {
        return;
      }
      return;
    }
    if (command.command === "motion-progress-preview") {
      const host = [
        ...this.#nodeLayer.querySelectorAll<HTMLElement>(
          "[data-playable-surface]",
        ),
      ].find((candidate) => candidate.dataset.playableSurface === command.nodeId);
      const root = host?.shadowRoot;
      if (!root) return;
      try {
        const element = root.querySelector<HTMLElement>(command.cssPath);
        if (
          !element ||
          element.getAttribute(PLAYABLE_SOURCE_ATTRIBUTE) !== command.source
        )
          return;
        let preview = element.querySelector<HTMLElement>(
          "[data-putenggame-motion-progress-preview]",
        );
        if (!preview) {
          if (this.#document.defaultView?.getComputedStyle(element).position === "static")
            element.style.position = "relative";
          preview = this.#document.createElement("span");
          preview.dataset.putenggameMotionProgressPreview = "";
          Object.assign(preview.style, {
            position: "absolute",
            display: "grid",
            placeItems: "center",
            overflow: "visible",
            pointerEvents: "none",
          });
          element.append(preview);
        }
        preview.style.zIndex = command.barLayer === "bottom" ? "-2" : "2";
        const buttonBaseImage = element.querySelector<HTMLElement>(
          "[data-putenggame-button-asset-image]",
        );
        if (buttonBaseImage) element.style.isolation = "isolate";
        const oldUrl = preview.dataset.assetUrl;
        if (oldUrl) {
          URL.revokeObjectURL(oldUrl);
          this.#motionAssetUrls.delete(oldUrl);
        }
        const motionUi = element.querySelector<HTMLElement>(
          "[data-putenggame-motion-ui]",
        );
        if (motionUi)
          motionUi.style.zIndex =
            command.barLayer === "bottom" ? "-2" : "2";
        const url = URL.createObjectURL(
          new Blob([command.asset.bytes], { type: command.asset.contentType }),
        );
        this.#motionAssetUrls.add(url);
        preview.dataset.assetUrl = url;
        if (command.circular) {
          Object.assign(preview.style, {
            inset: "0",
            left: "",
            right: "",
            bottom: "",
            width: "100%",
            height: "100%",
          });
          const frame = circularHoldChargeAssetFrame({
            scale: command.scale,
            offsetX: command.offsetX,
            offsetY: command.offsetY,
          });
          const svg = this.#document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
          );
          svg.setAttribute("viewBox", "0 0 100 100");
          Object.assign(svg.style, {
            position: "absolute",
            inset: "0",
            width: "100%",
            height: "100%",
          });
          const image = this.#document.createElementNS(
            "http://www.w3.org/2000/svg",
            "image",
          );
          image.setAttribute("data-putenggame-motion-bar-preview", "");
          image.setAttribute("href", url);
          image.setAttribute("x", String(frame.x));
          image.setAttribute("y", String(frame.y));
          image.setAttribute("width", String(frame.width));
          image.setAttribute("height", String(frame.height));
          image.setAttribute("preserveAspectRatio", "xMidYMid meet");
          svg.append(image);
          preview.replaceChildren(svg);
          return;
        }
        Object.assign(preview.style, {
          inset: "",
          left: "8%",
          right: "8%",
          bottom: "0.2em",
          width: "",
          height: "1em",
        });
        preview.replaceChildren();
        const fill = element.querySelector<HTMLElement>(
          "[data-putenggame-motion-fill]",
        );
        let image = fill?.querySelector<HTMLImageElement>(
          "[data-putenggame-motion-bar]",
        );
        if (fill && !image) {
          image = this.#document.createElement("img");
          image.dataset.putenggameMotionBar = "";
          image.alt = "";
          image.draggable = false;
          Object.assign(image.style, {
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "fill",
            transformOrigin: "center",
          });
          fill.append(image);
        }
        if (image) {
          const previousUrl = image.dataset.previewAssetUrl;
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl);
            this.#motionAssetUrls.delete(previousUrl);
          }
          image.dataset.previewAssetUrl = url;
          image.src = url;
          image.style.transform = `translate(${command.offsetX ?? 0}%, ${command.offsetY ?? 0}%) scale(${command.scale / 100})`;
          image.style.transformOrigin = "center";
          preview.remove();
          return;
        }
        image = preview.querySelector("img");
        if (!image) {
          image = this.#document.createElement("img");
          image.alt = "";
          image.draggable = false;
          Object.assign(image.style, {
            width: "100%",
            height: "100%",
            objectFit: "contain",
          });
          preview.append(image);
        }
        image.src = url;
        image.style.transform = `translate(${command.offsetX ?? 0}%, ${command.offsetY ?? 0}%) scale(${command.scale / 100})`;
        image.style.transformOrigin = "center";
      } catch {
        return;
      }
      return;
    }
    const video = this.#targetBackdropVideo();
    if (!video) return;
    if (command.command === "seek") {
      video.currentTime = Math.min(
        Math.max(0, command.time),
        Number.isFinite(video.duration) ? video.duration : command.time,
      );
      this.#emitMediaState(video);
      return;
    }
    if (command.command === "pause") {
      video.pause();
      this.#emitMediaState(video);
      return;
    }
    void video.play().catch(() => this.#emitMediaState(video));
  }

  setBackdropEffects(effects: PlayableBackdropEffects): void {
    this.#backdropEffects = { ...effects };
    for (const host of this.#projectRoot.querySelectorAll<HTMLElement>(
      "[data-playable-surface]",
    )) {
      this.#applyBackdropEffects(host, effects);
    }
  }

  setGlobalFontFamily(family: string | undefined): void {
    this.#globalFontFamily = family;
    this.#globalFontFamilyOverridden = true;
    const style = globalFontStyleText(family);
    for (const host of this.#projectRoot.querySelectorAll<HTMLElement>(
      "[data-playable-surface]",
    )) {
      const fontStyle = host.shadowRoot?.querySelector<HTMLStyleElement>(
        "style[data-playable-global-font]",
      );
      if (fontStyle) fontStyle.textContent = style;
    }
  }

  destroy(): void {
    this.stopPicking();
    if (this.#timingTimer !== undefined)
      this.#document.defaultView!.clearTimeout(this.#timingTimer);
    for (const observer of this.#mediaObservers) observer.disconnect();
    this.#mediaObservers = [];
    for (const url of this.#motionAssetUrls) URL.revokeObjectURL(url);
    this.#motionAssetUrls.clear();
    this.#mediaListener = undefined;
    this.#projectRoot.remove();
  }

  /**
   * Hands the preview's input to an authoring tool until it is stopped. The
   * element under the pointer is outlined and surfaces receive no pointer or
   * keyboard input. With `select`, each click reports an element; holding
   * Shift, Command, or Control adds it to the selection, and dragging across
   * the preview selects every visible source element inside the rectangle.
   * With `text`, a click
   * makes an element's text editable in place; Enter or leaving the element
   * reports the edit and Escape reverts it. With `move`, dragging an element
   * moves it and reports where it ended up; Escape during a drag puts it
   * back. Escape otherwise cancels the tool.
   */
  startPicking(
    tool: PlayablePreviewTool,
    handlers: {
      onPick: (result: PlayablePickResult, additive: boolean) => void;
      onTextSelect: (selection: PlayableTextSelection | undefined) => void;
      onInteractionSelect: (
        selection: PlayableInteractionSelection,
        additive: boolean,
      ) => void;
      onTextEdit: (edit: PlayableTextEdit) => void;
      onTextCreate: (text: PlayableTextCreate) => void;
      onMove: (move: PlayableMove) => void;
      onTransform: (edit: PlayableTransformEdit) => void;
      onDelete: (edit: PlayableDeleteEdit) => void;
      onDeleteSelection?: () => void;
      onContextMenu?: (position: {
        x: number;
        y: number;
        viewportWidth: number;
        viewportHeight: number;
      }) => void;
      onPasteElements: (
        copies: PlayableElementCopy[],
      ) => Promise<Record<string, string> | undefined>;
      onHistoryCommand?: (command: PlayableHistoryCommand) => void;
      onCancel: () => void;
    },
  ): void {
    this.stopPicking();
    const view = this.#document.defaultView!;
    const outline = this.#document.createElement("div");
    outline.dataset.playablePickOutline = "true";
    Object.assign(outline.style, {
      position: "absolute",
      zIndex: "2",
      pointerEvents: "none",
      boxSizing: "border-box",
      border: "2px solid #4f8cff",
      background: tool === "text" ? "transparent" : "rgba(79, 140, 255, 0.12)",
      display: "none",
    });
    const handles =
      tool === "select" ? createTransformHandles(this.#document) : [];
    outline.append(...handles);
    this.#projectRoot.append(outline);
    const selectionOutlines = new Map<string, HTMLDivElement>();
    const marquee = this.#document.createElement("div");
    marquee.dataset.playablePickMarquee = "true";
    Object.assign(marquee.style, {
      position: "absolute",
      zIndex: "4",
      pointerEvents: "none",
      boxSizing: "border-box",
      border: "1px dashed #4f8cff",
      background: "rgba(79, 140, 255, 0.12)",
      display: "none",
    });
    this.#projectRoot.append(marquee);
    const previousCursor = this.#projectRoot.style.cursor;
    const idleCursor =
      tool === "text" ? "text" : tool === "move" ? "grab" : "crosshair";
    this.#projectRoot.style.cursor = idleCursor;
    const temporaryButtonLabels =
      tool === "move" ? [] : wrapButtonLabelsForPicking(this.#projectRoot);
    const selectableElements = new Set(
      selectableSourceTargets(this.#projectRoot),
    );
    const movableElements = tool === "move" ? selectableElements : undefined;
    let lockedPickKeys = new Set<string>();
    let editing: TextEditing | undefined;
    let dragging: Dragging | undefined;
    let selected: SelectedElement | undefined;
    let selectedElements: SelectedElement[] = [];
    let transforming: Transforming | undefined;
    let marqueeDrag: MarqueeDrag | undefined;
    let pendingClickPath: readonly EventTarget[] | undefined;
    let textSequence = 0;
    let copySequence = 0;
    let copiedElements: SelectedElement[] = [];

    const inside = (event: Event) =>
      Boolean(editing && event.composedPath().includes(editing.element));
    const block = (event: Event) => {
      // Input to the element being edited keeps its default action, such as
      // typing, but still never reaches the surface's own listeners.
      if (!inside(event)) event.preventDefault();
      event.stopImmediatePropagation();
    };
    const projectScale = (root: DOMRect) => ({
      x:
        root.width > 0 && this.#projectRoot.clientWidth > 0
          ? this.#projectRoot.clientWidth / root.width
          : 1,
      y:
        root.height > 0 && this.#projectRoot.clientHeight > 0
          ? this.#projectRoot.clientHeight / root.height
          : 1,
    });
    const place = (box: PlayablePickResult["box"] | undefined) => {
      const selectionLocked = Boolean(
        selected &&
          lockedPickKeys.has(selectionKey(selected.pick, selected.part)),
      );
      for (const handle of handles) {
        handle.style.display = selectionLocked
          ? "none"
          : handle.dataset.playableTransformHandle === "rotate" &&
              selected?.pick.tag === "button"
            ? "none"
            : "";
      }
      if (!box) {
        outline.style.display = "none";
        return;
      }
      const root = this.#projectRoot.getBoundingClientRect();
      const scale = projectScale(root);
      Object.assign(outline.style, {
        display: "block",
        left: `${(box.x - root.x) * scale.x}px`,
        top: `${(box.y - root.y) * scale.y}px`,
        width: `${box.width * scale.x}px`,
        height: `${box.height * scale.y}px`,
      });
    };
    const placeSelectionBox = (
      target: HTMLElement,
      box: PlayablePickResult["box"] | undefined,
    ) => {
      if (!box) {
        target.style.display = "none";
        return;
      }
      const root = this.#projectRoot.getBoundingClientRect();
      const scale = projectScale(root);
      Object.assign(target.style, {
        display: "block",
        left: `${(box.x - root.x) * scale.x}px`,
        top: `${(box.y - root.y) * scale.y}px`,
        width: `${box.width * scale.x}px`,
        height: `${box.height * scale.y}px`,
      });
    };
    const selectionKey = (
      pick: PlayablePickResult,
      part?: SelectedElement["part"],
    ) =>
      `${pick.nodeId}:${pick.cssPath}:${part ?? pick.part ?? "element"}:${pick.partId ?? ""}`;
    const createSelectionOutline = () => {
      const target = this.#document.createElement("div");
      target.dataset.playablePickOutline = "multiple";
      Object.assign(target.style, {
        position: "absolute",
        zIndex: "2",
        pointerEvents: "none",
        boxSizing: "border-box",
        border: "2px solid #4f8cff",
        background: "rgba(79, 140, 255, 0.08)",
        display: "none",
      });
      this.#projectRoot.append(target);
      return target;
    };
    const placeSelectionOutlines = () => {
      const activeKey = selected
        ? selectionKey(selected.pick, selected.part)
        : undefined;
      const currentKeys = new Set(
        selectedElements
          .filter(
            (item) =>
              selectionKey(item.pick, item.part) !== activeKey,
          )
          .map((item) => selectionKey(item.pick, item.part)),
      );
      for (const [key, target] of selectionOutlines) {
        if (!currentKeys.has(key)) {
          target.remove();
          selectionOutlines.delete(key);
        }
      }
      for (const item of selectedElements) {
        const key = selectionKey(item.pick, item.part);
        if (key === activeKey) continue;
        const target = selectionOutlines.get(key) ?? createSelectionOutline();
        selectionOutlines.set(key, target);
        placeSelectionBox(target, selectedBox(item.element));
      }
      place(selected ? selectedBox(selected.element) : undefined);
    };
    const placeSelected = () => placeSelectionOutlines();
    const placeMarquee = () => {
      const current = marqueeDrag;
      if (!current) {
        marquee.style.display = "none";
        return;
      }
      const box = rectangle(current.start, current.current);
      const root = this.#projectRoot.getBoundingClientRect();
      const scale = projectScale(root);
      Object.assign(marquee.style, {
        display: "block",
        left: `${(box.x - root.x) * scale.x}px`,
        top: `${(box.y - root.y) * scale.y}px`,
        width: `${box.width * scale.x}px`,
        height: `${box.height * scale.y}px`,
      });
    };
    const hover = (event: Event) => {
      block(event);
      if (editing) return;
      if (transforming) return dragTransform(event as PointerEvent);
      if (dragging) return drag(event as PointerEvent);
      if (marqueeDrag) {
        const pointer = event as PointerEvent;
        if (pointer.pointerId === marqueeDrag.pointerId) {
          marqueeDrag.current = { x: pointer.clientX, y: pointer.clientY };
          placeMarquee();
        }
        return;
      }
      if (tool === "select" && selected) return placeSelected();
      if (tool === "move")
        return place(
          movableElements
            ? movableTarget(
                event.composedPath(),
                movableElements,
                (event as PointerEvent).clientX,
                (event as PointerEvent).clientY,
              )?.pick.box
            : undefined,
        );
      const path = event.composedPath();
      const pointer = event as PointerEvent;
      const hitTarget =
        tool === "select"
          ? selectableElementAtPoint(
              path,
              selectableElements,
              pointer.clientX,
              pointer.clientY,
            )
          : undefined;
      const buttonTarget =
        tool === "select"
          ? path.find(
              (target): target is HTMLElement =>
                target instanceof HTMLElement &&
                target.matches('button, [role="button"]'),
            )
          : undefined;
      const pointTarget = buttonTarget ?? hitTarget;
      const pick = pointTarget
        ? pickForElement(pointTarget)
        : describePlayablePick(path);
      const target = path[0];
      if (pick && tool === "select" && !pick.source) {
        place(undefined);
        return;
      }
      const sourceTarget = describePlayableSourceTarget(path);
      if (
        sourceTarget?.pick.mediaSlot === "backdrop" ||
        pick?.mediaSlot === "backdrop"
      ) {
        place(undefined);
        return;
      }
      place(
        pick && (tool === "select" || isTextTarget(target))
          ? pick.box
          : undefined,
      );
    };
    const finish = (commit: boolean) => {
      const current = editing;
      if (!current) return;
      editing = undefined;
      const { element, editor, pick, before, inPlace } = current;
      editor.removeEventListener("blur", current.onBlur);
      const after = (editor.textContent ?? "").trim();
      const changed = commit && after && after !== before.trim();
      if (current.creation) {
        editor.removeAttribute("contenteditable");
        if (changed)
          handlers.onTextCreate({ ...current.creation, text: after });
        else element.remove();
        place(undefined);
        return;
      }
      editor.remove();
      current.placeholders.forEach((placeholder, index) => {
        if (changed && index === 0) {
          placeholder.replaceWith(
            this.#document.createTextNode(
              `${current.leadingText}${after}${current.trailingText}`,
            ),
          );
        } else if (changed) {
          placeholder.remove();
        } else {
          placeholder.replaceWith(current.originalNodes[index]!);
        }
      });
      place(commit ? selectedBox(element) : undefined);
      if (changed)
        handlers.onTextEdit({
          pick,
          before,
          after,
          sourceBefore: current.sourceBefore,
          inPlace,
        });
    };
    const contextMenu = (event: Event) => {
      const mouse = event as MouseEvent;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (tool !== "select" || mouse.button !== 2) return;
      const path = event.composedPath();
      if (!selectedElements.some(({ element }) => path.includes(element))) {
        const target = path.find(
          (item): item is Element => item instanceof Element,
        );
        target?.dispatchEvent(
          new view.MouseEvent("click", {
            bubbles: true,
            composed: true,
            clientX: mouse.clientX,
            clientY: mouse.clientY,
          }),
        );
      }
      if (selectedElements.length)
        handlers.onContextMenu?.({
          x: mouse.clientX,
          y: mouse.clientY,
          viewportWidth: view.innerWidth,
          viewportHeight: view.innerHeight,
        });
    };
    const createText = (event: Event) => {
      block(event);
      if (tool !== "text" || editing) return;
      const path = event.composedPath();
      const surfaceIndex = path.findIndex(
        (target) =>
          target instanceof HTMLElement &&
          target.hasAttribute("data-playable-surface"),
      );
      if (surfaceIndex < 0) return;
      const inside = path
        .slice(0, surfaceIndex)
        .filter(
          (target): target is HTMLElement => target instanceof HTMLElement,
        );
      if (
        inside.some(
          (element) =>
            !isBackdropElement(element) &&
            (isFrameText(element) ||
              isFrameMedia(element) ||
              isFrameInteraction(element)),
        )
      )
        return;
      const surface = path[surfaceIndex] as HTMLElement;
      const parent = Array.from(surface.shadowRoot?.children ?? []).find(
        (element) => element.tagName.toLowerCase() !== "style",
      ) as HTMLElement | undefined;
      const bounds = surface.getBoundingClientRect();
      if (
        !parent ||
        !bounds.width ||
        !bounds.height ||
        !surface.dataset.playableSurface
      )
        return;
      const mouse = event as MouseEvent;
      const creation = {
        id: `putenggame-text-${Date.now()}-${++textSequence}`,
        nodeId: surface.dataset.playableSurface,
        x: Math.max(
          0,
          Math.min(100, ((mouse.clientX - bounds.left) / bounds.width) * 100),
        ),
        y: Math.max(
          0,
          Math.min(100, ((mouse.clientY - bounds.top) / bounds.height) * 100),
        ),
      };
      const element = this.#document.createElement("p");
      element.id = creation.id;
      Object.assign(element.style, {
        position: "absolute",
        left: `${creation.x}cqw`,
        top: `${creation.y}cqh`,
        margin: "0",
        minWidth: "1em",
        minHeight: "1.2em",
        whiteSpace: "pre-wrap",
      });
      parent.append(element);
      const onBlur = () => finish(true);
      editing = {
        element,
        editor: element,
        placeholders: [],
        originalNodes: [],
        leadingText: "",
        trailingText: "",
        pick: {
          nodeId: creation.nodeId,
          cssPath: `#${creation.id}`,
          tag: "p",
          text: "",
          box: selectedBox(element),
        },
        before: "",
        inPlace: false,
        creation,
        onBlur,
      };
      element.setAttribute("contenteditable", "plaintext-only");
      element.addEventListener("blur", onBlur);
      element.focus();
      place(selectedBox(element));
    };
    const press = (event: Event) => {
      const pointer = event as PointerEvent;
      const handle = transformHandle(event.composedPath());
      if (
        tool === "select" &&
        handle &&
        selected &&
        !lockedPickKeys.has(selectionKey(selected.pick, selected.part)) &&
        pointer.button === 0
      ) {
        block(event);
        startTransform(handle.kind, pointer);
        return;
      }
      block(event);
      if (tool === "select" && pointer.button === 0 && !transforming) {
        pendingClickPath = undefined;
        marqueeDrag = {
          pointerId: pointer.pointerId,
          start: { x: pointer.clientX, y: pointer.clientY },
          current: { x: pointer.clientX, y: pointer.clientY },
          additive: pointer.shiftKey || pointer.metaKey || pointer.ctrlKey,
          targetPath: event.composedPath(),
        };
        this.#projectRoot.setPointerCapture?.(pointer.pointerId);
        placeMarquee();
        return;
      }
      if (tool !== "move" || dragging || pointer.button !== 0) return;
      const target = movableElements
        ? movableTarget(
            event.composedPath(),
            movableElements,
            pointer.clientX,
            pointer.clientY,
          )
        : undefined;
      if (
        target &&
        lockedPickKeys.has(selectionKey(target.pick, target.part))
      )
        return;
      const root = target?.element.getRootNode();
      const size =
        root instanceof ShadowRoot
          ? root.host.getBoundingClientRect()
          : undefined;
      if (!target || !size?.width || !size.height) return;
      const { element } = target;
      const original = {
        translate: element.style.translate,
        transition: element.style.transition,
      };
      const base = parsePlayableTranslate(original.translate, size);
      dragging = {
        ...target,
        pointerId: pointer.pointerId,
        start: { x: pointer.clientX, y: pointer.clientY },
        delta: { x: 0, y: 0 },
        box: selectedBox(element),
        size: { width: size.width, height: size.height },
        base: base ?? { x: 0, y: 0 },
        original,
        inPlace:
          base !== undefined &&
          (target.part === "button-label"
            ? Boolean(
                element.parentElement?.hasAttribute(PLAYABLE_SOURCE_ATTRIBUTE),
              )
            : element.hasAttribute(PLAYABLE_SOURCE_ATTRIBUTE)),
      };
      // A transition on the element would make it trail the pointer.
      element.style.transition = "none";
      element.setPointerCapture(pointer.pointerId);
      this.#projectRoot.style.cursor = "grabbing";
    };
    const drag = (pointer: PointerEvent) => {
      const current = dragging;
      if (!current || pointer.pointerId !== current.pointerId) return;
      const delta = {
        x: pointer.clientX - current.start.x,
        y: pointer.clientY - current.start.y,
      };
      current.delta = delta;
      current.element.style.translate = `calc(${current.base.x}cqw + ${delta.x}px) calc(${current.base.y}cqh + ${delta.y}px)`;
      place({
        ...current.box,
        x: current.box.x + delta.x,
        y: current.box.y + delta.y,
      });
    };
    const endDrag = (commit: boolean) => {
      const current = dragging;
      if (!current) return;
      dragging = undefined;
      const { element, delta, size, base, original } = current;
      if (element.hasPointerCapture(current.pointerId))
        element.releasePointerCapture(current.pointerId);
      this.#projectRoot.style.cursor = idleCursor;
      const moved = commit && Math.hypot(delta.x, delta.y) >= MOVE_THRESHOLD;
      const translate = {
        x: roundOffset(base.x + (delta.x / size.width) * 100),
        y: roundOffset(base.y + (delta.y / size.height) * 100),
      };
      const inPlace = current.inPlace && !overridesTranslate(element);
      // The source will say the same once the preview reloads; a move the Agent makes goes back until it does.
      element.style.translate =
        moved && inPlace
          ? (playableTranslateValue(translate) ?? "")
          : original.translate;
      element.style.transition = original.transition;
      place(undefined);
      if (moved)
        handlers.onMove({
          pick: current.pick,
          ...(current.part ? { part: current.part } : {}),
          translate,
          inPlace,
        });
    };
    const startTransform = (
      kind: TransformHandleKind,
      pointer: PointerEvent,
    ) => {
      if (!selected || transforming) return;
      const element = selected.element;
      const computed = view.getComputedStyle(element);
      const box = selectedBox(element);
      const center = {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      };
      const centeredButton = element.hasAttribute(
        "data-putenggame-button-preset",
      );
      const { x: originX, y: originY } = centeredButton
        ? { x: 50, y: 50 }
        : parseTransformOrigin(
            computed.transformOrigin,
            element.offsetWidth,
            element.offsetHeight,
          );
      const original = {
        scale: element.style.scale,
        rotate: element.style.rotate,
        transformOrigin: element.style.transformOrigin,
        transformOriginPriority: element.style.getPropertyPriority(
          "transform-origin",
        ),
        transition: element.style.transition,
      };
      element.style.setProperty(
        "transform-origin",
        `${originX}% ${originY}%`,
        "important",
      );
      transforming = {
        kind,
        element,
        pick: selected.pick,
        pointerId: pointer.pointerId,
        start: { x: pointer.clientX, y: pointer.clientY },
        box,
        center,
        base: {
          scale: playableElementTransformScale(
            element,
            element.style.scale || computed.scale,
          ),
          rotation: parsePlayableRotation(
            element.style.rotate || computed.rotate,
          ),
          originX,
          originY,
        },
        transform: {
          scale: playableElementTransformScale(
            element,
            element.style.scale || computed.scale,
          ),
          rotation: parsePlayableRotation(
            element.style.rotate || computed.rotate,
          ),
          originX,
          originY,
        },
        original,
        inPlace: element.hasAttribute(PLAYABLE_SOURCE_ATTRIBUTE),
      };
      element.style.transition = "none";
      element.setPointerCapture(pointer.pointerId);
      this.#projectRoot.style.cursor =
        kind === "rotate" ? "crosshair" : "nwse-resize";
    };
    const dragTransform = (pointer: PointerEvent) => {
      const current = transforming;
      if (!current || pointer.pointerId !== current.pointerId) return;
      if (current.kind === "rotate") {
        const startAngle = Math.atan2(
          current.start.y - current.center.y,
          current.start.x - current.center.x,
        );
        const nextAngle = Math.atan2(
          pointer.clientY - current.center.y,
          pointer.clientX - current.center.x,
        );
        const delta = ((nextAngle - startAngle) * 180) / Math.PI;
        current.transform.rotation = roundRotation(
          current.base.rotation + delta,
        );
        current.element.style.rotate = `${current.transform.rotation}deg`;
      } else {
        const factor = playableCenteredScaleFactor(
          current.center,
          current.start,
          { x: pointer.clientX, y: pointer.clientY },
        );
        current.transform.scale = roundScale(
          current.base.scale * factor,
        );
        current.element.style.scale = playableElementRuntimeScale(
          current.element,
          current.transform.scale,
        );
        const box = selectedBox(current.element);
        const [scaleX, scaleY] = parseScaleAxes(
          current.element.style.scale || view.getComputedStyle(current.element).scale,
        );
        const size = {
          width: current.element.offsetWidth,
          height: current.element.offsetHeight,
        };
        const correctedOrigin = current.element.hasAttribute(
          "data-putenggame-button-preset",
        )
          ? { x: 50, y: 50 }
          : playableTransformOriginCorrection(
              {
                x: current.transform.originX ?? 50,
                y: current.transform.originY ?? 50,
              },
              size,
              { x: scaleX, y: scaleY },
              current.transform.rotation,
              linearTransformMatrix(
                view.getComputedStyle(current.element).transform,
              ),
              {
                x: current.center.x - (box.x + box.width / 2),
                y: current.center.y - (box.y + box.height / 2),
              },
            );
        current.transform.originX = roundOffset(correctedOrigin.x);
        current.transform.originY = roundOffset(correctedOrigin.y);
        current.element.style.setProperty(
          "transform-origin",
          `${current.transform.originX}% ${current.transform.originY}%`,
          "important",
        );
      }
      place(selectedBox(current.element));
    };
    const endTransform = (commit: boolean) => {
      const current = transforming;
      if (!current) return;
      transforming = undefined;
      if (current.element.hasPointerCapture(current.pointerId))
        current.element.releasePointerCapture(current.pointerId);
      this.#projectRoot.style.cursor = idleCursor;
      const changed =
        commit &&
        (current.transform.scale !== current.base.scale ||
          current.transform.rotation !== current.base.rotation);
      const inPlace = current.inPlace && !overridesTransform(current.element);
      current.element.style.scale =
        changed && inPlace
          ? playableElementRuntimeScale(
              current.element,
              current.transform.scale,
            )
          : current.original.scale;
      current.element.style.rotate =
        changed && inPlace
          ? `${current.transform.rotation}deg`
          : current.original.rotate;
      if (!changed || !inPlace)
        current.element.style.setProperty(
          "transform-origin",
          current.original.transformOrigin,
          current.original.transformOriginPriority,
        );
      current.element.style.transition = current.original.transition;
      if (changed) {
        placeSelected();
        handlers.onTransform({
          pick: current.pick,
          transform: current.transform,
          inPlace,
        });
      } else {
        placeSelected();
      }
    };
    const release = (event: Event) => {
      block(event);
      const pointer = event as PointerEvent;
      if (pointer.pointerId === transforming?.pointerId)
        return endTransform(event.type === "pointerup");
      if (pointer.pointerId === dragging?.pointerId)
        endDrag(event.type === "pointerup");
      if (pointer.pointerId === marqueeDrag?.pointerId)
        endMarquee(event.type === "pointerup");
    };
    const endMarquee = (commit: boolean) => {
      const current = marqueeDrag;
      if (!current) return;
      marqueeDrag = undefined;
      if (this.#projectRoot.hasPointerCapture?.(current.pointerId))
        this.#projectRoot.releasePointerCapture(current.pointerId);
      marquee.style.display = "none";
      if (!commit) return;
      const box = rectangle(current.start, current.current);
      if (box.width < MOVE_THRESHOLD && box.height < MOVE_THRESHOLD) {
        // Pointer capture can retarget the following click to the project
        // root. Keep the original hit path so a click still selects the item.
        pendingClickPath = current.targetPath;
        return;
      }
      const frameTargets = selectableSourceTargets(this.#projectRoot);
      const targets = frameTargets.flatMap((element) => {
        const button = element.closest<HTMLElement>('button, [role="button"]');
        if (
          element.hasAttribute("data-putenggame-button-label") ||
          (button && button !== element)
        )
          return [];
        const label = element.hasAttribute("data-putenggame-button-label")
          ? element
          : undefined;
        const pick = label
          ? buttonLabelPick(label)
          : pickForElement(element);
        const targetBox = selectedBox(element);
        return pick?.source &&
          pick.mediaSlot !== "backdrop" &&
          intersects(box, targetBox)
          ? [
              {
                element,
                pick: label ? { ...pick, box: targetBox } : pick,
                ...(label ? { part: "button-label" as const } : {}),
              },
            ]
          : [];
      });
      if (!targets.length) return;
      if (!current.additive) selectedElements = [];
      targets.forEach(({ element, pick, part }, index) => {
        const additive = current.additive || index > 0;
        handlers.onPick(pick, additive);
        const appearance = interactionForElement(element);
        if (appearance) handlers.onInteractionSelect(appearance, additive);
        const key = selectionKey(pick, part);
        const existing = selectedElements.some(
          (item) => selectionKey(item.pick, item.part) === key,
        );
        if (current.additive && existing) {
          selectedElements = selectedElements.filter(
            (item) => selectionKey(item.pick, item.part) !== key,
          );
        } else if (!existing) {
          selectedElements = [
            ...selectedElements,
            { element, pick, ...(part ? { part } : {}) },
          ];
        }
      });
      selected = selectedElements.at(-1);
      placeSelected();
    };
    const deleteSelected = () => {
      if (tool !== "select" || !selected || transforming || dragging) return;
      const current = selected;
      if (current.pick.mediaSlot === "backdrop") return;
      selectedElements = selectedElements.filter(
        (item) =>
          selectionKey(item.pick, item.part) !==
          selectionKey(current.pick, current.part),
      );
      selected = selectedElements.at(-1);
      this.#motionCleanups.get(current.element)?.();
      this.#motionCleanups.delete(current.element);
      this.#motionContexts.delete(current.element);
      this.#buttonPresetCleanups.get(current.element)?.();
      this.#buttonPresetCleanups.delete(current.element);
      current.element.remove();
      placeSelected();
      handlers.onDelete({
        pick: current.pick,
        ...(current.part ?? current.pick.part
          ? { part: current.part ?? current.pick.part }
          : {}),
        inPlace: Boolean(current.pick.source),
      });
    };
    const copySelected = () => {
      if (tool !== "select" || !selectedElements.length) return;
      if (
        selectedElements.some(
          ({ pick, part }) =>
            part || !pick.source || pick.mediaSlot === "backdrop",
        )
      ) {
        copiedElements = [];
        return;
      }
      copiedElements = [...selectedElements];
    };
    const pasteCopied = async () => {
      if (
        tool !== "select" ||
        !copiedElements.length ||
        copiedElements.length > 32
      )
        return;
      const copies: PlayableElementCopy[] = copiedElements.map(
        ({ element, pick }) => {
          const clone = element.cloneNode(true) as HTMLElement;
          for (const runtimeElement of clone.querySelectorAll<HTMLElement>(
            [
              "[data-putenggame-button-asset-image]",
              "[data-putenggame-button-pressed-image]",
              "[data-putenggame-motion-ui]",
              "[data-putenggame-motion-progress-preview]",
              "[data-putenggame-motion-bar-preview]",
              "[data-putenggame-motion-fill]",
              "[data-putenggame-motion-bar]",
              "[data-putenggame-motion-ring]",
              "[data-putenggame-ripple-hint]",
              "[data-putenggame-swipe-rail]",
              "[data-putenggame-swipe-thumb]",
            ].join(","),
          ))
            runtimeElement.remove();
          for (const label of clone.querySelectorAll<HTMLElement>(
            "[data-putenggame-button-label]",
          ))
            label.replaceWith(...Array.from(label.childNodes));
          clone.removeAttribute(PLAYABLE_MOTION_HOLDING_ATTRIBUTE);
          if (clone.hasAttribute(PLAYABLE_MOTION_ATTRIBUTES.asset)) {
            const { x, y } = playableButtonAssetScales(clone);
            const [scaleX, scaleY] = parseScaleAxes(clone.style.scale);
            const baseScaleX = scaleX / (x / 100);
            const baseScaleY = scaleY / (y / 100);
            clone.style.scale =
              Math.abs(baseScaleX - 1) < 0.0001 &&
              Math.abs(baseScaleY - 1) < 0.0001
                ? ""
                : `${baseScaleX} ${baseScaleY}`;
          }
          const subtree = [
            clone,
            ...Array.from(clone.querySelectorAll<HTMLElement>("*")),
          ];
          const idMap = new Map<string, string>();
          const ids = subtree.map((target) => {
            const oldId = target.id;
            const id = `putenggame-copy-${Date.now()}-${++copySequence}`;
            if (oldId) idMap.set(oldId, id);
            target.id = id;
            target.removeAttribute(PLAYABLE_SOURCE_ATTRIBUTE);
            target.removeAttribute("contenteditable");
            target.removeAttribute("data-playable-timing-hidden");
            return id;
          });
          for (const target of subtree) {
            for (const attribute of Array.from(target.attributes)) {
              const name = attribute.name.toLowerCase();
              const rewritten = [
                "for",
                "headers",
                "list",
                "aria-labelledby",
                "aria-describedby",
                "aria-controls",
                "aria-owns",
                "aria-flowto",
                "aria-details",
                "aria-errormessage",
              ].includes(name)
                ? attribute.value.replace(
                    /[A-Za-z][\w-]*/g,
                    (id) => idMap.get(id) ?? id,
                  )
                : name === "href" || name === "xlink:href"
                  ? attribute.value.replace(
                      /^#([A-Za-z][\w-]*)$/,
                      (match, id: string) =>
                        idMap.has(id) ? `#${idMap.get(id)}` : match,
                    )
                  : attribute.value.replace(
                      /url\(#([A-Za-z][\w-]*)\)/g,
                      (match, id: string) =>
                        idMap.has(id) ? `url(#${idMap.get(id)})` : match,
                    );
              if (rewritten !== attribute.value)
                target.setAttribute(attribute.name, rewritten);
            }
          }
          const root = element.getRootNode();
          const bounds =
            root instanceof ShadowRoot
              ? root.host.getBoundingClientRect()
              : undefined;
          const computedTranslate = view.getComputedStyle(element).translate;
          const translate =
            bounds && parsePlayableTranslate(computedTranslate, bounds);
          const [translateX = "0px", translateY = "0px"] =
            computedTranslate === "none" ? [] : computedTranslate.split(/\s+/);
          clone.style.translate = translate
            ? (playableTranslateValue({
                x: translate.x + 2,
                y: translate.y + 2,
              }) ?? "")
            : `calc(${translateX} + 2cqw) calc(${translateY} + 2cqh)`;
          const previewHtml = clone.outerHTML;
          const sourceClone = clone.cloneNode(true) as HTMLElement;
          for (const target of [
            sourceClone,
            ...Array.from(sourceClone.querySelectorAll<HTMLElement>("*")),
          ]) {
            if (target.getAttribute("src")?.startsWith("blob:"))
              target.removeAttribute("src");
          }
          return { pick, html: sourceClone.outerHTML, previewHtml, ids };
        },
      );
      if (
        copies.some(
          (copy) =>
            copy.html.length > 256 * 1024 ||
            copy.previewHtml.length > 256 * 1024,
        ) ||
        copies.reduce(
          (size, copy) => size + copy.html.length + copy.previewHtml.length,
          0,
        ) >
          2 * 1024 * 1024
      )
        return;
      const sources = await handlers.onPasteElements(copies);
      if (!sources) return;

      const pasted: SelectedElement[] = [];
      for (let index = 0; index < copies.length; index += 1) {
        const copy = copies[index]!;
        const original = copiedElements[index]!;
        if (!original.element.isConnected) continue;
        const template = this.#document.createElement("template");
        template.innerHTML = copy.previewHtml;
        const clone = template.content.firstElementChild as HTMLElement | null;
        if (!clone) continue;
        for (const id of copy.ids) {
          const source = sources[id];
          const target =
            clone.id === id
              ? clone
              : clone.querySelector<HTMLElement>(`#${id}`);
          if (target && source)
            target.setAttribute(PLAYABLE_SOURCE_ATTRIBUTE, source);
        }
        original.element.after(clone);
        const context =
          this.#motionContexts.get(original.element) ??
          this.#motionContextsBySurface.get(original.pick.nodeId);
        if (context) {
          if (clone.hasAttribute("data-putenggame-button-preset"))
            this.#buttonPresetCleanups.set(
              clone,
              this.#bindButtonPreset(clone, context),
            );
          if (
            clone.hasAttribute(PLAYABLE_MOTION_ATTRIBUTES.kind) ||
            clone.hasAttribute(PLAYABLE_MOTION_ATTRIBUTES.asset) ||
            clone.hasAttribute(PLAYABLE_MOTION_ATTRIBUTES.pressedAsset)
          ) {
            this.#motionContexts.set(clone, context);
            const assetUrl = this.#motionAssetUrlsByElement.get(
              original.element,
            );
            const pressedAssetUrl = this.#pressedMotionAssetUrlsByElement.get(
              original.element,
            );
            const ringAssetUrl = this.#ringMotionAssetUrlsByElement.get(
              original.element,
            );
            const barAssetUrl = this.#barMotionAssetUrlsByElement.get(
              original.element,
            );
            const swipeAssetUrl = this.#swipeMotionAssetUrlsByElement.get(
              original.element,
            );
            if (assetUrl)
              this.#motionAssetUrlsByElement.set(clone, assetUrl);
            if (pressedAssetUrl)
              this.#pressedMotionAssetUrlsByElement.set(
                clone,
                pressedAssetUrl,
              );
            if (ringAssetUrl)
              this.#ringMotionAssetUrlsByElement.set(clone, ringAssetUrl);
            if (barAssetUrl)
              this.#barMotionAssetUrlsByElement.set(clone, barAssetUrl);
            if (swipeAssetUrl)
              this.#swipeMotionAssetUrlsByElement.set(clone, swipeAssetUrl);
            this.#motionCleanups.set(
              clone,
              mountPlayableMotionElement(
                clone,
                context,
                assetUrl,
                pressedAssetUrl,
                ringAssetUrl,
                barAssetUrl,
                swipeAssetUrl,
              ),
            );
          }
        }
        const pick = pickForElement(clone);
        if (!pick?.source) continue;
        pasted.push({ element: clone, pick });
      }
      if (!pasted.length) return;
      selectedElements = pasted;
      selected = pasted.at(-1);
      pasted.forEach(({ element, pick }, index) => {
        handlers.onPick(pick, index > 0);
        const appearance = interactionForElement(element);
        if (appearance) handlers.onInteractionSelect(appearance, index > 0);
      });
      placeSelected();
    };
    const click = (event: Event) => {
      block(event);
      if (tool === "move") return;
      if (transformHandle(event.composedPath())) return;
      if (inside(event)) return;
      finish(true);
      const eventPath = event.composedPath();
      const path = describePlayablePick(eventPath)
        ? eventPath
        : pendingClickPath;
      pendingClickPath = undefined;
      const label = path ? buttonLabelInPath(path) : undefined;
      const pick = label?.parentElement
        ? pickForElement(label.parentElement)
        : path
          ? describePlayablePick(path)
          : undefined;
      if (!pick) {
        if (tool === "text") {
          handlers.onTextSelect(undefined);
          place(undefined);
        }
        return;
      }
      if (tool === "select") {
        const mouse = event as MouseEvent;
        const buttonTarget = path?.find(
          (target): target is HTMLElement =>
            target instanceof HTMLElement &&
            target.matches('button, [role="button"]'),
        );
        const pointTarget = path
          ? selectableElementAtPoint(
              path,
              selectableElements,
              mouse.clientX,
              mouse.clientY,
            )
          : undefined;
        const appearance =
          pointTarget?.hasAttribute("data-putenggame-selectable")
            ? undefined
            : pointTarget
          ? describePlayableAppearanceTarget(elementPath(pointTarget))
          : path
            ? describePlayableAppearanceTarget(path)
            : undefined;
        const selectionTarget = buttonTarget ?? pointTarget;
        const pointPick = selectionTarget
          ? pickForElement(selectionTarget)
          : undefined;
        const sourceTarget =
          selectionTarget && pointPick
            ? { element: selectionTarget, pick: pointPick }
            : path
              ? describePlayableSourceTarget(path)
              : undefined;
        const selectedPick = sourceTarget?.pick ?? pick;
        if (selectedPick.mediaSlot === "backdrop") return;
        const additive = mouse.shiftKey || mouse.metaKey || mouse.ctrlKey;
        handlers.onPick(selectedPick, additive);
        const selectedElement =
          (sourceTarget?.element as HTMLElement | undefined) ??
          path?.find(
            (target): target is HTMLElement =>
              target instanceof HTMLElement &&
              target.getAttribute("data-playable-surface") === null,
          );
        if (selectedElement) {
          const next = {
            element: selectedElement,
            pick: selectedPick,
          };
          const key = selectionKey(next.pick);
          const existing = selectedElements.some(
            (item) => selectionKey(item.pick, item.part) === key,
          );
          if (!additive) selectedElements = [next];
          else if (existing)
            selectedElements = selectedElements.filter(
              (item) => selectionKey(item.pick, item.part) !== key,
            );
          else selectedElements = [...selectedElements, next];
          selected = selectedElements.at(-1);
          placeSelected();
        } else if (!additive) {
          selectedElements = [];
          selected = undefined;
          placeSelected();
        }
        if (appearance) {
          const element = appearance.element as Element;
          const computed = view.getComputedStyle(element);
          const rawDelay =
            element instanceof HTMLElement
              ? element.style.getPropertyValue("--putenggame-appear-at") ||
                computed.getPropertyValue("--putenggame-appear-at") ||
                element.style.getPropertyValue("--delay") ||
                computed.getPropertyValue("--delay") ||
                computed.animationDelay
              : computed.getPropertyValue("--putenggame-appear-at") ||
                computed.getPropertyValue("--delay") ||
                computed.animationDelay;
          const rawEnd =
            element instanceof HTMLElement
              ? element.style.getPropertyValue("--putenggame-disappear-at") ||
                computed.getPropertyValue("--putenggame-disappear-at")
              : computed.getPropertyValue("--putenggame-disappear-at");
          const endSeconds = parseOptionalTimingSeconds(rawEnd);
          handlers.onInteractionSelect(
            {
              pick: appearance.pick,
              delaySeconds: parseDelaySeconds(rawDelay),
              ...(endSeconds === undefined ? {} : { endSeconds }),
              inPlace: Boolean(appearance.pick.source),
            },
            additive,
          );
        }
        return;
      }
      const textLabel =
        tool === "text"
          ? (label ??
            path
              ?.filter(
                (target): target is HTMLElement =>
                  target instanceof HTMLElement,
              )
              .map((element) =>
                element.querySelector<HTMLElement>(
                  "[data-putenggame-button-label]",
                ),
              )
              .find((element): element is HTMLElement => Boolean(element)))
          : undefined;
      const textTarget =
        tool === "text"
          ? path?.find(
              (target): target is HTMLElement =>
                target instanceof HTMLElement &&
                target.hasAttribute(PLAYABLE_SOURCE_ATTRIBUTE) &&
                isTextTarget(target),
            )
          : undefined;
      const target = textTarget ?? textLabel ?? path?.[0];
      if (!isTextTarget(target)) {
        handlers.onTextSelect(undefined);
        place(undefined);
        return;
      }
      const element = target as HTMLElement;
      const textPick = pickForElement(element) ?? pick;
      const originalNodes = Array.from(element.childNodes).filter(
        (child): child is Text => child.nodeType === 3,
      );
      if (!originalNodes.some((node) => node.textContent?.trim())) return;
      const original = originalNodes
        .map((node) => node.nodeValue ?? "")
        .join("");
      const sourceBefore = originalNodes
        .map((node) => playableOriginalText(node))
        .join("");
      const leadingText = /^\s*/.exec(original)![0];
      const trailingText = /\s*$/.exec(original.slice(leadingText.length))![0];
      const editor = this.#document.createElement("span");
      editor.setAttribute("contenteditable", "plaintext-only");
      editor.textContent = original;
      const placeholders = originalNodes.map(() =>
        this.#document.createComment("playable-text"),
      );
      originalNodes.forEach((node, index) =>
        node.replaceWith(placeholders[index]!),
      );
      placeholders[0]!.parentNode?.insertBefore(editor, placeholders[0]!);
      const onBlur = () => finish(true);
      const inPlace = holdsSourceText(element);
      const computed = view.getComputedStyle(element);
      handlers.onTextSelect({
        pick: textPick,
        fontFamily:
          computed.fontFamily
            .split(",")[0]
            ?.trim()
            .replace(/^['"]|['"]$/g, "") || "sans-serif",
        fontSize: computed.fontSize,
        inPlace,
      });
      editing = {
        element,
        editor,
        placeholders,
        originalNodes,
        pick: textPick,
        leadingText,
        trailingText,
        before: original.replace(/\s+/g, " ").trim(),
        sourceBefore: sourceBefore.replace(/\s+/g, " ").trim(),
        inPlace,
        onBlur,
      };
      editor.addEventListener("blur", onBlur);
      editor.focus();
      view.getSelection()?.selectAllChildren(editor);
      place(textPick.box);
    };
    const key = (event: Event) => {
      const keyboard = event as KeyboardEvent;
      if (editing) {
        block(event);
        if (keyboard.key === "Enter" && !keyboard.shiftKey) {
          keyboard.preventDefault();
          finish(true);
        } else if (keyboard.key === "Escape") {
          keyboard.preventDefault();
          finish(false);
        }
        return;
      }
      block(event);
      if ((keyboard.ctrlKey || keyboard.metaKey) && !keyboard.altKey) {
        const shortcut = keyboard.key.toLowerCase();
        if (shortcut === "z") {
          handlers.onHistoryCommand?.(keyboard.shiftKey ? "redo" : "undo");
          return;
        }
        if (shortcut === "y" && keyboard.ctrlKey && !keyboard.metaKey) {
          handlers.onHistoryCommand?.("redo");
          return;
        }
        if (tool === "select") {
          if (shortcut === "c") {
            copySelected();
            return;
          }
          if (shortcut === "v") {
            void pasteCopied().catch(() => {});
            return;
          }
        }
      }
      if (
        (keyboard.key === "Delete" || keyboard.key === "Backspace") &&
        tool === "select" &&
        selected
      ) {
        keyboard.preventDefault();
        if (handlers.onDeleteSelection) handlers.onDeleteSelection();
        else deleteSelected();
        return;
      }
      if (keyboard.key !== "Escape") return;
      if (dragging) return endDrag(false);
      if (transforming) return endTransform(false);
      if (marqueeDrag) return endMarquee(false);
      this.stopPicking();
      handlers.onCancel();
    };
    const leavePreview = () => (marqueeDrag ? placeMarquee() : placeSelected());
    const listeners: Array<[string, (event: Event) => void]> = [
      ["pointermove", hover],
      ["pointerover", hover],
      ["pointerdown", press],
      ["pointerup", release],
      ["pointercancel", release],
      ["dblclick", createText],
      ["click", click],
      ["contextmenu", contextMenu],
      ["keydown", key],
      ...BLOCKED_PICK_EVENTS.map(
        (type) => [type, block] as [string, (event: Event) => void],
      ),
    ];
    for (const [type, listener] of listeners)
      view.addEventListener(type, listener, { capture: true });
    this.#projectRoot.addEventListener("pointerleave", leavePreview);
    this.#picking = {
      copy: copySelected,
      paste: pasteCopied,
      setLockedPicks: (picks) => {
        lockedPickKeys = new Set(picks.map((pick) => selectionKey(pick)));
        placeSelected();
      },
      alignToCenter: (reference, targets) => {
        if (tool !== "select" || reference.tag !== "button") return;
        const referenceElement = elementForPick(this.#projectRoot, reference);
        const referenceBox = referenceElement
          ? selectedBox(referenceElement)
          : undefined;
        if (!referenceElement || !referenceBox) return;
        const referenceCenter = {
          x: referenceBox.x + referenceBox.width / 2,
          y: referenceBox.y + referenceBox.height / 2,
        };
        for (const pick of targets) {
          if (
            pick.tag !== "button" ||
            selectionKey(pick) === selectionKey(reference) ||
            lockedPickKeys.has(selectionKey(pick))
          )
            continue;
          const element = elementForPick(this.#projectRoot, pick);
          const root = element?.getRootNode();
          const surfaceSize =
            root instanceof ShadowRoot
              ? root.host.getBoundingClientRect()
              : undefined;
          if (!element || !surfaceSize?.width || !surfaceSize.height) continue;
          const box = selectedBox(element);
          const deltaX = referenceCenter.x - (box.x + box.width / 2);
          const deltaY = referenceCenter.y - (box.y + box.height / 2);
          if (Math.hypot(deltaX, deltaY) < 0.01) continue;
          const base = parsePlayableTranslate(element.style.translate, {
            width: surfaceSize.width,
            height: surfaceSize.height,
          });
          if (!base) continue;
          const translate = {
            x: roundOffset(base.x + (deltaX / surfaceSize.width) * 100),
            y: roundOffset(base.y + (deltaY / surfaceSize.height) * 100),
          };
          const inPlace =
            element.hasAttribute(PLAYABLE_SOURCE_ATTRIBUTE) &&
            !overridesTranslate(element);
          element.style.translate = inPlace
            ? playableTranslateValue(translate) ?? ""
            : element.style.translate;
          handlers.onMove({ pick, translate, inPlace });
        }
        placeSelected();
      },
      refresh: placeSelected,
      delete: (pick) => {
        const key = selectionKey(pick, pick.part);
        const current = selectedElements.find(
          (item) => selectionKey(item.pick, item.part) === key,
        );
        if (!current) return;
        current.element.remove();
        selectedElements = selectedElements.filter(
          (item) => selectionKey(item.pick, item.part) !== key,
        );
        selected = selectedElements.at(-1);
        placeSelected();
      },
      stop: () => {
        finish(true);
        endTransform(false);
        endDrag(false);
        for (const [type, listener] of listeners)
          view.removeEventListener(type, listener, { capture: true });
        this.#projectRoot.removeEventListener("pointerleave", leavePreview);
        outline.remove();
        for (const target of selectionOutlines.values()) target.remove();
        selectionOutlines.clear();
        marquee.remove();
        temporaryButtonLabels.forEach((label) =>
          label.replaceWith(...Array.from(label.childNodes)),
        );
        this.#projectRoot.style.cursor = previousCursor;
      },
    };
  }

  stopPicking(): void {
    const picking = this.#picking;
    this.#picking = undefined;
    picking?.stop();
  }

  get isPicking(): boolean {
    return this.#picking !== undefined;
  }

  setPickingLocks(picks: readonly PlayablePickResult[]): void {
    this.#picking?.setLockedPicks(picks);
  }

  alignPickedToCenter(
    reference: PlayablePickResult,
    targets: readonly PlayablePickResult[],
  ): void {
    this.#picking?.alignToCenter(reference, targets);
  }

  deletePicked(pick: PlayablePickResult): void {
    this.#picking?.delete(pick);
  }

  copyPickedElements(): void {
    this.#picking?.copy();
  }

  pastePickedElements(): Promise<void> | undefined {
    return this.#picking?.paste();
  }

  setTextSource(id: string, source: string | undefined): void {
    for (const surface of this.#nodeLayer.querySelectorAll<HTMLElement>(
      "[data-playable-surface]",
    )) {
      const element = surface.shadowRoot?.getElementById(id);
      if (!element) continue;
      if (source) element.setAttribute(PLAYABLE_SOURCE_ATTRIBUTE, source);
      else element.remove();
    }
  }

  updateAppearanceTiming(
    updates: readonly PlayableAppearanceTimingUpdate[],
  ): void {
    for (const { pick, delaySeconds, endSeconds } of updates) {
      if (
        !Number.isFinite(delaySeconds) ||
        delaySeconds < 0 ||
        delaySeconds > 3600 ||
        (endSeconds !== undefined &&
          (!Number.isFinite(endSeconds) ||
            endSeconds <= delaySeconds ||
            endSeconds > 3600)) ||
        pick.tag === "video"
      )
        continue;

      for (const surface of this.#nodeLayer.querySelectorAll<HTMLElement>(
        "[data-playable-surface]",
      )) {
        if (surface.dataset.playableSurface !== pick.nodeId) continue;
        const root = surface.shadowRoot;
        if (!root) continue;
        let target: HTMLElement | undefined;
        try {
          const candidate = root.querySelector<HTMLElement>(pick.cssPath);
          if (
            candidate?.tagName.toLowerCase() === pick.tag &&
            candidate.getAttribute(PLAYABLE_SOURCE_ATTRIBUTE) === pick.source &&
            !isBackdropElement(candidate)
          )
            target = candidate;
        } catch {
          continue;
        }
        if (!target) continue;

        target.classList.add("rise");
        target.style.setProperty("--delay", "0s");
        target.style.setProperty(
          "--putenggame-appear-at",
          `${Math.round(delaySeconds * 10) / 10}s`,
        );
        if (endSeconds === undefined)
          target.style.removeProperty("--putenggame-disappear-at");
        else
          target.style.setProperty(
            "--putenggame-disappear-at",
            `${Math.round(endSeconds * 10) / 10}s`,
          );
        break;
      }
    }
    this.#updateTimedVisibility();
  }

  updateTextStyle(command: PlayableTextStyleCommand): void {
    const { pick, property, value } = command;
    if (!pick.source || !value.trim()) return;
    const surface = [
      ...this.#nodeLayer.querySelectorAll<HTMLElement>(
        "[data-playable-surface]",
      ),
    ].find((candidate) => candidate.dataset.playableSurface === pick.nodeId);
    const root = surface?.shadowRoot;
    if (!root) return;
    try {
      const element = root.querySelector<HTMLElement>(pick.cssPath);
      if (
        !element ||
        element.tagName.toLowerCase() !== pick.tag ||
        element.getAttribute(PLAYABLE_SOURCE_ATTRIBUTE) !== pick.source
      )
        return;
      if (property === "fontFamily") element.style.fontFamily = value;
      else element.style.fontSize = value;
    } catch {
      return;
    }
  }

  updateMotion(command: PlayableMotionCommand): void {
    const target = command.target;
    const surfaceId =
      target.kind === "element" ? target.pick.nodeId : target.nodeId;
    const surface = [
      ...this.#nodeLayer.querySelectorAll<HTMLElement>(
        "[data-playable-surface]",
      ),
    ].find((candidate) => candidate.dataset.playableSurface === surfaceId);
    const root = surface?.shadowRoot;
    if (!root) return;
    let element: HTMLElement | null = null;
    if (target.kind === "element") {
      try {
        const candidate = root.querySelector<HTMLElement>(target.pick.cssPath);
        if (
          candidate?.tagName.toLowerCase() === target.pick.tag &&
          candidate.getAttribute(PLAYABLE_SOURCE_ATTRIBUTE) ===
            target.pick.source
        )
          element = candidate;
      } catch {
        return;
      }
    } else {
      element = root.getElementById(target.id);
      if (!element) {
        element = this.#document.createElement("div");
        element.id = target.id;
        element.setAttribute(PLAYABLE_SOURCE_ATTRIBUTE, target.source);
        Object.assign(element.style, {
          position: "absolute",
          left: "40cqw",
          top: "40cqh",
          width: "20cqw",
          height: "5cqh",
          display: "grid",
          placeItems: "center",
        });
        (
          root.querySelector<HTMLElement>(".stage") ??
          root.firstElementChild ??
          root
        ).append(element);
      }
    }
    if (!element) return;

    if (command.buttonSignal !== undefined)
      element.setAttribute("data-signal", command.buttonSignal);
    const progressPreview = element.querySelector<HTMLElement>(
      "[data-putenggame-motion-progress-preview]",
    );
    const progressPreviewUrl = progressPreview?.dataset.assetUrl;
    if (progressPreviewUrl) {
      URL.revokeObjectURL(progressPreviewUrl);
      this.#motionAssetUrls.delete(progressPreviewUrl);
    }
    const progressImagePreviewUrl = element
      .querySelector<HTMLImageElement>("[data-putenggame-motion-bar]")
      ?.dataset.previewAssetUrl;
    if (progressImagePreviewUrl) {
      URL.revokeObjectURL(progressImagePreviewUrl);
      this.#motionAssetUrls.delete(progressImagePreviewUrl);
    }
    progressPreview?.remove();
    this.#motionCleanups.get(element)?.();
    if (command.buttonText !== undefined) {
      const textNodes: Text[] = [];
      const visit = (node: Node) => {
        for (const child of Array.from(node.childNodes)) {
          if (child.nodeType === 3 && child.textContent?.trim())
            textNodes.push(child as Text);
          else if (child.nodeType === 1) visit(child);
        }
      };
      visit(element);
      if (textNodes[0]) textNodes[0].textContent = command.buttonText;
      else if (command.buttonText) element.append(command.buttonText);
      for (const textNode of textNodes.slice(1)) textNode.remove();
    }
    for (const [name, value] of Object.entries({
      [PLAYABLE_MOTION_ATTRIBUTES.kind]: command.config?.kind,
      [PLAYABLE_MOTION_ATTRIBUTES.mode]: command.config?.mode,
      [PLAYABLE_MOTION_ATTRIBUTES.duration]:
        command.config === undefined
          ? undefined
          : String(command.config.duration),
      [PLAYABLE_MOTION_ATTRIBUTES.signal]: command.config?.signal,
      [PLAYABLE_MOTION_ATTRIBUTES.timeoutSignal]: command.config?.timeoutSignal,
      [PLAYABLE_MOTION_ATTRIBUTES.timeoutDuration]:
        command.config?.timeoutDuration === undefined
          ? undefined
          : String(command.config.timeoutDuration),
      [PLAYABLE_MOTION_ATTRIBUTES.interaction]: command.config?.interaction,
      [PLAYABLE_MOTION_ATTRIBUTES.requiredCount]:
        command.config?.requiredCount === undefined
          ? undefined
          : String(command.config.requiredCount),
      [PLAYABLE_MOTION_ATTRIBUTES.ringAsset]: command.config?.ringAssetId,
      [PLAYABLE_MOTION_ATTRIBUTES.ringAssetScale]:
        command.config?.ringAssetScale === undefined
          ? undefined
          : String(command.config.ringAssetScale),
      [PLAYABLE_MOTION_ATTRIBUTES.barAsset]: command.config?.barAssetId,
      [PLAYABLE_MOTION_ATTRIBUTES.barAssetScale]:
        command.config?.barAssetScale === undefined
          ? undefined
          : String(command.config.barAssetScale),
      [PLAYABLE_MOTION_ATTRIBUTES.barAssetOffsetX]:
        command.config?.barAssetOffsetX === undefined
          ? undefined
          : String(command.config.barAssetOffsetX),
      [PLAYABLE_MOTION_ATTRIBUTES.barAssetOffsetY]:
        command.config?.barAssetOffsetY === undefined
          ? undefined
          : String(command.config.barAssetOffsetY),
      [PLAYABLE_MOTION_ATTRIBUTES.barLayer]: command.config?.barLayer,
      [PLAYABLE_MOTION_ATTRIBUTES.swipeAsset]:
        command.config?.swipeAssetId,
      [PLAYABLE_MOTION_ATTRIBUTES.swipeStyle]: command.config?.swipeStyle,
      [PLAYABLE_MOTION_ATTRIBUTES.swipeBehavior]:
        command.config?.swipeBehavior,
      [PLAYABLE_MOTION_ATTRIBUTES.ringFill]: command.config?.ringFill,
      [PLAYABLE_MOTION_ATTRIBUTES.ringRotation]: command.config?.ringRotation,
      [PLAYABLE_MOTION_ATTRIBUTES.pressEffect]: command.config?.pressEffect,
      [PLAYABLE_MOTION_ATTRIBUTES.effectColor]: command.config?.effectColor,
      [PLAYABLE_MOTION_ATTRIBUTES.effectAnchorX]:
        command.config?.effectAnchorX === undefined
          ? undefined
          : String(command.config.effectAnchorX),
      [PLAYABLE_MOTION_ATTRIBUTES.effectAnchorY]:
        command.config?.effectAnchorY === undefined
          ? undefined
          : String(command.config.effectAnchorY),
      [PLAYABLE_MOTION_ATTRIBUTES.effectOffsetX]:
        command.config?.effectOffsetX === undefined
          ? undefined
          : String(command.config.effectOffsetX),
      [PLAYABLE_MOTION_ATTRIBUTES.effectOffsetY]:
        command.config?.effectOffsetY === undefined
          ? undefined
          : String(command.config.effectOffsetY),
      [PLAYABLE_MOTION_ATTRIBUTES.feedback]: command.config?.feedback,
      [PLAYABLE_MOTION_ATTRIBUTES.buttonShape]:
        command.config?.buttonShape,
      [PLAYABLE_MOTION_ATTRIBUTES.asset]: command.assetId,
      [PLAYABLE_MOTION_ATTRIBUTES.pressedAsset]: command.pressedAssetId,
      [PLAYABLE_MOTION_ATTRIBUTES.assetScaleX]:
        command.assetScaleX === undefined
          ? undefined
          : String(command.assetScaleX),
      [PLAYABLE_MOTION_ATTRIBUTES.assetScaleY]:
        command.assetScaleY === undefined
          ? undefined
          : String(command.assetScaleY),
    }))
      if (value === undefined) element.removeAttribute(name);
      else element.setAttribute(name, value);

    let assetUrl: string | undefined;
    if (command.asset && command.assetId) {
      assetUrl = URL.createObjectURL(
        new Blob([command.asset.bytes], { type: command.asset.contentType }),
      );
      this.#motionAssetUrls.add(assetUrl);
      this.#motionAssetUrlsByElement.set(element, assetUrl);
    }
    assetUrl ??= this.#motionAssetUrlsByElement.get(element);
    let pressedAssetUrl: string | undefined;
    if (command.pressedAsset && command.pressedAssetId) {
      pressedAssetUrl = URL.createObjectURL(
        new Blob([command.pressedAsset.bytes], {
          type: command.pressedAsset.contentType,
        }),
      );
      this.#motionAssetUrls.add(pressedAssetUrl);
      this.#pressedMotionAssetUrlsByElement.set(element, pressedAssetUrl);
    }
    pressedAssetUrl ??= this.#pressedMotionAssetUrlsByElement.get(element);
    let ringAssetUrl: string | undefined;
    if (command.ringAsset && command.config?.ringAssetId) {
      ringAssetUrl = URL.createObjectURL(
        new Blob([command.ringAsset.bytes], {
          type: command.ringAsset.contentType,
        }),
      );
      this.#motionAssetUrls.add(ringAssetUrl);
      this.#ringMotionAssetUrlsByElement.set(element, ringAssetUrl);
    }
    ringAssetUrl ??= this.#ringMotionAssetUrlsByElement.get(element);
    let barAssetUrl: string | undefined;
    if (command.barAsset && command.config?.barAssetId) {
      barAssetUrl = URL.createObjectURL(
        new Blob([command.barAsset.bytes], {
          type: command.barAsset.contentType,
        }),
      );
      this.#motionAssetUrls.add(barAssetUrl);
      this.#barMotionAssetUrlsByElement.set(element, barAssetUrl);
    }
    barAssetUrl ??= this.#barMotionAssetUrlsByElement.get(element);
    let swipeAssetUrl: string | undefined;
    if (command.swipeAsset && command.config?.swipeAssetId) {
      swipeAssetUrl = URL.createObjectURL(
        new Blob([command.swipeAsset.bytes], {
          type: command.swipeAsset.contentType,
        }),
      );
      this.#motionAssetUrls.add(swipeAssetUrl);
      this.#swipeMotionAssetUrlsByElement.set(element, swipeAssetUrl);
    }
    swipeAssetUrl ??= this.#swipeMotionAssetUrlsByElement.get(element);
    const context =
      this.#motionContexts.get(element) ??
      this.#motionContextsBySurface.get(surfaceId);
    if (context) this.#motionContexts.set(element, context);
    if (context)
      this.#motionCleanups.set(
        element,
        mountPlayableMotionElement(
          element,
          context,
          assetUrl,
          pressedAssetUrl,
          ringAssetUrl,
          barAssetUrl,
          swipeAssetUrl,
        ),
      );
  }

  async #mount(
    layer: HTMLElement,
    surface: CompiledPlayableSurface,
    context: Omit<PlayableNodeContext, "root">,
    onBackdropVideoEnded?: () => void,
  ): Promise<PlayableMountedSurface> {
    const host = this.#document.createElement("div");
    host.dataset.playableSurface = surface.id;
    host.style.width = "100%";
    host.style.height = "100%";
    const root = host.attachShadow({ mode: "open" });
    const style = this.#document.createElement("style");
    style.textContent = `${surface.css}
[data-playable-timing-hidden] {
  visibility: hidden !important;
  pointer-events: none !important;
}
.playable-settings-subtitle {
  position: absolute;
  z-index: 20;
  right: 8cqw;
  bottom: 5cqw;
  left: 8cqw;
  margin: 0;
  padding: 0.8cqw 1.4cqw;
  border-radius: 0.35cqw;
  background: rgb(0 0 0 / 58%);
  color: #fff;
  font: 600 calc(var(--text-line, 2.2cqw) * var(--subtitle-scale, 1)) / 1.45 system-ui, sans-serif;
  text-align: center;
  text-shadow: 0 1px 3px #000;
  pointer-events: none;
}`;
    const globalFontStyle = this.#document.createElement("style");
    globalFontStyle.dataset.playableGlobalFont = "";
    globalFontStyle.textContent = globalFontStyleText(
      this.#globalFontFamilyOverridden
        ? this.#globalFontFamily
        : context.globalFontFamily,
    );
    const template = this.#document.createElement("template");
    template.innerHTML = surface.html;
    root.append(style, globalFontStyle, template.content.cloneNode(true));
    let backdropVideo: HTMLVideoElement | undefined;
    const attachBackdropVideoEnded = () => {
      const next = root.querySelector<HTMLVideoElement>(
        '[data-media="backdrop"] video',
      );
      if (next === backdropVideo) return;
      backdropVideo?.removeEventListener("ended", onBackdropVideoEnded!);
      backdropVideo = next ?? undefined;
      if (backdropVideo && onBackdropVideoEnded)
        backdropVideo.addEventListener("ended", onBackdropVideoEnded);
    };
    const backdropObserver = onBackdropVideoEnded
      ? new MutationObserver(attachBackdropVideoEnded)
      : undefined;
    backdropObserver?.observe(root, { childList: true, subtree: true });
    for (const media of root.querySelectorAll<
      HTMLImageElement | HTMLVideoElement
    >("[data-putenggame-asset]")) {
      const assetId = media.getAttribute("data-putenggame-asset");
      if (assetId) media.src = context.assets.url(assetId);
    }
    if (this.#backdropEffects)
      this.#applyBackdropEffects(host, this.#backdropEffects);
    for (const element of root.querySelectorAll<HTMLElement>(
      "[style*='--putenggame-appear-at'], [style*='--putenggame-disappear-at']",
    ))
      element.style.setProperty("--delay", "0s");
    this.#surfaceStartedAt.set(
      host,
      this.#document.defaultView!.performance.now(),
    );
    layer.append(host);
    this.#updateTimedVisibility();

    try {
      const module = await this.#loadModule(surface.javascript);
      if (!isPlayableSurfaceModule(module))
        throw new Error(
          `Playable surface "${surface.id}" does not export a mount function.`,
        );
      const playerSettings =
        context.settings ?? createPlayableSettingsService();
      const transcription = context.transcription ?? {
        available: false,
        async transcribe() {
          throw new Error(
            "No subtitle transcription provider is configured.",
          );
        },
      };
      const nodeContext: PlayableNodeContext = {
        ...context,
        root,
        settings: playerSettings,
        transcription,
        navigation: {
          ...context.navigation,
          fail: (signal) => {
            const stage = this.#stage(root);
            return (
              (stage?.getAttribute(
                PLAYABLE_MOTION_ATTRIBUTES.continueWithoutInput,
              ) === "true" ||
                stage?.hasAttribute("data-putenggame-awaiting-input")) &&
              context.navigation.connected(signal)
              ? Promise.resolve()
              : context.navigation.fail(signal)
            );
          },
        },
      };
      const unlockOnInput = (event: Event) => {
        const configured = event.composedPath().some((target) => {
          const ElementClass = this.#document.defaultView!.Element;
          if (!(target instanceof ElementClass)) return false;
          const control = target.closest(
            `[data-signal], [${PLAYABLE_MOTION_ATTRIBUTES.mode}="interactive"]`,
          );
          return Boolean(control && stage?.contains(control));
        });
        if (configured && stage?.hasAttribute("data-putenggame-awaiting-input"))
          this.#resumeSurface(host, root, stage);
      };
      const stage = this.#stage(root);
      const onMotionTimingUpdate = () => this.#updateTimedVisibility();
      root.addEventListener(
        PLAYABLE_MOTION_TIMING_UPDATE_EVENT,
        onMotionTimingUpdate,
        true,
      );
      for (const type of ["pointerdown", "keydown", "click"])
        root.addEventListener(type, unlockOnInput, true);
      if (stage?.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.noInputMode) === "wait")
        this.#setNoInputMode(host, root, stage, "wait");
      else if (stage?.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.noInputMode) === "continue")
        stage.setAttribute(PLAYABLE_MOTION_ATTRIBUTES.continueWithoutInput, "true");
      const cleanup = await module.mount(nodeContext);
      this.#motionContextsBySurface.set(surface.id, nodeContext);
      const subtitle = this.#document.createElement("p");
      subtitle.className = "playable-settings-subtitle";
      subtitle.dataset.playerSubtitle = "true";
      subtitle.setAttribute("aria-live", "polite");
      subtitle.hidden = true;
      if (stage) stage.append(subtitle);
      const settingsVideo = root.querySelector<HTMLVideoElement>(
        '[data-media="backdrop"] video',
      );
      const updatePlayerSettings = () => {
        const settings = playerSettings.get();
        for (const hint of root.querySelectorAll<HTMLElement>(
          "[data-playable-hint], .continue-hint",
        ))
          hint.hidden = !settings.messageHints;
        host.style.filter =
          settings.brightness === 100
            ? ""
            : `brightness(${settings.brightness}%)`;
        subtitle.style.setProperty(
          "--subtitle-scale",
          String(settings.subtitleFontSize / 100),
        );
        if (settingsVideo) {
          settingsVideo.volume = settings.videoVolume;
          settingsVideo.muted = settings.videoVolume === 0;
        }
        for (const media of root.querySelectorAll<
          HTMLAudioElement | HTMLVideoElement
        >("[data-playable-audio]")) {
          const role = media.dataset.playableAudio;
          if (role === "music") {
            media.volume = settings.musicVolume;
            media.muted =
              !settings.musicEnabled || settings.musicVolume === 0;
          } else if (role === "ui") {
            media.volume = settings.uiSoundVolume;
            media.muted =
              !settings.uiSoundEnabled || settings.uiSoundVolume === 0;
          }
        }
        const backdropAssetId = root
          .querySelector<HTMLElement>('[data-media="backdrop"]')
          ?.getAttribute("data-asset");
        const time = settingsVideo?.currentTime ?? 0;
        const cue = settings.subtitlesEnabled
          ? settings.subtitleCues.find(
              (item) =>
                (!item.assetId || item.assetId === backdropAssetId) &&
                time >= item.startSeconds &&
                time < item.endSeconds,
            )
          : undefined;
        subtitle.textContent = cue?.text ?? "";
        subtitle.hidden = !cue?.text;
      };
      const unsubscribeSettings = playerSettings.subscribe(
        updatePlayerSettings,
      );
      settingsVideo?.addEventListener("timeupdate", updatePlayerSettings);
      settingsVideo?.addEventListener("seeked", updatePlayerSettings);
      updatePlayerSettings();
      const buttonPresetElements = [
        ...root.querySelectorAll<HTMLElement>(
          "[data-putenggame-button-preset]",
        ),
      ];
      for (const element of buttonPresetElements)
        this.#buttonPresetCleanups.set(
          element,
          this.#bindButtonPreset(element, nodeContext),
        );
      for (const element of root.querySelectorAll<HTMLElement>(
        `[${PLAYABLE_MOTION_ATTRIBUTES.kind}], [${PLAYABLE_MOTION_ATTRIBUTES.asset}], [${PLAYABLE_MOTION_ATTRIBUTES.pressedAsset}]`,
      )) {
        this.#motionContexts.set(element, nodeContext);
        const cleanup = mountPlayableMotionElement(element, nodeContext);
        this.#motionCleanups.set(element, cleanup);
      }
      if (stage?.hasAttribute("data-putenggame-awaiting-input"))
        this.#pauseSurface(host, root);
      this.#observeMedia(root);
      attachBackdropVideoEnded();
      return {
        cleanup: async () => {
          backdropObserver?.disconnect();
          if (backdropVideo && onBackdropVideoEnded)
            backdropVideo.removeEventListener("ended", onBackdropVideoEnded);
          for (const type of ["pointerdown", "keydown", "click"])
            root.removeEventListener(type, unlockOnInput, true);
          root.removeEventListener(
            PLAYABLE_MOTION_TIMING_UPDATE_EVENT,
            onMotionTimingUpdate,
            true,
          );
          unsubscribeSettings();
          settingsVideo?.removeEventListener(
            "timeupdate",
            updatePlayerSettings,
          );
          settingsVideo?.removeEventListener("seeked", updatePlayerSettings);
          subtitle.remove();
          for (const element of root.querySelectorAll<HTMLElement>(
            `[${PLAYABLE_MOTION_ATTRIBUTES.kind}], [${PLAYABLE_MOTION_ATTRIBUTES.asset}], [${PLAYABLE_MOTION_ATTRIBUTES.pressedAsset}]`,
          )) {
            this.#motionCleanups.get(element)?.();
            this.#motionContexts.delete(element);
            this.#motionCleanups.delete(element);
          }
          for (const element of root.querySelectorAll<HTMLElement>(
            "[data-putenggame-button-preset]",
          )) {
            this.#buttonPresetCleanups.get(element)?.();
            this.#buttonPresetCleanups.delete(element);
          }
          this.#motionContextsBySurface.delete(surface.id);
          await (cleanup as PlayableCleanup | undefined)?.();
        },
        destroy: () => host.remove(),
      };
    } catch (cause) {
      host.remove();
      throw cause;
    }
  }

  #stage(root: ShadowRoot): HTMLElement | undefined {
    return (
      root.querySelector<HTMLElement>("main, .stage") ??
      [...root.children].find(
        (element): element is HTMLElement =>
          element instanceof this.#document.defaultView!.HTMLElement &&
          element.tagName !== "STYLE",
      )
    );
  }

  #setNoInputMode(
    host: HTMLElement,
    root: ShadowRoot,
    stage: HTMLElement,
    mode: "continue" | "wait" | undefined,
  ): void {
    if (mode === "continue") {
      stage.setAttribute(PLAYABLE_MOTION_ATTRIBUTES.continueWithoutInput, "true");
      stage.setAttribute(PLAYABLE_MOTION_ATTRIBUTES.noInputMode, "continue");
      this.#resumeSurface(host, root, stage);
    } else if (mode === "wait") {
      stage.removeAttribute(PLAYABLE_MOTION_ATTRIBUTES.continueWithoutInput);
      stage.setAttribute(PLAYABLE_MOTION_ATTRIBUTES.noInputMode, "wait");
      stage.setAttribute("data-putenggame-awaiting-input", "");
      this.#pauseSurface(host, root);
    } else {
      stage.removeAttribute(PLAYABLE_MOTION_ATTRIBUTES.continueWithoutInput);
      stage.removeAttribute(PLAYABLE_MOTION_ATTRIBUTES.noInputMode);
      this.#resumeSurface(host, root, stage);
    }
  }

  #pauseSurface(host: HTMLElement, root: ShadowRoot): void {
    const view = this.#document.defaultView!;
    const now = view.performance.now();
    if (!this.#surfacePausedAt.has(host)) {
      this.#surfacePausedAt.set(host, now);
      this.#stage(root)?.dispatchEvent(
        new view.CustomEvent("putenggame:motion-pause", {
          bubbles: true,
          detail: now,
        }),
      );
    }
    const paused = this.#pausedAnimations.get(host) ?? [];
    for (const animation of root.getAnimations()) {
      if (animation.playState !== "running") continue;
      animation.pause();
      paused.push(animation);
    }
    this.#pausedAnimations.set(host, paused);
    const pausedVideos = this.#pausedVideos.get(host) ?? [];
    for (const video of root.querySelectorAll<HTMLVideoElement>("video")) {
      if (!video.paused && !pausedVideos.includes(video))
        pausedVideos.push(video);
      video.pause();
    }
    this.#pausedVideos.set(host, pausedVideos);
    this.#updateTimedVisibility();
  }

  #resumeSurface(
    host: HTMLElement,
    root: ShadowRoot,
    stage: HTMLElement,
  ): void {
    const now = this.#document.defaultView!.performance.now();
    stage.dispatchEvent(
      new this.#document.defaultView!.CustomEvent(
        "putenggame:motion-resume",
        { bubbles: true, detail: now },
      ),
    );
    stage.removeAttribute("data-putenggame-awaiting-input");
    const pausedAt = this.#surfacePausedAt.get(host);
    if (pausedAt !== undefined) {
      this.#surfaceStartedAt.set(
        host,
        (this.#surfaceStartedAt.get(host) ?? pausedAt) +
          now -
          pausedAt,
      );
      this.#surfacePausedAt.delete(host);
    }
    for (const animation of this.#pausedAnimations.get(host) ?? [])
      animation.play();
    this.#pausedAnimations.delete(host);
    for (const video of this.#pausedVideos.get(host) ?? [])
      void video.play().catch(() => {});
    this.#pausedVideos.delete(host);
    this.#updateTimedVisibility();
  }

  #bindButtonPreset(
    element: HTMLElement,
    context: PlayableNodeContext,
  ): () => void {
    element.style.setProperty("transform-origin", "50% 50%", "important");
    const click = () => {
      if (
        element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.buttonAction) ===
        "new-game"
      ) {
        void context.session
          .reset()
          .then(() => {
            const signal = element.getAttribute("data-signal");
            if (signal) return context.navigation.emit(signal);
          })
          .catch(() => {});
        return;
      }
      if (
        element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.buttonAction) ===
        "continue"
      ) {
        if (context.session.hasSave())
          void context.session.continue().catch(() => {});
        return;
      }
      if (
        element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.buttonAction) ===
        "back"
      ) {
        void context.navigation.back().catch(() => {});
        return;
      }
      const signal = element.getAttribute("data-signal");
      if (signal) void context.navigation.emit(signal).catch(() => {});
    };
    if (
      element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.buttonAction) ===
        "continue" &&
      !context.session.hasSave()
    )
      element.setAttribute("aria-disabled", "true");
    else if (
      element.getAttribute(PLAYABLE_MOTION_ATTRIBUTES.buttonAction) ===
      "continue"
    )
      element.removeAttribute("aria-disabled");
    element.addEventListener("click", click);
    return () => element.removeEventListener("click", click);
  }

  #applyBackdropEffects(
    host: HTMLElement,
    effects: PlayableBackdropEffects,
  ): void {
    const root = host.shadowRoot;
    if (!root) return;
    let style = root.querySelector<HTMLStyleElement>(
      "style[data-playable-backdrop-effects]",
    );
    if (!style) {
      style = this.#document.createElement("style");
      style.dataset.playableBackdropEffects = "true";
      root.append(style);
    }
    style.textContent = `:host {\n  ${PLAYABLE_BACKDROP_VIGNETTE_VARIABLE}: ${effects.vignette ? `var(${PLAYABLE_BACKDROP_VIGNETTE_VARIABLE}-source)` : "none"};\n  ${PLAYABLE_BACKDROP_GRAIN_VARIABLE}: ${effects.grain ? `var(${PLAYABLE_BACKDROP_GRAIN_VARIABLE}-source)` : "none"};\n}`;
  }

  #observeMedia(root: ShadowRoot): void {
    const observer = new MutationObserver(() => this.#syncMedia());
    observer.observe(root, { childList: true, subtree: true });
    this.#mediaObservers.push(observer);
    this.#syncMedia();
  }

  #mediaVideos(): HTMLVideoElement[] {
    const roots: (Document | ShadowRoot)[] = [this.#document];
    for (let index = 0; index < roots.length; index += 1) {
      for (const element of Array.from(roots[index]!.querySelectorAll("*"))) {
        if (element.shadowRoot) roots.push(element.shadowRoot);
      }
    }
    return roots.flatMap((root) => Array.from(root.querySelectorAll("video")));
  }

  #syncMedia(): void {
    const videos = this.#mediaVideos();
    for (const video of videos) {
      if (this.#mediaBindings.has(video)) continue;
      this.#mediaBindings.add(video);
      for (const type of [
        "timeupdate",
        "seeking",
        "seeked",
        "loadedmetadata",
        "durationchange",
        "play",
        "pause",
        "ended",
      ])
        video.addEventListener(type, () =>
          this.#emitMediaState(this.#targetBackdropVideo()),
        );
    }
    this.#emitMediaState(this.#targetBackdropVideo());
  }

  #targetBackdropVideo(): HTMLVideoElement | undefined {
    const videos: HTMLVideoElement[] = [];
    for (const surface of this.#nodeLayer.querySelectorAll<HTMLElement>(
      "[data-playable-surface]",
    )) {
      const backdrop = surface.shadowRoot?.querySelector<HTMLElement>(
        '[data-media="backdrop"]',
      );
      const video =
        backdrop?.tagName.toLowerCase() === "video"
          ? (backdrop as HTMLVideoElement)
          : backdrop?.querySelector<HTMLVideoElement>("video");
      if (video) videos.push(video);
    }
    return videos.find((video) => !video.paused) ?? videos[0];
  }

  #updateTimedVisibility(): void {
    const now = this.#document.defaultView!.performance.now();
    let nextFallbackAt = Number.POSITIVE_INFINITY;
    for (const surface of this.#nodeLayer.querySelectorAll<HTMLElement>(
      "[data-playable-surface]",
    )) {
      const root = surface.shadowRoot;
      if (!root) continue;
      const isWaiting = Boolean(
        this.#stage(root)?.hasAttribute("data-putenggame-awaiting-input"),
      );
      const effectiveNow = this.#surfacePausedAt.get(surface) ?? now;
      const backdrop = root.querySelector<HTMLElement>(
        '[data-media="backdrop"]',
      );
      const video =
        backdrop?.tagName.toLowerCase() === "video"
          ? (backdrop as HTMLVideoElement)
          : backdrop?.querySelector<HTMLVideoElement>("video");
      const currentTime =
        video && Number.isFinite(video.currentTime)
          ? video.currentTime
          : Math.max(
              0,
              (effectiveNow - (this.#surfaceStartedAt.get(surface) ?? now)) / 1000,
            );
      for (const element of root.querySelectorAll<HTMLElement>(
        "[style*='--putenggame-appear-at'], [style*='--putenggame-disappear-at'], [data-putenggame-show-after-video-end]",
      )) {
        const style = this.#document.defaultView!.getComputedStyle(element);
        const appearAt = parseDelaySeconds(
          element.style.getPropertyValue("--putenggame-appear-at") ||
            style.getPropertyValue("--putenggame-appear-at"),
        );
        const rawDisappearAt =
          element.style.getPropertyValue("--putenggame-disappear-at") ||
          style.getPropertyValue("--putenggame-disappear-at");
        const disappearAt = parseOptionalTimingSeconds(rawDisappearAt);
        if (!video && !isWaiting) {
          const startedAt = this.#surfaceStartedAt.get(surface) ?? now;
          if (appearAt > currentTime)
            nextFallbackAt = Math.min(
              nextFallbackAt,
              startedAt + appearAt * 1000,
            );
          if (disappearAt !== undefined && disappearAt > currentTime)
            nextFallbackAt = Math.min(
              nextFallbackAt,
              startedAt + disappearAt * 1000,
            );
        }
        const videoEnded =
          Boolean(
            video &&
              (video.ended ||
                (Number.isFinite(video.duration) &&
                  video.duration > 0 &&
                  currentTime >= video.duration - 0.05)),
          );
        const hidden =
          (element.hasAttribute(
            PLAYABLE_MOTION_ATTRIBUTES.showAfterVideoEnd,
          ) &&
            !videoEnded) ||
          currentTime < appearAt ||
          (disappearAt !== undefined &&
            currentTime >= disappearAt &&
            !element.hasAttribute(PLAYABLE_MOTION_HOLDING_ATTRIBUTE)) ||
          (disappearAt !== undefined && disappearAt <= appearAt);
        element.toggleAttribute("data-playable-timing-hidden", hidden);
      }
    }
    if (this.#timingTimer !== undefined)
      this.#document.defaultView!.clearTimeout(this.#timingTimer);
    this.#timingTimer = Number.isFinite(nextFallbackAt)
      ? this.#document.defaultView!.setTimeout(
          () => {
            this.#timingTimer = undefined;
            this.#updateTimedVisibility();
          },
          Math.max(0, nextFallbackAt - now),
        )
      : undefined;
  }

  #emitMediaState(video: HTMLVideoElement | undefined): void {
    this.#updateTimedVisibility();
    if (!video) {
      this.#mediaListener?.({ currentTime: 0, duration: 0, paused: true });
      return;
    }
    const backdrop = video.closest<HTMLElement>('[data-media="backdrop"]');
    this.#mediaListener?.({
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      paused: video.paused,
      ...(backdrop?.dataset.asset ? { backdropAssetId: backdrop.dataset.asset } : {}),
    });
  }
}

function buttonImageDataUrl(
  button: HTMLButtonElement,
  selector?: string,
): string | undefined {
  const image = selector
    ? button.querySelector<HTMLImageElement>(selector)
    : button.querySelector<HTMLImageElement>(
        "[data-putenggame-button-asset-image] img",
      ) ??
      [...button.querySelectorAll<HTMLImageElement>("img")].find(
        (candidate) =>
          !candidate.closest("[data-putenggame-button-pressed-image]"),
      );
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return;
  try {
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = button.ownerDocument.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    return dataUrl.length <= 524288 ? dataUrl : undefined;
  } catch {
    return;
  }
}

export function assertPlayableSandboxDocument(document: Document): void {
  const view = document.defaultView;
  if (!view || view === view.top || view.origin !== "null") {
    throw new Error(
      'Playable surfaces require an opaque-origin iframe with sandbox="allow-scripts".',
    );
  }
}

export function installPlayableSandboxCsp(document: Document): void {
  const existing = document.head.querySelector<HTMLMetaElement>(
    'meta[data-playable-sandbox-csp="true"]',
  );
  if (existing) {
    if (existing.content !== PLAYABLE_SANDBOX_CSP)
      throw new Error(
        "Playable sandbox CSP does not match the Runtime policy.",
      );
    return;
  }

  const meta = document.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = PLAYABLE_SANDBOX_CSP;
  meta.dataset.playableSandboxCsp = "true";
  document.head.prepend(meta);
}

export async function loadPlayableModule(javascript: string): Promise<unknown> {
  const url = URL.createObjectURL(
    new Blob([javascript], { type: "text/javascript" }),
  );
  try {
    return await import(/* @vite-ignore */ url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function createSandboxScaffold(document: Document): {
  projectRoot: HTMLElement;
  nodeLayer: HTMLElement;
} {
  document.documentElement.style.width = "100%";
  document.documentElement.style.height = "100%";
  document.body.replaceChildren();
  document.body.style.width = "100%";
  document.body.style.height = "100%";
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";

  const projectRoot = document.createElement("main");
  projectRoot.dataset.playableSandbox = "true";
  projectRoot.style.position = "relative";
  projectRoot.style.width = "100%";
  projectRoot.style.height = "100%";
  projectRoot.style.overflow = "hidden";

  const nodeLayer = document.createElement("div");
  nodeLayer.dataset.playableNodeLayer = "true";
  setLayerStyle(nodeLayer, 0);

  projectRoot.append(nodeLayer);
  document.body.append(projectRoot);
  return { projectRoot, nodeLayer };
}

interface TextEditing {
  element: HTMLElement;
  editor: HTMLElement;
  placeholders: Comment[];
  originalNodes: Text[];
  leadingText: string;
  trailingText: string;
  pick: PlayablePickResult;
  before: string;
  sourceBefore?: string;
  inPlace: boolean;
  creation?: Omit<PlayableTextCreate, "text">;
  onBlur: () => void;
}

interface Dragging {
  element: HTMLElement;
  /** The element before the drag started. */
  pick: PlayablePickResult;
  part?: "button-label";
  box: PlayablePickResult["box"];
  pointerId: number;
  start: { x: number; y: number };
  /** How far the pointer has moved, in the frame's CSS pixels. */
  delta: { x: number; y: number };
  /** The surface's size, which cqw and cqh are hundredths of. */
  size: { width: number; height: number };
  /** The offset the element had, in cqw and cqh. */
  base: PlayableTranslate;
  /** The inline values the drag replaces, restored when it is cancelled. */
  original: { translate: string; transition: string };
  inPlace: boolean;
}

type TransformHandleKind = "nw" | "ne" | "sw" | "se" | "rotate";

interface SelectedElement {
  element: HTMLElement;
  pick: PlayablePickResult;
  part?: "button-label";
}

interface MarqueeDrag {
  pointerId: number;
  start: { x: number; y: number };
  current: { x: number; y: number };
  additive: boolean;
  targetPath: readonly EventTarget[];
}

interface Transforming {
  kind: TransformHandleKind;
  element: HTMLElement;
  pick: PlayablePickResult;
  pointerId: number;
  start: { x: number; y: number };
  box: PlayablePickResult["box"];
  center: { x: number; y: number };
  base: PlayableTransform;
  transform: PlayableTransform;
  original: {
    scale: string;
    rotate: string;
    transformOrigin: string;
    transformOriginPriority: string;
    transition: string;
  };
  inPlace: boolean;
}

function createTransformHandles(document: Document): HTMLDivElement[] {
  return (["nw", "ne", "sw", "se", "rotate"] as const).map((kind) => {
    const handle = document.createElement("div");
    handle.dataset.playableTransformHandle = kind;
    handle.setAttribute("aria-hidden", "true");
    const visibleHandle = document.createElement("span");
    Object.assign(visibleHandle.style, {
      display: "block",
      width: kind === "rotate" ? "18px" : "12px",
      height: kind === "rotate" ? "18px" : "12px",
      boxSizing: "border-box",
      border: "1px solid #4f8cff",
      borderRadius: kind === "rotate" ? "50%" : "2px",
      background: "#fff",
      pointerEvents: "none",
    });
    handle.append(visibleHandle);
    Object.assign(handle.style, {
      position: "absolute",
      zIndex: "3",
      display: "grid",
      placeItems: "center",
      width: "28px",
      height: "28px",
      boxSizing: "border-box",
      border: "0",
      borderRadius: "50%",
      background: "transparent",
      pointerEvents: "auto",
      touchAction: "none",
      ...(kind === "nw"
        ? { left: "-14px", top: "-14px", cursor: "nwse-resize" }
        : {}),
      ...(kind === "ne"
        ? { right: "-14px", top: "-14px", cursor: "nesw-resize" }
        : {}),
      ...(kind === "sw"
        ? { left: "-14px", bottom: "-14px", cursor: "nesw-resize" }
        : {}),
      ...(kind === "se"
        ? { right: "-14px", bottom: "-14px", cursor: "nwse-resize" }
        : {}),
      ...(kind === "rotate"
        ? {
            left: "50%",
            top: "-34px",
            transform: "translateX(-50%)",
            cursor: "grab",
          }
        : {}),
    });
    return handle;
  });
}

function transformHandle(
  path: readonly EventTarget[],
): { kind: TransformHandleKind; element: HTMLElement } | undefined {
  const element = path.find(
    (target): target is HTMLElement =>
      target instanceof HTMLElement &&
      typeof target.dataset.playableTransformHandle === "string",
  );
  const kind = element?.dataset.playableTransformHandle;
  return kind && isTransformHandleKind(kind) ? { kind, element } : undefined;
}

function isTransformHandleKind(value: string): value is TransformHandleKind {
  return (
    value === "nw" ||
    value === "ne" ||
    value === "sw" ||
    value === "se" ||
    value === "rotate"
  );
}

function selectedBox(element: Element): PlayablePickResult["box"] {
  const rect = element.getBoundingClientRect();
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (
    element instanceof HTMLElement &&
    (element.hasAttribute(PLAYABLE_MOTION_ATTRIBUTES.asset) ||
      element.hasAttribute(PLAYABLE_MOTION_ATTRIBUTES.pressedAsset))
  ) {
    const localWidth = element.clientWidth || rect.width;
    const localHeight = element.clientHeight || rect.height;
    const scaleX = localWidth ? rect.width / localWidth : 1;
    const scaleY = localHeight ? rect.height / localHeight : 1;
    const images = element.querySelectorAll<HTMLImageElement>(
      "[data-putenggame-button-asset-image] img, [data-putenggame-button-pressed-image] img",
    );
    let hasContainedAsset = false;
    for (const image of images) {
      if (!image.naturalWidth || !image.naturalHeight) continue;
      const objectFit =
        element.ownerDocument.defaultView?.getComputedStyle(image).objectFit ??
        image.style.objectFit;
      if (objectFit !== "contain" && objectFit !== "scale-down") continue;
      const contentWidth = image.clientWidth || localWidth;
      const contentHeight = image.clientHeight || localHeight;
      const fitScale = Math.min(
        contentWidth / image.naturalWidth,
        contentHeight / image.naturalHeight,
        ...(objectFit === "scale-down" ? [1] : []),
      );
      const width = image.naturalWidth * fitScale * scaleX;
      const height = image.naturalHeight * fitScale * scaleY;
      const imageRect = image.getBoundingClientRect();
      const centerX = imageRect.x + imageRect.width / 2;
      const centerY = imageRect.y + imageRect.height / 2;
      const imageLeft = centerX - width / 2;
      const imageTop = centerY - height / 2;
      const imageRight = centerX + width / 2;
      const imageBottom = centerY + height / 2;
      if (!hasContainedAsset) {
        left = imageLeft;
        top = imageTop;
        right = imageRight;
        bottom = imageBottom;
        hasContainedAsset = true;
      } else {
        left = Math.min(left, imageLeft);
        top = Math.min(top, imageTop);
        right = Math.max(right, imageRight);
        bottom = Math.max(bottom, imageBottom);
      }
    }
  }
  return {
    x: Math.round(left * 100) / 100,
    y: Math.round(top * 100) / 100,
    width: Math.round((right - left) * 100) / 100,
    height: Math.round((bottom - top) * 100) / 100,
  };
}

function parseTransformOrigin(
  value: string,
  width: number,
  height: number,
): { x: number; y: number } {
  const [xToken = "50%", yToken = "50%"] = value.trim().split(/\s+/);
  const parse = (token: string, length: number, axis: "x" | "y") => {
    if (token.endsWith("%")) return Number.parseFloat(token);
    if (token.endsWith("px"))
      return length ? (Number.parseFloat(token) / length) * 100 : 50;
    if (token === "center") return 50;
    if (token === "left" || token === "top") return 0;
    if (token === "right" || token === "bottom") return 100;
    if (!Number.isFinite(Number(token))) return axis === "x" ? 50 : 50;
    return length ? (Number(token) / length) * 100 : 50;
  };
  return {
    x: parse(xToken, width, "x"),
    y: parse(yToken, height, "y"),
  };
}

function linearTransformMatrix(
  value: string,
): { a: number; b: number; c: number; d: number } {
  const matrix = /^matrix\(([^)]+)\)$/.exec(value.trim());
  if (matrix) {
    const [a, b, c, d] = matrix[1]!.split(",").map(Number);
    if ([a, b, c, d].every(Number.isFinite)) return { a: a!, b: b!, c: c!, d: d! };
  }
  const matrix3d = /^matrix3d\(([^)]+)\)$/.exec(value.trim());
  if (matrix3d) {
    const values = matrix3d[1]!.split(",").map(Number);
    const [a, b, c, d] = [values[0], values[1], values[4], values[5]];
    if ([a, b, c, d].every(Number.isFinite))
      return { a: a!, b: b!, c: c!, d: d! };
  }
  return { a: 1, b: 0, c: 0, d: 1 };
}

function rectangle(
  start: { x: number; y: number },
  end: { x: number; y: number },
): PlayablePickResult["box"] {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function intersects(
  first: PlayablePickResult["box"],
  second: PlayablePickResult["box"],
): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function selectableSourceTargets(root: HTMLElement): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const labels: HTMLElement[] = [];
  const visit = (container: Document | ShadowRoot | HTMLElement) => {
    for (const element of Array.from(
      container.querySelectorAll<HTMLElement>("*"),
    )) {
      if (element.hasAttribute(PLAYABLE_SOURCE_ATTRIBUTE))
        elements.push(element);
      if (element.hasAttribute("data-putenggame-button-label"))
        labels.push(element);
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(root);
  const sourceElements = new Set(elements);
  const targets = new Set<HTMLElement>();
  for (const element of elements) {
    if (isBackdropElement(element)) continue;

    if (element.hasAttribute("data-putenggame-selectable")) {
      targets.add(element);
      continue;
    }

    const interaction = nearestSourceAncestor(
      element,
      sourceElements,
      isFrameInteraction,
    );
    if (interaction) {
      targets.add(interaction);
      continue;
    }

    if (
      isFrameMedia(element) ||
      isFrameText(element) ||
      !hasSourceChild(element, sourceElements)
    )
      targets.add(element);
  }
  labels.forEach((label) => targets.add(label));
  return [...targets];
}

function wrapButtonLabelsForPicking(root: HTMLElement): HTMLSpanElement[] {
  const buttons: HTMLElement[] = [];
  const visit = (container: Document | ShadowRoot | HTMLElement) => {
    for (const element of Array.from(
      container.querySelectorAll<HTMLElement>("*"),
    )) {
      if (
        element.hasAttribute(PLAYABLE_SOURCE_ATTRIBUTE) &&
        (element.tagName.toLowerCase() === "button" ||
          element.getAttribute("role") === "button") &&
        !element.querySelector("[data-putenggame-button-label]")
      )
        buttons.push(element);
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(root);
  return buttons.flatMap((button) => {
    const walker = button.ownerDocument.createTreeWalker(button, 4, {
      acceptNode: (node) =>
        node.textContent?.trim() &&
        !["SCRIPT", "STYLE"].includes(
          node.parentElement?.tagName.toUpperCase() ?? "",
        ) &&
        !node.parentElement?.closest("svg")
          ? 1
          : 2,
    });
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
    return textNodes.map((node) => {
      const label = button.ownerDocument.createElement("span");
      label.dataset.putenggameButtonLabel = "";
      Object.assign(label.style, {
        display: "inline-block",
        transformOrigin: "center",
        verticalAlign: "inherit",
      });
      node.replaceWith(label);
      label.append(node);
      return label;
    });
  });
}

function nearestSourceAncestor(
  element: HTMLElement,
  sourceElements: Set<HTMLElement>,
  predicate: (element: HTMLElement) => boolean,
): HTMLElement | undefined {
  let current: HTMLElement | null = element;
  while (current) {
    if (sourceElements.has(current) && predicate(current)) return current;
    current = current.parentElement;
  }
  return undefined;
}

function isBackdropElement(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    if (current.getAttribute("data-media") === "backdrop") return true;
    current = current.parentElement;
  }
  return false;
}

function isFrameInteraction(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  return (
    ["button", "a", "input", "select", "textarea"].includes(tag) ||
    element.getAttribute("role") === "button" ||
    element.hasAttribute("data-qte") ||
    [
      "data-signal",
      "data-press",
      "data-restart",
      "data-continue",
      "data-back",
    ].some((name) => element.hasAttribute(name))
  );
}

function isFrameMedia(element: HTMLElement): boolean {
  return (
    ["img", "video", "picture", "canvas", "svg"].includes(
      element.tagName.toLowerCase(),
    ) || element.hasAttribute("data-media")
  );
}

function isFrameText(element: HTMLElement): boolean {
  return Array.from(element.childNodes).some(
    (child) => child.nodeType === 3 && Boolean(child.textContent?.trim()),
  );
}

function hasSourceChild(
  element: HTMLElement,
  sourceElements: Set<HTMLElement>,
): boolean {
  return Array.from(element.children).some((child) =>
    sourceElements.has(child as HTMLElement),
  );
}

function elementForPick(
  projectRoot: HTMLElement,
  pick: PlayablePickResult,
): HTMLElement | undefined {
  const surface = Array.from(
    projectRoot.querySelectorAll<HTMLElement>("[data-playable-surface]"),
  ).find((candidate) => candidate.dataset.playableSurface === pick.nodeId);
  if (!surface?.shadowRoot) return;
  try {
    const element = surface.shadowRoot.querySelector<HTMLElement>(pick.cssPath);
    return element && element.tagName.toLowerCase() === pick.tag
      ? element
      : undefined;
  } catch {
    return;
  }
}

function pickForElement(element: HTMLElement): PlayablePickResult | undefined {
  const pick = describePlayablePick(elementPath(element));
  const computed = element.ownerDocument.defaultView?.getComputedStyle(element);
  const fontFamily = computed?.fontFamily
    .split(",")[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, "");
  const [scaleX, scaleY] = parseScaleAxes(
    element.style.scale || computed?.scale || "1",
  );
  const assetScales = element.hasAttribute(PLAYABLE_MOTION_ATTRIBUTES.asset)
    ? playableButtonAssetScales(element)
    : { x: 100, y: 100 };
  const transformScale =
    (scaleX / (assetScales.x / 100) +
      scaleY / (assetScales.y / 100)) /
    2;
  const origin =
    element.hasAttribute("data-putenggame-button-preset")
      ? { x: 50, y: 50 }
      : parseTransformOrigin(
          computed?.transformOrigin ?? "50% 50%",
          element.offsetWidth,
          element.offsetHeight,
        );
  return pick
    ? {
        ...pick,
        box: selectedBox(element),
        transformScale,
        transformRotation: parsePlayableRotation(
          element.style.rotate || computed?.rotate || "none",
        ),
        transformOriginX: origin.x,
        transformOriginY: origin.y,
        ...(fontFamily ? { fontFamily } : {}),
      }
    : undefined;
}

function interactionForElement(
  element: HTMLElement,
): PlayableInteractionSelection | undefined {
  if (element.hasAttribute("data-putenggame-selectable")) return undefined;
  const appearance = describePlayableAppearanceTarget(elementPath(element));
  if (!appearance) return undefined;
  const target = appearance.element as HTMLElement;
  const computed = getComputedStyle(target);
  const rawDelay =
    target.style.getPropertyValue("--putenggame-appear-at") ||
    computed.getPropertyValue("--putenggame-appear-at") ||
    target.style.getPropertyValue("--delay") ||
    computed.getPropertyValue("--delay") ||
    computed.animationDelay;
  const rawEnd =
    target.style.getPropertyValue("--putenggame-disappear-at") ||
    computed.getPropertyValue("--putenggame-disappear-at");
  return {
    pick: appearance.pick,
    delaySeconds: parseDelaySeconds(rawDelay),
    ...(parseOptionalTimingSeconds(rawEnd) === undefined
      ? {}
      : { endSeconds: parseOptionalTimingSeconds(rawEnd) }),
    inPlace: Boolean(appearance.pick.source),
  };
}

function elementPath(element: HTMLElement): EventTarget[] {
  const path: EventTarget[] = [element];
  let current: Element | null = element;
  while (current) {
    if (current.parentElement) {
      current = current.parentElement;
      path.push(current);
      continue;
    }
    const shadowRoot = current.getRootNode();
    if (!(shadowRoot instanceof ShadowRoot)) break;
    current = shadowRoot.host;
    path.push(current);
  }
  return path;
}

/** Pointer travel, in CSS pixels, before a press becomes a move instead of a click. */
const MOVE_THRESHOLD = 3;

/**
 * The element a drag at the start of `path` moves, with its pick. Inline
 * boxes ignore `translate`, so a press on one moves the box that holds it.
 * A surface's own root and its background stay put.
 */
function movableTarget(
  path: readonly EventTarget[],
  selectable: ReadonlySet<HTMLElement>,
  x: number,
  y: number,
):
  | {
      element: HTMLElement;
      pick: PlayablePickResult;
      part?: "button-label";
    }
  | undefined {
  const label = buttonLabelInPath(path);
  const button = label?.closest<HTMLElement>('button, [role="button"]');
  if (button && selectable.has(button)) {
    const pick = pickForElement(button);
    if (pick?.buttonAssetId)
      return { element: label!, pick, part: "button-label" };
  }
  const element = selectableElementAtPoint(path, selectable, x, y);
  if (!element) return undefined;
  const pick = pickForElement(element);
  if (!pick || pick.mediaSlot === "backdrop") return undefined;
  return { element, pick };
}

function buttonLabelInPath(
  path: readonly EventTarget[],
): HTMLElement | undefined {
  return path.find(
    (target): target is HTMLElement =>
      target instanceof HTMLElement &&
      target.hasAttribute("data-putenggame-button-label"),
  );
}

function buttonLabelPick(label: HTMLElement): PlayablePickResult | undefined {
  const button = label.closest<HTMLElement>('button, [role="button"]');
  const pick = button ? pickForElement(button) : undefined;
  const walker = label.ownerDocument.createTreeWalker(
    label,
    label.ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4,
  );
  const sourceText: string[] = [];
  while (walker.nextNode())
    sourceText.push(playableOriginalText(walker.currentNode as Text));
  const labelIndex = button
    ? Array.from(
        button.querySelectorAll<HTMLElement>(
          "[data-putenggame-button-label]",
        ),
      ).indexOf(label)
    : -1;
  return pick
    ? {
        ...pick,
        part: "button-label",
        ...(labelIndex >= 0 ? { partId: String(labelIndex) } : {}),
        text: (label.textContent ?? "").replace(/\s+/g, " ").trim(),
        sourceText: sourceText.join("").replace(/\s+/g, " ").trim(),
        box: selectedBox(label),
      }
    : undefined;
}

function selectableElementAtPoint(
  path: readonly EventTarget[],
  selectable: ReadonlySet<HTMLElement>,
  x: number,
  y: number,
): HTMLElement | undefined {
  const explicitlySelectable = [...selectable]
    .filter((element) => {
      if (!element.hasAttribute("data-putenggame-selectable")) return false;
      const box = element.getBoundingClientRect();
      const horizontalPadding = Math.max(0, (14 - box.width) / 2);
      const verticalPadding = Math.max(0, (14 - box.height) / 2);
      return (
        x >= box.left - horizontalPadding &&
        x <= box.right + horizontalPadding &&
        y >= box.top - verticalPadding &&
        y <= box.bottom + verticalPadding
      );
    })
    .sort((first, second) => {
      const firstBox = first.getBoundingClientRect();
      const secondBox = second.getBoundingClientRect();
      return (
        firstBox.width * firstBox.height - secondBox.width * secondBox.height
      );
    })[0];
  if (explicitlySelectable) return explicitlySelectable;

  const direct = path.find(
    (target): target is HTMLElement =>
      target instanceof HTMLElement && selectable.has(target),
  );
  if (direct) return direct;

  return [...selectable]
    .filter((element) => {
      const box = element.getBoundingClientRect();
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    })
    .sort((first, second) => {
      const firstBox = first.getBoundingClientRect();
      const secondBox = second.getBoundingClientRect();
      return (
        firstBox.width * firstBox.height - secondBox.width * secondBox.height
      );
    })[0];
}

/**
 * An animation on the element sets `translate` in place of the element's
 * own, so an offset written to its style would not show. Animations that add
 * to it, like the Project Style's `.rise`, are fine, and transitions end.
 */
function overridesTranslate(element: Element): boolean {
  return element.getAnimations().some((animation) => {
    const effect = animation.effect;
    if (
      "transitionProperty" in animation ||
      !(effect instanceof KeyframeEffect) ||
      effect.composite !== "replace"
    )
      return false;
    return effect.getKeyframes().some((frame) => "translate" in frame);
  });
}

function overridesTransform(element: Element): boolean {
  return element.getAnimations().some((animation) => {
    if (animation.id === PLAYABLE_EDITOR_FEEDBACK_ANIMATION_ID) return false;
    const effect = animation.effect;
    if (
      "transitionProperty" in animation ||
      !(effect instanceof KeyframeEffect) ||
      effect.composite !== "replace"
    )
      return false;
    return effect
      .getKeyframes()
      .some(
        (frame) =>
          "transform" in frame || "scale" in frame || "rotate" in frame,
      );
  });
}

function parseScaleAxes(value: string): [number, number] {
  if (!value.trim() || value.trim() === "none") return [1, 1];
  const [x, y = x] = value.trim().split(/\s+/).map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : [1, 1];
}

/**
 * Elements whose text can be typed over: they hold text of their own and are
 * not form fields. A container whose text all sits in child elements is not
 * one; typing over it would replace the whole layout.
 */
function isTextTarget(target: unknown): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName.toLowerCase();
  if (
    [
      "input",
      "textarea",
      "select",
      "img",
      "video",
      "audio",
      "canvas",
      "svg",
      "iframe",
    ].includes(tag)
  )
    return false;
  return Array.from(target.childNodes).some(
    (child) => child.nodeType === 3 && Boolean(child.textContent?.trim()),
  );
}

/**
 * The element came from surface HTML and holds only text, so its source can
 * be rewritten directly.
 */
function holdsSourceText(element: Element): boolean {
  let current: Element | null = element;
  while (current && !current.hasAttribute(PLAYABLE_SOURCE_ATTRIBUTE))
    current = current.parentElement;
  return (
    element.hasAttribute(PLAYABLE_SOURCE_ATTRIBUTE) ||
    (element.hasAttribute("data-putenggame-button-label") && current !== null)
  );
}

function parseDelaySeconds(value: string): number {
  const match = /(-?(?:\d+\.?\d*|\.\d+))\s*(ms|s)?/i.exec(value.trim());
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(
    0,
    Math.round(
      (match[2]?.toLowerCase() === "ms" ? amount / 1000 : amount) * 10,
    ) / 10,
  );
}

function parseOptionalTimingSeconds(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const seconds = parseDelaySeconds(value);
  return seconds <= 3600 ? seconds : undefined;
}

const BLOCKED_PICK_EVENTS = [
  "pointerenter",
  "pointerleave",
  "mousedown",
  "mouseup",
  "dblclick",
  "auxclick",
  "touchstart",
  "touchmove",
  "touchend",
  "wheel",
  "keyup",
  "keypress",
];

function setLayerStyle(layer: HTMLElement, zIndex: number): void {
  layer.style.position = "absolute";
  layer.style.inset = "0";
  layer.style.zIndex = String(zIndex);
}

function globalFontStyleText(family: string | undefined): string {
  return family
    ? `:host, :host *, :host *::before, :host *::after {
  font-family: ${cssFontFamilyName(family)} !important;
}`
    : "";
}

function isPlayableSurfaceModule(
  value: unknown,
): value is PlayableSurfaceModule {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "mount") === "function"
  );
}
