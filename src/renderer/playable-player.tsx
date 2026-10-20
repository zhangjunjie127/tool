import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  PlayableAssetTransfer,
  PlayableAppearanceTimingCommand,
  PlayableDeleteEdit,
  PlayableElementClipboardCommand,
  PlayableElementCopy,
  PlayableFrameMessage,
  PlayableHistoryCommand,
  PlayableMediaCommand,
  PlayableMediaState,
  PlayableMotionCommand,
  PlayableTextStyleCommand,
  PlayableMove,
  PlayablePreviewOptions,
  PlayablePreviewTool,
  PlayableTextCreate,
  PlayableTextEdit,
  PlayableTextSelection,
  PlayableInteractionSelection,
  PlayableTransformEdit,
  NodePlayerDefinition,
} from "../shared/playable-player-protocol.js";
import type { PlayableBackdropEffects } from "../shared/playable-backdrop-effects.js";
import { isPlayableFrameMessage } from "../shared/playable-player-protocol.js";
import type { PlayablePickResult } from "../shared/playable-picker.js";
import type { NodeRuntimeSnapshot } from "../shared/playable-runtime.js";
import { playableRuntimeKey } from "../shared/playable-editor.js";
import { PLAYABLE_IFRAME_SANDBOX } from "../shared/playable-sandbox.js";
import { readLanguage, translateText } from "./i18n.js";
import "./playable-player.css";

export interface NodePlayerProps {
  definition: NodePlayerDefinition;
  assets: Readonly<Record<string, Blob>>;
  saveKey: string;
  title?: string;
  frameUrl?: string;
  storage?: Storage;
  /**
   * Where what the player has seen is kept, for the Story Map. It outlasts
   * the save: by default `${saveKey}:seen` in localStorage, even when saves
   * use other storage.
   */
  seenKey?: string;
  seenStorage?: Storage;
  /** Authoring preview options; omit in the Published Player. */
  preview?: PlayablePreviewOptions;
  /** Hands the preview's input to an authoring tool; requires `preview`. */
  tool?: PlayablePreviewTool;
  /** `additive` asks to add the element to the selection instead of replacing it. */
  onPick?: (pick: PlayablePickResult, additive: boolean) => void;
  onTextEdit?: (edit: PlayableTextEdit) => void;
  onTextCreate?: (text: PlayableTextCreate) => Promise<string | undefined>;
  onTextSelect?: (selection: PlayableTextSelection | undefined) => void;
  onInteractionSelect?: (
    selection: PlayableInteractionSelection,
    additive: boolean,
  ) => void;
  onMove?: (move: PlayableMove) => void;
  onTransform?: (edit: PlayableTransformEdit) => void;
  onDelete?: (edit: PlayableDeleteEdit) => void;
  onDeleteSelected?: () => void;
  onPasteElements?: (
    copies: PlayableElementCopy[],
  ) => Promise<Record<string, string> | undefined>;
  onHistoryCommand?: (command: PlayableHistoryCommand) => void;
  elementClipboardCommand?: PlayableElementClipboardCommand;
  onElementClipboardCommandApplied?: (sequence: number) => void;
  onMediaState?: (state: PlayableMediaState) => void;
  onActivity?: () => void;
  /** Keeps the authoring preview's media position across source updates. */
  preserveMediaState?: PlayableMediaState;
  backdropEffects?: PlayableBackdropEffects;
  /** Removes the currently selected element without rebuilding the preview. */
  deleteCommand?: { sequence: number; picks: PlayablePickResult[] };
  /** Updates timed elements in the active preview without rebuilding it. */
  appearanceTimingCommand?: PlayableAppearanceTimingCommand;
  onAppearanceTimingCommandApplied?: (sequence: number) => void;
  /** Applies animation and material edits without rebuilding the preview. */
  motionCommand?: PlayableMotionCommand;
  /** Applies font edits to the live scene without rebuilding the preview. */
  textStyleCommand?: PlayableTextStyleCommand;
  mediaCommand?: PlayableMediaCommand;
  mediaCommandSequence?: number;
  /** Called when the author leaves the tool (Escape in the frame). */
  onPickCancel?: () => void;
  onSnapshot?: (snapshot: NodeRuntimeSnapshot) => void;
  onDiagnostic?: (error: string) => void;
}

export function NodePlayer({
  definition,
  assets,
  saveKey,
  title = definition.graph.title,
  frameUrl = "./playable-sandbox.html",
  storage = window.localStorage,
  seenKey = `${saveKey}:seen`,
  seenStorage = window.localStorage,
  preview,
  tool,
  onPick,
  onTextEdit,
  onTextCreate,
  onTextSelect,
  onInteractionSelect,
  onMove,
  onTransform,
  onDelete,
  onDeleteSelected,
  onPasteElements,
  onHistoryCommand,
  elementClipboardCommand,
  onElementClipboardCommandApplied,
  onMediaState,
  onActivity,
  preserveMediaState,
  backdropEffects,
  deleteCommand,
  appearanceTimingCommand,
  onAppearanceTimingCommandApplied,
  motionCommand,
  textStyleCommand,
  mediaCommand,
  mediaCommandSequence,
  onPickCancel,
  onSnapshot,
  onDiagnostic = reportDiagnostic,
}: NodePlayerProps) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const player = useRef<HTMLElement>(null);
  const frameLoaded = useRef(false);
  const restoreMediaState = useRef<
    { instanceId: string; state: PlayableMediaState } | undefined
  >(undefined);
  const appliedAppearanceTimingSequence = useRef<number | undefined>(undefined);
  const appliedMotionSequence = useRef<number | undefined>(undefined);
  const appliedTextStyleSequence = useRef<number | undefined>(undefined);
  const [scale, setScale] = useState<number>();
  // Keyed on content so callers need not memoize the preview object.
  const previewKey = JSON.stringify(preview ?? null);
  // Parent selection state may recreate the definition object without changing
  // the running preview. Keep the iframe alive unless the actual runtime content changes.
  const definitionKey = useMemo(
    () => playableRuntimeKey(definition),
    [definition],
  );
  const instanceId = useMemo(
    () => `playable-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    [definitionKey, previewKey],
  );
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number }>();
  const clipboardSequence = useRef(0);

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (!isPlayableFrameMessage(event.data)) return;
      const message = event.data;
      // Sandboxed frames can report an opaque source WindowProxy; the
      // per-session instance ID is the stable identity for this preview.
      if (message.instanceId !== instanceId) return;
      if (message.kind === "putenggame:playable:save") {
        respondToSave(iframe.current, storage, saveKey, message);
      } else if (message.kind === "putenggame:playable:seen") {
        try {
          seenStorage.setItem(seenKey, JSON.stringify(message.seen));
        } catch (cause) {
          onDiagnostic(
            `Could not keep which Scenes were seen: ${errorMessage(cause)}`,
          );
        }
      } else if (message.kind === "putenggame:playable:snapshot") {
        setReady(true);
        onSnapshot?.(message.snapshot);
      } else if (message.kind === "putenggame:playable:error") {
        setError(message.error);
      } else if (message.kind === "putenggame:playable:picked") {
        onPick?.(message.pick, message.additive);
        setContextMenu(undefined);
        player.current?.focus({ preventScroll: true });
      } else if (message.kind === "putenggame:playable:delete-selection") {
        onDeleteSelected?.();
      } else if (message.kind === "putenggame:playable:context-menu") {
        const bounds = player.current?.getBoundingClientRect();
        const frameBounds = iframe.current?.getBoundingClientRect();
        if (!bounds || !frameBounds) return;
        const x =
          frameBounds.left -
          bounds.left +
          (message.x / message.viewportWidth) * frameBounds.width;
        const y =
          frameBounds.top -
          bounds.top +
          (message.y / message.viewportHeight) * frameBounds.height;
        setContextMenu({
          x: Math.max(4, Math.min(x, bounds.width - 150)),
          y: Math.max(4, Math.min(y, bounds.height - 112)),
        });
        player.current?.focus({ preventScroll: true });
      } else if (message.kind === "putenggame:playable:text-edited") {
        onTextEdit?.(message.edit);
      } else if (message.kind === "putenggame:playable:text-created") {
        void Promise.resolve(onTextCreate?.(message.text))
          .catch(() => undefined)
          .then((source) =>
            iframe.current?.contentWindow?.postMessage(
              {
                kind: "putenggame:playable:text-created-result",
                instanceId,
                id: message.text.id,
                ...(source ? { source } : {}),
              },
              "*",
            ),
          );
      } else if (message.kind === "putenggame:playable:text-selected") {
        onTextSelect?.(message.selection);
      } else if (message.kind === "putenggame:playable:interaction-selected") {
        onInteractionSelect?.(message.selection, message.additive);
      } else if (message.kind === "putenggame:playable:moved") {
        onMove?.(message.move);
      } else if (message.kind === "putenggame:playable:transformed") {
        onTransform?.(message.edit);
      } else if (message.kind === "putenggame:playable:deleted") {
        onDelete?.(message.edit);
      } else if (message.kind === "putenggame:playable:element-paste") {
        void Promise.resolve(onPasteElements?.(message.copies))
          .then((sources) =>
            iframe.current?.contentWindow?.postMessage(
              {
                kind: "putenggame:playable:element-paste-result",
                instanceId,
                requestId: message.requestId,
                ...(sources
                  ? { sources }
                  : { error: translateText("Could not paste these items", readLanguage()) }),
              },
              "*",
            ),
          )
          .catch((cause) =>
            iframe.current?.contentWindow?.postMessage(
              {
                kind: "putenggame:playable:element-paste-result",
                instanceId,
                requestId: message.requestId,
                error: errorMessage(cause),
              },
              "*",
            ),
          );
      } else if (message.kind === "putenggame:playable:history-command") {
        onHistoryCommand?.(message.command);
      } else if (message.kind === "putenggame:playable:media-state") {
        onMediaState?.(message.state);
      } else if (message.kind === "putenggame:playable:activity") {
        onActivity?.();
      } else if (message.kind === "putenggame:playable:pick-cancelled") {
        onPickCancel?.();
      } else {
        onDiagnostic(message.error);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [
    instanceId,
    onDiagnostic,
    onPick,
    onTextEdit,
    onTextCreate,
    onTextSelect,
    onInteractionSelect,
    onMove,
    onTransform,
    onDelete,
    onDeleteSelected,
    onPasteElements,
    onHistoryCommand,
    onMediaState,
    onActivity,
    onPickCancel,
    onSnapshot,
    saveKey,
    storage,
    seenKey,
    seenStorage,
  ]);

  useEffect(() => {
    const container = player.current;
    if (!container || tool !== "select") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && contextMenu) {
        event.preventDefault();
        setContextMenu(undefined);
        return;
      }
      if (
        (event.key !== "Delete" && event.key !== "Backspace") ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      event.preventDefault();
      onDeleteSelected?.();
    };
    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [contextMenu, onDeleteSelected, tool]);

  const activeTool = preview !== undefined ? tool : undefined;
  useEffect(() => {
    if (!ready) return;
    iframe.current?.contentWindow?.postMessage(
      activeTool
        ? {
            kind: "putenggame:playable:pick-start",
            instanceId,
            tool: activeTool,
          }
        : { kind: "putenggame:playable:pick-cancel", instanceId },
      "*",
    );
  }, [instanceId, activeTool, ready]);

  useEffect(() => {
    if (!ready || !elementClipboardCommand) return;
    iframe.current?.contentWindow?.postMessage(
      {
        kind: "putenggame:playable:element-clipboard",
        instanceId,
        ...elementClipboardCommand,
      },
      "*",
    );
    onElementClipboardCommandApplied?.(elementClipboardCommand.sequence);
  }, [
    elementClipboardCommand,
    instanceId,
    onElementClipboardCommandApplied,
    ready,
  ]);

  const mediaCommandKey = JSON.stringify({
    command: mediaCommand ?? null,
    sequence: mediaCommandSequence,
  });
  useEffect(() => {
    if (!ready) return;
    const restore = restoreMediaState.current;
    if (restore?.instanceId === instanceId) {
      restoreMediaState.current = undefined;
      const target = iframe.current?.contentWindow;
      if (!target) return;
      if (restore.state.currentTime > 0) {
        target.postMessage(
          {
            kind: "putenggame:playable:media-command",
            instanceId,
            command: { command: "seek", time: restore.state.currentTime },
          },
          "*",
        );
      }
      target.postMessage(
        {
          kind: "putenggame:playable:media-command",
          instanceId,
          command: { command: restore.state.paused ? "pause" : "play" },
        },
        "*",
      );
      return;
    }
    if (mediaCommand) {
      const bytes =
        mediaCommand.command === "insert-media"
          ? mediaCommand.asset.bytes.slice(0)
          : mediaCommand.command === "set-backdrop" && mediaCommand.asset
            ? mediaCommand.asset.transfer.bytes.slice(0)
            : undefined;
      iframe.current?.contentWindow?.postMessage(
        {
          kind: "putenggame:playable:media-command",
          instanceId,
          command:
            bytes && mediaCommand.command === "insert-media"
              ? { ...mediaCommand, asset: { ...mediaCommand.asset, bytes } }
              : bytes && mediaCommand.command === "set-backdrop"
                ? {
                    ...mediaCommand,
                    asset: {
                      ...mediaCommand.asset!,
                      transfer: {
                        ...mediaCommand.asset!.transfer,
                        bytes,
                      },
                    },
                  }
                : mediaCommand,
        },
        "*",
        bytes ? [bytes] : [],
      );
    }
  }, [instanceId, mediaCommandKey, ready]);

  const deleteCommandKey = JSON.stringify(deleteCommand ?? null);
  useEffect(() => {
    if (!ready || !deleteCommand) return;
    for (const pick of deleteCommand.picks)
      iframe.current?.contentWindow?.postMessage(
        {
          kind: "putenggame:playable:delete-element",
          instanceId,
          pick,
        },
        "*",
      );
  }, [deleteCommandKey, instanceId, ready]);

  const appearanceTimingCommandKey = JSON.stringify(
    appearanceTimingCommand ?? null,
  );
  useEffect(() => {
    const command = appearanceTimingCommand;
    if (
      !ready ||
      !command ||
      appliedAppearanceTimingSequence.current === command.sequence
    )
      return;
    const target = iframe.current?.contentWindow;
    if (!target) return;
    target.postMessage(
      {
        kind: "putenggame:playable:appearance-timing",
        instanceId,
        command,
      },
      "*",
    );
    appliedAppearanceTimingSequence.current = command.sequence;
    onAppearanceTimingCommandApplied?.(command.sequence);
  }, [
    appearanceTimingCommandKey,
    instanceId,
    ready,
    onAppearanceTimingCommandApplied,
  ]);

  useEffect(() => {
    if (
      !ready ||
      !motionCommand ||
      appliedMotionSequence.current === motionCommand.sequence
    )
      return;
    const bytes = motionCommand.asset?.bytes.slice(0);
    const pressedBytes = motionCommand.pressedAsset?.bytes.slice(0);
    iframe.current?.contentWindow?.postMessage(
      {
        kind: "putenggame:playable:motion",
        instanceId,
        command: bytes
          ? {
              ...motionCommand,
              asset: { ...motionCommand.asset!, bytes },
              ...(pressedBytes
                ? {
                    pressedAsset: {
                      ...motionCommand.pressedAsset!,
                      bytes: pressedBytes,
                    },
                  }
                : {}),
            }
          : pressedBytes
            ? {
                ...motionCommand,
                pressedAsset: {
                  ...motionCommand.pressedAsset!,
                  bytes: pressedBytes,
                },
              }
            : motionCommand,
      },
      "*",
      [bytes, pressedBytes].filter(
        (item): item is ArrayBuffer => item !== undefined,
      ),
    );
    appliedMotionSequence.current = motionCommand.sequence;
  }, [instanceId, motionCommand, ready]);

  useEffect(() => {
    if (
      !ready ||
      !textStyleCommand ||
      appliedTextStyleSequence.current === textStyleCommand.sequence
    )
      return;
    iframe.current?.contentWindow?.postMessage(
      {
        kind: "putenggame:playable:text-style",
        instanceId,
        command: textStyleCommand,
      },
      "*",
    );
    appliedTextStyleSequence.current = textStyleCommand.sequence;
  }, [instanceId, ready, textStyleCommand]);

  const backdropEffectsKey = JSON.stringify(backdropEffects ?? null);
  useEffect(() => {
    if (!ready || !backdropEffects) return;
    iframe.current?.contentWindow?.postMessage(
      {
        kind: "putenggame:playable:backdrop-effects",
        instanceId,
        effects: backdropEffects,
      },
      "*",
    );
  }, [backdropEffectsKey, instanceId, ready]);

  const initialize = async () => {
    const target = iframe.current?.contentWindow;
    if (!target) return;
    setError(undefined);
    setReady(false);
    try {
      const transferredAssets: Record<string, PlayableAssetTransfer> = {};
      const transfer: Transferable[] = [];
      for (const [id, blob] of Object.entries(assets)) {
        const bytes = await blob.arrayBuffer();
        transferredAssets[id] = {
          contentType: blob.type || "application/octet-stream",
          bytes,
        };
        transfer.push(bytes);
      }
      let save: unknown;
      const saved = storage.getItem(saveKey);
      if (saved !== null) {
        try {
          save = JSON.parse(saved) as unknown;
        } catch {
          storage.removeItem(saveKey);
        }
      }
      target.postMessage(
        {
          kind: "putenggame:playable:init",
          instanceId,
          definition,
          assets: transferredAssets,
          save,
          seen: readSeen(seenStorage, seenKey),
          ...(preview ? { preview } : {}),
        },
        "*",
        transfer,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  // A new instance (changed definition or preview options) restarts the
  // session in the already-loaded frame.
  useEffect(() => {
    if (!frameLoaded.current) return;
    if (preserveMediaState) {
      restoreMediaState.current = {
        instanceId,
        state: { ...preserveMediaState },
      };
    }
    void initialize();
  }, [instanceId]);

  // Nodes are always laid out at the project viewport and scaled to fit, so
  // a Node looks the same in the Workbench, a thumbnail, and any window.
  const { width, height } = definition.graph.viewport;
  useLayoutEffect(() => {
    const container = player.current;
    if (!container) return;
    const update = () =>
      setScale(
        Math.min(
          container.clientWidth / width,
          container.clientHeight / height,
        ),
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [width, height]);

  const stageStyle: CSSProperties =
    scale === undefined
      ? { visibility: "hidden" }
      : { width: width * scale, height: height * scale };
  const canvasStyle: CSSProperties = {
    width,
    height,
    transform: `scale(${scale ?? 1})`,
  };
  return (
    <main
      ref={player}
      className="playable-player"
      tabIndex={-1}
      onClick={() => setContextMenu(undefined)}
    >
      <div className="playable-player-stage" style={stageStyle}>
        <div className="playable-player-canvas" style={canvasStyle}>
          <iframe
            ref={iframe}
            className="playable-player-frame"
            src={frameUrl}
            sandbox={PLAYABLE_IFRAME_SANDBOX}
            title={title}
            onLoad={() => {
              frameLoaded.current = true;
              void initialize();
            }}
          />
        </div>
        {contextMenu && tool === "select" ? (
          <div
            className="playable-player-context-menu"
            role="menu"
            onClick={(event) => event.stopPropagation()}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {(["copy", "paste", "delete"] as const).map((action) => (
              <button
                key={action}
                type="button"
                role="menuitem"
                onClick={() => {
                  setContextMenu(undefined);
                  if (action === "delete") {
                    onDeleteSelected?.();
                  } else {
                    iframe.current?.contentWindow?.postMessage(
                      {
                        kind: "putenggame:playable:element-clipboard",
                        instanceId,
                        action,
                        sequence: ++clipboardSequence.current,
                      },
                      "*",
                    );
                  }
                  player.current?.focus({ preventScroll: true });
                }}
              >
                {translateText(
                  action === "copy"
                    ? "Copy"
                    : action === "paste"
                      ? "Paste"
                      : "Delete",
                  readLanguage(),
                )}
              </button>
            ))}
          </div>
        ) : null}
        {!ready && !error ? (
          <div className="playable-player-status">正在加载……</div>
        ) : null}
        {error ? (
          <div className="playable-player-status is-error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function respondToSave(
  iframe: HTMLIFrameElement | null,
  storage: Storage,
  saveKey: string,
  message: Extract<PlayableFrameMessage, { kind: "putenggame:playable:save" }>,
): void {
  let error: string | undefined;
  try {
    storage.setItem(saveKey, JSON.stringify(message.save));
  } catch (cause) {
    error = errorMessage(cause);
  }
  iframe?.contentWindow?.postMessage(
    {
      kind: "putenggame:playable:save-result",
      instanceId: message.instanceId,
      requestId: message.requestId,
      error,
    },
    "*",
  );
}

/** What the player has seen; a record that cannot be read starts over. */
function readSeen(storage: Storage, key: string): unknown {
  try {
    const stored = storage.getItem(key);
    return stored === null ? undefined : (JSON.parse(stored) as unknown);
  } catch {
    return undefined;
  }
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function reportDiagnostic(error: string): void {
  console.error(`[Node Runtime] ${error}`);
}

/** Preview saves live in memory so a preview never touches the Playtest save. */
export function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}
