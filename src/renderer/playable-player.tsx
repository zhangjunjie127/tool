import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  PlayableAppearanceTimingCommand,
  PlayableDeleteEdit,
  PlayableElementClipboardCommand,
  PlayableElementCopy,
  PlayableFrameMessage,
  PlayableHistoryCommand,
  PlayableMediaCommand,
  PlayableMediaState,
  PlayableMotionCommand,
  PlayableRuntimeAsset,
  PlayableTextStyleCommand,
  PlayableVrButton,
  PlayableMove,
  PlayablePreviewOptions,
  PlayablePreviewShortcut,
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
import {
  DEFAULT_PLAYABLE_GAME_SETTINGS,
  normalizePlayableGameSettings,
  type PlayableGameSettings,
} from "../shared/playable-settings.js";
import {
  normalizePlayableSettingsButtonPosition,
  normalizePlayableSettingsButtonSize,
  PLAYABLE_SETTINGS_BUTTON_SIZE,
} from "../shared/playable-settings-button.js";
import {
  normalizePlayableReturnButton,
  normalizePlayableReturnButtonPosition,
  PLAYABLE_RETURN_BUTTON_SIZE,
} from "../shared/playable-return-button.js";
import { cssFontFamilyName } from "../shared/playable-fonts.js";
import { readLanguage, t, translateText } from "./i18n.js";
import "./playable-player.css";
import { PlayableVrViewer } from "./playable-vr-viewer.js";
import { PlayableGameSettingsOverlay } from "./playable-game-settings-overlay.js";
import { ArrowLeft, Pause, Play, Settings as SettingsIcon } from "./icons.js";

const PAUSE_MENU_ITEMS = [
  "continue",
  "main-menu",
  "story-map",
  "settings",
  "exit",
] as const;
type PauseMenuItem = (typeof PAUSE_MENU_ITEMS)[number];

export interface NodePlayerProps {
  definition: NodePlayerDefinition;
  assets: Readonly<Record<string, Blob>>;
  saveKey: string;
  title?: string;
  frameUrl?: string;
  storage?: Storage;
  /** Player preferences use a slot separate from story progress. */
  settingsKey?: string;
  /**
   * Where what the player has seen is kept, for the Story Map. It outlasts
   * the save: by default `${saveKey}:seen` in localStorage, even when saves
   * use other storage.
   */
  seenKey?: string;
  seenStorage?: Storage;
  /** Resolves only the Assets needed by a destination Scene. */
  onLoadAssets?: (assetIds: readonly string[]) => Promise<Record<string, Blob>>;
  /** Authoring preview options; omit in the Published Player. */
  preview?: PlayablePreviewOptions;
  /** Shows playback controls in the exported player. */
  showPlaybackControls?: boolean;
  /** Shows the player-owned settings menu; editor-only previews opt out. */
  showGameSettings?: boolean;
  /** Shows the persistent return button and pause menu in a game player. */
  showPauseMenu?: boolean;
  /** Shows the return button in an editor preview without enabling the pause menu. */
  showReturnButton?: boolean;
  /** Highlights the settings entry while it is selected in the editor. */
  settingsButtonSelected?: boolean;
  settingsButtonSizePreview?: number;
  /** Temporarily previews a replacement icon before the editor commits it. */
  settingsButtonIconPreview?: Blob;
  /** Lets the editor drag the game-wide settings entry without restarting playback. */
  onSettingsButtonPositionChange?: (position: { x: number; y: number }) => Promise<boolean>;
  onSelectSettingsButton?: () => void;
  returnButtonSelected?: boolean;
  returnButtonIconPreview?: Blob;
  returnButtonSizePreview?: number;
  onSelectReturnButton?: () => void;
  onReturnButtonPositionChange?: (position: { x: number; y: number }) => Promise<boolean>;
  /** Hands the preview's input to an authoring tool; requires `preview`. */
  tool?: PlayablePreviewTool;
  /** Forwards keyboard shortcuts pressed while the preview iframe has focus. */
  onPreviewShortcut?: (shortcut: PlayablePreviewShortcut) => void;
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
  lockedPicks?: readonly PlayablePickResult[];
  alignCommand?: {
    sequence: number;
    reference: PlayablePickResult;
    targets: readonly PlayablePickResult[];
  };
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
  settingsKey = `${saveKey}:settings`,
  seenKey = `${saveKey}:seen`,
  seenStorage = window.localStorage,
  onLoadAssets,
  preview,
  showPlaybackControls = false,
  showGameSettings = true,
  showPauseMenu = false,
  showReturnButton = false,
  settingsButtonSelected = false,
  settingsButtonSizePreview,
  settingsButtonIconPreview,
  onSettingsButtonPositionChange,
  onSelectSettingsButton,
  returnButtonSelected = false,
  returnButtonIconPreview,
  returnButtonSizePreview,
  onSelectReturnButton,
  onReturnButtonPositionChange,
  tool,
  onPreviewShortcut,
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
  lockedPicks = [],
  alignCommand,
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
  const playerStage = useRef<HTMLDivElement>(null);
  const frameLoaded = useRef(false);
  const restoreMediaState = useRef<
    { instanceId: string; state: PlayableMediaState } | undefined
  >(undefined);
  const appliedAppearanceTimingSequence = useRef<number | undefined>(undefined);
  const appliedMotionSequence = useRef<number | undefined>(undefined);
  const appliedTextStyleSequence = useRef<number | undefined>(undefined);
  const appliedMotionProgressPreviewKey = useRef<string | undefined>(
    undefined,
  );
  const [scale, setScale] = useState<number>();
  const [resolution, setResolution] =
    useState<PlayableGameSettings["resolution"]>("auto");
  const [displayModeValue, setDisplayModeValue] =
    useState<PlayableGameSettings["displayMode"]>("fullscreen");
  const [gameSettings, setGameSettings] = useState<PlayableGameSettings>(() =>
    normalizePlayableGameSettings(
      readStoredJson(storage, settingsKey) ?? DEFAULT_PLAYABLE_GAME_SETTINGS,
    ),
  );
  const gameSettingsRef = useRef(gameSettings);
  const savedGameSettingsRef = useRef(gameSettings);
  const closeSettingsAfterSave = useRef(false);
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const [pauseMenuOpen, setPauseMenuOpen] = useState(false);
  const [selectedPauseMenuItem, setSelectedPauseMenuItem] = useState(0);
  const [gameExited, setGameExited] = useState(false);
  const pauseMenuOpenRef = useRef(false);
  const pauseMenuResumeAfterClose = useRef(true);
  const pauseMenuButton = useRef<HTMLButtonElement>(null);
  const pauseMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [gameSettingsSaveStatus, setGameSettingsSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
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
  const [currentNodeId, setCurrentNodeId] = useState(
    preview?.startNodeId ?? definition.graph.entryNodeId,
  );
  const [mediaState, setMediaState] = useState<PlayableMediaState>({
    currentTime: 0,
    duration: 0,
    paused: true,
  });
  const [playbackControlsVisible, setPlaybackControlsVisible] = useState(true);
  const playbackControlsTimer = useRef<number | undefined>(undefined);
  const [vrButtons, setVrButtons] = useState<PlayableVrButton[]>([]);
  const buttonSoundAudio = useRef<HTMLAudioElement | undefined>(undefined);
  const buttonSoundAssetId = definition.graph.buttonSoundAssetId;
  const providedButtonSound = buttonSoundAssetId
    ? assets[buttonSoundAssetId]
    : undefined;
  const [loadedButtonSound, setLoadedButtonSound] = useState<{
    assetId: string;
    blob: Blob;
  }>();
  const buttonSoundBlob =
    providedButtonSound ??
    (buttonSoundAssetId !== undefined &&
    loadedButtonSound?.assetId === buttonSoundAssetId
      ? loadedButtonSound.blob
      : undefined);
  const vrRequestId = useRef("");
  const clipboardSequence = useRef(0);
  const previousDisplayMode = useRef<PlayableGameSettings["displayMode"]>("fullscreen");
  const settingsButtonConfig = definition.graph.settingsButton;
  const displayedSettingsButtonSize = normalizePlayableSettingsButtonSize(
    settingsButtonSizePreview ??
      settingsButtonConfig?.size ??
      PLAYABLE_SETTINGS_BUTTON_SIZE,
  );
  const settingsButtonPositionFromGraph = normalizePlayableSettingsButtonPosition(
    settingsButtonConfig,
    definition.graph.viewport,
  );
  const [settingsButtonPosition, setSettingsButtonPosition] = useState(
    settingsButtonPositionFromGraph,
  );
  const settingsButtonPositionRef = useRef(settingsButtonPosition);
  const settingsButtonDrag = useRef<
    | {
        pointerId: number;
        startX: number;
        startY: number;
        offsetX: number;
        offsetY: number;
        moved: boolean;
      }
    | undefined
  >(undefined);
  const settingsButtonAssetId = settingsButtonConfig?.iconAssetId;
  const providedSettingsButtonIcon = settingsButtonAssetId
    ? assets[settingsButtonAssetId]
    : undefined;
  const [settingsButtonIcon, setSettingsButtonIcon] = useState<Blob>();
  const [settingsButtonIconUrl, setSettingsButtonIconUrl] = useState<string>();
  const displayedSettingsButtonIcon =
    settingsButtonIconPreview ?? settingsButtonIcon;
  const returnButtonConfig = definition.graph.returnButton;
  const returnButtonFromGraph = normalizePlayableReturnButton(
    returnButtonConfig,
    definition.graph.viewport,
  );
  const returnButtonPositionFromGraph = normalizePlayableReturnButtonPosition(
    returnButtonConfig,
    definition.graph.viewport,
  );
  const [returnButtonPosition, setReturnButtonPosition] = useState({
    x: returnButtonPositionFromGraph.x,
    y: returnButtonPositionFromGraph.y,
  });
  const returnButtonPositionRef = useRef(returnButtonPosition);
  const returnButtonDrag = useRef<
    | {
        pointerId: number;
        startX: number;
        startY: number;
        offsetX: number;
        offsetY: number;
        moved: boolean;
      }
    | undefined
  >(undefined);
  const displayedReturnButtonSize = normalizePlayableReturnButton(
    {
      ...returnButtonConfig,
      size: returnButtonSizePreview ?? returnButtonFromGraph.size,
    },
    definition.graph.viewport,
  ).size;
  const displayedReturnButtonPosition = normalizePlayableReturnButtonPosition(
    returnButtonPosition,
    definition.graph.viewport,
  );
  const returnButtonAssetId = returnButtonConfig?.iconAssetId;
  const providedReturnButtonIcon = returnButtonAssetId
    ? assets[returnButtonAssetId]
    : undefined;
  const [returnButtonIcon, setReturnButtonIcon] = useState<Blob>();
  const [returnButtonIconUrl, setReturnButtonIconUrl] = useState<string>();
  const displayedReturnButtonIcon = returnButtonIconPreview ?? returnButtonIcon;

  pauseMenuOpenRef.current = pauseMenuOpen;
  settingsButtonPositionRef.current = settingsButtonPosition;
  returnButtonPositionRef.current = returnButtonPosition;

  useEffect(() => {
    let active = true;
    setLoadedButtonSound(undefined);
    if (!buttonSoundAssetId || providedButtonSound || !onLoadAssets)
      return () => {
        active = false;
      };
    void onLoadAssets([buttonSoundAssetId]).then(
      (loaded) => {
        const blob = loaded[buttonSoundAssetId];
        if (active && blob)
          setLoadedButtonSound({ assetId: buttonSoundAssetId, blob });
      },
      (cause) => {
        if (active)
          onDiagnostic(
            `Could not load the game-wide button sound: ${errorMessage(cause)}`,
          );
      },
    );
    return () => {
      active = false;
    };
  }, [
    buttonSoundAssetId,
    providedButtonSound,
    onLoadAssets,
    onDiagnostic,
  ]);

  useEffect(() => {
    if (!buttonSoundBlob) {
      buttonSoundAudio.current = undefined;
      return;
    }
    const url = URL.createObjectURL(buttonSoundBlob);
    const audio = document.createElement("audio");
    audio.preload = "auto";
    audio.src = url;
    buttonSoundAudio.current = audio;
    return () => {
      if (buttonSoundAudio.current === audio)
        buttonSoundAudio.current = undefined;
      audio.pause();
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [buttonSoundBlob]);

  useEffect(() => {
    setSettingsButtonPosition(settingsButtonPositionFromGraph);
    settingsButtonPositionRef.current = settingsButtonPositionFromGraph;
  }, [
    settingsButtonConfig?.x,
    settingsButtonConfig?.y,
    definition.graph.viewport.width,
    definition.graph.viewport.height,
  ]);

  useEffect(() => {
    setReturnButtonPosition({
      x: returnButtonPositionFromGraph.x,
      y: returnButtonPositionFromGraph.y,
    });
    returnButtonPositionRef.current = {
      x: returnButtonPositionFromGraph.x,
      y: returnButtonPositionFromGraph.y,
    };
  }, [
    returnButtonConfig?.x,
    returnButtonConfig?.y,
    definition.graph.viewport.width,
    definition.graph.viewport.height,
  ]);

  useEffect(() => {
    let active = true;
    if (!settingsButtonAssetId) {
      setSettingsButtonIcon(undefined);
      return () => {
        active = false;
      };
    }
    if (providedSettingsButtonIcon) {
      setSettingsButtonIcon(providedSettingsButtonIcon);
      return () => {
        active = false;
      };
    }
    setSettingsButtonIcon(undefined);
    if (!onLoadAssets) return;
    void onLoadAssets([settingsButtonAssetId]).then(
      (loaded) => {
        if (active) setSettingsButtonIcon(loaded[settingsButtonAssetId]);
      },
      (cause) => {
        if (active)
          onDiagnostic(
            `Could not load the settings button image: ${errorMessage(cause)}`,
          );
      },
    );
    return () => {
      active = false;
    };
  }, [
    settingsButtonAssetId,
    providedSettingsButtonIcon,
    onLoadAssets,
    onDiagnostic,
  ]);

  useEffect(() => {
    if (!displayedSettingsButtonIcon) {
      setSettingsButtonIconUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(displayedSettingsButtonIcon);
    setSettingsButtonIconUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [displayedSettingsButtonIcon]);

  useEffect(() => {
    let active = true;
    if (!returnButtonAssetId) {
      setReturnButtonIcon(undefined);
      return () => {
        active = false;
      };
    }
    if (providedReturnButtonIcon) {
      setReturnButtonIcon(providedReturnButtonIcon);
      return () => {
        active = false;
      };
    }
    setReturnButtonIcon(undefined);
    if (!onLoadAssets) return () => {
      active = false;
    };
    void onLoadAssets([returnButtonAssetId]).then(
      (loaded) => {
        if (active) setReturnButtonIcon(loaded[returnButtonAssetId]);
      },
      (cause) => {
        if (active)
          onDiagnostic(
            `Could not load the return button image: ${errorMessage(cause)}`,
          );
      },
    );
    return () => {
      active = false;
    };
  }, [
    returnButtonAssetId,
    providedReturnButtonIcon,
    onLoadAssets,
    onDiagnostic,
  ]);

  useEffect(() => {
    if (!displayedReturnButtonIcon) {
      setReturnButtonIconUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(displayedReturnButtonIcon);
    setReturnButtonIconUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [displayedReturnButtonIcon]);

  const startSettingsButtonDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const selectButton = tool === "select" && onSelectSettingsButton;
    if (selectButton) {
      event.preventDefault();
      event.stopPropagation();
      onSelectSettingsButton();
    }
    if (!onSettingsButtonPositionChange) return;
    const stage = playerStage.current;
    const stageBounds = stage?.getBoundingClientRect();
    const buttonBounds = event.currentTarget.getBoundingClientRect();
    if (!stage || !stageBounds || !stageBounds.width || !stageBounds.height)
      return;
    event.preventDefault();
    event.stopPropagation();
    settingsButtonDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: (event.clientX - buttonBounds.left - buttonBounds.width / 2) / stageBounds.width,
      offsetY: (event.clientY - buttonBounds.top - buttonBounds.height / 2) / stageBounds.height,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveSettingsButton = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = settingsButtonDrag.current;
    const stageBounds = playerStage.current?.getBoundingClientRect();
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      !stageBounds ||
      !stageBounds.width ||
      !stageBounds.height
    )
      return;
    const crossedDragThreshold =
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 3;
    if (crossedDragThreshold) {
      drag.moved = true;
    }
    if (!drag.moved) return;
    event.preventDefault();
    event.stopPropagation();
    const next = normalizePlayableSettingsButtonPosition(
      {
        x:
          (event.clientX - stageBounds.left) / stageBounds.width -
          drag.offsetX,
        y:
          (event.clientY - stageBounds.top) / stageBounds.height -
          drag.offsetY,
      },
      definition.graph.viewport,
    );
    settingsButtonPositionRef.current = next;
    setSettingsButtonPosition(next);
  };

  const finishSettingsButtonDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = settingsButtonDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    settingsButtonDrag.current = undefined;
    if (!drag.moved) {
      if (
        event.type === "pointerup" &&
        !(tool === "select" && onSelectSettingsButton)
      )
        activateSettingsButton();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const savePosition = onSettingsButtonPositionChange;
    if (!savePosition) return;
    void savePosition(settingsButtonPositionRef.current).catch((cause) => {
      onDiagnostic(
        `Could not save the settings button position: ${errorMessage(cause)}`,
      );
    });
  };

  const startReturnButtonDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (
      tool !== "select" ||
      !onSelectReturnButton ||
      !onReturnButtonPositionChange
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    onSelectReturnButton();
    const stage = playerStage.current;
    const stageBounds = stage?.getBoundingClientRect();
    const buttonBounds = event.currentTarget.getBoundingClientRect();
    if (!stage || !stageBounds || !stageBounds.width || !stageBounds.height)
      return;
    returnButtonDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX:
        (event.clientX - buttonBounds.left - buttonBounds.width / 2) /
        stageBounds.width,
      offsetY:
        (event.clientY - buttonBounds.top - buttonBounds.height / 2) /
        stageBounds.height,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveReturnButton = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = returnButtonDrag.current;
    const stageBounds = playerStage.current?.getBoundingClientRect();
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      !stageBounds ||
      !stageBounds.width ||
      !stageBounds.height
    )
      return;
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 3
    )
      drag.moved = true;
    if (!drag.moved) return;
    event.preventDefault();
    event.stopPropagation();
    const next = normalizePlayableReturnButton(
      {
        x:
          (event.clientX - stageBounds.left) / stageBounds.width -
          drag.offsetX,
        y:
          (event.clientY - stageBounds.top) / stageBounds.height -
          drag.offsetY,
        size: displayedReturnButtonSize,
      },
      definition.graph.viewport,
    );
    const position = { x: next.x, y: next.y };
    returnButtonPositionRef.current = position;
    setReturnButtonPosition(position);
  };

  const finishReturnButtonDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = returnButtonDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    returnButtonDrag.current = undefined;
    if (!drag.moved) return;
    event.preventDefault();
    event.stopPropagation();
    void onReturnButtonPositionChange?.(returnButtonPositionRef.current).catch(
      (cause) => {
        onDiagnostic(
          `Could not save the return button position: ${errorMessage(cause)}`,
        );
      },
    );
  };

  const revealPlaybackControls = () => {
    if (!showPlaybackControls) return;
    setPlaybackControlsVisible(true);
    if (playbackControlsTimer.current !== undefined)
      window.clearTimeout(playbackControlsTimer.current);
    playbackControlsTimer.current = mediaState.paused
      ? undefined
      : window.setTimeout(() => setPlaybackControlsVisible(false), 2500);
  };

  const sendSettingsAction = (
    action: "save" | "reset" | "discard" | "pause" | "resume",
  ) => {
    iframe.current?.contentWindow?.postMessage(
      {
        kind: "putenggame:playable:settings-command",
        instanceId,
        action,
      },
      "*",
    );
  };

  const playButtonSound = useCallback(() => {
    const settings = gameSettingsRef.current;
    const audio = buttonSoundAudio.current;
    if (
      !audio ||
      !settings.uiSoundEnabled ||
      settings.uiSoundVolume <= 0
    )
      return;
    audio.volume = settings.uiSoundVolume;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }, []);

  const sendRuntimeCommand = (
    command: "return-to-entry" | "open-story-map",
  ) => {
    iframe.current?.contentWindow?.postMessage(
      {
        kind: "putenggame:playable:runtime-command",
        instanceId,
        command,
      },
      "*",
    );
  };

  const patchGameSettings = (patch: Partial<PlayableGameSettings>) => {
    const next = normalizePlayableGameSettings({
      ...gameSettingsRef.current,
      ...patch,
    });
    gameSettingsRef.current = next;
    setGameSettings(next);
    setGameSettingsSaveStatus("idle");
    iframe.current?.contentWindow?.postMessage(
      {
        kind: "putenggame:playable:settings-command",
        instanceId,
        action: "patch",
        settings: next,
      },
      "*",
    );
  };

  const closeGameSettings = () => {
    closeSettingsAfterSave.current = false;
    setGameSettingsOpen(false);
    if (!pauseMenuOpenRef.current) sendSettingsAction("resume");
  };

  const openGameSettings = () => {
    setGameSettingsSaveStatus("idle");
    setGameSettingsOpen(true);
    sendSettingsAction("pause");
  };

  function activateSettingsButton() {
    if (tool === "select" && onSelectSettingsButton) {
      onSelectSettingsButton();
      return;
    }
    openGameSettings();
  }

  const openPauseMenu = () => {
    if (!showPauseMenu || gameExited || gameSettingsOpen) return;
    setSelectedPauseMenuItem(0);
    pauseMenuResumeAfterClose.current =
      mediaState.duration === 0 || !mediaState.paused;
    setPauseMenuOpen(true);
    sendSettingsAction("pause");
  };

  const closePauseMenu = () => {
    setPauseMenuOpen(false);
    if (pauseMenuResumeAfterClose.current) sendSettingsAction("resume");
  };

  const exitGame = () => {
    setPauseMenuOpen(false);
    try {
      window.close();
    } finally {
      window.setTimeout(() => setGameExited(true), 150);
    }
  };

  const activatePauseMenuItem = (item: PauseMenuItem) => {
    switch (item) {
      case "continue":
        closePauseMenu();
        break;
      case "main-menu":
        setPauseMenuOpen(false);
        sendRuntimeCommand("return-to-entry");
        break;
      case "story-map":
        setPauseMenuOpen(false);
        sendRuntimeCommand("open-story-map");
        break;
      case "settings":
        openGameSettings();
        break;
      case "exit":
        exitGame();
        break;
    }
  };

  useEffect(() => {
    if (pauseMenuOpen && !gameSettingsOpen)
      pauseMenuItemRefs.current[selectedPauseMenuItem]?.focus();
  }, [gameSettingsOpen, pauseMenuOpen, selectedPauseMenuItem]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!showPauseMenu || gameSettingsOpen || gameExited) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (pauseMenuOpen) closePauseMenu();
        else openPauseMenu();
        return;
      }
      if (!pauseMenuOpen) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setSelectedPauseMenuItem(
          (current) =>
            (current + direction + PAUSE_MENU_ITEMS.length) %
            PAUSE_MENU_ITEMS.length,
        );
      } else if (event.key === "Tab") {
        event.preventDefault();
        const direction = event.shiftKey ? -1 : 1;
        setSelectedPauseMenuItem(
          (current) =>
            (current + direction + PAUSE_MENU_ITEMS.length) %
            PAUSE_MENU_ITEMS.length,
        );
      } else if (event.key === "Enter") {
        event.preventDefault();
        activatePauseMenuItem(PAUSE_MENU_ITEMS[selectedPauseMenuItem]!);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    gameExited,
    gameSettingsOpen,
    pauseMenuOpen,
    selectedPauseMenuItem,
    showPauseMenu,
  ]);

  useEffect(
    () => () => {
      if (playbackControlsTimer.current !== undefined)
        window.clearTimeout(playbackControlsTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (playbackControlsTimer.current !== undefined)
      window.clearTimeout(playbackControlsTimer.current);
    playbackControlsTimer.current = undefined;
    if (!showPlaybackControls) return;
    if (mediaState.paused) {
      setPlaybackControlsVisible(true);
    } else if (playbackControlsVisible) {
      playbackControlsTimer.current = window.setTimeout(
        () => setPlaybackControlsVisible(false),
        2500,
      );
    }
  }, [mediaState.paused, playbackControlsVisible, showPlaybackControls]);

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (!isPlayableFrameMessage(event.data)) return;
      const message = event.data;
      // Sandboxed frames can report an opaque source WindowProxy; the
      // per-session instance ID is the stable identity for this preview.
      if (message.instanceId !== instanceId) return;
      if (message.kind === "putenggame:playable:save") {
        respondToSave(iframe.current, storage, saveKey, message);
      } else if (message.kind === "putenggame:playable:settings-save") {
        const saveError = respondToSettings(
          iframe.current,
          storage,
          settingsKey,
          message,
        );
        if (saveError) {
          setGameSettingsSaveStatus("error");
          closeSettingsAfterSave.current = false;
        } else {
          savedGameSettingsRef.current = message.settings;
          setGameSettingsSaveStatus("saved");
          if (closeSettingsAfterSave.current) {
            closeSettingsAfterSave.current = false;
            setGameSettingsOpen(false);
            if (!pauseMenuOpenRef.current) sendSettingsAction("resume");
          }
        }
      } else if (message.kind === "putenggame:playable:settings-change") {
        gameSettingsRef.current = message.settings;
        setGameSettings(message.settings);
        setGameSettingsSaveStatus((current) =>
          current === "saving" ||
          (current === "saved" &&
            JSON.stringify(message.settings) ===
              JSON.stringify(savedGameSettingsRef.current))
            ? current
            : "idle",
        );
        setResolution(message.settings.resolution);
        setDisplayModeValue(message.settings.displayMode);
        if (preview === undefined) {
          const changedMode =
            previousDisplayMode.current !== message.settings.displayMode;
          applyPlayerDisplaySettings(
            player.current,
            message.settings,
            changedMode,
            onDiagnostic,
          );
          previousDisplayMode.current = message.settings.displayMode;
        }
      } else if (message.kind === "putenggame:playable:assets-request") {
        void Promise.resolve(onLoadAssets?.(message.assetIds))
          .then((loaded) => {
            if (!loaded) throw new Error("Scene Assets could not be loaded.");
            const assets: Record<string, PlayableRuntimeAsset> = {};
            for (const [id, blob] of Object.entries(loaded))
              assets[id] = {
                contentType: blob.type || "application/octet-stream",
                blob,
              };
            iframe.current?.contentWindow?.postMessage(
              {
                kind: "putenggame:playable:assets-result",
                instanceId,
                requestId: message.requestId,
                assets,
              },
              "*",
            );
          })
          .catch((cause) =>
            iframe.current?.contentWindow?.postMessage(
              {
                kind: "putenggame:playable:assets-result",
                instanceId,
                requestId: message.requestId,
                assets: {},
                error: errorMessage(cause),
              },
              "*",
            ),
          );
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
        setCurrentNodeId(message.snapshot.currentNodeId);
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
        setMediaState(message.state);
        onMediaState?.(message.state);
      } else if (message.kind === "putenggame:playable:pause-menu-toggle") {
        openPauseMenu();
      } else if (message.kind === "putenggame:playable:button-activated") {
        playButtonSound();
      } else if (message.kind === "putenggame:playable:keyboard-shortcut") {
        if (preview !== undefined) onPreviewShortcut?.(message.shortcut);
      } else if (message.kind === "putenggame:playable:vr-scene") {
        if (message.requestId === vrRequestId.current)
          setVrButtons(message.buttons);
      } else if (message.kind === "putenggame:playable:activity") {
        onActivity?.();
        revealPlaybackControls();
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
    onLoadAssets,
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
    onPreviewShortcut,
    onSnapshot,
    openPauseMenu,
    playButtonSound,
    preview,
    saveKey,
    settingsKey,
    storage,
    seenKey,
    seenStorage,
    showPlaybackControls,
    mediaState.paused,
  ]);

  useEffect(() => {
    if (!ready || !frameLoaded.current || !currentNodeId) return;
    const requestId = `vr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    vrRequestId.current = requestId;
    iframe.current?.contentWindow?.postMessage(
      {
        kind: "putenggame:playable:vr-inspect",
        instanceId,
        requestId,
        nodeId: currentNodeId,
        viewport: definition.graph.viewport,
      },
      "*",
    );
  }, [
    currentNodeId,
    definition.graph.viewport.height,
    definition.graph.viewport.width,
    instanceId,
    ready,
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

  const lockedPicksKey = JSON.stringify(lockedPicks);
  useEffect(() => {
    if (!ready) return;
    iframe.current?.contentWindow?.postMessage(
      {
        kind: "putenggame:playable:pick-locks",
        instanceId,
        picks: lockedPicks,
      },
      "*",
    );
  }, [activeTool, instanceId, lockedPicksKey, ready]);

  const alignCommandKey = JSON.stringify(alignCommand ?? null);
  useEffect(() => {
    if (!ready || !alignCommand) return;
    iframe.current?.contentWindow?.postMessage(
      {
        kind: "putenggame:playable:align-elements",
        instanceId,
        reference: alignCommand.reference,
        targets: alignCommand.targets,
      },
      "*",
    );
  }, [alignCommandKey, instanceId, ready]);

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
    if (
      mediaCommand?.command === "motion-progress-preview" &&
      appliedMotionProgressPreviewKey.current === mediaCommandKey
    )
      return;
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
      if (mediaCommand.command === "motion-progress-preview")
        appliedMotionProgressPreviewKey.current = mediaCommandKey;
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

  useEffect(() => {
    if (!ready) return;
    iframe.current?.contentWindow?.postMessage(
      {
        kind: "putenggame:playable:global-font",
        instanceId,
        ...(definition.graph.globalFontFamily
          ? { family: definition.graph.globalFontFamily }
          : {}),
      },
      "*",
    );
  }, [definition.graph.globalFontFamily, instanceId, ready]);

  const initialize = async () => {
    const target = iframe.current?.contentWindow;
    if (!target) return;
    setError(undefined);
    setReady(false);
    try {
      const transferredAssets: Record<string, PlayableRuntimeAsset> = {};
      for (const [id, blob] of Object.entries(assets)) {
        transferredAssets[id] = {
          contentType: blob.type || "application/octet-stream",
          blob,
        };
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
      const settings = readStoredJson(storage, settingsKey);
      if (settings && typeof settings === "object" && "displayMode" in settings) {
        const savedSettings = settings as Partial<PlayableGameSettings>;
        previousDisplayMode.current =
          savedSettings.displayMode === "windowed" ? "windowed" : "fullscreen";
        const savedResolution = isPlayableResolution(savedSettings.resolution)
          ? savedSettings.resolution
          : "auto";
        setResolution(savedResolution);
        setDisplayModeValue(previousDisplayMode.current);
        if (preview === undefined)
          applyPlayerDisplaySettings(
            player.current,
            {
              displayMode: previousDisplayMode.current,
              resolution: savedResolution,
            },
            false,
            onDiagnostic,
          );
      }
      target.postMessage(
        {
          kind: "putenggame:playable:init",
          instanceId,
          definition,
          assets: transferredAssets,
          save,
          settings,
          seen: readSeen(seenStorage, seenKey),
          pauseMenuEnabled: showPauseMenu,
          ...(preview ? { preview } : {}),
        },
        "*",
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
          resolutionLimit(resolution, displayModeValue, width, height),
        ),
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [width, height, resolution, displayModeValue]);

  const stageStyle: CSSProperties =
    scale === undefined
      ? { visibility: "hidden" }
      : { width: width * scale, height: height * scale };
  const canvasStyle: CSSProperties = {
    width,
    height,
    transform: `scale(${scale ?? 1})`,
  };
  const globalFontFamily = definition.graph.globalFontFamily;
  const globalFontStyle: CSSProperties | undefined = globalFontFamily
    ? {
        "--playable-global-font-family":
          cssFontFamilyName(globalFontFamily),
      } as CSSProperties
    : undefined;
  return (
    <main
      ref={player}
      className="playable-player"
      data-global-font={globalFontFamily ? "" : undefined}
      style={globalFontStyle}
      data-display-mode={displayModeValue}
      data-resolution={resolution}
      tabIndex={-1}
      onClick={() => setContextMenu(undefined)}
      onClickCapture={(event: ReactMouseEvent<HTMLElement>) => {
        if (tool !== undefined || !(event.target instanceof Element)) return;
        const control = event.target.closest(
          'button, a[href], [role="button"], input[type="button"], input[type="submit"]',
        );
        if (!control || control.matches(":disabled, [aria-disabled='true']"))
          return;
        playButtonSound();
      }}
      onPointerMove={revealPlaybackControls}
      onPointerDown={revealPlaybackControls}
    >
      {gameSettingsOpen ? (
        <PlayableGameSettingsOverlay
          settings={gameSettings}
          hasUnsavedChanges={
            JSON.stringify(gameSettings) !==
            JSON.stringify(savedGameSettingsRef.current)
          }
          saveStatus={gameSettingsSaveStatus}
          onChange={patchGameSettings}
          onSave={(closeAfterSave = false) => {
            closeSettingsAfterSave.current = closeAfterSave;
            setGameSettingsSaveStatus("saving");
            sendSettingsAction("save");
          }}
          onReset={() => {
            setGameSettingsSaveStatus("idle");
            sendSettingsAction("reset");
          }}
          onDiscard={() => {
            sendSettingsAction("discard");
            closeGameSettings();
          }}
          onClose={closeGameSettings}
        />
      ) : null}
      <PlayableVrViewer
        video={
          mediaState.backdropAssetId
            ? assets[mediaState.backdropAssetId]
            : undefined
        }
        currentTime={mediaState.currentTime}
        buttons={vrButtons}
        viewport={definition.graph.viewport}
        onActivate={(buttonId) =>
          iframe.current?.contentWindow?.postMessage(
            {
              kind: "putenggame:playable:vr-activate",
              instanceId,
              nodeId: currentNodeId,
              buttonId,
            },
            "*",
          )
        }
        onPress={(buttonId, phase) =>
          iframe.current?.contentWindow?.postMessage(
            {
              kind: "putenggame:playable:vr-press",
              instanceId,
              nodeId: currentNodeId,
              buttonId,
              phase,
            },
            "*",
          )
        }
      />
      <div ref={playerStage} className="playable-player-stage" style={stageStyle}>
        {showGameSettings && ready ? (
          <button
            className={`playable-player-settings-trigger${onSettingsButtonPositionChange ? " is-editable" : ""}${settingsButtonSelected && tool === "select" ? " is-selected" : ""}`}
            type="button"
            aria-label={translateText(
              tool === "select" && onSelectSettingsButton
                ? "Select game settings button"
                : "Open game settings",
              readLanguage(),
            )}
            aria-pressed={settingsButtonSelected && tool === "select"}
            title={
              tool === "select" && onSelectSettingsButton
                ? translateText("Select the settings button or drag to move it", readLanguage())
                : onSettingsButtonPositionChange
                  ? translateText("Drag to move the settings button", readLanguage())
                  : translateText("Open game settings", readLanguage())
            }
            onPointerDown={startSettingsButtonDrag}
            onPointerMove={moveSettingsButton}
            onPointerUp={finishSettingsButtonDrag}
            onPointerCancel={finishSettingsButtonDrag}
            onClick={(event) => {
              event.stopPropagation();
              if (tool === "select" && onSelectSettingsButton) return;
              if (onSettingsButtonPositionChange && event.detail !== 0) return;
              if (!settingsButtonDrag.current) activateSettingsButton();
            }}
            style={{
              left: `${settingsButtonPosition.x * 100}%`,
              top: `${settingsButtonPosition.y * 100}%`,
              width: displayedSettingsButtonSize * (scale ?? 1),
              height: displayedSettingsButtonSize * (scale ?? 1),
            }}
          >
            {settingsButtonIconUrl ? (
              <img
                className="playable-player-button-icon"
                src={settingsButtonIconUrl}
                alt=""
                draggable={false}
                style={{ objectFit: "contain" }}
              />
            ) : (
              <SettingsIcon
                size={
                  (19 * displayedSettingsButtonSize) /
                  PLAYABLE_SETTINGS_BUTTON_SIZE *
                  (scale ?? 1)
                }
              />
            )}
            {settingsButtonSelected && tool === "select" ? (
              <span
                className="playable-player-settings-selection-box"
                aria-hidden="true"
              />
            ) : null}
          </button>
        ) : null}
        {(
          showReturnButton ||
          (showPauseMenu &&
            currentNodeId !== definition.graph.entryNodeId)
        ) &&
        ready ? (
          <button
            ref={pauseMenuButton}
            className={`playable-player-return-trigger${showReturnButton && onReturnButtonPositionChange ? " is-editable" : ""}${returnButtonSelected && tool === "select" ? " is-selected" : ""}`}
            type="button"
            aria-label={
              tool === "select" && onSelectReturnButton
                ? t("playableWorkbench.selectReturnButton")
                : t("pauseMenu.open")
            }
            aria-pressed={returnButtonSelected && tool === "select"}
            title={
              tool === "select" && onSelectReturnButton
                ? t("playableWorkbench.selectReturnButtonHint")
                : showPauseMenu
                  ? t("pauseMenu.open")
                  : onReturnButtonPositionChange
                    ? t("playableWorkbench.dragReturnButton")
                    : t("pauseMenu.open")
            }
            onPointerDown={startReturnButtonDrag}
            onPointerMove={moveReturnButton}
            onPointerUp={finishReturnButtonDrag}
            onPointerCancel={finishReturnButtonDrag}
            onClick={(event) => {
              event.stopPropagation();
              if (tool === "select" && onSelectReturnButton) return;
              if (!returnButtonDrag.current && showPauseMenu) openPauseMenu();
            }}
            style={{
              left: `${displayedReturnButtonPosition.x * 100}%`,
              top: `${displayedReturnButtonPosition.y * 100}%`,
              width: displayedReturnButtonSize * (scale ?? 1),
              height: displayedReturnButtonSize * (scale ?? 1),
            }}
          >
            {returnButtonIconUrl ? (
              <img
                className="playable-player-button-icon"
                src={returnButtonIconUrl}
                alt=""
                draggable={false}
                style={{ objectFit: "contain" }}
              />
            ) : (
              <ArrowLeft
                size={
                  (20 * displayedReturnButtonSize) /
                  PLAYABLE_RETURN_BUTTON_SIZE *
                  (scale ?? 1)
                }
              />
            )}
            {returnButtonSelected && tool === "select" ? (
              <span
                className="playable-player-settings-selection-box"
                aria-hidden="true"
              />
            ) : null}
          </button>
        ) : null}
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
      {gameExited ? (
        <div className="playable-player-exited" role="status">
          <section>
            <h2>{t("pauseMenu.exited")}</h2>
            <p>{t("pauseMenu.closeWindowHint")}</p>
            <button type="button" onClick={() => window.close()}>
              {t("pauseMenu.closeWindow")}
            </button>
          </section>
        </div>
      ) : null}
      {pauseMenuOpen && !gameSettingsOpen ? (
        <div
          className="playable-pause-menu"
          role="dialog"
          aria-modal="true"
          aria-label={t("pauseMenu.title")}
        >
          <div className="playable-pause-menu-content">
            <div className="playable-pause-menu-items" role="listbox">
              {PAUSE_MENU_ITEMS.map((item, index) => {
                const labels: Record<PauseMenuItem, string> = {
                  continue: t("pauseMenu.continueGame"),
                  "main-menu": t("pauseMenu.mainMenu"),
                  "story-map": t("pauseMenu.storyMap"),
                  settings: t("pauseMenu.settings"),
                  exit: t("pauseMenu.exit"),
                };
                const selected = selectedPauseMenuItem === index;
                return (
                  <button
                    key={item}
                    ref={(element) => {
                      pauseMenuItemRefs.current[index] = element;
                    }}
                    className={`playable-pause-menu-item${selected ? " is-selected" : ""}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onFocus={() => setSelectedPauseMenuItem(index)}
                    onPointerEnter={() => setSelectedPauseMenuItem(index)}
                    onClick={() => {
                      setSelectedPauseMenuItem(index);
                      activatePauseMenuItem(item);
                    }}
                  >
                    <span
                      className="playable-pause-menu-indicator"
                      aria-hidden="true"
                    />
                    <span>{labels[item]}</span>
                  </button>
                );
              })}
            </div>
            <footer className="playable-pause-menu-hints">
              <span>
                <kbd>Esc</kbd>
                {t("pauseMenu.continueHint")}
              </span>
              <span>
                <kbd>Enter</kbd>
                {t("pauseMenu.selectHint")}
              </span>
            </footer>
          </div>
        </div>
      ) : null}
      {showPlaybackControls && mediaState.duration > 0 ? (
        <div
          className={`published-player-controls${playbackControlsVisible ? " is-visible" : ""}`}
          role="group"
          aria-label={translateText("Published video timeline", readLanguage())}
          onPointerMove={revealPlaybackControls}
          onPointerDown={revealPlaybackControls}
        >
          <button
            type="button"
            aria-label={translateText(
              mediaState.paused
                ? "Play video"
                : "Pause video",
              readLanguage(),
            )}
            title={translateText(
              mediaState.paused
                ? "Play video"
                : "Pause video",
              readLanguage(),
            )}
            onClick={() =>
              iframe.current?.contentWindow?.postMessage(
                {
                  kind: "putenggame:playable:media-command",
                  instanceId,
                  command: { command: mediaState.paused ? "play" : "pause" },
                },
                "*",
              )
            }
          >
            {mediaState.paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <time>{formatPlayerTime(mediaState.currentTime)}</time>
          <input
            type="range"
            min="0"
            max={mediaState.duration}
            step="0.01"
            value={Math.min(
              Math.max(0, mediaState.currentTime),
              mediaState.duration,
            )}
            aria-label={translateText("Video progress", readLanguage())}
            onChange={(event) =>
              iframe.current?.contentWindow?.postMessage(
                {
                  kind: "putenggame:playable:media-command",
                  instanceId,
                  command: { command: "seek", time: Number(event.target.value) },
                },
                "*",
              )
            }
          />
          <time>{formatPlayerTime(mediaState.duration)}</time>
        </div>
      ) : null}
    </main>
  );
}

function formatPlayerTime(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

function respondToSettings(
  iframe: HTMLIFrameElement | null,
  storage: Storage,
  settingsKey: string,
  message: Extract<
    PlayableFrameMessage,
    { kind: "putenggame:playable:settings-save" }
  >,
): string | undefined {
  let error: string | undefined;
  try {
    storage.setItem(settingsKey, JSON.stringify(message.settings));
  } catch (cause) {
    error = errorMessage(cause);
  }
  iframe?.contentWindow?.postMessage(
    {
      kind: "putenggame:playable:settings-save-result",
      instanceId: message.instanceId,
      requestId: message.requestId,
      error,
    },
    "*",
  );
  return error;
}

function applyPlayerDisplaySettings(
  player: HTMLElement | null,
  settings: Pick<PlayableGameSettings, "displayMode" | "resolution">,
  changedMode: boolean,
  onDiagnostic: (error: string) => void,
): void {
  if (!player) return;
  player.dataset.displayMode = settings.displayMode;
  player.dataset.resolution = settings.resolution;
  if (!changedMode) return;
  if (settings.displayMode === "fullscreen") {
    void player.requestFullscreen?.().catch((cause) =>
      onDiagnostic(`Could not enter fullscreen: ${errorMessage(cause)}`),
    );
  } else if (document.fullscreenElement === player) {
    void document.exitFullscreen().catch((cause) =>
      onDiagnostic(`Could not leave fullscreen: ${errorMessage(cause)}`),
    );
  }
}

function resolutionLimit(
  resolution: PlayableGameSettings["resolution"],
  displayMode: PlayableGameSettings["displayMode"],
  width: number,
  height: number,
): number {
  const limits: Record<
    Exclude<PlayableGameSettings["resolution"], "auto">,
    { width: number; height: number }
  > = {
    "1280x720": { width: 1280, height: 720 },
    "1920x1080": { width: 1920, height: 1080 },
    "2560x1440": { width: 2560, height: 1440 },
  };
  const limit =
    resolution === "auto"
      ? displayMode === "windowed"
        ? { width: 1280, height: 720 }
        : undefined
      : limits[resolution];
  return limit
    ? Math.min(limit.width / width, limit.height / height)
    : Number.POSITIVE_INFINITY;
}

function isPlayableResolution(
  value: unknown,
): value is PlayableGameSettings["resolution"] {
  return (
    value === "auto" ||
    value === "1280x720" ||
    value === "1920x1080" ||
    value === "2560x1440"
  );
}

function readStoredJson(storage: Storage, key: string): unknown {
  const stored = storage.getItem(key);
  if (stored === null) return undefined;
  try {
    return JSON.parse(stored) as unknown;
  } catch {
    storage.removeItem(key);
    return undefined;
  }
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
