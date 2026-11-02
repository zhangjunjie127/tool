import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  ArrowUp,
  Brush,
  Check,
  Film,
  FolderOpen,
  GuideHorizontal,
  GuideVertical,
  Lock,
  LockOpen,
  Image,
  ImageOff,
  Music2,
  InfoCircle,
  History,
  Heart,
  LoaderCircle,
  Layers3,
  MousePointer2,
  Move,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  ArrowDownToLine,
  ChevronDown,
  Trash2,
  Type,
  Undo2,
  X,
  type IconComponent,
} from "./icons.js";
import {
  type NodeGraph,
  type PlayableAssetDefinition,
  type PlayableNode,
} from "../shared/playable-nodes.js";
import type { PlayableAlignmentGuide } from "../shared/playable-codebase.js";
import { playableNodeById } from "../shared/playable-graph.js";
import type {
  PlayableAppearanceTimingCommand,
  NodePlayerDefinition,
  PlayableDeleteEdit,
  PlayableElementClipboardCommand,
  PlayableElementCopy,
  PlayableHistoryCommand,
  PlayableInteractionSelection,
  PlayableInteractionTimingEdit,
  PlayableMediaCommand,
  PlayableMediaState,
  PlayableMotionCommand,
  PlayablePreviewShortcut,
  PlayableMove,
  PlayablePreviewOptions,
  PlayableTextCreate,
  PlayableTextEdit,
  PlayableTextSelection,
  PlayableTextStyleCommand,
  PlayableTextStyleEdit,
  PlayableTransformEdit,
} from "../shared/playable-player-protocol.js";
import type { PlayableBackdropEffects } from "../shared/playable-backdrop-effects.js";
import type {
  PlayableButtonAction,
  PlayableNoInputMode,
} from "../shared/playable-motion.js";
import {
  playableTextPickWithSource,
  type PlayablePickResult,
} from "../shared/playable-picker.js";
import type { NodeRuntimeSnapshot } from "../shared/playable-runtime.js";
import type {
  LibrarySourceFolderCategory,
  LibrarySourceFolders,
  PromptContext,
} from "../shared/contracts.js";
import {
  playableElementContext,
  playableMoveRequest,
  playableTextEditRequest,
} from "../shared/playable-chat-context.js";
import {
  playableAssetType,
  playableRuntimeKey,
  type PlayableProjectValidationIssue,
} from "../shared/playable-editor.js";
import {
  getLibraryAsset,
  getNodeRuntime,
  getWorkspaceFile,
  listLibrarySourceFolders,
  playableSandboxUrl,
  setLibrarySourceFolder,
} from "./api.js";
import { loadLibraryAssets, type LibraryAsset } from "./library-assets.js";
import { browserLibraryFolderNames, chooseBrowserLibraryFolder, clearBrowserLibraryFolder } from "./browser-library-folders.js";
import {
  LibraryAssetPicker,
  type LibraryPickerCategory,
  uploadLibraryFile,
  WorkbenchBreadcrumb,
  WorkbenchPreview,
  uploadLibraryFiles,
} from "./node-workbench.js";
import { createMemoryStorage, NodePlayer } from "./playable-player.js";
import { loadPlayableAssets } from "./playable-assets.js";
import {
  chooseBrowserFontDirectory,
  rememberedBrowserFontDirectory,
  scanBrowserSystemFonts,
} from "./browser-fonts.js";
import {
  playablePickKey,
  usePlayableChatReport,
  type PlayableChatState,
  type PlayableMediaAttachment,
  type PlayableStroke,
} from "./playable-chat.js";
import { isTextEntry, undoShortcut } from "./editor-canvas.js";
import { PlayableAffectionDialog } from "./playable-affection-dialog.js";
import {
  readPlayableAffectionConfig,
  type PlayableAffectionConfig,
} from "../shared/playable-affection.js";
import {
  PLAYABLE_BUTTON_PRESS_EFFECT_DEFAULT_COLOR,
  PLAYABLE_BUTTON_PRESS_EFFECTS,
  type PlayableButtonPressEffect,
  type PlayableMotionConfig,
  type PlayableMotionKind,
} from "../shared/playable-motion.js";
import { interactionTimingEditsAreUnchanged } from "../shared/playable-move.js";
import { parsePlayableSourceLocation } from "../shared/playable-text-edit.js";
import { PLAYABLE_RETURN_BUTTON_SIZE } from "../shared/playable-return-button.js";
import {
  MAX_PLAYABLE_FUNCTION_BUTTON_SIZE,
  MIN_PLAYABLE_FUNCTION_BUTTON_SIZE,
  PLAYABLE_FUNCTION_BUTTON_SIZE,
} from "../shared/playable-function-button.js";
import { readLanguage, t, translateText } from "./i18n.js";

const ASSET_UPLOAD_ACCEPT = ".png,.jpg,.jpeg,.webp,.mp4,.mov,.webm";
const PICKER_CATEGORIES: readonly {
  id: "video" | "image" | "audio" | "custom";
  label: string;
  icon: IconComponent;
}[] = [
  { id: "video", label: "Videos", icon: Film },
  { id: "image", label: "Images", icon: Image },
  { id: "audio", label: "Audio", icon: Music2 },
  { id: "custom", label: "Custom", icon: Layers3 },
];
const SESSION_IMPORTED_ASSET_IDS = new Set<string>();
const TOAST_LIMIT = 3;
const TOAST_MS = 3500;
const TOAST_LONG_MS = 6000;
const PICK_LIMIT = 8;
const FALLBACK_SYSTEM_FONTS = [
  "Microsoft YaHei",
  "SimSun",
  "Arial",
  "Segoe UI",
  "Georgia",
  "Times New Roman",
  "system-ui",
  "sans-serif",
];
const TEXT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96];

function formatHistoryTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(readLanguage(), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export interface PlayableAssetRequest extends PlayableAssetDefinition {
  name: string;
}

/** A Playtest that starts at a Scene instead of the saved game, with a new game's values. */
export interface PlaytestStart {
  nodeId: string;
}

export interface PlayableHistoryItem {
  id: string;
  label: string;
  createdAt: number;
  current: boolean;
  restoreIndex?: number;
}

export interface PreviewRuntime {
  definition?: NodePlayerDefinition;
  assets?: Record<string, Blob>;
  loadAssets?: (assetIds: readonly string[]) => Promise<Record<string, Blob>>;
  error?: string;
}

/**
 * What the pointer does in the preview: play the game, pick elements for the
 * chat, edit text in place, move elements, or draw over it for the chat.
 */
export type PreviewTool = "play" | "select" | "text" | "move" | "draw";

/**
 * A short message over the preview: where an Exit would go, since the preview
 * stays on the Scene, or a change from the preview that failed. Changes that
 * work show in the preview or the chat instead.
 */
interface PreviewToast {
  id: number;
  text: string;
  tone: "info" | "warning" | "error";
  /** A Scene the message offers to open. */
  targetNodeId?: string;
}

/**
 * One Node's Workbench: a live preview that reports navigation instead of
 * leaving the Node, with tools to point at, edit, and draw on it. There is no
 * inspector and no code here; the AI changes the Node.
 * Everything else floats over the preview, so it keeps the whole height.
 */
export function PlayableNodeWorkbench({
  projectId,
  node,
  graph,
  guides,
  onGuidesChange,
  history,
  onRestoreHistory,
  issues,
  revision,
  onClose,
  onOpenNode,
  onRename,
  onAskAgent,
  onSendToAgent,
  onWriteText,
  onWriteTextCreate,
  onWriteElementCopies,
  onHistoryCommand,
  elementClipboardCommand,
  onElementClipboardCommandApplied,
  onWriteTextStyle,
  onWriteInteractionTimings,
  onWriteMotion,
  onReplaceButtonAsset,
  onSetButtonPressedAsset,
  onInsertMediaAsset,
  onAddButtonPreset,
  onCreateSharedAnswerSignals,
  onDeleteSharedAnswerSignals,
  onWriteButtonSignal,
  onWriteButtonSignalLabel,
  onWriteButtonAssetScale,
  onWriteMove,
  onWriteTransform,
  onWriteDelete,
  onWriteAffection,
  onAddAsset,
  onSetSettingsButtonIcon,
  onWriteSettingsButtonPosition,
  onWriteSettingsButtonSize,
  onSetReturnButtonIcon,
  onWriteReturnButtonPosition,
  onWriteReturnButtonSize,
  onSetButtonSound,
  onRemoveButtonSound,
  onWriteGlobalFontFamily,
  onSetBackdrop,
  onRemoveBackdrop,
  onWriteBackdropLoop,
  pictureInPictureVideoLoop,
  onWritePictureInPictureVideoLoop,
  onWriteNoInputMode,
  onWriteVideoEndAutoAdvance,
  backdrop,
  backdropType,
  backdropLoop,
  noInputMode,
  videoEndAutoAdvance,
  backdropEffects,
  onPlayFromHere,
  onChatContextChange,
}: {
  projectId: string;
  node: PlayableNode;
  graph: NodeGraph;
  guides: readonly PlayableAlignmentGuide[];
  onGuidesChange: (guides: PlayableAlignmentGuide[]) => void;
  history: readonly PlayableHistoryItem[];
  onRestoreHistory: (index: number) => Promise<void>;
  issues: readonly PlayableProjectValidationIssue[];
  /** Changes whenever the project's files were saved, so the preview reloads. */
  revision: number;
  onClose: () => void;
  onOpenNode: (nodeId: string) => void;
  onRename: (title: string) => void;
  /** Sends a request to the AI now; resolves false when it could not be sent. */
  onSendToAgent?: (text: string, contexts: PromptContext[]) => Promise<boolean>;
  /** Writes a text edit back to surface HTML; resolves false when it cannot be made in place. */
  onWriteText: (edit: PlayableTextEdit) => Promise<boolean>;
  /** Adds a positioned text element and returns its source location. */
  onWriteTextCreate: (text: PlayableTextCreate) => Promise<string | undefined>;
  /** Persists copied preview elements and returns each new source location. */
  onWriteElementCopies: (
    copies: PlayableElementCopy[],
  ) => Promise<Record<string, string> | undefined>;
  onHistoryCommand?: (
    command: PlayableHistoryCommand,
  ) => Promise<void> | undefined;
  elementClipboardCommand?: PlayableElementClipboardCommand;
  onElementClipboardCommandApplied?: (sequence: number) => void;
  /** Writes a font property back to the selected text element. */
  onWriteTextStyle: (edit: PlayableTextStyleEdit) => Promise<boolean>;
  /** Writes a non-video element's appearance delay back to its source element. */
  onWriteInteractionTimings: (
    edits: PlayableInteractionTimingEdit[],
  ) => Promise<boolean>;
  onWriteMotion: (
    pick: PlayablePickResult,
    config: PlayableMotionConfig | undefined,
    assetId?: string,
    applyButtonPreset?: boolean,
  ) => Promise<boolean>;
  onReplaceButtonAsset: (
    pick: PlayablePickResult,
    asset: PlayableAssetRequest,
  ) => Promise<string | undefined>;
  onSetButtonPressedAsset: (
    pick: PlayablePickResult,
    asset: PlayableAssetRequest,
  ) => Promise<string | undefined>;
  onInsertMediaAsset: (
    asset: PlayableAssetRequest,
    pictureInPictureLoop: boolean,
  ) => Promise<{ assetId: string; source: string } | undefined>;
  onAddButtonPreset: (
    config?: PlayableMotionConfig,
    assetId?: string,
    reuseExistingSignals?: boolean,
    buttonSignal?: string,
    pressedAssetId?: string,
    buttonText?: string,
    fontFamily?: string,
    buttonAction?: PlayableButtonAction,
  ) => Promise<
    {
      id: string;
      source: string;
      signal?: string;
      label: string;
      timeoutSignal?: string;
    } | undefined
  >;
  onCreateSharedAnswerSignals: (nodeId: string) => Promise<boolean>;
  onDeleteSharedAnswerSignals: (nodeId: string) => Promise<boolean>;
  onWriteButtonSignal: (
    pick: PlayablePickResult,
    signalId: string,
  ) => Promise<boolean>;
  onWriteButtonSignalLabel: (
    pick: PlayablePickResult,
    signalId: string,
    label: string,
  ) => Promise<boolean>;
  onWriteButtonAssetScale: (
    pick: PlayablePickResult,
    scaleX: number,
    scaleY: number,
  ) => Promise<boolean>;
  /** Writes a move back to surface HTML; resolves false when it cannot be made in place. */
  onWriteMove: (move: PlayableMove) => Promise<boolean>;
  /** Writes a visual scale/rotation change back to surface HTML. */
  onWriteTransform: (edit: PlayableTransformEdit) => Promise<boolean>;
  /** Removes a selected element from surface HTML. */
  onWriteDelete: (edit: PlayableDeleteEdit) => Promise<boolean>;
  onWriteAffection: (config: PlayableAffectionConfig) => Promise<void>;
  /** Declares an asset on the Scene and resolves with its ID once saved. */
  onAddAsset: (asset: PlayableAssetRequest) => Promise<string>;
  onSetSettingsButtonIcon: (
    asset: PlayableAssetRequest,
  ) => Promise<string | undefined>;
  onWriteSettingsButtonPosition: (position: { x: number; y: number }) => Promise<boolean>;
  onWriteSettingsButtonSize: (size: number) => Promise<boolean>;
  onSetReturnButtonIcon: (
    asset: PlayableAssetRequest,
  ) => Promise<string | undefined>;
  onWriteReturnButtonPosition: (position: { x: number; y: number }) => Promise<boolean>;
  onWriteReturnButtonSize: (size: number) => Promise<boolean>;
  onSetButtonSound: (asset: PlayableAssetRequest) => Promise<void>;
  onRemoveButtonSound: () => Promise<void>;
  onWriteGlobalFontFamily: (fontFamily: string) => Promise<void>;
  /**
   * Shows the asset as the Scene's background, as a step the editor's Undo
   * takes back; resolves false when the background cannot be set in place.
   */
  onSetBackdrop?: (asset: PlayableAssetRequest) => Promise<string | undefined>;
  /**
   * Takes the Asset off the Scene's background, as a step the editor's Undo
   * takes back; resolves false when there is no background to clear.
   */
  onRemoveBackdrop?: () => Promise<boolean>;
  /** Persists this Node's background-video loop preference. */
  onWriteBackdropLoop: (loop: boolean) => Promise<boolean>;
  pictureInPictureVideoLoop: boolean;
  onWritePictureInPictureVideoLoop: (loop: boolean) => Promise<boolean>;
  onWriteNoInputMode: (
    mode: PlayableNoInputMode | undefined,
  ) => Promise<boolean>;
  onWriteVideoEndAutoAdvance: (enabled: boolean) => Promise<boolean>;
  /** Whether the Scene's background shows anything yet; unset when the editor cannot set it. */
  backdrop?: "missing" | "set";
  backdropType?: "image" | "video";
  backdropLoop: boolean;
  noInputMode: PlayableNoInputMode | undefined;
  videoEndAutoAdvance: boolean;
  backdropEffects: PlayableBackdropEffects;
  /** Opens a Playtest that starts at this Scene. */
  onPlayFromHere?: (start: PlaytestStart) => void;
  onChatContextChange?: (state: PlayableChatState | undefined) => void;
  /** Puts a request in the chat prompt, for when it cannot be sent now. */
  onAskAgent?: (text: string) => void;
}) {
  const skipNextRuntimeRefresh = useRef(0);
  const reserveRuntimeRefreshSkip = useCallback(() => {
    skipNextRuntimeRefresh.current += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      skipNextRuntimeRefresh.current = Math.max(
        0,
        skipNextRuntimeRefresh.current - 1,
      );
    };
  }, []);
  const runtime = usePlayablePreviewRuntime(
    projectId,
    node.id,
    revision,
    skipNextRuntimeRefresh,
  );
  const [affectionConfig, setAffectionConfig] =
    useState<PlayableAffectionConfig>();
  const [affectionOpen, setAffectionOpen] = useState(false);
  const [affectionSaving, setAffectionSaving] = useState(false);
  useEffect(() => {
    let active = true;
    void getWorkspaceFile(projectId, node.source.html)
      .then((file) => {
        if (active)
          setAffectionConfig(
            file.content
              ? readPlayableAffectionConfig(file.content)
              : undefined,
          );
      })
      .catch(() => {
        if (active) setAffectionConfig(undefined);
      });
    return () => {
      active = false;
    };
  }, [projectId, node.source.html, revision]);
  const [session, setSession] = useState(0);
  const [deleteCommand, setDeleteCommand] = useState<{
    sequence: number;
    picks: PlayablePickResult[];
  }>();
  const deleteSequence = useRef(0);
  const [appearanceTimingCommand, setAppearanceTimingCommand] =
    useState<PlayableAppearanceTimingCommand>();
  const appearanceTimingSequence = useRef(0);
  const [motionCommand, setMotionCommand] = useState<PlayableMotionCommand>();
  const [motionRingAsset, setMotionRingAsset] = useState<{
    id: string;
    transfer: { contentType: string; bytes: ArrayBuffer };
  }>();
  const [motionBarAsset, setMotionBarAsset] = useState<{
    id: string;
    transfer: { contentType: string; bytes: ArrayBuffer };
  }>();
  const motionBarPlacement = useRef<
    | {
        cssPath: string;
        scale: number;
        offsetX: number;
        offsetY: number;
        circular: boolean;
        barLayer: "bottom" | "top";
      }
    | undefined
  >(undefined);
  const [motionSwipeAsset, setMotionSwipeAsset] = useState<{
    id: string;
    transfer: { contentType: string; bytes: ArrayBuffer };
  }>();
  const [motionBaseAsset, setMotionBaseAsset] = useState<{
    id: string;
    transfer: { contentType: string; bytes: ArrayBuffer };
  }>();
  const [motionPressedAsset, setMotionPressedAsset] = useState<{
    id: string;
    transfer: { contentType: string; bytes: ArrayBuffer };
  }>();
  const [pendingButtonNormalAsset, setPendingButtonNormalAsset] =
    useState<PlayableAssetRequest>();
  const [pendingButtonPressedAsset, setPendingButtonPressedAsset] =
    useState<PlayableAssetRequest>();
  const motionSequence = useRef(0);
  const [textStyleCommand, setTextStyleCommand] =
    useState<PlayableTextStyleCommand>();
  const textStyleSequence = useRef(0);
  const [snapshot, setSnapshot] = useState<NodeRuntimeSnapshot>();
  const [diagnostics, setDiagnostics] = useState<
    { message: string; at: string }[]
  >([]);
  const [tool, setTool] = useState<PreviewTool>("play");
  const [settingsButtonSelected, setSettingsButtonSelected] = useState(false);
  const [returnButtonSelected, setReturnButtonSelected] = useState(false);
  const [settingsButtonSizePreview, setSettingsButtonSizePreview] =
    useState<number>();
  const [pendingSettingsButtonIcon, setPendingSettingsButtonIcon] = useState<{
    asset: PlayableAssetRequest;
    blob: Blob;
    committed: boolean;
    synced?: boolean;
    assetId?: string;
  }>();
  const [settingsButtonIconApplying, setSettingsButtonIconApplying] =
    useState(false);
  const settingsButtonIconRequest = useRef(0);
  const [pendingReturnButtonIcon, setPendingReturnButtonIcon] = useState<{
    asset: PlayableAssetRequest;
    blob: Blob;
    committed: boolean;
    synced?: boolean;
    assetId?: string;
  }>();
  const [returnButtonIconApplying, setReturnButtonIconApplying] =
    useState(false);
  const returnButtonIconRequest = useRef(0);
  const [returnButtonSizePreview, setReturnButtonSizePreview] =
    useState<number>();
  const [selectedGuideId, setSelectedGuideId] = useState<string>();
  const [referencePicks, setReferencePicks] = useState<PlayablePickResult[]>([]);
  const [referencePickKey, setReferencePickKey] = useState<string>();
  const [alignCommand, setAlignCommand] = useState<{
    sequence: number;
    reference: PlayablePickResult;
    targets: PlayablePickResult[];
  }>();
  const alignSequence = useRef(0);
  const moveWriteQueue = useRef(Promise.resolve());
  const [textSelection, setTextSelection] = useState<PlayableTextSelection>();
  const [interactionSelections, setInteractionSelections] = useState<
    PlayableInteractionSelection[]
  >([]);
  const interactionSelection = interactionSelections.at(-1);
  const [picks, setPicks] = useState<PlayablePickResult[]>([]);
  const [strokeHistory, setStrokeHistory] = useState<{
    strokes: PlayableStroke[];
    redo: PlayableStroke[];
  }>({ strokes: [], redo: [] });
  const strokes = strokeHistory.strokes;
  const redoStrokes = strokeHistory.redo;
  const undoStroke = useCallback(() => {
    setStrokeHistory((current) => {
      const stroke = current.strokes.at(-1);
      if (!stroke) return current;
      return {
        strokes: current.strokes.slice(0, -1),
        redo: [...current.redo, stroke],
      };
    });
  }, []);
  const redoStroke = useCallback(() => {
    setStrokeHistory((current) => {
      const stroke = current.redo.at(-1);
      if (!stroke) return current;
      return {
        strokes: [...current.strokes, stroke],
        redo: current.redo.slice(0, -1),
      };
    });
  }, []);
  const clearStrokes = useCallback(
    () => setStrokeHistory({ strokes: [], redo: [] }),
    [],
  );
  const [media, setMedia] = useState<PlayableMediaAttachment[]>([]);
  const [mediaState, setMediaState] = useState<PlayableMediaState>({
    currentTime: 0,
    duration: 0,
    paused: true,
  });
  const [mediaCommand, setMediaCommand] = useState<PlayableMediaCommand>();
  const [vrEyeReference, setVrEyeReference] = useState<"full" | "left" | "right">("full");
  const backdropUpdateSequence = useRef(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRestoring, setHistoryRestoring] = useState(false);
  const [storage] = useState(createMemoryStorage);
  const {
    fonts,
    fontDirectoryName,
    addFontDirectory,
    scanSystemFonts,
  } = useSystemFonts();
  const { toasts, show: showToast, dismiss: dismissToast } = usePreviewToasts();
  const page = useRef<HTMLElement>(null);
  const seenReport = useRef("");

  // Any new session starts with no errors and no Exits taken.
  useEffect(() => {
    setSnapshot(undefined);
    setDiagnostics([]);
  }, [runtime.definition, node.id, session]);

  useEffect(() => {
    setTool("play");
    setSettingsButtonSelected(false);
    setReturnButtonSelected(false);
    setSettingsButtonSizePreview(undefined);
    settingsButtonIconRequest.current += 1;
    setPendingSettingsButtonIcon(undefined);
    setSettingsButtonIconApplying(false);
    returnButtonIconRequest.current += 1;
    setPendingReturnButtonIcon(undefined);
    setReturnButtonIconApplying(false);
    setReturnButtonSizePreview(undefined);
    setSelectedGuideId(undefined);
    setTextSelection(undefined);
    setInteractionSelections([]);
    setPicks([]);
    setStrokeHistory({ strokes: [], redo: [] });
    setMedia([]);
    setMediaState({ currentTime: 0, duration: 0, paused: true });
    setMediaCommand(undefined);
    setVrEyeReference("full");
    setMotionCommand(undefined);
    setMotionRingAsset(undefined);
    setMotionBarAsset(undefined);
    setMotionSwipeAsset(undefined);
    setMotionBaseAsset(undefined);
    setPendingButtonNormalAsset(undefined);
    setPendingButtonPressedAsset(undefined);
  }, [node.id]);

  useEffect(() => {
    if (
      !pendingSettingsButtonIcon?.committed ||
      !pendingSettingsButtonIcon.assetId
    )
      return;
    if (!runtime.definition) return;
    const currentAssetId =
      runtime.definition?.graph.settingsButton?.iconAssetId;
    if (currentAssetId === pendingSettingsButtonIcon.assetId) {
      if (!pendingSettingsButtonIcon.synced)
        setPendingSettingsButtonIcon((current) =>
          current?.asset === pendingSettingsButtonIcon.asset
            ? { ...current, synced: true }
            : current,
        );
    } else if (pendingSettingsButtonIcon.synced) {
      setPendingSettingsButtonIcon(undefined);
    }
  }, [
    pendingSettingsButtonIcon?.assetId,
    pendingSettingsButtonIcon?.asset,
    pendingSettingsButtonIcon?.committed,
    pendingSettingsButtonIcon?.synced,
    runtime.definition?.graph.settingsButton?.iconAssetId,
  ]);

  useEffect(() => {
    if (
      !pendingReturnButtonIcon?.committed ||
      !pendingReturnButtonIcon.assetId
    )
      return;
    if (!runtime.definition) return;
    const currentAssetId = runtime.definition.graph.returnButton?.iconAssetId;
    if (currentAssetId === pendingReturnButtonIcon.assetId) {
      if (!pendingReturnButtonIcon.synced)
        setPendingReturnButtonIcon((current) =>
          current?.asset === pendingReturnButtonIcon.asset
            ? { ...current, synced: true }
            : current,
        );
    } else if (pendingReturnButtonIcon.synced) {
      setPendingReturnButtonIcon(undefined);
    }
  }, [
    pendingReturnButtonIcon?.assetId,
    pendingReturnButtonIcon?.asset,
    pendingReturnButtonIcon?.committed,
    pendingReturnButtonIcon?.synced,
    runtime.definition?.graph.returnButton?.iconAssetId,
  ]);

  useEffect(() => {
    setMotionRingAsset(undefined);
    setMotionBarAsset(undefined);
    setMotionSwipeAsset(undefined);
    setMotionBaseAsset(undefined);
    setPendingButtonNormalAsset(undefined);
    setPendingButtonPressedAsset(undefined);
  }, [picks.at(-1)?.cssPath]);

  useEffect(() => {
    setReferencePicks([]);
    setReferencePickKey(undefined);
  }, [node.id]);

  useEffect(() => {
    if (tool !== "text") setTextSelection(undefined);
    if (tool !== "select") setInteractionSelections([]);
    if (tool !== "select") setPicks([]);
    if (tool !== "select") setSettingsButtonSelected(false);
    if (tool !== "select") setReturnButtonSelected(false);
  }, [tool]);

  // Esc puts the pointer back to playing. The preview frame reports its own Esc.
  useEffect(() => {
    if (tool === "play") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        isTextEntry(event.target)
      )
        return;
      setTool("play");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tool]);

  // Each Exit the preview takes shows up once, instead of changing the Scene.
  useEffect(() => {
    if (!snapshot) {
      seenReport.current = "";
      return;
    }
    for (const report of snapshot.reports) {
      if (report.at > seenReport.current) showToast(reportToast(graph, report));
    }
    seenReport.current = snapshot.reports.at(-1)?.at ?? seenReport.current;
  }, [graph, showToast, snapshot]);

  const removePick = useCallback((key: string) => {
    setPicks((current) =>
      current.filter((pick) => playablePickKey(pick) !== key),
    );
    setInteractionSelections((current) =>
      current.filter((selection) => playablePickKey(selection.pick) !== key),
    );
  }, []);
  usePlayableChatReport({
    graph,
    nodeId: node.id,
    picks,
    strokes,
    media,
    onRemovePick: removePick,
    onClearPicks: () => {
      setPicks([]);
      setInteractionSelections([]);
    },
    onClearDrawing: clearStrokes,
    onRemoveMedia: (assetId) =>
      setMedia((current) => current.filter((item) => item.assetId !== assetId)),
    onClearMedia: () => setMedia([]),
    stage: page,
    onChange: onChatContextChange,
  });

  const onDiagnostic = useCallback((message: string) => {
    setDiagnostics((current) => [
      ...current.slice(-19),
      { message, at: new Date().toISOString() },
    ]);
  }, []);
  const onPick = useCallback((pick: PlayablePickResult, additive: boolean) => {
    setSettingsButtonSelected(false);
    setReturnButtonSelected(false);
    const key = playablePickKey(pick);
    if (!additive) setInteractionSelections([]);
    setPicks((current) => {
      const picked = current.some(
        (candidate) => playablePickKey(candidate) === key,
      );
      if (!additive) return [pick];
      return picked
        ? current.filter((candidate) => playablePickKey(candidate) !== key)
        : [...current, pick].slice(-PICK_LIMIT);
    });
  }, []);
  const onSelectSettingsButton = useCallback(() => {
    setSettingsButtonSelected(true);
    setReturnButtonSelected(false);
    setSelectedGuideId(undefined);
    setTextSelection(undefined);
    setInteractionSelections([]);
    setPicks([]);
  }, []);
  const onSelectReturnButton = useCallback(() => {
    setReturnButtonSelected(true);
    setSettingsButtonSelected(false);
    setSelectedGuideId(undefined);
    setTextSelection(undefined);
    setInteractionSelections([]);
    setPicks([]);
  }, []);
  const onPickCancel = useCallback(() => setTool("play"), []);
  const toggleReferencePick = useCallback(
    (pick: PlayablePickResult) => {
      const key = playablePickKey(pick);
      const next = referencePicks.some(
        (candidate) => playablePickKey(candidate) === key,
      )
        ? referencePicks.filter((candidate) => playablePickKey(candidate) !== key)
        : [...referencePicks, pick];
      setReferencePicks(next);
      if (referencePickKey === key)
        setReferencePickKey(
          next[0] ? playablePickKey(next[0]) : undefined,
        );
      else if (!referencePickKey && next.length)
        setReferencePickKey(playablePickKey(next[0]!));
    },
    [referencePickKey, referencePicks],
  );
  const alignSelectionToReference = useCallback(
    (referenceKey: string) => {
      const reference = referencePicks.find(
        (pick) => playablePickKey(pick) === referenceKey,
      );
      const targets = picks.filter(
        (pick) =>
          pick.tag === "button" &&
          !referencePicks.some(
            (candidate) => playablePickKey(candidate) === playablePickKey(pick),
          ),
      );
      if (!reference || targets.length === 0) return;
      setAlignCommand({
        sequence: ++alignSequence.current,
        reference,
        targets,
      });
    },
    [picks, referencePicks],
  );
  const onPreviewHistoryCommand = useCallback(
    (command: PlayableHistoryCommand) => {
      if (!onHistoryCommand) return;
      void withPlayablePreviewRefreshSkip(
        skipNextRuntimeRefresh,
        async () => {
          const change = onHistoryCommand(command);
          if (!change) return false;
          await change;
          return true;
        },
        Boolean,
      ).catch(() => {});
    },
    [onHistoryCommand, skipNextRuntimeRefresh],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isTextEntry(event.target) ||
        event.isComposing
      )
        return;
      const command = undoShortcut(event);
      if (!command) return;
      if (command === "undo" && strokes.length > 0) {
        event.preventDefault();
        undoStroke();
      } else if (command === "redo" && redoStrokes.length > 0) {
        event.preventDefault();
        redoStroke();
      } else {
        onPreviewHistoryCommand(command);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onPreviewHistoryCommand, redoStroke, redoStrokes.length, strokes.length, undoStroke]);

  /** Asks the AI now, or puts the request in the chat prompt when it cannot be sent. */
  const askAgent = useCallback(
    async (
      text: string,
      contexts: PromptContext[],
      summary: string,
    ): Promise<void> => {
      if (onSendToAgent && (await onSendToAgent(text, contexts))) return;
      if (onAskAgent) return onAskAgent(text);
      showToast({ tone: "error", text: `Could not ask the AI: ${summary}` });
    },
    [onAskAgent, onSendToAgent, showToast],
  );

  const onTextEdit = useCallback(
    (edit: PlayableTextEdit) => {
      if (edit.before === edit.after) return;
      void (async () => {
        const releaseRefreshSkip = reserveRuntimeRefreshSkip();
        try {
          if (await onWriteText(edit)) {
            return;
          }
          releaseRefreshSkip();
          await askAgent(
            playableTextEditRequest(edit.before, edit.after),
            [playableElementContext(edit.pick)],
            `Changing "${edit.before}" to "${edit.after}"`,
          );
        } catch (cause) {
          releaseRefreshSkip();
          return showToast({
            tone: "error",
            text: `Could not change the text: ${errorMessage(cause)}`,
          });
        }
      })();
    },
    [askAgent, onWriteText, reserveRuntimeRefreshSkip, showToast],
  );

  const onTextSelect = useCallback(
    (selection: PlayableTextSelection | undefined) => {
      setTextSelection(selection);
    },
    [],
  );

  const onPasteElements = useCallback(
    async (copies: PlayableElementCopy[]) => {
      const releaseRefreshSkip = reserveRuntimeRefreshSkip();
      try {
        const sources = await onWriteElementCopies(copies);
        if (sources) return sources;
        releaseRefreshSkip();
        showToast({ tone: "error", text: t("playableWorkbench.errorPasteItems") });
      } catch (cause) {
        releaseRefreshSkip();
        showToast({
          tone: "error",
          text: `${t("playableWorkbench.errorPasteItems")}: ${errorMessage(cause)}`,
        });
      }
      return undefined;
    },
    [onWriteElementCopies, reserveRuntimeRefreshSkip, showToast],
  );

  const onTextCreate = useCallback(
    async (text: PlayableTextCreate) => {
      const releaseRefreshSkip = reserveRuntimeRefreshSkip();
      try {
        const source = await onWriteTextCreate(text);
        if (source) {
          const withSource = (pick: PlayablePickResult) =>
            playableTextPickWithSource(pick, {
              id: text.id,
              nodeId: text.nodeId,
              source,
            });
          setPicks((current) => current.map(withSource));
          setTextSelection((current) => {
            if (!current) return current;
            const pick = withSource(current.pick);
            return pick === current.pick
              ? current
              : { ...current, pick, inPlace: true };
          });
          setInteractionSelections((current) =>
            current.map((selection) => {
              const pick = withSource(selection.pick);
              return pick === selection.pick
                ? selection
                : { ...selection, pick, inPlace: true };
            }),
          );
          return source;
        }
        releaseRefreshSkip();
        showToast({ tone: "error", text: t("playableWorkbench.errorSaveText") });
      } catch (cause) {
        releaseRefreshSkip();
        showToast({
          tone: "error",
          text: `${t("playableWorkbench.errorSaveText")}: ${errorMessage(cause)}`,
        });
      }
      return undefined;
    },
    [onWriteTextCreate, reserveRuntimeRefreshSkip, showToast],
  );

  const onTextStyle = useCallback(
    (property: PlayableTextStyleEdit["property"], value: string) => {
      const selection = textSelection;
      if (!selection || !value) return;
      void (async () => {
        const releaseRefreshSkip = reserveRuntimeRefreshSkip();
        try {
          if (!selection.inPlace) {
            releaseRefreshSkip();
            showToast({ tone: "error", text: t("playableWorkbench.errorSaveTextFont") });
            return;
          }
          if (
            !(await onWriteTextStyle({
              pick: selection.pick,
              property,
              value,
              inPlace: selection.inPlace,
            }))
          ) {
            releaseRefreshSkip();
            showToast({ tone: "error", text: t("playableWorkbench.errorSaveTextFont") });
            return;
          }
          setTextSelection((current) =>
            current && current.pick.cssPath === selection.pick.cssPath
              ? { ...current, [property]: value }
              : current,
          );
          setTextStyleCommand({
            sequence: ++textStyleSequence.current,
            pick: selection.pick,
            property,
            value,
          });
        } catch (cause) {
          releaseRefreshSkip();
          showToast({
            tone: "error",
            text: `无法保存字体设置：${errorMessage(cause)}`,
          });
        }
      })();
    },
    [onWriteTextStyle, reserveRuntimeRefreshSkip, showToast, textSelection],
  );

  const editButtonLabel = useCallback(
    async (pick: PlayablePickResult, after: string): Promise<boolean> => {
      const before = pick.text ?? "";
      if (before === after) return true;
      const releaseRefreshSkip = reserveRuntimeRefreshSkip();
      try {
        if (
          !(await onWriteText({
            pick,
            before,
            after,
            sourceBefore: pick.sourceText ?? before,
            inPlace: true,
          }))
        ) {
          releaseRefreshSkip();
          showToast({
            tone: "error",
            text: t("playableWorkbench.errorSaveButtonText"),
          });
          return false;
        }
        return true;
      } catch (cause) {
        releaseRefreshSkip();
        showToast({
          tone: "error",
          text: `${t("playableWorkbench.errorSaveButtonText")}: ${errorMessage(cause)}`,
        });
        return false;
      }
    },
    [onWriteText, reserveRuntimeRefreshSkip, showToast],
  );

  const onInteractionSelect = useCallback(
    (selection: PlayableInteractionSelection, additive: boolean) => {
      const key = playablePickKey(selection.pick);
      setInteractionSelections((current) => {
        if (!additive) return [selection];
        const existing = current.some(
          (item) => playablePickKey(item.pick) === key,
        );
        return existing
          ? current.filter((item) => playablePickKey(item.pick) !== key)
          : [...current, selection];
      });
    },
    [],
  );

  const onInteractionTiming = useCallback(
    async (
      property: "appear" | "disappear" | "both",
      seconds: number | undefined,
      disappearAtSeconds?: number,
    ): Promise<boolean> => {
      const value =
        seconds === undefined ? undefined : Math.round(seconds * 10) / 10;
      if (
        !interactionSelections.length ||
        (value !== undefined &&
          (!Number.isFinite(value) || value < 0 || value > 3600))
      )
        return false;
      const edits = interactionSelections.map((selection) => {
        const delaySeconds =
          property === "appear" || property === "both"
            ? value!
            : selection.delaySeconds;
        const endSeconds =
          property === "both"
            ? disappearAtSeconds
            : property === "disappear"
              ? value
              : selection.endSeconds;
        return { ...selection, delaySeconds, endSeconds };
      });
      if (interactionTimingEditsAreUnchanged(interactionSelections, edits))
        return true;
      if (
        edits.some(
          ({ delaySeconds, endSeconds }) =>
            endSeconds !== undefined && endSeconds <= delaySeconds,
        )
      ) {
        showToast({
          tone: "error",
          text: t("playableWorkbench.errorTimingOrder"),
        });
        return false;
      }
      const releaseRefreshSkip = reserveRuntimeRefreshSkip();
      try {
        if (!(await onWriteInteractionTimings(edits))) {
          releaseRefreshSkip();
          showToast({
            tone: "error",
            text: t("playableWorkbench.errorPartialTiming"),
          });
          return false;
        }
        setInteractionSelections((current) =>
          current.map((selection) => {
            const updated = edits.find(
              (edit) =>
                playablePickKey(edit.pick) === playablePickKey(selection.pick),
            );
            return updated ?? selection;
          }),
        );
        setAppearanceTimingCommand({
          sequence: ++appearanceTimingSequence.current,
          updates: edits.map((selection) => ({
            pick: selection.pick,
            delaySeconds: selection.delaySeconds,
            ...(selection.endSeconds === undefined
              ? {}
              : { endSeconds: selection.endSeconds }),
          })),
        });
        return true;
      } catch (cause) {
        releaseRefreshSkip();
        showToast({
          tone: "error",
          text: `无法保存时间设置：${errorMessage(cause)}`,
        });
        return false;
      }
    },
    [
      interactionSelections,
      onWriteInteractionTimings,
      reserveRuntimeRefreshSkip,
      showToast,
    ],
  );

  const onApplyMotion = useCallback(
    async (
      config: PlayableMotionConfig,
      applyButtonPreset = false,
      buttonText?: string,
      buttonAssetScaleX?: number,
      buttonAssetScaleY?: number,
    ) => {
      const pick = picks.at(-1);
      if (!pick) return;
      if (!pick.source) {
        showToast({ tone: "error", text: t("playableWorkbench.errorMotionEdit") });
        return;
      }
      try {
        let appliedPick =
          pick.tag === "button" &&
          buttonAssetScaleX !== undefined &&
          buttonAssetScaleY !== undefined
            ? {
                ...pick,
                buttonAssetScaleX,
                buttonAssetScaleY,
              }
            : pick;
        let normalAssetTransfer:
          | { contentType: string; bytes: ArrayBuffer }
          | undefined;
        let pressedAssetTransfer:
          | { contentType: string; bytes: ArrayBuffer }
          | undefined;
        if (pick.tag === "button" && pendingButtonNormalAsset) {
          const assetId = await withPlayablePreviewRefreshSkip(
            skipNextRuntimeRefresh,
            () =>
              onReplaceButtonAsset(
                pick,
                pendingButtonNormalAsset,
              ),
            Boolean,
          );
          if (!assetId)
            throw new Error("Could not save the normal-state image.");
          const blob = await getLibraryAsset(
            pendingButtonNormalAsset.source.kind === "library"
              ? pendingButtonNormalAsset.source.assetId
              : pendingButtonNormalAsset.name,
          );
          normalAssetTransfer = {
            contentType: blob.type || "application/octet-stream",
            bytes: await blob.arrayBuffer(),
          };
          appliedPick = {
            ...appliedPick,
            buttonAssetId: assetId,
          };
        }
        if (pick.tag === "button" && pendingButtonPressedAsset) {
          const assetId = await withPlayablePreviewRefreshSkip(
            skipNextRuntimeRefresh,
            () =>
              onSetButtonPressedAsset(
                appliedPick,
                pendingButtonPressedAsset,
              ),
            Boolean,
          );
          if (!assetId)
            throw new Error("Could not save the pressed-state image.");
          const blob = await getLibraryAsset(
            pendingButtonPressedAsset.source.kind === "library"
              ? pendingButtonPressedAsset.source.assetId
              : pendingButtonPressedAsset.name,
          );
          pressedAssetTransfer = {
            contentType: blob.type || "application/octet-stream",
            bytes: await blob.arrayBuffer(),
          };
          appliedPick = { ...appliedPick, buttonPressedAssetId: assetId };
        }
        const motionWritten = await withPlayablePreviewRefreshSkip(
          skipNextRuntimeRefresh,
          () =>
            onWriteMotion(
              appliedPick,
              config,
              undefined,
              applyButtonPreset,
            ),
          Boolean,
        );
        if (!motionWritten) {
          showToast({ tone: "error", text: t("playableWorkbench.errorMotionEdit") });
          return;
        }
        setPicks((current) =>
          current.map((item) =>
            playablePickKey(item) === playablePickKey(appliedPick)
              ? { ...appliedPick, motion: config }
              : item,
          ),
        );
        setInteractionSelections((current) =>
          current.map((item) =>
            playablePickKey(item.pick) === playablePickKey(appliedPick)
              ? {
                  ...item,
                  pick: { ...appliedPick, motion: config },
                }
              : item,
          ),
        );
        setPendingButtonNormalAsset(undefined);
        setPendingButtonPressedAsset(undefined);
        setMotionCommand({
            sequence: ++motionSequence.current,
            target: { kind: "element", pick: appliedPick },
            config,
            ...(buttonText !== undefined ? { buttonText } : {}),
            ...(appliedPick.buttonAssetId
              ? {
                  assetId: appliedPick.buttonAssetId,
                  assetScaleX: appliedPick.buttonAssetScaleX ?? 100,
                  assetScaleY: appliedPick.buttonAssetScaleY ?? 100,
                }
              : {}),
            ...(appliedPick.buttonPressedAssetId
              ? { pressedAssetId: appliedPick.buttonPressedAssetId }
              : {}),
            ...(normalAssetTransfer ? { asset: normalAssetTransfer } : {}),
            ...(pressedAssetTransfer
              ? { pressedAsset: pressedAssetTransfer }
              : {}),
            ...(config.ringAssetId && motionRingAsset?.id === config.ringAssetId
              ? { ringAsset: motionRingAsset.transfer }
              : {}),
            ...(config.barAssetId && motionBarAsset?.id === config.barAssetId
              ? { barAsset: motionBarAsset.transfer }
              : {}),
            ...(config.swipeAssetId &&
            motionSwipeAsset?.id === config.swipeAssetId
              ? { swipeAsset: motionSwipeAsset.transfer }
              : {}),
          });
        if (config.feedback === "idle-pulse-hover-press") setTool("play");
      } catch (cause) {
        showToast({
          tone: "error",
          text: `${t("playableWorkbench.errorMotionEdit")}: ${errorMessage(cause)}`,
        });
      }
    },
    [
      motionRingAsset,
      motionBarAsset,
      motionSwipeAsset,
      pendingButtonNormalAsset,
      pendingButtonPressedAsset,
      onReplaceButtonAsset,
      onSetButtonPressedAsset,
      onWriteMotion,
      picks,
      skipNextRuntimeRefresh,
      showToast,
    ],
  );

  const onReplaceSelectedButton = useCallback(
    async (asset: PlayableAssetRequest) => {
      const pick = picks.at(-1);
      if (pick?.tag !== "button" || !pick.source || asset.type !== "image") {
        showToast({ tone: "error", text: t("playableWorkbench.selectButtonBeforeReplace") });
        return;
      }
      setPendingButtonNormalAsset(asset);
    },
    [picks, showToast],
  );

  const onSetSelectedButtonPressedAsset = useCallback(
    async (asset: PlayableAssetRequest) => {
      const pick = picks.at(-1);
      if (pick?.tag !== "button" || !pick.source || asset.type !== "image") {
        showToast({
          tone: "error",
          text: t("playableWorkbench.selectButtonBeforePressed"),
        });
        return;
      }
      setPendingButtonPressedAsset(asset);
    },
    [picks, showToast],
  );

  const setSelectedButtonSignal = useCallback(
    async (pick: PlayablePickResult, signalId: string): Promise<boolean> => {
      const releaseRefreshSkip = reserveRuntimeRefreshSkip();
      try {
        if (!(await onWriteButtonSignal(pick, signalId))) {
          releaseRefreshSkip();
          showToast({ tone: "error", text: "Could not update the button output." });
          return false;
        }
        const motion =
          pick.motion &&
          (pick.motion.kind !== "button-feedback" ||
            pick.motion.interaction === "multi-click")
            ? { ...pick.motion, signal: signalId }
            : pick.motion;
        const updatedPick = { ...pick, signal: signalId, motion };
        setPicks((current) =>
          current.map((item) =>
            playablePickKey(item) === playablePickKey(pick)
              ? updatedPick
              : item,
          ),
        );
        setInteractionSelections((current) =>
          current.map((item) =>
            playablePickKey(item.pick) === playablePickKey(pick)
              ? { ...item, pick: updatedPick }
              : item,
          ),
        );
        setMotionCommand({
          sequence: ++motionSequence.current,
          target: { kind: "element", pick },
          buttonSignal: signalId,
          ...(motion ? { config: motion } : {}),
          ...(pick.buttonAssetId
            ? {
                assetId: pick.buttonAssetId,
                assetScaleX: pick.buttonAssetScaleX ?? 100,
                assetScaleY: pick.buttonAssetScaleY ?? 100,
              }
            : {}),
          ...(pick.buttonPressedAssetId
            ? { pressedAssetId: pick.buttonPressedAssetId }
            : {}),
        });
        return true;
      } catch {
        releaseRefreshSkip();
        showToast({ tone: "error", text: "Could not update the button output." });
        return false;
      }
    },
    [onWriteButtonSignal, reserveRuntimeRefreshSkip, showToast],
  );

  const editButtonSignalLabel = useCallback(
    async (
      pick: PlayablePickResult,
      signalId: string,
      label: string,
    ): Promise<boolean> => {
      const releaseRefreshSkip = reserveRuntimeRefreshSkip();
      try {
        if (!(await onWriteButtonSignalLabel(pick, signalId, label))) {
          releaseRefreshSkip();
          showToast({
            tone: "error",
            text: t("playableWorkbench.errorSaveButtonExit"),
          });
          return false;
        }
        return true;
      } catch (cause) {
        releaseRefreshSkip();
        showToast({
          tone: "error",
          text: `${t("playableWorkbench.errorSaveButtonExit")}: ${errorMessage(cause)}`,
        });
        return false;
      }
    },
    [onWriteButtonSignalLabel, reserveRuntimeRefreshSkip, showToast],
  );

  const createSharedAnswerOutputs = useCallback(async () => {
    const releaseRefreshSkip = reserveRuntimeRefreshSkip();
    try {
      const created = await onCreateSharedAnswerSignals(node.id);
      if (!created) releaseRefreshSkip();
      return created;
    } catch (cause) {
      releaseRefreshSkip();
      throw cause;
    }
  }, [node.id, onCreateSharedAnswerSignals, reserveRuntimeRefreshSkip]);

  const deleteSharedAnswerOutputs = useCallback(async () => {
    const releaseRefreshSkip = reserveRuntimeRefreshSkip();
    try {
      const deleted = await onDeleteSharedAnswerSignals(node.id);
      if (!deleted) releaseRefreshSkip();
      return deleted;
    } catch (cause) {
      releaseRefreshSkip();
      throw cause;
    }
  }, [node.id, onDeleteSharedAnswerSignals, reserveRuntimeRefreshSkip]);

  const addButtonPreset = useCallback(
    async (
      config?: PlayableMotionConfig,
      assetId?: string,
      reuseExistingSignals = false,
      buttonSignal?: string,
      pressedAssetId?: string,
      buttonText?: string,
      fontFamily?: string,
      buttonAction?: PlayableButtonAction,
    ) => {
    const releaseRefreshSkip = reserveRuntimeRefreshSkip();
    try {
      const preset = await onAddButtonPreset(
        config,
        assetId,
        reuseExistingSignals,
        buttonSignal,
        pressedAssetId,
        buttonText,
        fontFamily,
        buttonAction,
      );
      if (!preset) {
        releaseRefreshSkip();
        showToast({ tone: "error", text: t("playableWorkbench.errorAddButtonPreset") });
        return;
      }
      setMediaCommand({
        command: "insert-button-preset",
        nodeId: node.id,
        ...preset,
        ...(buttonText !== undefined ? { buttonText } : {}),
        ...(buttonAction ? { buttonAction } : {}),
        ...(fontFamily ? { fontFamily } : {}),
        ...(assetId ? { assetId } : {}),
        ...(assetId && motionBaseAsset?.id === assetId
          ? { asset: motionBaseAsset.transfer }
          : {}),
        ...(pressedAssetId ? { pressedAssetId } : {}),
        ...(pressedAssetId && motionPressedAsset?.id === pressedAssetId
          ? { pressedAsset: motionPressedAsset.transfer }
          : {}),
        ...(config
          ? {
              motion: {
                ...config,
                ...(config.kind === "button-feedback"
                  ? {}
                  : {
                      signal: preset.signal,
                      ...(preset.timeoutSignal
                        ? { timeoutSignal: preset.timeoutSignal }
                        : {}),
                    }),
              },
              ...(config.ringAssetId &&
              motionRingAsset?.id === config.ringAssetId
                ? { ringAsset: motionRingAsset.transfer }
                : {}),
              ...(config.barAssetId &&
              motionBarAsset?.id === config.barAssetId
                ? { barAsset: motionBarAsset.transfer }
                : {}),
              ...(config.swipeAssetId &&
              motionSwipeAsset?.id === config.swipeAssetId
                ? { swipeAsset: motionSwipeAsset.transfer }
                : {}),
            }
          : {}),
      });
      setTool(
        config?.feedback === "idle-pulse-hover-press" ? "play" : "select",
      );
      showToast({
        tone: "info",
        text: config
          ? "Complete button added; replace the base or progress image as needed"
          : t("playableWorkbench.buttonAdded"),
      });
    } catch (cause) {
      releaseRefreshSkip();
      showToast({
        tone: "error",
        text: `${t("playableWorkbench.errorAddButtonPreset")}: ${errorMessage(cause)}`,
      });
    }
    },
    [
      motionBaseAsset,
      motionPressedAsset,
      motionBarAsset,
      motionSwipeAsset,
      motionRingAsset,
      node.id,
      onAddButtonPreset,
      reserveRuntimeRefreshSkip,
      showToast,
    ],
  );

  const previewElementScale = useCallback(
    (pick: PlayablePickResult, scale: number) => {
      if (!pick.source) return;
      setMediaCommand({
        command: "element-scale-preview",
        nodeId: pick.nodeId,
        cssPath: pick.cssPath,
        source: pick.source,
        scale,
      });
    },
    [],
  );

  const commitElementScale = useCallback(
    async (pick: PlayablePickResult, scale: number): Promise<boolean> => {
      const releaseRefreshSkip = reserveRuntimeRefreshSkip();
      try {
        const saved = await onWriteTransform({
          pick,
          inPlace: Boolean(pick.source),
          transform: {
            scale,
            rotation: pick.transformRotation ?? 0,
            originX: pick.transformOriginX ?? 50,
            originY: pick.transformOriginY ?? 50,
          },
        });
        if (!saved) {
          releaseRefreshSkip();
          showToast({
            tone: "error",
            text: t("playableWorkbench.errorTransform"),
          });
          return false;
        }
        setPicks((current) =>
          current.map((item) =>
            playablePickKey(item) === playablePickKey(pick)
              ? { ...item, transformScale: scale }
              : item,
          ),
        );
        setInteractionSelections((current) =>
          current.map((item) =>
            playablePickKey(item.pick) === playablePickKey(pick)
              ? {
                  ...item,
                  pick: { ...item.pick, transformScale: scale },
                }
              : item,
          ),
        );
        return true;
      } catch (cause) {
        releaseRefreshSkip();
        showToast({
          tone: "error",
          text: `无法保存缩放：${errorMessage(cause)}`,
        });
        return false;
      }
    },
    [onWriteTransform, reserveRuntimeRefreshSkip, showToast],
  );

  const previewMotionBarScale = useCallback(
    (
      scale: number,
      offsetX: number,
      offsetY: number,
      circular?: boolean,
      barLayer?: "bottom" | "top",
    ) => {
      const pick = picks.at(-1);
      if (!pick?.source) return;
      motionBarPlacement.current = {
        cssPath: pick.cssPath,
        scale,
        offsetX,
        offsetY,
        circular: circular ?? pick.motion?.buttonShape === "circle",
        barLayer: barLayer ?? pick.motion?.barLayer ?? "top",
      };
      if (!motionBarAsset) return;
      setMediaCommand({
        command: "motion-progress-preview",
        nodeId: pick.nodeId,
        cssPath: pick.cssPath,
        source: pick.source,
        scale,
        offsetX,
        offsetY,
        circular: motionBarPlacement.current.circular,
        barLayer: motionBarPlacement.current.barLayer,
        asset: {
          ...motionBarAsset.transfer,
          bytes: motionBarAsset.transfer.bytes.slice(0),
        },
      });
    },
    [motionBarAsset, picks],
  );

  const commitButtonAssetScale = useCallback(
    async (
      pick: PlayablePickResult,
      scaleX: number,
      scaleY: number,
    ): Promise<boolean> => {
      const releaseRefreshSkip = reserveRuntimeRefreshSkip();
      try {
        if (!(await onWriteButtonAssetScale(pick, scaleX, scaleY))) {
          releaseRefreshSkip();
          showToast({
            tone: "error",
            text: t("playableWorkbench.errorButtonBackgroundScale"),
          });
          return false;
        }
        setPicks((current) =>
          current.map((item) =>
            playablePickKey(item) === playablePickKey(pick)
              ? {
                  ...item,
                  buttonAssetScaleX: scaleX,
                  buttonAssetScaleY: scaleY,
                }
              : item,
          ),
        );
        return true;
      } catch (cause) {
        releaseRefreshSkip();
        showToast({
          tone: "error",
          text: `${t("playableWorkbench.errorButtonBackgroundScale")}: ${errorMessage(cause)}`,
        });
        return false;
      }
    },
    [onWriteButtonAssetScale, reserveRuntimeRefreshSkip, showToast],
  );

  const onMove = useCallback(
    (move: PlayableMove) => {
      moveWriteQueue.current = moveWriteQueue.current.then(async () => {
        if (move.inPlace) {
          const releaseRefreshSkip = reserveRuntimeRefreshSkip();
          try {
            if (await onWriteMove(move)) return;
            releaseRefreshSkip();
          } catch (cause) {
            releaseRefreshSkip();
            return showToast({
              tone: "error",
              text: `Could not move it: ${errorMessage(cause)}`,
            });
          }
        }
        const excerpt = move.pick.text ? ` "${move.pick.text}"` : "";
        await askAgent(
          playableMoveRequest(move.translate),
          [playableElementContext(move.pick)],
          `Moving <${move.pick.tag}>${excerpt}`,
        );
      }).catch(() => {});
    },
    [askAgent, onWriteMove, reserveRuntimeRefreshSkip, showToast],
  );

  const onTransform = useCallback(
    (edit: PlayableTransformEdit) => {
      void (async () => {
        const releaseRefreshSkip = reserveRuntimeRefreshSkip();
        try {
          if (!edit.inPlace) {
            releaseRefreshSkip();
            showToast({ tone: "error", text: t("playableWorkbench.errorTransform") });
            return;
          }
          if (await onWriteTransform(edit)) return;
          releaseRefreshSkip();
          showToast({ tone: "error", text: t("playableWorkbench.errorTransform") });
        } catch (cause) {
          releaseRefreshSkip();
          showToast({
            tone: "error",
            text: `无法保存缩放或旋转：${errorMessage(cause)}`,
          });
        }
      })();
    },
    [onWriteTransform, reserveRuntimeRefreshSkip, showToast],
  );

  const onDelete = useCallback(
    (edit: PlayableDeleteEdit) => {
      void (async () => {
        let releaseRefreshSkip: (() => void) | undefined;
        try {
          if (!edit.inPlace) {
            showToast({ tone: "error", text: t("playableWorkbench.errorDeleteElement") });
            return;
          }
          releaseRefreshSkip = reserveRuntimeRefreshSkip();
          if (await onWriteDelete(edit)) {
            setPicks((current) =>
              current.filter(
                (pick) => playablePickKey(pick) !== playablePickKey(edit.pick),
              ),
            );
            setInteractionSelections((current) =>
              current.filter(
                (selection) =>
                  playablePickKey(selection.pick) !==
                  playablePickKey(edit.pick),
              ),
            );
            return;
          }
          releaseRefreshSkip();
          showToast({ tone: "error", text: t("playableWorkbench.errorDeleteElement") });
        } catch (cause) {
          releaseRefreshSkip?.();
          showToast({
            tone: "error",
            text: `无法删除元素：${errorMessage(cause)}`,
          });
        }
      })();
    },
    [onWriteDelete, reserveRuntimeRefreshSkip, showToast],
  );

  const deleteSelected = useCallback(() => {
    if (!picks.length) return;
    const selected = [...picks].sort((first, second) => {
      const firstLocation = first.source
        ? parsePlayableSourceLocation(first.source)
        : undefined;
      const secondLocation = second.source
        ? parsePlayableSourceLocation(second.source)
        : undefined;
      return (
        (secondLocation?.line ?? 0) - (firstLocation?.line ?? 0) ||
        (secondLocation?.column ?? 0) - (firstLocation?.column ?? 0) ||
        Number(second.part === "button-label") -
          Number(first.part === "button-label")
      );
    });
    void (async () => {
      const deleted: PlayablePickResult[] = [];
      for (const pick of selected) {
        const releaseRefreshSkip = reserveRuntimeRefreshSkip();
        try {
          const written = await onWriteDelete({
            pick,
            ...(pick.part ? { part: pick.part } : {}),
            inPlace: true,
          });
          if (written) deleted.push(pick);
          else releaseRefreshSkip();
        } catch {
          releaseRefreshSkip();
        }
      }
      if (deleted.length) {
        const deletedKeys = new Set(deleted.map(playablePickKey));
        setDeleteCommand({
          sequence: ++deleteSequence.current,
          picks: deleted,
        });
        setPicks((current) =>
          current.filter(
            (candidate) => !deletedKeys.has(playablePickKey(candidate)),
          ),
        );
        setInteractionSelections((current) =>
          current.filter(
            (selection) => !deletedKeys.has(playablePickKey(selection.pick)),
          ),
        );
      }
      if (deleted.length !== selected.length)
        showToast({
          tone: "error",
          text: deleted.length
            ? "Some selected items could not be deleted directly."
            : "Selected items could not be deleted directly.",
        });
    })();
  }, [onWriteDelete, picks, reserveRuntimeRefreshSkip, showToast]);

  const confirmSettingsButtonIcon = async () => {
    const pending = pendingSettingsButtonIcon;
    if (!pending || pending.committed || settingsButtonIconApplying) return;
    setSettingsButtonIconApplying(true);
    try {
      const assetId = await onSetSettingsButtonIcon(pending.asset);
      if (!assetId) {
        showToast({
          tone: "error",
          text: t("playableWorkbench.errorSettingsButtonIcon"),
        });
        return;
      }
      setPendingSettingsButtonIcon((current) =>
        current?.asset === pending.asset
          ? { ...current, committed: true, assetId }
          : current,
      );
    } catch (cause) {
      showToast({
        tone: "error",
        text: `${t("playableWorkbench.errorSettingsButtonIcon")}: ${errorMessage(cause)}`,
      });
    } finally {
      setSettingsButtonIconApplying(false);
    }
  };

  const confirmReturnButtonIcon = async () => {
    const pending = pendingReturnButtonIcon;
    if (!pending || pending.committed || returnButtonIconApplying) return;
    setReturnButtonIconApplying(true);
    try {
      const assetId = await onSetReturnButtonIcon(pending.asset);
      if (!assetId) {
        showToast({
          tone: "error",
          text: t("playableWorkbench.errorReturnButtonIcon"),
        });
        return;
      }
      setPendingReturnButtonIcon((current) =>
        current?.asset === pending.asset
          ? { ...current, committed: true, assetId }
          : current,
      );
    } catch (cause) {
      showToast({
        tone: "error",
        text: `${t("playableWorkbench.errorReturnButtonIcon")}: ${errorMessage(cause)}`,
      });
    } finally {
      setReturnButtonIconApplying(false);
    }
  };

  const removeButtonSound = async () => {
    try {
      await onRemoveButtonSound();
    } catch (cause) {
      showToast({
        tone: "error",
        text: `${t("playableWorkbench.errorButtonSound")}: ${errorMessage(cause)}`,
      });
    }
  };

  /**
   * As background, the editor sets the Scene's background. Otherwise the
   * media goes into the chat, declared on the Scene, for the message to say
   * where it goes.
   */
  const addMedia = useCallback(
    async (asset: PlayableAssetRequest, target: MediaTarget) => {
      try {
        if (target === "button-sound") {
          if (asset.type !== "audio") return;
          await onSetButtonSound(asset);
          return;
        }
        if (target === "settings-button") {
          if (asset.type !== "image") return;
          const requestId = ++settingsButtonIconRequest.current;
          const blob = await getLibraryAsset(
            asset.source.kind === "library"
              ? asset.source.assetId
              : asset.name,
          );
          if (requestId !== settingsButtonIconRequest.current) return;
          setPendingSettingsButtonIcon({ asset, blob, committed: false });
          return;
        }
        if (target === "return-button") {
          if (asset.type !== "image") return;
          const requestId = ++returnButtonIconRequest.current;
          const blob = await getLibraryAsset(
            asset.source.kind === "library"
              ? asset.source.assetId
              : asset.name,
          );
          if (requestId !== returnButtonIconRequest.current) return;
          setPendingReturnButtonIcon({ asset, blob, committed: false });
          return;
        }
        if (target === "motion-ring") {
          if (asset.type !== "image") return;
          const id = await onAddAsset(asset);
          const blob = await getLibraryAsset(
            asset.source.kind === "library" ? asset.source.assetId : asset.name,
          );
          setMotionRingAsset({
            id,
            transfer: {
              contentType: blob.type || "application/octet-stream",
              bytes: await blob.arrayBuffer(),
            },
          });
          return;
        }
        if (target === "motion-bar") {
          if (asset.type !== "image") return;
          const id = await onAddAsset(asset);
          const blob = await getLibraryAsset(
            asset.source.kind === "library" ? asset.source.assetId : asset.name,
          );
          const bytes = await blob.arrayBuffer();
          const transfer = {
            contentType: blob.type || "application/octet-stream",
            bytes,
          };
          setMotionBarAsset({
            id,
            transfer,
          });
          const pick = picks.at(-1);
          const placement =
            pick && motionBarPlacement.current?.cssPath === pick.cssPath
              ? motionBarPlacement.current
              : undefined;
          if (pick?.source)
            setMediaCommand({
              command: "motion-progress-preview",
              nodeId: pick.nodeId,
              cssPath: pick.cssPath,
              source: pick.source,
              scale: placement?.scale ?? pick.motion?.barAssetScale ?? 100,
              offsetX: placement?.offsetX ?? pick.motion?.barAssetOffsetX ?? 0,
              offsetY: placement?.offsetY ?? pick.motion?.barAssetOffsetY ?? 0,
              circular:
                placement?.circular ?? pick.motion?.buttonShape === "circle",
              barLayer: placement?.barLayer ?? pick.motion?.barLayer ?? "top",
              asset: { ...transfer, bytes: bytes.slice(0) },
            });
          return;
        }
        if (target === "motion-swipe") {
          if (asset.type !== "image") return;
          const id = await onAddAsset(asset);
          const blob = await getLibraryAsset(
            asset.source.kind === "library" ? asset.source.assetId : asset.name,
          );
          setMotionSwipeAsset({
            id,
            transfer: {
              contentType: blob.type || "application/octet-stream",
              bytes: await blob.arrayBuffer(),
            },
          });
          return;
        }
        if (target === "motion-base") {
          if (asset.type !== "image") return;
          const selectedButton = picks.at(-1);
          if (selectedButton?.tag === "button") {
            await onReplaceSelectedButton(asset);
            return;
          }
          const id = await onAddAsset(asset);
          const blob = await getLibraryAsset(
            asset.source.kind === "library" ? asset.source.assetId : asset.name,
          );
          setMotionBaseAsset({
            id,
            transfer: {
              contentType: blob.type || "application/octet-stream",
              bytes: await blob.arrayBuffer(),
            },
          });
          return;
        }
        if (target === "motion-pressed") {
          if (asset.type !== "image") return;
          const id = await onAddAsset(asset);
          const blob = await getLibraryAsset(
            asset.source.kind === "library" ? asset.source.assetId : asset.name,
          );
          setMotionPressedAsset({
            id,
            transfer: {
              contentType: blob.type || "application/octet-stream",
              bytes: await blob.arrayBuffer(),
            },
          });
          return;
        }
        if (target === "button") {
          await onReplaceSelectedButton(asset);
          return;
        }
        if (target === "button-pressed") {
          await onSetSelectedButtonPressedAsset(asset);
          return;
        }
        if (target === "canvas") {
          if (asset.type !== "image" && asset.type !== "video") return;
          const releaseRefreshSkip = reserveRuntimeRefreshSkip();
          try {
            const inserted = await onInsertMediaAsset(
              asset,
              pictureInPictureVideoLoop,
            );
            if (!inserted) {
              releaseRefreshSkip();
              showToast({ tone: "error", text: t("playableWorkbench.errorAddAssetToCanvas") });
              return;
            }
            const blob = await getLibraryAsset(
              asset.source.kind === "library"
                ? asset.source.assetId
                : asset.name,
            );
            setMediaCommand({
              command: "insert-media",
              nodeId: node.id,
              source: inserted.source,
              assetId: inserted.assetId,
              type: asset.type,
              asset: {
                contentType: blob.type || "application/octet-stream",
                bytes: await blob.arrayBuffer(),
              },
              loop: pictureInPictureVideoLoop,
            });
            return;
          } catch (cause) {
            releaseRefreshSkip();
            showToast({
              tone: "error",
              text: `无法添加素材：${errorMessage(cause)}`,
            });
            return;
          }
        }
        if (target === "backdrop" && onSetBackdrop) {
          if (asset.type !== "image" && asset.type !== "video") return;
          const blob = await getLibraryAsset(
            asset.source.kind === "library"
              ? asset.source.assetId
              : asset.name,
          );
          const releaseRefreshSkip = reserveRuntimeRefreshSkip();
          try {
            const assetId = await onSetBackdrop(asset);
            if (!assetId) {
              releaseRefreshSkip();
              return;
            }
            setMediaCommand({
              command: "set-backdrop",
              nodeId: node.id,
              sequence: ++backdropUpdateSequence.current,
              asset: {
                assetId,
                type: asset.type,
                transfer: {
                  contentType: blob.type || "application/octet-stream",
                  bytes: await blob.arrayBuffer(),
                },
                loop: backdropLoop,
              },
            });
            setPicks((current) =>
              current.filter((pick) => pick.mediaSlot !== "backdrop"),
            );
            return;
          } catch (cause) {
            releaseRefreshSkip();
            throw cause;
          }
        }
        const assetId = await onAddAsset(asset);
        if (asset.type !== "image" && asset.type !== "video") return;
        const type = asset.type;
        setMedia((current) => [
          ...current.filter((item) => item.assetId !== assetId),
          { assetId, name: asset.name, type },
        ]);
      } catch (cause) {
        showToast({
          tone: "error",
          text: `Could not add ${asset.name}: ${errorMessage(cause)}`,
        });
      }
    },
    [
      node.id,
      onAddAsset,
      onSetButtonSound,
      onInsertMediaAsset,
      backdropLoop,
      pictureInPictureVideoLoop,
      onReplaceSelectedButton,
      onSetBackdrop,
      onSetSelectedButtonPressedAsset,
      picks,
      reserveRuntimeRefreshSkip,
      showToast,
    ],
  );

  const removeBackdrop = useCallback(async () => {
    const releaseRefreshSkip = reserveRuntimeRefreshSkip();
    try {
      if (!onRemoveBackdrop || !(await onRemoveBackdrop())) {
        releaseRefreshSkip();
        return showToast({
          tone: "error",
          text: t("sceneWorkbench.noBackground"),
        });
      }
      setMediaCommand({
        command: "set-backdrop",
        nodeId: node.id,
        sequence: ++backdropUpdateSequence.current,
      });
      setPicks((current) =>
        current.filter((pick) => pick.mediaSlot !== "backdrop"),
      );
    } catch (cause) {
      releaseRefreshSkip();
      showToast({
        tone: "error",
        text: `Could not remove the background: ${errorMessage(cause)}`,
      });
    }
  }, [node.id, onRemoveBackdrop, reserveRuntimeRefreshSkip, showToast]);

  const writeBackdropLoop = useCallback(
    async (loop: boolean) => {
      const releaseRefreshSkip = reserveRuntimeRefreshSkip();
      try {
        if (!(await onWriteBackdropLoop(loop))) {
          releaseRefreshSkip();
          showToast({
            tone: "error",
            text: t("playableWorkbench.errorBackgroundPlayback"),
          });
          return;
        }
        setMediaCommand({ command: "backdrop-loop", loop });
      } catch (cause) {
        releaseRefreshSkip();
        showToast({
          tone: "error",
          text: `${t("playableWorkbench.errorBackgroundPlayback")}: ${errorMessage(cause)}`,
        });
      }
    },
    [onWriteBackdropLoop, reserveRuntimeRefreshSkip, showToast],
  );

  const writePictureInPictureVideoLoop = useCallback(
    async (loop: boolean) => {
      const releaseRefreshSkip = reserveRuntimeRefreshSkip();
      try {
        if (!(await onWritePictureInPictureVideoLoop(loop))) {
          releaseRefreshSkip();
          showToast({
            tone: "error",
            text: "Could not save picture-in-picture video playback",
          });
          return;
        }
        setMediaCommand({
          command: "picture-in-picture-video-loop",
          nodeId: node.id,
          loop,
        });
      } catch (cause) {
        releaseRefreshSkip();
        showToast({
          tone: "error",
          text: `Could not save picture-in-picture video playback: ${errorMessage(cause)}`,
        });
      }
    },
    [
      node.id,
      onWritePictureInPictureVideoLoop,
      reserveRuntimeRefreshSkip,
      showToast,
    ],
  );

  const writeNoInputMode = useCallback(
    async (mode: PlayableNoInputMode) => {
      const releaseRefreshSkip = reserveRuntimeRefreshSkip();
      try {
        if (!(await onWriteNoInputMode(mode))) {
          releaseRefreshSkip();
          showToast({
            tone: "error",
            text: "Could not save the no-input behavior",
          });
          return;
        }
        setMediaCommand({
          command: "no-input-mode",
          nodeId: node.id,
          mode,
        });
      } catch {
        releaseRefreshSkip();
        showToast({
          tone: "error",
          text: "Could not save the no-input behavior",
        });
      }
    },
    [node.id, onWriteNoInputMode, reserveRuntimeRefreshSkip, showToast],
  );

  const preview: PlayablePreviewOptions = {
    policy: "report",
    startNodeId: node.id,
  };
  const nodeIssues = issues.filter(
    (issue) =>
      issue.surfaceId === node.id ||
      issue.path.startsWith(`nodes/${node.id}/`) ||
      Object.values(node.source).includes(issue.path),
  );
  const errors = previewErrors(
    graph,
    node,
    nodeIssues,
    runtime.error,
    snapshot,
    diagnostics,
  );
  const ready = Boolean(runtime.definition && runtime.assets);
  const motionSignals = useMemo(
    () =>
      node.signals.filter((signal) =>
        graph.edges.some(
          (edge) =>
            edge.source.nodeId === node.id && edge.source.signal === signal.id,
        ),
      ),
    [graph.edges, node.id, node.signals],
  );
  const canSetBackdrop = Boolean(backdrop && onSetBackdrop);
  const canRemoveBackdrop = Boolean(backdrop === "set" && onRemoveBackdrop);
  const chooser = useMediaChooser(
    (asset, target) => void addMedia(asset, target),
    (text) => showToast({ tone: "error", text }),
  );

  // In the header, where the canvas has Playtest.
  const actions = (
    <div className="story-node-editor-actions">
      <div className="story-node-editor-history">
        <button
          type="button"
          className="icon-button pane-header-action"
          title={t("playableWorkbench.history")}
          aria-label={t("playableWorkbench.history")}
          aria-expanded={historyOpen}
          aria-haspopup="menu"
          onClick={() => setHistoryOpen((current) => !current)}
        >
          <History size={14} />
        </button>
        {historyOpen ? (
          <div className="story-node-editor-history-popover" role="menu">
            <div className="story-node-editor-history-title">{t("playableWorkbench.history")}</div>
            <div className="story-node-editor-history-list">
              {history.length ? (
                history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={item.current ? "is-current" : undefined}
                    disabled={item.current || historyRestoring}
                    onClick={() => {
                      if (item.restoreIndex === undefined) return;
                      setHistoryRestoring(true);
                      void onRestoreHistory(item.restoreIndex)
                        .catch(() => {})
                        .finally(() => {
                          setHistoryRestoring(false);
                          setHistoryOpen(false);
                        });
                    }}
                  >
                    <span>{item.label}</span>
                    <time>{formatHistoryTime(item.createdAt)}</time>
                  </button>
                ))
              ) : (
                <p className="story-node-editor-history-empty">{t("playableWorkbench.noHistory")}</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
      {affectionConfig ? (
        <button
          type="button"
          className="icon-button pane-header-action"
          title={translateText("Affection settings")}
          aria-label={translateText("Affection settings")}
          onClick={() => setAffectionOpen(true)}
        >
          <Heart size={14} />
        </button>
      ) : null}
      <button
        type="button"
        className="icon-button pane-header-action"
        title={translateText("Replay from the start with a new game")}
        aria-label={translateText("Replay")}
        disabled={!runtime.definition}
        onClick={() => setSession((current) => current + 1)}
      >
        <RotateCcw size={14} />
      </button>
      {onPlayFromHere ? (
        <button
          type="button"
          className="icon-button pane-header-action"
          data-tooltip={t("playableWorkbench.playFromHere")}
          title={t("playableWorkbench.playFromHere")}
          aria-label={t("playableWorkbench.playFromHere")}
          onClick={() => onPlayFromHere({ nodeId: node.id })}
        >
          <Play size={14} />
        </button>
      ) : null}
    </div>
  );

  const previewPane = (
    <WorkbenchPreview
      ariaLabel={`${node.title} live preview`}
      viewport={graph.viewport}
      stageClassName={`playable-workbench-stage is-tool-${tool}`}
      layout="side-panels"
      pickerOpen={chooser.isOpen}
      pickerNavigation={chooser.navigation}
      stageOverlayHeight={28}
      stageOverlay={
        <div className="playable-preview-stage-overlay has-timeline">
          <PreviewTimeline
            state={mediaState}
            onSeek={(time) => setMediaCommand({ command: "seek", time })}
            onTogglePlay={() => {
              setTool("play");
              setMediaCommand({
                command: mediaState.paused ? "play" : "pause",
              });
            }}
          />
        </div>
      }
      overlay={
        <>
          <PreviewToolbar
            tool={tool}
            disabled={!ready}
            strokes={strokes.length}
            redoStrokes={redoStrokes.length}
            picks={picks.length}
            functionButtonScaleSelection={
              tool === "select" && settingsButtonSelected
                ? {
                    kind: "settings",
                    key: "settings-button",
                    label: t("playableWorkbench.settingsButton"),
                    size:
                      runtime.definition?.graph.settingsButton?.size ??
                      PLAYABLE_FUNCTION_BUTTON_SIZE,
                  }
                : tool === "select" && returnButtonSelected
                  ? {
                      kind: "return",
                      key: "return-button",
                      label: t("playableWorkbench.returnButton"),
                      size:
                        runtime.definition?.graph.returnButton?.size ??
                        PLAYABLE_RETURN_BUTTON_SIZE,
                    }
                  : undefined
            }
            onPreviewFunctionButtonSize={(kind, size) => {
              if (kind === "settings") setSettingsButtonSizePreview(size);
              else setReturnButtonSizePreview(size);
            }}
            onCommitFunctionButtonSize={async (kind, size) => {
              try {
                const saved =
                  kind === "settings"
                    ? await onWriteSettingsButtonSize(size)
                    : await onWriteReturnButtonSize(size);
                if (!saved) {
                  showToast({
                    tone: "error",
                    text: t("playableWorkbench.errorFunctionButtonSize"),
                  });
                } else if (kind === "settings") {
                  setSettingsButtonSizePreview(undefined);
                } else {
                  setReturnButtonSizePreview(undefined);
                }
                return saved;
              } catch (cause) {
                if (kind === "settings")
                  setSettingsButtonSizePreview(undefined);
                else setReturnButtonSizePreview(undefined);
                showToast({
                  tone: "error",
                  text: `${t("playableWorkbench.errorFunctionButtonSize")}: ${errorMessage(cause)}`,
                });
                return false;
              }
            }}
            guides={guides}
            selectedGuideId={selectedGuideId}
            onAddGuide={(axis) => {
              const guide: PlayableAlignmentGuide = {
                id: crypto.randomUUID(),
                axis,
                position: 0.5,
              };
              onGuidesChange([...guides, guide]);
              setSelectedGuideId(guide.id);
            }}
            onRemoveGuide={() => {
              if (!selectedGuideId) return;
              onGuidesChange(guides.filter(({ id }) => id !== selectedGuideId));
              setSelectedGuideId(undefined);
            }}
            onClearGuides={() => {
              onGuidesChange([]);
              setSelectedGuideId(undefined);
            }}
            referencePicks={referencePicks}
            referencePickKey={referencePickKey}
            selectedPicks={picks}
            onToggleReferencePick={toggleReferencePick}
            onReferencePickChange={setReferencePickKey}
            onAlignSelection={alignSelectionToReference}
            textSelection={textSelection}
            interactionSelection={interactionSelection}
            motionSelection={picks.at(-1)}
            onPreviewElementScale={previewElementScale}
            onCommitElementScale={commitElementScale}
            motionRingAssetId={
              motionRingAsset?.id ?? picks.at(-1)?.motion?.ringAssetId
            }
            motionBarAssetId={
              motionBarAsset?.id ?? picks.at(-1)?.motion?.barAssetId
            }
            motionSwipeAssetId={
              motionSwipeAsset?.id ?? picks.at(-1)?.motion?.swipeAssetId
            }
            motionBaseAssetId={
              motionBaseAsset?.id ?? picks.at(-1)?.buttonAssetId
            }
            motionPressedAssetId={
              picks.at(-1)?.tag === "button"
                ? picks.at(-1)?.buttonPressedAssetId
                : motionPressedAsset?.id
            }
            pendingButtonNormalAssetName={pendingButtonNormalAsset?.name}
            pendingButtonPressedAssetName={pendingButtonPressedAsset?.name}
            onChooseMotionRing={() => chooser.choose("motion-ring")}
            onChooseMotionBar={(scale, offsetX, offsetY, circular, barLayer) => {
              const pick = picks.at(-1);
              if (pick)
                motionBarPlacement.current = {
                  cssPath: pick.cssPath,
                  scale,
                  offsetX,
                  offsetY,
                  circular,
                  barLayer,
                };
              chooser.choose("motion-bar");
            }}
            onChooseMotionSwipe={() => chooser.choose("motion-swipe")}
            onChooseMotionBase={() => chooser.choose("motion-base")}
            onChooseButtonNormal={() => chooser.choose("button")}
            onChooseButtonPressed={() =>
              chooser.choose(
                picks.at(-1)?.tag === "button"
                  ? "button-pressed"
                  : "motion-pressed",
              )
            }
            motionSignals={motionSignals}
            fonts={fonts}
            globalFontFamily={graph.globalFontFamily}
            onAddFontDirectory={addFontDirectory}
            onTextStyle={onTextStyle}
            vrEyeReference={vrEyeReference}
            onVrEyeReference={(eye) => {
              setVrEyeReference(eye);
              setMediaCommand({ command: "vr-eye-preview", nodeId: node.id, eye });
            }}
            onEditButtonLabel={editButtonLabel}
            onDeleteSelected={deleteSelected}
            onInteractionTiming={onInteractionTiming}
            onApplyMotion={onApplyMotion}
            onAddButtonPreset={addButtonPreset}
            onCreateSharedAnswerSignals={createSharedAnswerOutputs}
            onDeleteSharedAnswerSignals={deleteSharedAnswerOutputs}
            onWriteButtonSignal={setSelectedButtonSignal}
            onWriteButtonSignalLabel={editButtonSignalLabel}
            buttonSignals={node.signals.map(({ id, label }) => ({
              id,
              label,
            }))}
            onPreviewMotionBarScale={previewMotionBarScale}
            onCommitButtonAssetScale={commitButtonAssetScale}
            onTool={setTool}
            mediaState={mediaState}
            onMediaCommand={setMediaCommand}
            onHistoryCommand={onPreviewHistoryCommand}
            buttonSettings={
              <GameFunctionSettings
                disabled={!ready}
                uploading={chooser.uploading}
                globalFontFamily={graph.globalFontFamily ?? ""}
                fonts={fonts}
                fontDirectoryName={fontDirectoryName}
                onChangeGlobalFontFamily={(family) =>
                  void onWriteGlobalFontFamily(family)
                }
                onScanSystemFonts={scanSystemFonts}
                onAddFontDirectory={addFontDirectory}
                onChooseSettingsButtonIcon={() =>
                  chooser.choose("settings-button")
                }
                settingsButtonIconPending={
                  Boolean(pendingSettingsButtonIcon) &&
                  !pendingSettingsButtonIcon?.committed
                }
                settingsButtonIconApplying={settingsButtonIconApplying}
                onConfirmSettingsButtonIcon={() =>
                  void confirmSettingsButtonIcon()
                }
                returnButtonIconPending={
                  Boolean(pendingReturnButtonIcon) &&
                  !pendingReturnButtonIcon?.committed
                }
                returnButtonIconApplying={returnButtonIconApplying}
                onChooseReturnButtonIcon={() =>
                  chooser.choose("return-button")
                }
                onConfirmReturnButtonIcon={() =>
                  void confirmReturnButtonIcon()
                }
                buttonSoundSelected={Boolean(graph.buttonSoundAssetId)}
                onChooseButtonSound={() => chooser.choose("button-sound")}
                onRemoveButtonSound={() => void removeButtonSound()}
              />
            }
            onPreviewShortcut={(shortcut) =>
              applyPreviewShortcut(shortcut, {
                onTool: setTool,
                onMediaCommand: setMediaCommand,
                paused: mediaState.paused,
              })
            }
            onUndoStroke={undoStroke}
            onRedoStroke={redoStroke}
            onClearStrokes={clearStrokes}
            media={
              <MediaMenu
                disabled={!ready}
                uploading={chooser.uploading}
                canSetBackdrop={canSetBackdrop}
                canRemoveBackdrop={canRemoveBackdrop}
                canSetBackdropLoop={
                  backdrop === "set" && backdropType === "video"
                }
                backdropLoop={backdropLoop}
                pictureInPictureVideoLoop={pictureInPictureVideoLoop}
                noInputMode={noInputMode}
                canEnableVideoEndAutoAdvance={
                  (() => {
                    const outgoing = graph.edges.filter(
                      (edge) => edge.source.nodeId === node.id,
                    );
                    return outgoing.length === 1 &&
                      node.signals.find(
                        (signal) => signal.id === outgoing[0]!.source.signal,
                      )?.role !== "navigation";
                  })()
                }
                videoEndAutoAdvance={videoEndAutoAdvance}
                onChoose={chooser.choose}
                onRemoveBackdrop={() => void removeBackdrop()}
                onBackdropLoopChange={(loop) => void writeBackdropLoop(loop)}
                onPictureInPictureVideoLoopChange={(loop) =>
                  void writePictureInPictureVideoLoop(loop)
                }
                onNoInputModeChange={(mode) =>
                  void writeNoInputMode(mode)
                }
                onVideoEndAutoAdvanceChange={(enabled) =>
                  void onWriteVideoEndAutoAdvance(enabled)
                }
              />
            }
            picker={chooser.elements}
            pickerOpen={chooser.isOpen}
          />
          <PreviewToasts
            errors={errors}
            toasts={toasts}
            onFix={() =>
              void askAgent(
                fixErrorsRequest(node.title, errors),
                [],
                "Fixing the errors",
              )
            }
            onOpenNode={onOpenNode}
            onDismiss={dismissToast}
          />
        </>
      }
    >
      {runtime.definition && runtime.assets ? (
        <NodePlayer
          key={session}
          definition={runtime.definition}
          frameUrl={playableSandboxUrl()}
          assets={runtime.assets}
          onLoadAssets={runtime.loadAssets}
          saveKey={`putenggame:playable:preview:${projectId}`}
          storage={storage}
          preview={preview}
          showGameSettings
          showPauseMenu={tool === "play"}
          showReturnButton={tool !== "play"}
          settingsButtonSelected={settingsButtonSelected}
          settingsButtonSizePreview={settingsButtonSizePreview}
          settingsButtonIconPreview={pendingSettingsButtonIcon?.blob}
          onSelectSettingsButton={onSelectSettingsButton}
          onSettingsButtonPositionChange={async (position) => {
            try {
              const saved = await onWriteSettingsButtonPosition(position);
              if (!saved)
                showToast({
                  tone: "error",
                  text: t("playableWorkbench.errorSettingsButtonPosition"),
                });
              return saved;
            } catch (cause) {
              showToast({
                tone: "error",
                text: `${t("playableWorkbench.errorSettingsButtonPosition")}: ${errorMessage(cause)}`,
              });
              return false;
            }
          }}
          returnButtonSelected={returnButtonSelected}
          returnButtonIconPreview={pendingReturnButtonIcon?.blob}
          returnButtonSizePreview={returnButtonSizePreview}
          onSelectReturnButton={onSelectReturnButton}
          onReturnButtonPositionChange={async (position) => {
            try {
              const saved = await onWriteReturnButtonPosition(position);
              if (!saved)
                showToast({
                  tone: "error",
                  text: t("playableWorkbench.errorReturnButtonPosition"),
                });
              return saved;
            } catch (cause) {
              showToast({
                tone: "error",
                text: `${t("playableWorkbench.errorReturnButtonPosition")}: ${errorMessage(cause)}`,
              });
              return false;
            }
          }}
          preserveMediaState={mediaState}
          backdropEffects={backdropEffects}
          deleteCommand={deleteCommand}
          appearanceTimingCommand={appearanceTimingCommand}
          motionCommand={motionCommand}
          textStyleCommand={textStyleCommand}
          onAppearanceTimingCommandApplied={(sequence) =>
            setAppearanceTimingCommand((current) =>
              current?.sequence === sequence ? undefined : current,
            )
          }
          {...(tool === "select" || tool === "text" || tool === "move"
            ? { tool }
            : {})}
          onPick={onPick}
          onTextEdit={onTextEdit}
          onTextCreate={onTextCreate}
          onTextSelect={onTextSelect}
          onInteractionSelect={onInteractionSelect}
          onMove={onMove}
          onTransform={onTransform}
          onDelete={onDelete}
          onDeleteSelected={deleteSelected}
          onPasteElements={onPasteElements}
          onHistoryCommand={onPreviewHistoryCommand}
          elementClipboardCommand={elementClipboardCommand}
          onElementClipboardCommandApplied={onElementClipboardCommandApplied}
          onMediaState={setMediaState}
          lockedPicks={referencePicks}
          alignCommand={alignCommand}
          onPreviewShortcut={(shortcut) =>
            applyPreviewShortcut(shortcut, {
              onTool: setTool,
              onMediaCommand: setMediaCommand,
              paused: mediaState.paused,
            })
          }
          mediaCommand={mediaCommand}
          onPickCancel={onPickCancel}
          onSnapshot={setSnapshot}
          onDiagnostic={onDiagnostic}
        />
      ) : (
        <div
          className={`playable-workbench-stage-state${runtime.error ? " is-error" : ""}`}
          role={runtime.error ? "alert" : undefined}
        >
          {runtime.error ?? t("sceneWorkbench.loadingPreview")}
        </div>
      )}
      {tool === "draw" || strokes.length ? (
        <DrawingLayer
          viewport={graph.viewport}
          strokes={strokes}
          drawing={tool === "draw"}
          onStroke={(stroke) =>
            setStrokeHistory((current) => ({
              strokes: [...current.strokes, stroke],
              redo: [],
            }))
          }
        />
      ) : null}
      <AlignmentGuides
        viewport={graph.viewport}
        guides={guides}
        onChange={onGuidesChange}
        selectedGuideId={selectedGuideId}
        onSelectGuide={setSelectedGuideId}
      />
    </WorkbenchPreview>
  );

  return (
    <section
      ref={page}
      className="story-node-editor-page playable-workbench-page"
      aria-label={`${node.title} workbench`}
    >
      <header className="pane-header story-node-editor-header window-drag-handle">
        <WorkbenchBreadcrumb
          label={node.title}
          onClose={onClose}
          onRename={onRename}
        />
        {actions}
      </header>
      <div className="story-node-workbench playable-node-workbench">
        <div className="story-node-workbench-stage">
          <div className="story-node-workbench-preview">{previewPane}</div>
        </div>
      </div>
      {affectionOpen && affectionConfig ? (
        <PlayableAffectionDialog
          config={affectionConfig}
          busy={affectionSaving}
          onSave={async (config) => {
            setAffectionSaving(true);
            try {
              await onWriteAffection(config);
              setAffectionConfig(config);
            } finally {
              setAffectionSaving(false);
            }
          }}
          onClose={() => setAffectionOpen(false)}
        />
      ) : null}
    </section>
  );
}

const TOOLS: {
  tool: Exclude<PreviewTool, "play">;
  label: "playableWorkbench.selectTool" | "playableWorkbench.textTool" | "playableWorkbench.moveTool" | "playableWorkbench.drawTool";
  title: "playableWorkbench.selectToolHint" | "playableWorkbench.textToolHint" | "playableWorkbench.moveToolHint" | "playableWorkbench.drawToolHint";
  icon: IconComponent;
}[] = [
  {
    tool: "select",
    label: "playableWorkbench.selectTool",
    title: "playableWorkbench.selectToolHint",
    icon: MousePointer2,
  },
  {
    tool: "text",
    label: "playableWorkbench.textTool",
    title: "playableWorkbench.textToolHint",
    icon: Type,
  },
  {
    tool: "move",
    label: "playableWorkbench.moveTool",
    title: "playableWorkbench.moveToolHint",
    icon: Move,
  },
  {
    tool: "draw",
    label: "playableWorkbench.drawTool",
    title: "playableWorkbench.drawToolHint",
    icon: Brush,
  },
];

function applyPreviewShortcut(
  shortcut: PlayablePreviewShortcut,
  handlers: {
    onTool: (tool: PreviewTool) => void;
    onMediaCommand: (command: PlayableMediaCommand) => void;
    paused: boolean;
  },
): void {
  if (shortcut === "toggle-playback") {
    handlers.onTool("play");
    handlers.onMediaCommand({
      command: handlers.paused ? "play" : "pause",
    });
    return;
  }
  handlers.onTool(shortcut);
}

export async function withPlayablePreviewRefreshSkip<T>(
  skip: { current: number },
  write: () => Promise<T>,
  succeeded: (result: T) => boolean,
): Promise<T> {
  skip.current += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    skip.current = Math.max(0, skip.current - 1);
  };
  try {
    const result = await write();
    if (!succeeded(result)) release();
    return result;
  } catch (error) {
    release();
    throw error;
  }
}

function previewShortcutForKey(
  key: string,
): PlayablePreviewShortcut | undefined {
  switch (key.toLowerCase()) {
    case "s":
      return "select";
    case "t":
      return "text";
    case "m":
      return "move";
    case "d":
      return "draw";
    case " ":
    case "spacebar":
      return "toggle-playback";
    default:
      return undefined;
  }
}

type FunctionButtonScaleSelection = {
  kind: "settings" | "return";
  key: string;
  label: string;
  size: number;
};

/** Floats over the bottom of the preview. */
export function PreviewToolbar({
  tool,
  disabled,
  strokes,
  picks,
  guides = [],
  selectedGuideId,
  onAddGuide = () => {},
  onRemoveGuide = () => {},
  onClearGuides = () => {},
  referencePicks = [],
  referencePickKey,
  selectedPicks = [],
  onToggleReferencePick,
  onReferencePickChange,
  onAlignSelection,
  textSelection,
  interactionSelection,
  motionSelection,
  motionRingAssetId,
  motionBarAssetId,
  motionSwipeAssetId,
  motionBaseAssetId,
  motionPressedAssetId,
  pendingButtonNormalAssetName,
  pendingButtonPressedAssetName,
  onChooseMotionRing,
  onChooseMotionBar,
  onChooseMotionSwipe,
  onChooseMotionBase,
  onChooseButtonNormal,
  onChooseButtonPressed,
  motionSignals,
  mediaState,
  onMediaCommand,
  onPreviewShortcut,
  vrEyeReference = "full",
  onVrEyeReference,
  fonts,
  globalFontFamily,
  onAddFontDirectory,
  onTextStyle,
  onInteractionTiming,
  onApplyMotion,
  onAddButtonPreset,
  onCreateSharedAnswerSignals,
  onDeleteSharedAnswerSignals,
  onWriteButtonSignal,
  onWriteButtonSignalLabel,
  onEditButtonLabel,
  buttonSignals = [],
  onPreviewElementScale,
  onCommitElementScale,
  functionButtonScaleSelection,
  onPreviewFunctionButtonSize,
  onCommitFunctionButtonSize,
  onPreviewMotionBarScale,
  onCommitButtonAssetScale,
  onTool,
  onUndoStroke,
  onRedoStroke = () => {},
  onClearStrokes,
  redoStrokes = 0,
  onHistoryCommand,
  buttonSettings,
  media,
  picker,
  pickerOpen = false,
}: {
  tool: PreviewTool;
  disabled: boolean;
  strokes: number;
  picks: number;
  guides?: readonly PlayableAlignmentGuide[];
  selectedGuideId?: string;
  onAddGuide?: (axis: PlayableAlignmentGuide["axis"]) => void;
  onRemoveGuide?: () => void;
  onClearGuides?: () => void;
  referencePicks?: readonly PlayablePickResult[];
  referencePickKey?: string;
  selectedPicks?: readonly PlayablePickResult[];
  onToggleReferencePick?: (pick: PlayablePickResult) => void;
  onReferencePickChange?: (key: string) => void;
  onAlignSelection?: (referenceKey: string) => void;
  textSelection?: PlayableTextSelection;
  interactionSelection?: PlayableInteractionSelection;
  motionSelection?: PlayablePickResult;
  motionRingAssetId?: string;
  motionBarAssetId?: string;
  motionSwipeAssetId?: string;
  motionBaseAssetId?: string;
  motionPressedAssetId?: string;
  pendingButtonNormalAssetName?: string;
  pendingButtonPressedAssetName?: string;
  onChooseMotionRing?: () => void;
  onChooseMotionBar?: (
    scale: number,
    offsetX: number,
    offsetY: number,
    circular: boolean,
    barLayer: "bottom" | "top",
  ) => void;
  onChooseMotionSwipe?: () => void;
  onChooseMotionBase?: () => void;
  onChooseButtonNormal?: () => void;
  onChooseButtonPressed?: () => void;
  motionSignals: readonly { id: string; label: string }[];
  mediaState: PlayableMediaState;
  onMediaCommand: (command: PlayableMediaCommand) => void;
  onPreviewShortcut?: (shortcut: PlayablePreviewShortcut) => void;
  vrEyeReference?: "full" | "left" | "right";
  onVrEyeReference?: (eye: "full" | "left" | "right") => void;
  onDeleteSelected?: () => void;
  fonts: readonly string[];
  globalFontFamily?: string;
  onAddFontDirectory?: () => Promise<void>;
  onTextStyle: (
    property: PlayableTextStyleEdit["property"],
    value: string,
  ) => void;
  onInteractionTiming: (
    property: "appear" | "disappear" | "both",
    seconds: number | undefined,
    endSeconds?: number,
  ) => void | Promise<boolean>;
  onApplyMotion: (
    config: PlayableMotionConfig,
    applyButtonPreset?: boolean,
    buttonText?: string,
    buttonAssetScaleX?: number,
    buttonAssetScaleY?: number,
  ) => Promise<void>;
  onAddButtonPreset?: (
    config: PlayableMotionConfig,
    assetId?: string,
    reuseExistingSignals?: boolean,
    buttonSignal?: string,
    pressedAssetId?: string,
    buttonText?: string,
    fontFamily?: string,
    buttonAction?: PlayableButtonAction,
  ) => Promise<void>;
  onCreateSharedAnswerSignals?: () => Promise<boolean>;
  onDeleteSharedAnswerSignals?: () => Promise<boolean>;
  onWriteButtonSignal?: (
    pick: PlayablePickResult,
    signalId: string,
  ) => Promise<boolean>;
  onWriteButtonSignalLabel?: (
    pick: PlayablePickResult,
    signalId: string,
    label: string,
  ) => Promise<boolean>;
  onEditButtonLabel?: (
    pick: PlayablePickResult,
    text: string,
  ) => Promise<boolean>;
  buttonSignals?: readonly { id: string; label: string }[];
  onPreviewElementScale?: (
    pick: PlayablePickResult,
    scale: number,
  ) => void;
  onCommitElementScale?: (
    pick: PlayablePickResult,
    scale: number,
  ) => Promise<boolean>;
  functionButtonScaleSelection?: FunctionButtonScaleSelection;
  onPreviewFunctionButtonSize?: (
    kind: FunctionButtonScaleSelection["kind"],
    size: number | undefined,
  ) => void;
  onCommitFunctionButtonSize?: (
    kind: FunctionButtonScaleSelection["kind"],
    size: number,
  ) => Promise<boolean>;
  redoStrokes?: number;
  onPreviewMotionBarScale?: (
    scale: number,
    offsetX: number,
    offsetY: number,
  ) => void;
  onCommitButtonAssetScale?: (
    pick: PlayablePickResult,
    scaleX: number,
    scaleY: number,
  ) => Promise<boolean>;
  onTool: (tool: PreviewTool) => void;
  onUndoStroke: () => void;
  onRedoStroke?: () => void;
  onClearStrokes: () => void;
  onHistoryCommand?: (command: PlayableHistoryCommand) => void;
  buttonSettings?: ReactNode;
  /** An action after the tools, such as the Media menu. */
  media?: ReactNode;
  /** Inline media chooser placed beside the inspector instead of over the scene. */
  picker?: ReactNode;
  pickerOpen?: boolean;
}) {
  const language = readLanguage();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.defaultPrevented &&
        !event.isComposing &&
        !isTextEntry(event.target)
      ) {
        const command = undoShortcut(event);
        if (command) {
          if (command === "undo" && strokes > 0) {
            event.preventDefault();
            event.stopPropagation();
            onUndoStroke();
            return;
          }
          if (command === "redo" && redoStrokes > 0) {
            event.preventDefault();
            event.stopPropagation();
            onRedoStroke();
            return;
          }
          if (onHistoryCommand) {
            event.preventDefault();
            event.stopPropagation();
            onHistoryCommand(command);
            return;
          }
        }
      }
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isTextEntry(event.target)
      )
        return;
      const shortcut = previewShortcutForKey(event.key);
      if (!shortcut) return;
      event.preventDefault();
      if (onPreviewShortcut) {
        onPreviewShortcut(shortcut);
        return;
      }
      applyPreviewShortcut(shortcut, {
        onTool,
        onMediaCommand,
        paused: mediaState.paused,
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    mediaState.paused,
    onMediaCommand,
    onPreviewShortcut,
    onHistoryCommand,
    onRedoStroke,
    onUndoStroke,
    onTool,
    redoStrokes,
    strokes,
  ]);
  const selectedButtonAsset = motionSelection?.buttonAssetId
    ? motionSelection
    : undefined;
  const savedAssetScaleX = selectedButtonAsset?.buttonAssetScaleX ?? 100;
  const savedAssetScaleY = selectedButtonAsset?.buttonAssetScaleY ?? 100;
  const assetSelectionKey = selectedButtonAsset
    ? playablePickKey(selectedButtonAsset)
    : "";
  const [assetScaleXDraft, setAssetScaleXDraft] = useState(savedAssetScaleX);
  const [assetScaleYDraft, setAssetScaleYDraft] = useState(savedAssetScaleY);
  const scaleSelection =
    tool === "select" && functionButtonScaleSelection
      ? {
          ...functionButtonScaleSelection,
          scale: functionButtonScaleSelection.size / PLAYABLE_FUNCTION_BUTTON_SIZE,
          min: Math.round(
            (MIN_PLAYABLE_FUNCTION_BUTTON_SIZE /
              PLAYABLE_FUNCTION_BUTTON_SIZE) *
              100,
          ),
          max: Math.round(
            (MAX_PLAYABLE_FUNCTION_BUTTON_SIZE /
              PLAYABLE_FUNCTION_BUTTON_SIZE) *
              100,
          ),
        }
      : tool === "select" && motionSelection?.source
        ? {
            kind: "element" as const,
            key: playablePickKey(motionSelection),
            label:
              motionSelection.text?.trim() ||
              (motionSelection.tag === "button"
                ? t("playableWorkbench.defaultButtonText")
                : motionSelection.tag),
            scale: motionSelection.transformScale ?? 1,
            min: 5,
            max: 500,
          }
        : undefined;
  const initialScale = Math.round((scaleSelection?.scale ?? 1) * 100);
  const [scaleDraft, setScaleDraft] = useState(initialScale);
  const [scaleInputDraft, setScaleInputDraft] = useState(
    String(initialScale),
  );
  const scaleCommitted = useRef(initialScale);
  const scaleCommitPending = useRef<string | undefined>(undefined);
  useEffect(() => {
    const scale = Math.round((scaleSelection?.scale ?? 1) * 100);
    setScaleDraft(scale);
    setScaleInputDraft(String(scale));
    scaleCommitted.current = scale;
    scaleCommitPending.current = undefined;
  }, [scaleSelection?.key, scaleSelection?.scale]);
  const previewScaleDraft = (value: number) => {
    if (!scaleSelection) return;
    const scale = Math.max(scaleSelection.min, Math.min(scaleSelection.max, Math.round(value)));
    setScaleDraft(scale);
    setScaleInputDraft(String(scale));
    if (scaleSelection.kind === "element" && motionSelection)
      onPreviewElementScale?.(motionSelection, scale / 100);
    else if (scaleSelection.kind !== "element")
      onPreviewFunctionButtonSize?.(
        scaleSelection.kind,
        Math.min(
          MAX_PLAYABLE_FUNCTION_BUTTON_SIZE,
          Math.max(
            MIN_PLAYABLE_FUNCTION_BUTTON_SIZE,
            Math.round((PLAYABLE_FUNCTION_BUTTON_SIZE * scale) / 100),
          ),
        ),
      );
  };
  const commitScaleDraft = async (value = scaleDraft) => {
    if (!scaleSelection) return;
    const scale = Math.max(
      scaleSelection.min,
      Math.min(scaleSelection.max, Math.round(value)),
    );
    if (scale !== scaleDraft) previewScaleDraft(scale);
    const commitKey = `${scaleSelection.key}:${scale}`;
    if (
      scale === scaleCommitted.current ||
      scaleCommitPending.current === commitKey
    )
      return;
    scaleCommitPending.current = commitKey;
    let saved = false;
    if (scaleSelection.kind === "element" && motionSelection?.source)
      saved =
        (await onCommitElementScale?.(motionSelection, scale / 100)) ?? false;
    else if (scaleSelection.kind !== "element")
      saved =
        (await onCommitFunctionButtonSize?.(
          scaleSelection.kind,
          Math.min(
            MAX_PLAYABLE_FUNCTION_BUTTON_SIZE,
            Math.max(
              MIN_PLAYABLE_FUNCTION_BUTTON_SIZE,
              Math.round((PLAYABLE_FUNCTION_BUTTON_SIZE * scale) / 100),
            ),
          ),
        )) ?? false;
    if (saved) scaleCommitted.current = scale;
    else previewScaleDraft(scaleCommitted.current);
    scaleCommitPending.current = undefined;
  };
  const commitScaleInputDraft = () => {
    const value = Number(scaleInputDraft);
    const scale =
      scaleInputDraft.trim() && Number.isFinite(value)
        ? Math.max(
            scaleSelection?.min ?? 5,
            Math.min(scaleSelection?.max ?? 500, Math.round(value)),
          )
        : scaleCommitted.current;
    previewScaleDraft(scale);
    void commitScaleDraft(scale);
  };
  const adjustScaleInput = (delta: number) => {
    if (!scaleSelection) return;
    const current = Number(scaleInputDraft);
    const base = Number.isFinite(current) ? current : scaleDraft;
    const next = Math.max(
      scaleSelection.min,
      Math.min(scaleSelection.max, Math.round(base + delta)),
    );
    setScaleInputDraft(String(next));
    previewScaleDraft(next);
    void commitScaleDraft(next);
  };
  useEffect(() => {
    setAssetScaleXDraft(savedAssetScaleX);
    setAssetScaleYDraft(savedAssetScaleY);
  }, [assetSelectionKey, savedAssetScaleX, savedAssetScaleY]);
  const fontFamilies =
    textSelection?.fontFamily && !fonts.includes(textSelection.fontFamily)
      ? [textSelection.fontFamily, ...fonts]
      : fonts;
  const currentSize = textSelection
    ? Number.parseFloat(textSelection.fontSize)
    : undefined;
  const sizes =
    currentSize &&
    Number.isFinite(currentSize) &&
    !TEXT_SIZES.includes(currentSize)
      ? [currentSize, ...TEXT_SIZES]
      : TEXT_SIZES;
  const delayMinutes = interactionSelection
    ? Math.floor(interactionSelection.delaySeconds / 60)
    : 0;
  const delaySeconds = interactionSelection
    ? Math.round((interactionSelection.delaySeconds % 60) * 10) / 10
    : 0;
  const endMinutes =
    interactionSelection?.endSeconds === undefined
      ? ""
      : String(Math.floor(interactionSelection.endSeconds / 60));
  const endSeconds =
    interactionSelection?.endSeconds === undefined
      ? ""
      : String(Math.round((interactionSelection.endSeconds % 60) * 10) / 10);
  const [timingDraft, setTimingDraft] = useState(() => ({
    appearMinutes: String(delayMinutes),
    appearSeconds: String(delaySeconds),
    disappearMinutes: endMinutes,
    disappearSeconds: endSeconds,
  }));
  useEffect(() => {
    setTimingDraft({
      appearMinutes: String(delayMinutes),
      appearSeconds: String(delaySeconds),
      disappearMinutes: endMinutes,
      disappearSeconds: endSeconds,
    });
  }, [delayMinutes, delaySeconds, endMinutes, endSeconds]);
  const commitTimingDraft = (property: "appear" | "disappear") => {
    if (motionSelection?.tag === "button") return;
    const minutes = Number(
      property === "appear"
        ? timingDraft.appearMinutes || 0
        : timingDraft.disappearMinutes || 0,
    );
    const secondsValue =
      property === "appear"
        ? timingDraft.appearSeconds
        : timingDraft.disappearSeconds;
    if (
      property === "disappear" &&
      !timingDraft.disappearMinutes &&
      !secondsValue
    ) {
      if (interactionSelection?.endSeconds === undefined) return;
      onInteractionTiming("disappear", undefined);
      return;
    }
    const seconds = Number(secondsValue || 0);
    const nextTime = minutes * 60 + seconds;
    if (
      property === "appear" &&
      interactionSelection?.delaySeconds === nextTime
    )
      return;
    if (
      property === "disappear" &&
      interactionSelection?.endSeconds === nextTime
    )
      return;
    if (Number.isFinite(minutes) && Number.isFinite(seconds))
      onInteractionTiming(property, nextTime);
  };
  const timingControls =
    tool === "select" &&
    interactionSelection &&
    motionSelection &&
    playablePickKey(interactionSelection.pick) ===
      playablePickKey(motionSelection) ? (
      <div className="playable-preview-motion-timing">
        <strong>{t("playableWorkbench.showTiming")}</strong>
        <label className="playable-preview-motion-timing-row">
          <span>{t("playableWorkbench.appearTime")}</span>
          <input
            type="number"
            min="0"
            max="60"
            step="1"
            value={timingDraft.appearMinutes}
            onChange={(event) =>
              setTimingDraft((current) => ({
                ...current,
                appearMinutes: event.target.value,
              }))
            }
            onBlur={() => commitTimingDraft("appear")}
            aria-label={t("playableWorkbench.appearMinutes")}
          />
          <span>{t("playableWorkbench.minutesShort")}</span>
          <input
            type="number"
            min="0"
            max={delayMinutes >= 60 ? 0 : 59.9}
            step="0.1"
            value={timingDraft.appearSeconds}
            onChange={(event) =>
              setTimingDraft((current) => ({
                ...current,
                appearSeconds: event.target.value,
              }))
            }
            onBlur={() => commitTimingDraft("appear")}
            aria-label={t("playableWorkbench.appearSeconds")}
          />
          <span>{t("playableWorkbench.secondsShort")}</span>
        </label>
        <label className="playable-preview-motion-timing-row">
          <span>{t("playableWorkbench.disappearTime")}</span>
          <input
            type="number"
            min="0"
            max="60"
            step="1"
            value={timingDraft.disappearMinutes}
            onChange={(event) =>
              setTimingDraft((current) => ({
                ...current,
                disappearMinutes: event.target.value,
              }))
            }
            onBlur={() => commitTimingDraft("disappear")}
            aria-label={t("playableWorkbench.disappearMinutes")}
          />
          <span>{t("playableWorkbench.minutesShort")}</span>
          <input
            type="number"
            min="0"
            max={Number(endMinutes) >= 60 ? 0 : 59.9}
            step="0.1"
            value={timingDraft.disappearSeconds}
            onChange={(event) =>
              setTimingDraft((current) => ({
                ...current,
                disappearSeconds: event.target.value,
              }))
            }
            onBlur={() => commitTimingDraft("disappear")}
            aria-label={t("playableWorkbench.disappearSeconds")}
          />
          <span>{t("playableWorkbench.secondsShort")}</span>
        </label>
        {interactionSelection.endSeconds === undefined ? (
          <small>{t("playableWorkbench.leaveBlankToKeepVisible")}</small>
        ) : null}
      </div>
    ) : null;
  const selectedElementScaleControl =
    scaleSelection ? (
      <div className="playable-preview-selected-element-scale">
        <div
          className="playable-preview-selected-element-name"
          title={scaleSelection.label}
        >
          {scaleSelection.label}
        </div>
        <section
          className="playable-preview-element-scale"
          aria-label={t("playableWorkbench.elementScale")}
        >
          <div className="playable-preview-asset-scale-row">
            <span>{t("playableWorkbench.elementScale")}</span>
            <input
              type="range"
              min={scaleSelection.min}
              max={scaleSelection.max}
              step="1"
              value={scaleDraft}
              aria-label={t("playableWorkbench.elementScale")}
              aria-valuetext={`${scaleDraft}%`}
              onChange={(event) =>
                previewScaleDraft(Number(event.target.value))
              }
              onPointerUp={() => void commitScaleDraft()}
              onKeyUp={() => void commitScaleDraft()}
              onBlur={() => void commitScaleDraft()}
            />
            <span className="playable-preview-element-scale-input">
              <span className="playable-preview-element-scale-number">
                <input
                  type="number"
                  min={scaleSelection.min}
                  max={scaleSelection.max}
                  step="1"
                  value={scaleInputDraft}
                  aria-label={t("playableWorkbench.elementScale")}
                  onChange={(event) => {
                    const value = event.target.value;
                    setScaleInputDraft(value);
                    const scale = Number(value);
                    if (
                      value.trim() &&
                      Number.isFinite(scale) &&
                      scale >= scaleSelection.min &&
                      scale <= scaleSelection.max
                    ) {
                      previewScaleDraft(scale);
                    }
                  }}
                  onBlur={commitScaleInputDraft}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <span className="playable-preview-element-scale-stepper">
                  <button
                    type="button"
                    aria-label={t("playableWorkbench.increaseScale")}
                    title={t("playableWorkbench.increaseScale")}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => adjustScaleInput(1)}
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("playableWorkbench.decreaseScale")}
                    title={t("playableWorkbench.decreaseScale")}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => adjustScaleInput(-1)}
                  >
                    <ChevronDown size={11} />
                  </button>
                </span>
              </span>
              <span aria-hidden="true">%</span>
            </span>
          </div>
        </section>
      </div>
    ) : null;
  const motionSelectionIsReference =
    motionSelection?.tag === "button" &&
    referencePicks.some(
      (pick) =>
        playablePickKey(pick) === playablePickKey(motionSelection),
    );
  return (
    <div className="playable-preview-dock">
      <aside className="playable-preview-tools">
        <p className="playable-preview-panel-title">
          {translateText("Tools", language)}
        </p>
        <div
          className="playable-preview-tool-buttons"
          role="toolbar"
          aria-label={translateText("Preview tools")}
        >
          {TOOLS.map(({ tool: value, label, title, icon: ToolIcon }) => (
            <button
              key={value}
              type="button"
              className={tool === value ? "is-active" : undefined}
              title={t(title)}
              aria-label={t(label)}
              aria-pressed={tool === value}
              disabled={disabled}
              onClick={() => onTool(value)}
            >
              <ToolIcon size={18} />
            </button>
          ))}
        </div>
        <section className="playable-preview-tool-group">
          <div
            className="playable-preview-tool-group-title"
            title={t("playableWorkbench.alignmentGuides")}
            role="heading"
            aria-level={2}
          >
            <Move size={15} />
            <span>{t("playableWorkbench.alignmentGuides")}</span>
          </div>
          <div
            className="playable-preview-guide-tools"
            role="group"
            aria-label={t("playableWorkbench.alignmentGuides")}
          >
            <button
              type="button"
              title={t("playableWorkbench.addHorizontalGuide")}
              aria-label={t("playableWorkbench.addHorizontalGuide")}
              disabled={disabled}
              onClick={() => onAddGuide("horizontal")}
            >
              <GuideHorizontal size={18} />
            </button>
            <button
              type="button"
              title={t("playableWorkbench.addVerticalGuide")}
              aria-label={t("playableWorkbench.addVerticalGuide")}
              disabled={disabled}
              onClick={() => onAddGuide("vertical")}
            >
              <GuideVertical size={18} />
            </button>
            <button
              type="button"
              title={t("playableWorkbench.removeSelectedGuide")}
              aria-label={t("playableWorkbench.removeSelectedGuide")}
              disabled={disabled || !selectedGuideId}
              onClick={onRemoveGuide}
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              title={t("playableWorkbench.clearGuides")}
              aria-label={t("playableWorkbench.clearGuides")}
              disabled={disabled || !guides.length}
              onClick={onClearGuides}
            >
              <X size={16} />
            </button>
          </div>
        </section>
        <section className="playable-preview-tool-group">
            <div
              className="playable-preview-tool-group-title"
              title={t("playableWorkbench.positionAlignment")}
              role="heading"
              aria-level={2}
            >
              <Move size={15} />
              <span>
                {t("playableWorkbench.positionAlignment")}
                {referencePicks.length ? ` · ${referencePicks.length}` : ""}
              </span>
            </div>
            <div
              className="playable-preview-alignment-tools"
              role="group"
              aria-label={t("playableWorkbench.positionAlignment")}
            >
              <button
                type="button"
                className="is-icon-action"
                aria-pressed={motionSelectionIsReference}
                title={
                  motionSelectionIsReference
                    ? t("playableWorkbench.unlockReference")
                    : t("playableWorkbench.lockReference")
                }
                aria-label={
                  motionSelectionIsReference
                    ? t("playableWorkbench.unlockReference")
                    : t("playableWorkbench.lockReference")
                }
                disabled={disabled || motionSelection?.tag !== "button"}
                onClick={() => {
                  if (motionSelection?.tag === "button")
                    onToggleReferencePick?.(motionSelection);
                }}
              >
                {motionSelectionIsReference ? (
                  <Lock size={16} />
                ) : (
                  <LockOpen size={16} />
                )}
              </button>
              <select
                value={referencePickKey ?? ""}
                disabled={disabled || !referencePicks.length}
                onChange={(event) =>
                  onReferencePickChange?.(event.target.value)
                }
                aria-label={t("playableWorkbench.referenceButton")}
                title={t("playableWorkbench.referenceButton")}
              >
                <option value="">
                  {t("playableWorkbench.referenceButton")}
                </option>
                {referencePicks.map((pick) => {
                  const key = playablePickKey(pick);
                  return (
                    <option key={key} value={key}>
                      {pick.text || t("playableWorkbench.defaultButtonText")}
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                className="is-icon-action"
                title={t("playableWorkbench.alignCenters")}
                aria-label={t("playableWorkbench.alignCenters")}
                disabled={
                  disabled ||
                  !referencePickKey ||
                  !selectedPicks.some(
                    (pick) =>
                      pick.tag === "button" &&
                      !referencePicks.some(
                        (reference) =>
                          playablePickKey(reference) ===
                          playablePickKey(pick),
                      ),
                  )
                }
                onClick={() =>
                  referencePickKey &&
                  onAlignSelection?.(referencePickKey)
                }
              >
                <Move size={16} />
              </button>
            </div>
        </section>
      </aside>
      {pickerOpen ? (
        <aside className="playable-preview-library">
          {picker}
        </aside>
      ) : null}
      <aside className="playable-preview-inspector">
        <div className="playable-preview-inspector-content">
          <div className="playable-preview-toolbar" role="toolbar" aria-label={translateText("Scene adjustments")}>
        {mediaState.backdropAssetId && onVrEyeReference ? (
          <>
            <span className="playable-preview-toolbar-divider" aria-hidden="true" />
            <div className="playable-vr-eye-reference" role="group" aria-label={t("playableWorkbench.vrEyeReference")}>
              {([
                ["full", "playableWorkbench.fullFrame"],
                ["left", "playableWorkbench.leftEye"],
                ["right", "playableWorkbench.rightEye"],
              ] as const).map(([eye, label]) => (
                <button
                  key={eye}
                  type="button"
                  aria-pressed={vrEyeReference === eye}
                  className={vrEyeReference === eye ? "is-active" : undefined}
                  onClick={() => onVrEyeReference(eye)}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {media ? (
          <>
            <span
              className="playable-preview-toolbar-divider"
              aria-hidden="true"
            />
            {media}
          </>
        ) : null}
        {tool === "text" && textSelection ? (
          <section
            className="playable-preview-text-settings"
            aria-label={t("playableWorkbench.textSettings")}
          >
            <strong>{t("playableWorkbench.textSettings")}</strong>
            {globalFontFamily ? (
              <small>{t("playableWorkbench.globalFontOverridesLocal")}</small>
            ) : null}
            <label className="playable-preview-text-control">
              <span>{t("playableWorkbench.font")}</span>
              <span className="playable-font-select-row">
                <select
                  value={textSelection.fontFamily}
                  disabled={Boolean(globalFontFamily)}
                  title={
                    globalFontFamily
                      ? t("playableWorkbench.globalFontOverridesLocal")
                      : undefined
                  }
                  onChange={(event) =>
                    onTextStyle("fontFamily", event.target.value)
                  }
                  aria-label={t("playableWorkbench.font")}
                >
                  <option value="" disabled>
                    {t("playableWorkbench.selectFont")}
                  </option>
                  {fontFamilies.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
                {onAddFontDirectory ? (
                  <button
                    className="playable-font-folder-button"
                    type="button"
                    aria-label={t("playableWorkbench.addFontFolder")}
                    title={t("playableWorkbench.addFontFolder")}
                    onClick={() => void onAddFontDirectory()}
                  >
                    <FolderOpen size={13} />
                  </button>
                ) : null}
              </span>
            </label>
            <label className="playable-preview-text-control">
              <span>{t("playableWorkbench.fontSize")}</span>
              <select
                value={
                  currentSize && Number.isFinite(currentSize)
                    ? String(currentSize)
                    : ""
                }
                onChange={(event) =>
                  onTextStyle("fontSize", `${event.target.value}px`)
                }
                aria-label={t("playableWorkbench.fontSize")}
              >
                <option value="" disabled>
                  {t("playableWorkbench.selectFontSize")}
                </option>
                {sizes.map((size) => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </select>
            </label>
          </section>
        ) : null}
        {strokes || redoStrokes ? (
          <>
            <span
              className="playable-preview-toolbar-divider"
              aria-hidden="true"
            />
            <button
              type="button"
              title={t("playableWorkbench.undoStroke")}
              aria-label={t("playableWorkbench.undoStroke")}
              disabled={!strokes}
              onClick={onUndoStroke}
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              title={t("playableWorkbench.redoStroke")}
              aria-label={t("playableWorkbench.redoStroke")}
              disabled={!redoStrokes}
              onClick={onRedoStroke}
            >
              <Redo2 size={14} />
            </button>
            <button
              type="button"
              title={t("playableWorkbench.clearDrawing")}
              aria-label={t("playableWorkbench.clearDrawing")}
              disabled={!strokes}
              onClick={onClearStrokes}
            >
              <Trash2 size={14} />
            </button>
          </>
        ) : null}
          </div>
        </div>
      <MotionLibraryPopover
        selection={motionSelection}
        elementScaleControl={selectedElementScaleControl}
        ringAssetId={motionRingAssetId}
        barAssetId={motionBarAssetId}
        baseAssetId={motionBaseAssetId}
        pressedAssetId={motionPressedAssetId}
        pendingButtonNormalAssetName={pendingButtonNormalAssetName}
        pendingButtonPressedAssetName={pendingButtonPressedAssetName}
        onChooseRing={() => onChooseMotionRing?.()}
        onChooseBar={(scale, offsetX, offsetY, circular, barLayer) =>
          onChooseMotionBar?.(scale, offsetX, offsetY, circular, barLayer)
        }
        onChooseBase={() => onChooseMotionBase?.()}
        onChooseButtonNormal={() => onChooseButtonNormal?.()}
        onChooseButtonPressed={() => onChooseButtonPressed?.()}
        signals={motionSignals}
        onApply={async (config, applyButtonPreset, buttonText) => {
          if (
            selectedButtonAsset &&
            (assetScaleXDraft !== savedAssetScaleX ||
              assetScaleYDraft !== savedAssetScaleY) &&
            onCommitButtonAssetScale
          ) {
            const saved = await onCommitButtonAssetScale(
              selectedButtonAsset,
              assetScaleXDraft,
              assetScaleYDraft,
            );
            if (!saved) return;
          }
          if (
            motionSelection?.tag === "button" &&
            interactionSelection &&
            playablePickKey(interactionSelection.pick) ===
              playablePickKey(motionSelection)
          ) {
            const appearSeconds =
              Number(timingDraft.appearMinutes || 0) * 60 +
              Number(timingDraft.appearSeconds || 0);
            const disappearSeconds =
              timingDraft.disappearMinutes || timingDraft.disappearSeconds
                ? Number(timingDraft.disappearMinutes || 0) * 60 +
                  Number(timingDraft.disappearSeconds || 0)
                : undefined;
            const timingSaved = await onInteractionTiming(
              "both",
              appearSeconds,
              disappearSeconds,
            );
            if (timingSaved === false) return;
          }
          const assetScalePending =
            selectedButtonAsset &&
            (assetScaleXDraft !== savedAssetScaleX ||
              assetScaleYDraft !== savedAssetScaleY);
          if (assetScalePending)
            await onApplyMotion(
              config,
              applyButtonPreset,
              buttonText,
              assetScaleXDraft,
              assetScaleYDraft,
            );
          else if (buttonText !== undefined)
            await onApplyMotion(config, applyButtonPreset, buttonText);
          else await onApplyMotion(config, applyButtonPreset);
        }}
        onAddButtonPreset={onAddButtonPreset}
        onCreateSharedAnswerSignals={onCreateSharedAnswerSignals}
        onDeleteSharedAnswerSignals={onDeleteSharedAnswerSignals}
        onWriteButtonSignal={onWriteButtonSignal}
        onWriteButtonSignalLabel={onWriteButtonSignalLabel}
        onEditButtonLabel={onEditButtonLabel}
        onPreviewBarScale={onPreviewMotionBarScale}
        buttonSignals={buttonSignals}
        timingControls={timingControls}
        buttonSettings={buttonSettings}
      />
      </aside>
    </div>
  );
}

function builtInButtonPreset(
  kind: PlayableMotionKind,
  selection: PlayablePickResult | undefined,
  signals: readonly { id: string; label: string }[],
  ringAssetId?: string,
  barAssetId?: string,
  ringAssetScale?: number,
  barAssetScale?: number,
): PlayableMotionConfig {
  const signal =
    (selection?.signal && signals.some((item) => item.id === selection.signal)
      ? selection.signal
      : signals[0]?.id) ?? "";
  const timeoutSignal = signals.find((item) => item.id !== signal)?.id;
  if (kind === "button-feedback")
    return {
      kind,
      mode: "visual",
      duration: 0.1,
      feedback: "hover-press",
    };
  if (kind === "swipe-button")
    return {
      kind,
      mode: "interactive",
      duration: 1,
      interaction: "swipe-left",
      timeoutDuration: 10,
      ...(signal ? { signal } : {}),
      ...(timeoutSignal ? { timeoutSignal } : {}),
      swipeBehavior: "one-way",
      feedback: "none",
    };
  return {
    kind,
    mode: kind === "hold-charge" ? "interactive" : "visual",
    duration: kind === "hold-charge" ? 3 : 5,
    ...(signal ? { signal } : {}),
    ...(kind === "hold-charge"
      ? {
          interaction: "hold" as const,
          timeoutDuration: 10,
          ...(timeoutSignal ? { timeoutSignal } : {}),
        }
      : {}),
    ...(kind === "progress-ring"
      ? {
          ...(ringAssetId ? { ringAssetId } : {}),
      ...(ringAssetId && ringAssetScale !== undefined && ringAssetScale !== 100
        ? { ringAssetScale }
        : {}),
          ringFill: "deplete" as const,
          ringRotation: "clockwise" as const,
        }
      : {}),
    ...(["progress-bar", "hold-charge"].includes(kind) && barAssetId
      ? {
          barAssetId,
          ...(barAssetScale !== undefined && barAssetScale !== 100
            ? { barAssetScale }
            : {}),
        }
      : {}),
    ...(kind === "hold-charge"
      ? { feedback: "bounce-hover-press" as const }
      : kind === "countdown" || selection?.tag === "button"
        ? { feedback: "hover-press" as const }
        : {}),
  };
}

function buttonShapeForMotion(
  config: PlayableMotionConfig,
  fallback: "rectangle" | "circle" = "rectangle",
): "rectangle" | "circle" {
  if (config.buttonShape) return config.buttonShape;
  if (config.kind === "swipe-button" && config.swipeStyle)
    return config.swipeStyle === "floating" ? "circle" : "rectangle";
  return config.kind === "progress-ring" ||
    config.kind === "swipe-button" ||
    config.feedback === "bounce-hover-press" ||
    config.feedback === "ripple-hint"
    ? "circle"
    : fallback;
}

function defaultButtonText(kind: PlayableMotionKind): string {
  switch (kind) {
    case "hold-charge":
      return t("playableWorkbench.defaultHoldChargeText");
    case "progress-ring":
      return t("playableWorkbench.defaultRingCountdownText");
    case "countdown":
      return t("playableWorkbench.defaultCountdownText");
    case "swipe-button":
      return t("playableWorkbench.defaultSwipeButtonText");
    case "progress-bar":
      return t("playableWorkbench.defaultProgressBarText");
    default:
      return t("playableWorkbench.defaultButtonText");
  }
}

function MotionLibraryPopover({
  selection,
  ringAssetId: sourceRingAssetId,
  barAssetId: sourceBarAssetId,
  baseAssetId,
  pressedAssetId: sourcePressedAssetId,
  pendingButtonNormalAssetName,
  pendingButtonPressedAssetName,
  onChooseRing,
  onChooseBar,
  onChooseBase,
  onChooseButtonNormal,
  onChooseButtonPressed,
  signals,
  buttonSignals = [],
  onApply,
  onAddButtonPreset,
  onCreateSharedAnswerSignals,
  onDeleteSharedAnswerSignals,
  onWriteButtonSignal,
  onWriteButtonSignalLabel,
  onEditButtonLabel,
  onPreviewBarScale,
  timingControls,
  buttonSettings,
  elementScaleControl,
}: {
  selection?: PlayablePickResult;
  ringAssetId?: string;
  barAssetId?: string;
  baseAssetId?: string;
  pressedAssetId?: string;
  pendingButtonNormalAssetName?: string;
  pendingButtonPressedAssetName?: string;
  onChooseRing: () => void;
  onChooseBar: (
    scale: number,
    offsetX: number,
    offsetY: number,
    circular: boolean,
    barLayer: "bottom" | "top",
  ) => void;
  onChooseBase: () => void;
  onChooseButtonNormal: () => void;
  onChooseButtonPressed: () => void;
  signals: readonly { id: string; label: string }[];
  buttonSignals?: readonly { id: string; label: string }[];
  onApply: (
    config: PlayableMotionConfig,
    applyButtonPreset?: boolean,
    buttonText?: string,
    buttonAssetScaleX?: number,
    buttonAssetScaleY?: number,
  ) => Promise<void>;
  onAddButtonPreset?: (
    config: PlayableMotionConfig,
    assetId?: string,
    reuseExistingSignals?: boolean,
    buttonSignal?: string,
    pressedAssetId?: string,
    buttonText?: string,
    fontFamily?: string,
    buttonAction?: PlayableButtonAction,
  ) => Promise<void>;
  onCreateSharedAnswerSignals?: () => Promise<boolean>;
  onDeleteSharedAnswerSignals?: () => Promise<boolean>;
  onWriteButtonSignal?: (
    pick: PlayablePickResult,
    signalId: string,
  ) => void | Promise<boolean>;
  onWriteButtonSignalLabel?: (
    pick: PlayablePickResult,
    signalId: string,
    label: string,
  ) => Promise<boolean>;
  onEditButtonLabel?: (
    pick: PlayablePickResult,
    text: string,
  ) => Promise<boolean>;
  onPreviewBarScale?: (
    scale: number,
    offsetX: number,
    offsetY: number,
    circular: boolean,
    barLayer: "bottom" | "top",
  ) => void;
  timingControls?: ReactNode;
  buttonSettings?: ReactNode;
  elementScaleControl?: ReactNode;
}) {
  const [kind, setKind] = useState<PlayableMotionKind>("progress-bar");
  const [buttonShape, setButtonShape] = useState<"rectangle" | "circle">("rectangle");
  const [swipeStyle, setSwipeStyle] =
    useState<NonNullable<PlayableMotionConfig["swipeStyle"]>>("base");
  const [buttonLabel, setButtonLabel] = useState(selection?.text ?? "");
  const [buttonLabelEdited, setButtonLabelEdited] = useState(false);
  const [buttonAction, setButtonAction] = useState<PlayableButtonAction>();
  const [pressEffect, setPressEffect] = useState<
    PlayableButtonPressEffect | "none"
  >("none");
  const [effectColor, setEffectColor] = useState(
    PLAYABLE_BUTTON_PRESS_EFFECT_DEFAULT_COLOR,
  );
  const [effectAnchorX, setEffectAnchorX] = useState(50);
  const [effectAnchorY, setEffectAnchorY] = useState(50);
  const [effectOffsetX, setEffectOffsetX] = useState("0");
  const [effectOffsetY, setEffectOffsetY] = useState("0");
  const [selectedButtonSignal, setSelectedButtonSignal] = useState(
    selection?.signal ?? "",
  );
  const selectedSignalLabel =
    buttonSignals.find((item) => item.id === selectedButtonSignal)?.label ?? "";
  const [buttonExitLabel, setButtonExitLabel] = useState(selectedSignalLabel);
  const [effectPreset, setEffectPreset] = useState("");
  const [mode, setMode] = useState<"visual" | "interactive">("visual");
  const [duration, setDuration] = useState("5");
  const [timeoutDuration, setTimeoutDuration] = useState("10");
  const [signal, setSignal] = useState("");
  const [timeoutSignal, setTimeoutSignal] = useState("");
  const [interaction, setInteraction] =
    useState<PlayableMotionConfig["interaction"]>("click");
  const [requiredCount, setRequiredCount] = useState("3");
  const [ringFill, setRingFill] =
    useState<NonNullable<PlayableMotionConfig["ringFill"]>>("deplete");
  const [feedback, setFeedback] =
    useState<NonNullable<PlayableMotionConfig["feedback"]>>("hover-press");
  const [ringAssetId, setRingAssetId] = useState(sourceRingAssetId);
  const [ringAssetScale, setRingAssetScale] = useState(100);
  const [barAssetId, setBarAssetId] = useState(sourceBarAssetId);
  const [barAssetScale, setBarAssetScale] = useState(100);
  const [barAssetOffsetX, setBarAssetOffsetX] = useState(0);
  const [barAssetOffsetY, setBarAssetOffsetY] = useState(0);
  const [barLayer, setBarLayer] = useState<"bottom" | "top">("top");
  const [pressedAssetId, setPressedAssetId] = useState(sourcePressedAssetId);
  const [swipeBehavior, setSwipeBehavior] =
    useState<NonNullable<PlayableMotionConfig["swipeBehavior"]>>("one-way");
  const [disappearAfterSwipe, setDisappearAfterSwipe] = useState(false);
  const [reuseExistingSignals, setReuseExistingSignals] = useState(false);
  const [buttonSignal, setButtonSignal] = useState("");
  const [sharedExitNotice, setSharedExitNotice] = useState("");
  const hasSharedAnswerSignals = ["answer-correct", "answer-incorrect"].every(
    (id) => buttonSignals.some((item) => item.id === id),
  );

  useEffect(() => setRingAssetId(sourceRingAssetId), [sourceRingAssetId]);
  useEffect(() => setBarAssetId(sourceBarAssetId), [sourceBarAssetId]);
  useEffect(
    () => setPressedAssetId(sourcePressedAssetId),
    [sourcePressedAssetId],
  );
  useEffect(
    () => {
      setButtonLabel(selection?.text ?? "");
      setButtonLabelEdited(false);
    },
    [selection?.cssPath, selection?.text],
  );
  useEffect(
    () => setSelectedButtonSignal(selection?.signal ?? ""),
    [selection?.cssPath, selection?.signal],
  );
  useEffect(
    () => setButtonExitLabel(selectedSignalLabel),
    [selection?.cssPath, selectedButtonSignal, selectedSignalLabel],
  );
  useEffect(() => {
    setReuseExistingSignals(false);
    setButtonSignal("");
  }, [selection?.cssPath]);

  useEffect(() => {
    const config = selection?.motion;
    const connected = (id: string | undefined) =>
      id && signals.some((item) => item.id === id) ? id : "";
    if (config) {
      const shape = buttonShapeForMotion(config);
      setButtonShape(shape);
      setSwipeStyle(
        config.swipeStyle ?? (shape === "circle" ? "floating" : "base"),
      );
      setKind(config.kind);
      setEffectPreset(
        config.kind === "button-feedback" &&
          config.feedback === "ripple-hint"
          ? "builtin:button-feedback-ripple"
          : `builtin:${config.kind}`,
      );
      setMode(config.mode);
      setDuration(String(config.duration));
      const nextSwipeBehavior = config.swipeBehavior ?? "one-way";
      setInteraction(
        nextSwipeBehavior === "two-way" && config.interaction === "swipe-right"
          ? "swipe-left"
          : nextSwipeBehavior === "two-way" &&
              config.interaction === "swipe-down"
            ? "swipe-up"
            : (config.interaction ?? "click"),
      );
      setRequiredCount(String(config.requiredCount ?? 3));
      setRingFill(config.ringFill ?? "deplete");
      setRingAssetId(config.ringAssetId);
      setRingAssetScale(config.ringAssetScale ?? 100);
      setBarAssetId(config.barAssetId);
      setBarAssetScale(config.barAssetScale ?? 100);
      setBarAssetOffsetX(config.barAssetOffsetX ?? 0);
      setBarAssetOffsetY(config.barAssetOffsetY ?? 0);
      setBarLayer(config.barLayer ?? "top");
      setSwipeBehavior(config.swipeBehavior ?? "one-way");
      setDisappearAfterSwipe(config.disappearAfterSwipe ?? false);
      setPressEffect(config.pressEffect ?? "none");
      setEffectColor(
        config.effectColor ?? PLAYABLE_BUTTON_PRESS_EFFECT_DEFAULT_COLOR,
      );
      setEffectAnchorX(config.effectAnchorX ?? 50);
      setEffectAnchorY(config.effectAnchorY ?? 50);
      setEffectOffsetX(String(config.effectOffsetX ?? 0));
      setEffectOffsetY(String(config.effectOffsetY ?? 0));
      setFeedback(
        config.feedback ??
          (config.kind === "hold-charge"
            ? "bounce-hover-press"
            : selection.tag === "button"
              ? "hover-press"
              : "none"),
      );
      setTimeoutDuration(
        String(
          config.timeoutDuration ??
            Math.max(config.duration * 2, config.duration + 1),
        ),
      );
      const successSignal =
        connected(config.signal) ||
        connected(selection.signal) ||
        signals[0]?.id ||
        "";
      setSignal(successSignal);
      setTimeoutSignal(
        connected(config.timeoutSignal) ||
          signals.find((item) => item.id !== successSignal)?.id ||
          signals[0]?.id ||
          "",
      );
    } else if (selection) {
      setButtonShape("rectangle");
      setSwipeStyle("base");
      const nextKind =
        selection.tag === "button" ? "button-feedback" : "progress-bar";
      setKind(nextKind);
      setEffectPreset("");
      setRingAssetScale(100);
      setBarAssetScale(100);
      setBarAssetOffsetX(0);
      setBarAssetOffsetY(0);
      setBarLayer("top");
      setSwipeBehavior("one-way");
      setDisappearAfterSwipe(false);
      setPressEffect("none");
      setEffectColor(PLAYABLE_BUTTON_PRESS_EFFECT_DEFAULT_COLOR);
      setEffectAnchorX(50);
      setEffectAnchorY(50);
      setFeedback(selection.tag === "button" ? "hover-press" : "none");
      const successSignal = connected(selection.signal) || signals[0]?.id || "";
      setSignal(successSignal);
      setTimeoutDuration("10");
      setTimeoutSignal(
        signals.find((item) => item.id !== successSignal)?.id ??
          signals[0]?.id ??
          "",
      );
    } else {
      setButtonShape("rectangle");
      setSwipeStyle("base");
      setKind("progress-bar");
      setEffectPreset("");
      setRingAssetScale(100);
      setBarAssetScale(100);
      setBarAssetOffsetX(0);
      setBarAssetOffsetY(0);
      setBarLayer("top");
      setSwipeBehavior("one-way");
      setDisappearAfterSwipe(false);
      setPressEffect("none");
      setEffectColor(PLAYABLE_BUTTON_PRESS_EFFECT_DEFAULT_COLOR);
      setEffectAnchorX(50);
      setEffectAnchorY(50);
      setFeedback("none");
      setSignal(signals[0]?.id ?? "");
      setTimeoutSignal(signals[1]?.id ?? signals[0]?.id ?? "");
      setTimeoutDuration("10");
    }
  }, [selection?.cssPath, selection?.motion, selection?.signal, signals]);

  const isBounceClickPreset =
    kind === "button-feedback" && feedback === "bounce-hover-press";
  const canAttachPressEffect = selection
    ? selection.tag.toLowerCase() === "button"
    : Boolean(onAddButtonPreset);
  const offsetValue = (value: string) => {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.max(-500, Math.min(500, Math.round(number)))
      : 0;
  };
  const effectOffsetXValue = offsetValue(effectOffsetX);
  const effectOffsetYValue = offsetValue(effectOffsetY);
  const config: PlayableMotionConfig = {
    kind,
    ...(buttonAction === "back" ? {} : { buttonShape }),
    mode:
      kind === "button-feedback"
        ? isBounceClickPreset
          ? "interactive"
          : "visual"
        : kind === "swipe-button"
          ? "interactive"
          : mode,
    duration: kind === "button-feedback" ? 0.1 : Number(duration),
    ...(kind !== "button-feedback" &&
    (kind === "swipe-button" ||
      (mode === "interactive" &&
        (kind === "hold-charge" || interaction === "hold")))
      ? { timeoutDuration: Number(timeoutDuration) }
      : {}),
    ...(kind !== "button-feedback" &&
    mode === "interactive" &&
    kind !== "hold-charge"
      ? {
          interaction,
          ...(interaction === "multi-click"
            ? { requiredCount: Number(requiredCount) }
            : {}),
        }
      : {}),
    ...(isBounceClickPreset
      ? {
          interaction: "multi-click" as const,
          requiredCount: Number(requiredCount),
        }
      : {}),
    ...(kind === "progress-ring"
      ? {
          ...(ringAssetId ? { ringAssetId } : {}),
          ...(ringAssetId && ringAssetScale !== 100
            ? { ringAssetScale }
            : {}),
          ringFill:
            mode === "interactive" && interaction === "hold"
              ? "reveal"
              : ringFill,
          ringRotation: "clockwise",
        }
      : {}),
    ...(["progress-bar", "hold-charge"].includes(kind) && barAssetId
      ? {
          barAssetId,
          ...(barAssetScale !== 100 ? { barAssetScale } : {}),
          ...(barAssetOffsetX ? { barAssetOffsetX } : {}),
          ...(barAssetOffsetY ? { barAssetOffsetY } : {}),
        }
      : {}),
    ...(["progress-bar", "hold-charge"].includes(kind) &&
    (selection?.tag === "button" || !selection)
      ? { barLayer }
      : {}),
    ...(kind === "swipe-button"
      ? {
          swipeStyle,
          swipeBehavior,
          ...(disappearAfterSwipe ? { disappearAfterSwipe: true } : {}),
          feedback: "none" as const,
        }
      : {}),
    ...(kind === "button-feedback"
      ? { feedback }
      : kind === "hold-charge"
        ? { feedback }
        : kind === "countdown" || selection?.tag === "button"
        ? { feedback }
        : {}),
    ...(kind !== "button-feedback" && signal
      ? { signal }
      : isBounceClickPreset &&
          (selection ? selectedButtonSignal : reuseExistingSignals ? buttonSignal : "")
        ? {
            signal: selection
              ? selectedButtonSignal
              : buttonSignal,
          }
        : {}),
    ...(kind !== "button-feedback" &&
    mode === "interactive" &&
    timeoutSignal
      ? { timeoutSignal }
      : {}),
    ...(canAttachPressEffect && pressEffect !== "none"
      ? {
          pressEffect,
          effectColor,
          effectAnchorX,
          effectAnchorY,
          ...(effectOffsetXValue
            ? { effectOffsetX: effectOffsetXValue }
            : {}),
          ...(effectOffsetYValue
            ? { effectOffsetY: effectOffsetYValue }
            : {}),
        }
      : {}),
  };
  const clearProgressAsset = (target: "ring" | "bar") => {
    const next =
      target === "ring"
        ? { ...config, ringAssetId: undefined, ringAssetScale: undefined }
        : {
            ...config,
            barAssetId: undefined,
            barAssetScale: undefined,
            barAssetOffsetX: undefined,
            barAssetOffsetY: undefined,
          };
    if (target === "ring") {
      setRingAssetId(undefined);
      setRingAssetScale(100);
    } else {
      setBarAssetId(undefined);
      setBarAssetScale(100);
    }
    if (selection) void onApply(next, true);
  };
  const durationValid =
    Number.isFinite(config.duration) &&
    config.duration >= 0.1 &&
    config.duration <= 3600;
  const timeoutValid =
    config.timeoutDuration === undefined ||
    (Number.isFinite(config.timeoutDuration) &&
      config.timeoutDuration >= config.duration &&
      config.timeoutDuration <= 3600);
  const valid = durationValid && timeoutValid;
  const interactionValid =
    config.requiredCount === undefined ||
    (Number.isInteger(config.requiredCount) &&
      config.requiredCount >= 2 &&
      config.requiredCount <= 20);
  const addButtonDisabledReason = [
    !durationValid
      ? t("playableWorkbench.addButtonInvalidDuration")
      : undefined,
    !timeoutValid
      ? t("playableWorkbench.addButtonInvalidTimeout")
      : undefined,
    !interactionValid
      ? t("playableWorkbench.addButtonInvalidClickCount")
      : undefined,
    reuseExistingSignals && !buttonSignal
      ? t("playableWorkbench.addButtonMissingSharedExit")
      : undefined,
  ]
    .filter((reason): reason is string => Boolean(reason))
    .join("\n");
  const selectedButton = selection?.tag === "button" ? selection : undefined;
  const isRippleHintPreset = effectPreset === "builtin:button-feedback-ripple";
  const canChooseShape =
    Boolean(effectPreset) &&
    kind !== "swipe-button" &&
    buttonAction !== "back" &&
    effectPreset !== "builtin:button-feedback-ripple";
  const canChooseClickFeedback =
    kind === "button-feedback" &&
    !buttonAction &&
    effectPreset === "builtin:button-feedback";
  const buttonLabelValue = selection
    ? buttonLabel
    : buttonLabelEdited
      ? buttonLabel
      : isRippleHintPreset
        ? ""
        : buttonAction === "continue"
          ? t("playableWorkbench.continueButtonText")
          : buttonAction === "story-map"
            ? t("playableWorkbench.storyMapButtonText")
            : buttonAction === "back"
              ? t("playableWorkbench.backButtonText")
            : buttonAction === "new-game"
              ? t("playableWorkbench.newGameButtonText")
              : defaultButtonText(kind);

  const setConfigFields = (presetConfig: PlayableMotionConfig) => {
    setButtonShape(
      buttonShapeForMotion(presetConfig, buttonShape),
    );
    setSwipeStyle(
      presetConfig.swipeStyle ??
        (buttonShapeForMotion(presetConfig, buttonShape) === "circle"
          ? "floating"
          : "base"),
    );
    setKind(presetConfig.kind);
    setMode(
      presetConfig.kind === "swipe-button"
        ? "interactive"
        : presetConfig.mode,
    );
    setDuration(String(presetConfig.duration));
    const nextSwipeBehavior = presetConfig.swipeBehavior ?? "one-way";
    setInteraction(
      nextSwipeBehavior === "two-way" &&
        presetConfig.interaction === "swipe-right"
        ? "swipe-left"
        : nextSwipeBehavior === "two-way" &&
            presetConfig.interaction === "swipe-down"
          ? "swipe-up"
          : (presetConfig.interaction ?? "click"),
    );
    setRequiredCount(String(presetConfig.requiredCount ?? 3));
    setRingFill(presetConfig.ringFill ?? "deplete");
    setFeedback(
      presetConfig.feedback ??
        (presetConfig.kind === "hold-charge" ? "bounce-hover-press" : "hover-press"),
    );
    setRingAssetId(presetConfig.ringAssetId);
    setRingAssetScale(presetConfig.ringAssetScale ?? 100);
    setBarAssetId(presetConfig.barAssetId);
    setBarAssetScale(presetConfig.barAssetScale ?? 100);
    setBarLayer(presetConfig.barLayer ?? "top");
    setSwipeBehavior(presetConfig.swipeBehavior ?? "one-way");
    setDisappearAfterSwipe(presetConfig.disappearAfterSwipe ?? false);
    const successSignal =
      presetConfig.signal &&
      signals.some((item) => item.id === presetConfig.signal)
        ? presetConfig.signal
        : (selection?.signal &&
            signals.some((item) => item.id === selection.signal)
          ? selection.signal
          : signals[0]?.id) ?? "";
    setSignal(successSignal);
    setTimeoutSignal(
      (presetConfig.timeoutSignal &&
      signals.some((item) => item.id === presetConfig.timeoutSignal)
        ? presetConfig.timeoutSignal
        : signals.find((item) => item.id !== successSignal)?.id) ?? "",
    );
    setTimeoutDuration(
      String(
        presetConfig.timeoutDuration ??
          Math.max(presetConfig.duration * 2, presetConfig.duration + 1),
      ),
    );
  };
  const applyPreset = (
    value: string,
    presetConfig: PlayableMotionConfig,
  ) => {
    setButtonAction(undefined);
    const imageAdaptedBackButton = value === "builtin:button-back";
    const shape = buttonShapeForMotion(presetConfig, buttonShape);
    const selectedConfig =
      !selection && reuseExistingSignals && presetConfig.kind !== "button-feedback"
        ? {
            ...presetConfig,
            buttonShape: shape,
            signal: buttonSignal,
            ...(presetConfig.timeoutSignal === buttonSignal
              ? {
                  timeoutSignal: signals.find(
                    (item) => item.id !== buttonSignal,
                  )?.id,
                }
              : {}),
          }
        : {
            ...presetConfig,
            ...(!imageAdaptedBackButton ? { buttonShape: shape } : {}),
          };
    const normalizedPreset =
      value.startsWith("builtin:button-feedback-prompt:") ||
      value.startsWith("builtin:button-feedback-bounce")
        ? "builtin:button-feedback"
        : value.startsWith("builtin:swipe-button")
          ? "builtin:swipe-button"
          : value.replace(/:(?:circle|rectangle)(?::disappear)?$/, "");
    setEffectPreset(normalizedPreset);
    setConfigFields(selectedConfig);
  };
  const loadPreset = (value: string) => {
    if (value.startsWith("builtin:")) {
      const actionPreset =
        /^builtin:button-(new-game|continue|story-map)(?::(rectangle|circle))?$/.exec(value);
      if (actionPreset && !selection) {
        const action = actionPreset[1] as PlayableButtonAction;
        const shape =
          (actionPreset[2] as "rectangle" | "circle" | undefined) ??
          buttonShape;
        applyPreset(value, {
          kind: "button-feedback",
          mode: "visual",
          duration: 0.1,
          buttonShape: shape,
          feedback: "hover-press",
        });
        setButtonAction(action);
        return;
      }
      if (value === "builtin:button-back" && !selection) {
        applyPreset(value, {
          kind: "button-feedback",
          mode: "visual",
          duration: 0.1,
          feedback: "hover-press",
        });
        setButtonAction("back");
        return;
      }
      if (
        value === "builtin:button-feedback-prompt:rectangle" ||
        value === "builtin:button-feedback-prompt:circle"
      ) {
        const shape = value.endsWith(":circle") ? "circle" : "rectangle";
        applyPreset(value, {
          kind: "button-feedback",
          mode: "visual",
          duration: 0.1,
          buttonShape: shape,
          feedback: "idle-pulse-hover-press",
        });
        return;
      }
      if (
        value === "builtin:button-feedback" ||
        value === "builtin:button-feedback:rectangle" ||
        value === "builtin:button-feedback:circle"
      ) {
        const shape = value.endsWith(":circle")
          ? "circle"
          : value.endsWith(":rectangle")
            ? "rectangle"
            : buttonShape;
        applyPreset(value, {
          ...builtInButtonPreset("button-feedback", selection, signals),
          buttonShape: shape,
          feedback: "hover-press",
        });
        return;
      }
      if (value === "builtin:button-feedback-ripple") {
        if (!selection) setButtonLabel("");
        applyPreset(value, {
          ...builtInButtonPreset("button-feedback", selection, signals),
          buttonShape: "circle",
          feedback: "ripple-hint",
        });
        return;
      }
      const bounce = value.startsWith("builtin:button-feedback-bounce");
      const disappearingSwipe =
        value === "builtin:swipe-button:circle:disappear";
      const legacyShape = /:circle(?::disappear)?$/.test(value)
        ? "circle"
        : value.endsWith(":rectangle")
          ? "rectangle"
          : undefined;
      const shape = legacyShape ?? buttonShape;
      if (bounce || value === "builtin:button-feedback-bounce") {
        applyPreset(value, {
          ...builtInButtonPreset("button-feedback", selection, signals),
          buttonShape: shape,
          feedback: "bounce-hover-press",
          mode: "interactive",
          interaction: "multi-click",
          requiredCount: 3,
          ...(selection?.signal ? { signal: selection.signal } : {}),
        });
        return;
      }
      const presetKind = disappearingSwipe
        ? "swipe-button"
        : (value
            .slice("builtin:".length)
            .replace(/:(?:circle|rectangle)$/, "") as PlayableMotionKind);
      if (
        ![
          "countdown",
          "progress-ring",
          "progress-bar",
          "hold-charge",
          "swipe-button",
          "button-feedback",
        ].includes(presetKind)
      )
        return;
      applyPreset(
        value,
        {
          ...(() => {
            const preset = builtInButtonPreset(
            presetKind,
            selection,
            signals,
            ringAssetId,
            barAssetId,
            ringAssetScale,
            barAssetScale,
            );
            return preset;
          })(),
          buttonShape: shape,
          ...(presetKind === "swipe-button"
            ? {
                swipeStyle:
                  shape === "circle" ? ("floating" as const) : ("base" as const),
                ...(disappearingSwipe ? { disappearAfterSwipe: true } : {}),
              }
            : {}),
        },
      );
      return;
    }
  };
  const confirmAddButton = () => {
    if (!valid || !interactionValid || !onAddButtonPreset) return;
    if (reuseExistingSignals && !buttonSignal) {
      setSharedExitNotice("Choose a shared button output first.");
      return;
    }
    void onAddButtonPreset(
      config,
      baseAssetId,
      reuseExistingSignals,
      buttonSignal || undefined,
      pressedAssetId,
      selection
        ? undefined
        : buttonLabelValue.trim(),
      undefined,
      selection ? undefined : buttonAction,
    );
  };

  return (
    <details
      className={`playable-preview-motion-library${selection ? " is-selected" : " is-creating"}`}
      aria-label={t("playableWorkbench.gameFunctionSettings")}
      open
    >
      <summary>
        <strong>{t("playableWorkbench.gameFunctionSettings")}</strong>
      </summary>
      {elementScaleControl}
      {buttonSettings}
      {onCreateSharedAnswerSignals ? (
        <div className="playable-preview-motion-shared-exits">
          <strong>
            {renderParenthetical(
              translateText(
                "Shared exits (shared by multiple options/clicks)",
                readLanguage(),
              ),
            )}
          </strong>
          <div className="playable-preview-motion-shared-exit-actions">
            <button
              type="button"
              onClick={() => {
                void onCreateSharedAnswerSignals()
                  .then((created) =>
                    setSharedExitNotice(
                      created
                        ? "Correct and incorrect exits are ready. Connect them from the node canvas."
                        : "Could not create shared exits.",
                    ),
                  )
                  .catch(() =>
                    setSharedExitNotice("Could not create shared exits."),
                  );
              }}
            >
              {translateText("Create correct / incorrect exits", readLanguage())}
            </button>
            {onDeleteSharedAnswerSignals ? (
              <button
                type="button"
                disabled={!hasSharedAnswerSignals}
                onClick={() => {
                  void onDeleteSharedAnswerSignals()
                    .then((deleted) =>
                      setSharedExitNotice(
                        deleted
                          ? "Correct and incorrect exits were deleted."
                          : "Could not delete shared exits.",
                      ),
                    )
                    .catch(() =>
                      setSharedExitNotice("Could not delete shared exits."),
                    );
                }}
              >
                {translateText("Delete correct / incorrect exits", readLanguage())}
              </button>
            ) : null}
          </div>
          {sharedExitNotice ? (
            <small>{translateText(sharedExitNotice, readLanguage())}</small>
          ) : null}
        </div>
      ) : null}
      {selection ? (
        <small className="playable-preview-motion-scope">
          {translateText(
            "Animation applies only to the primary selected item.",
            readLanguage(),
          )}
        </small>
      ) : null}
      {(selection?.tag === "button" || !selection) &&
      (selection || !isRippleHintPreset) ? (
        <>
          <label className="playable-preview-button-label-control">
            <span>{translateText("Button text", readLanguage())}</span>
            <input
              aria-label={translateText("Button text", readLanguage())}
              maxLength={120}
              value={buttonLabelValue}
              onChange={(event) => {
                setButtonLabel(event.target.value);
                setButtonLabelEdited(true);
              }}
            />
          </label>
        </>
      ) : null}
      {selectedButton ? (
        <>
          <label>
            <span>{translateText("Button output")}</span>
            <select
              aria-label={translateText("Button result exit")}
              value={selectedButtonSignal}
              onChange={(event) => setSelectedButtonSignal(event.target.value)}
            >
              <option value="" disabled>
                {translateText("Choose an exit")}
              </option>
              {buttonSignals.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {selectedButtonSignal && onWriteButtonSignalLabel ? (
            <label>
              <span>{t("playableWorkbench.exitName")}</span>
              <input
                aria-label={t("playableWorkbench.exitName")}
                maxLength={120}
                value={buttonExitLabel}
                onChange={(event) => setButtonExitLabel(event.target.value)}
                onBlur={() => {
                  const label = buttonExitLabel.trim();
                  if (!label) {
                    setButtonExitLabel(selectedSignalLabel);
                    return;
                  }
                  if (label === selectedSignalLabel) return;
                  if (!onWriteButtonSignalLabel) return;
                  void onWriteButtonSignalLabel(
                    selectedButton,
                    selectedButtonSignal,
                    label,
                  ).then((saved) => {
                    if (!saved) setButtonExitLabel(selectedSignalLabel);
                  });
                }}
              />
            </label>
          ) : null}
        </>
      ) : null}
      {!selection ? (
        <>
          <label>
            <span>{translateText("Button exits")}</span>
            <select
              aria-label={translateText("Button exits")}
              value={reuseExistingSignals ? "shared" : "individual"}
              onChange={(event) =>
                setReuseExistingSignals(event.target.value === "shared")
              }
            >
              <option value="individual">{translateText("Create a separate exit")}</option>
              <option value="shared">{translateText("Reuse existing exits")}</option>
            </select>
          </label>
          {reuseExistingSignals ? (
            <label>
              <span>{translateText("Button output")}</span>
              <select
                aria-label={translateText("Button output")}
                value={buttonSignal}
                onChange={(event) => setButtonSignal(event.target.value)}
              >
                <option value="">{translateText("Create a separate exit")}</option>
                {buttonSignals.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </>
      ) : null}
      <label>
        <span>
          {translateText(
            selection ? "Change button style and animation" : "Button presets",
            readLanguage(),
          )}
        </span>
        <select
          aria-label={translateText("Button presets")}
          value={effectPreset}
          onChange={(event) => loadPreset(event.target.value)}
        >
          <option value="" disabled>
            {translateText("Choose a button preset")}
          </option>
          <optgroup label={t("playableWorkbench.progressAndHoldPresets")}>
            <option value="builtin:countdown">{t("playableWorkbench.countdownPreset")}</option>
            <option value="builtin:hold-charge">{t("playableWorkbench.holdChargePreset")}</option>
            {selection ? (
              <>
                <option value="builtin:progress-ring">{t("playableWorkbench.progressRingPreset")}</option>
                <option value="builtin:progress-bar">{t("playableWorkbench.progressBarPreset")}</option>
              </>
            ) : null}
          </optgroup>
          <optgroup label={t("playableWorkbench.swipePresets")}>
            <option value="builtin:swipe-button">{t("playableWorkbench.swipePreset")}</option>
          </optgroup>
          <optgroup label={t("playableWorkbench.clickPresets")}>
            <option value="builtin:button-feedback">{t("playableWorkbench.clickPreset")}</option>
            <option value="builtin:button-feedback-ripple">{translateText("Expanding hint button", readLanguage())}</option>
          </optgroup>
          {!selection ? (
            <optgroup label={t("playableWorkbench.navigationPresets")}>
              <option value="builtin:button-new-game">
                {t("playableWorkbench.newGameButtonText")}
              </option>
              <option value="builtin:button-continue">
                {t("playableWorkbench.continueButtonText")}
              </option>
              <option value="builtin:button-story-map">
                {t("playableWorkbench.storyMapButtonText")}
              </option>
              <option value="builtin:button-back">
                {t("playableWorkbench.backButtonPreset")}
              </option>
            </optgroup>
          ) : null}
        </select>
      </label>
      {(canChooseShape || canChooseClickFeedback || kind === "swipe-button") ? (
        <div className="playable-preview-motion-preset-options">
          {canChooseShape ? (
            <label>
              <span>{t("playableWorkbench.buttonShape")}</span>
              <select
                aria-label={t("playableWorkbench.buttonShape")}
                value={buttonShape}
                onChange={(event) =>
                  setButtonShape(
                    event.target.value as "rectangle" | "circle",
                  )
                }
              >
                <option value="rectangle">
                  {t("playableWorkbench.rectangleShape")}
                </option>
                <option value="circle">
                  {t("playableWorkbench.circleShape")}
                </option>
              </select>
            </label>
          ) : null}
          {canChooseClickFeedback ? (
            <label>
              <span>{t("playableWorkbench.clickFeedback")}</span>
              <select
                aria-label={t("playableWorkbench.clickFeedback")}
                value={feedback}
                onChange={(event) =>
                  setFeedback(
                    event.target.value as NonNullable<
                      PlayableMotionConfig["feedback"]
                    >,
                  )
                }
              >
                <option value="none">
                  {t("playableWorkbench.noClickFeedback")}
                </option>
                <option value="hover-press">
                  {t("playableWorkbench.normalClickFeedback")}
                </option>
                <option value="idle-pulse-hover-press">
                  {t("playableWorkbench.promptClickFeedback")}
                </option>
                <option value="bounce-hover-press">
                  {t("playableWorkbench.bounceClickFeedback")}
                </option>
              </select>
            </label>
          ) : null}
          {kind === "swipe-button" ? (
            <>
              <label>
                <span>{t("playableWorkbench.swipeButtonAppearance")}</span>
                <select
                  aria-label={t("playableWorkbench.swipeButtonAppearance")}
                  value={swipeStyle}
                  onChange={(event) => {
                    const next = event.target.value as "base" | "floating";
                    setSwipeStyle(next);
                    setButtonShape(next === "floating" ? "circle" : "rectangle");
                  }}
                >
                  <option value="base">
                    {t("playableWorkbench.swipeWithBase")}
                  </option>
                  <option value="floating">
                    {t("playableWorkbench.swipeNoBase")}
                  </option>
                </select>
              </label>
              <label className="playable-preview-motion-preset-checkbox">
                <input
                  type="checkbox"
                  aria-label={t("playableWorkbench.disappearAfterSwipe")}
                  checked={disappearAfterSwipe}
                  onChange={(event) =>
                    setDisappearAfterSwipe(event.target.checked)
                  }
                />
                <span>{t("playableWorkbench.disappearAfterSwipe")}</span>
              </label>
            </>
          ) : null}
        </div>
      ) : null}
      {canAttachPressEffect ? (
        <div className="playable-preview-motion-effect-library">
          <label>
            <span>{t("playableWorkbench.pressEffectLibrary")}</span>
            <select
              aria-label={t("playableWorkbench.pressEffectLibrary")}
              value={pressEffect}
              onChange={(event) =>
                setPressEffect(
                  event.target.value as PlayableButtonPressEffect | "none",
                )
              }
            >
              <option value="none">{t("playableWorkbench.noPressEffect")}</option>
              {PLAYABLE_BUTTON_PRESS_EFFECTS.map((effect) => (
                <option key={effect.id} value={effect.id}>
                  {t(effect.labelKey)}
                </option>
              ))}
            </select>
          </label>
          {pressEffect !== "none" ? (
            <div className="playable-preview-motion-effect-anchor">
              <label className="playable-preview-motion-effect-color">
                <span>{t("playableWorkbench.effectColor")}</span>
                <span className="playable-preview-motion-effect-color-value">
                  <input
                    type="color"
                    value={effectColor}
                    aria-label={t("playableWorkbench.effectColor")}
                    onChange={(event) => setEffectColor(event.target.value)}
                  />
                  <output>{effectColor.toUpperCase()}</output>
                </span>
              </label>
              <strong>{t("playableWorkbench.effectAttachmentPoint")}</strong>
              <label>
                <span>{t("playableWorkbench.effectAnchorX")}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={effectAnchorX}
                  style={{ accentColor: effectColor }}
                  aria-label={t("playableWorkbench.effectAnchorX")}
                  aria-valuetext={`${effectAnchorX}%`}
                  onChange={(event) =>
                    setEffectAnchorX(Number(event.target.value))
                  }
                />
                <output>{effectAnchorX}%</output>
              </label>
              <label>
                <span>{t("playableWorkbench.effectAnchorY")}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={effectAnchorY}
                  style={{ accentColor: effectColor }}
                  aria-label={t("playableWorkbench.effectAnchorY")}
                  aria-valuetext={`${effectAnchorY}%`}
                  onChange={(event) =>
                    setEffectAnchorY(Number(event.target.value))
                  }
                />
                <output>{effectAnchorY}%</output>
              </label>
              <div className="playable-preview-motion-effect-offset">
                <label>
                  <span>{t("playableWorkbench.effectOffsetX")}</span>
                  <input
                    type="number"
                    min="-500"
                    max="500"
                    step="1"
                    value={effectOffsetX}
                    aria-label={t("playableWorkbench.effectOffsetX")}
                    onChange={(event) => setEffectOffsetX(event.target.value)}
                    onBlur={(event) =>
                      setEffectOffsetX(String(offsetValue(event.target.value)))
                    }
                  />
                </label>
                <label>
                  <span>{t("playableWorkbench.effectOffsetY")}</span>
                  <input
                    type="number"
                    min="-500"
                    max="500"
                    step="1"
                    value={effectOffsetY}
                    aria-label={t("playableWorkbench.effectOffsetY")}
                    onChange={(event) => setEffectOffsetY(event.target.value)}
                    onBlur={(event) =>
                      setEffectOffsetY(String(offsetValue(event.target.value)))
                    }
                  />
                </label>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {kind !== "button-feedback" && kind !== "swipe-button" ? (
        <label>
          <span>{translateText("Run mode")}</span>
          <select
            value={mode}
            aria-label={translateText("Run mode")}
            onChange={(event) =>
              setMode(event.target.value as "visual" | "interactive")
            }
          >
            <option value="visual">{translateText("Visual; continue when finished")}</option>
            <option value="interactive">{translateText("Wait for player action")}</option>
          </select>
        </label>
      ) : null}
      {isBounceClickPreset ? (
        <label>
          <span>{t("playableWorkbench.requiredClicks")}</span>
          <input
            type="number"
            aria-label={t("playableWorkbench.requiredClicks")}
            min="2"
            max="20"
            step="1"
            value={requiredCount}
            onChange={(event) => setRequiredCount(event.target.value)}
          />
          <small>{t("playableWorkbench.consecutiveClickHint")}</small>
        </label>
      ) : null}
      {kind !== "button-feedback" && kind !== "swipe-button" ? (
        <label>
          <span>
            {renderParenthetical(
              translateText("Duration (seconds)", readLanguage()),
            )}
          </span>
          <input
            type="number"
            aria-label={translateText("Duration (seconds)")}
            min="0.1"
            max="3600"
            step="0.1"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          />
        </label>
      ) : null}
      {kind !== "button-feedback" &&
      mode === "interactive" &&
      kind !== "hold-charge" ? (
        <>
          {kind === "swipe-button" ? (
            <label>
              <span>{translateText("Swipe behavior")}</span>
              <select
                aria-label={translateText("Swipe behavior")}
                value={swipeBehavior}
                onChange={(event) => {
                  const next = event.target.value as NonNullable<
                    PlayableMotionConfig["swipeBehavior"]
                  >;
                  setSwipeBehavior(next);
                  if (next === "two-way") {
                    if (interaction === "swipe-right") setInteraction("swipe-left");
                    if (interaction === "swipe-down") setInteraction("swipe-up");
                  }
                }}
              >
                <option value="one-way">{translateText("One-way drag")}</option>
                <option value="two-way">{translateText("Two-way drag")}</option>
              </select>
            </label>
          ) : null}
          <label>
            <span>
              {translateText(
                kind === "swipe-button" ? "Swipe direction" : "Player action",
                readLanguage(),
              )}
            </span>
            <select
              aria-label={translateText(
                kind === "swipe-button" ? "Swipe direction" : "Player action",
                readLanguage(),
              )}
              value={interaction}
              onChange={(event) =>
                setInteraction(
                  event.target.value as PlayableMotionConfig["interaction"],
                )
              }
            >
              {kind !== "swipe-button" ? (
                <>
                  <option value="click">{translateText("Click")}</option>
                  <option value="quick-click">{translateText("Quick click (under 250 ms)")}</option>
                  <option value="double-click">{translateText("Double-click")}</option>
                  <option value="multi-click">{translateText("Repeated clicks")}</option>
                </>
              ) : null}
              {kind === "swipe-button" && swipeBehavior === "two-way" ? (
                <>
                  <option value="swipe-left">{translateText("Horizontal drag")}</option>
                  <option value="swipe-up">{translateText("Vertical drag")}</option>
                </>
              ) : (
                <>
                  <option value="swipe-left">{translateText("Swipe left")}</option>
                  <option value="swipe-right">{translateText("Swipe right")}</option>
                  <option value="swipe-up">{translateText("Swipe up")}</option>
                  <option value="swipe-down">{translateText("Swipe down")}</option>
                </>
              )}
              {kind !== "swipe-button" ? (
                <option value="hold">{translateText("Long press")}</option>
              ) : null}
            </select>
          </label>
          {kind !== "swipe-button" && interaction === "multi-click" ? (
            <label>
              <span>{translateText("Required clicks")}</span>
              <input
                aria-label={translateText("Required clicks")}
                type="number"
                min="2"
                max="20"
                step="1"
                value={requiredCount}
                onChange={(event) => setRequiredCount(event.target.value)}
              />
            </label>
          ) : null}
        </>
      ) : null}
      <div className="playable-preview-motion-section playable-preview-motion-material-section">
        <strong className="playable-preview-motion-section-title">{translateText("Button assets")}</strong>
        {kind === "progress-ring" ? (
        <>
          <div className="playable-preview-motion-actions">
            <div className="playable-preview-motion-asset-status">
              <strong>{translateText("Progress ring")}</strong>
              <small>{translateText(ringAssetId ? "Selected" : "Not selected")}</small>
            </div>
            <button
              type="button"
              aria-label={translateText(ringAssetId ? "Replace ring asset" : "Choose ring asset")}
              onClick={onChooseRing}
            >
              {translateText(ringAssetId ? "Replace" : "Choose")}
            </button>
            {ringAssetId ? (
              <button
                type="button"
                title={translateText("Remove ring image")}
                aria-label={translateText("Remove ring image")}
                onClick={() => clearProgressAsset("ring")}
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
          {ringAssetId ? (
            <label>
              <span>{translateText("Ring image size")}</span>
              <input
                type="range"
                min="25"
                max="300"
                step="1"
                value={ringAssetScale}
                aria-label={translateText("Ring image size")}
                aria-valuetext={`${ringAssetScale}%`}
                onChange={(event) =>
                  setRingAssetScale(Number(event.target.value))
                }
              />
              <output>{ringAssetScale}%</output>
            </label>
          ) : null}
          {mode === "interactive" && interaction === "hold" ? null : (
            <label>
              <span>{translateText("Ring progress")}</span>
              <select
                aria-label={translateText("Ring progress")}
                value={ringFill}
                onChange={(event) =>
                  setRingFill(
                    event.target.value as NonNullable<
                      PlayableMotionConfig["ringFill"]
                    >,
                  )
                }
              >
                <option value="deplete">{translateText("Full to empty")}</option>
                <option value="reveal">{translateText("Empty to full")}</option>
              </select>
            </label>
          )}
        </>
      ) : null}
      {kind === "progress-bar" || kind === "hold-charge" ? (
        <>
          <div className="playable-preview-motion-actions playable-preview-motion-asset-row">
            <div className="playable-preview-motion-asset-status">
              <strong>{translateText("Progress bar asset")}</strong>
              {barAssetId ? <small>{translateText("Selected")}</small> : null}
            </div>
            <button
              type="button"
              aria-label={translateText(barAssetId ? "Replace progress bar image" : "Choose progress bar image")}
              onClick={() =>
                onChooseBar(
                  barAssetScale,
                  barAssetOffsetX,
                  barAssetOffsetY,
                  buttonShape === "circle",
                  barLayer,
                )
              }
            >
              {translateText(barAssetId ? "Replace" : "Choose")}
            </button>
            {selection?.tag === "button" || !selection ? (
              <div
                className="playable-preview-motion-layer-actions"
                role="group"
                aria-label={translateText("Progress bar layer")}
              >
                <button
                  type="button"
                  title={translateText("Move progress bar to bottom")}
                  aria-label={translateText("Move progress bar to bottom")}
                  aria-pressed={barLayer === "bottom"}
                  className={barLayer === "bottom" ? "is-active" : undefined}
                  onClick={() => {
                    setBarLayer("bottom");
                    onPreviewBarScale?.(
                      barAssetScale,
                      barAssetOffsetX,
                      barAssetOffsetY,
                      buttonShape === "circle",
                      "bottom",
                    );
                  }}
                >
                  <ArrowDownToLine size={14} />
                </button>
                <button
                  type="button"
                  title={translateText("Move progress bar to top")}
                  aria-label={translateText("Move progress bar to top")}
                  aria-pressed={barLayer === "top"}
                  className={barLayer === "top" ? "is-active" : undefined}
                  onClick={() => {
                    setBarLayer("top");
                    onPreviewBarScale?.(
                      barAssetScale,
                      barAssetOffsetX,
                      barAssetOffsetY,
                      buttonShape === "circle",
                      "top",
                    );
                  }}
                >
                  <ArrowUp size={14} />
                </button>
              </div>
            ) : null}
            {barAssetId ? (
              <button
                type="button"
                title={translateText("Remove progress bar image")}
                aria-label={translateText("Remove progress bar image")}
                onClick={() => clearProgressAsset("bar")}
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
          {barAssetId ? (
            <label>
              <span>{translateText("Progress image size")}</span>
              <input
                type="range"
                min="25"
                max="300"
                step="1"
                value={barAssetScale}
                aria-label={translateText("Progress image size")}
                aria-valuetext={`${barAssetScale}%`}
                onChange={(event) =>
                  (() => {
                    const scale = Number(event.target.value);
                    setBarAssetScale(scale);
                    onPreviewBarScale?.(
                      scale,
                      barAssetOffsetX,
                      barAssetOffsetY,
                      buttonShape === "circle",
                      barLayer,
                    );
                  })()
                }
              />
              <output>{barAssetScale}%</output>
            </label>
          ) : null}
          {barAssetId ? (
            <>
              <label>
                <span>{translateText("Horizontal position")}</span>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  value={barAssetOffsetX}
                  aria-label={translateText("Horizontal position")}
                  onChange={(event) => {
                    const offset = Number(event.target.value);
                    setBarAssetOffsetX(offset);
                    onPreviewBarScale?.(
                      barAssetScale,
                      offset,
                      barAssetOffsetY,
                      buttonShape === "circle",
                      barLayer,
                    );
                  }}
                />
                <output>{barAssetOffsetX}</output>
              </label>
              <label>
                <span>{translateText("Vertical position")}</span>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  value={barAssetOffsetY}
                  aria-label={translateText("Vertical position")}
                  onChange={(event) => {
                    const offset = Number(event.target.value);
                    setBarAssetOffsetY(offset);
                    onPreviewBarScale?.(
                      barAssetScale,
                      barAssetOffsetX,
                      offset,
                      buttonShape === "circle",
                      barLayer,
                    );
                  }}
                />
                <output>{barAssetOffsetY}</output>
              </label>
            </>
          ) : null}
        </>
      ) : null}
      {selectedButton ? (
        <div className="playable-preview-motion-assets playable-preview-motion-button-state-assets">
          <strong>{translateText("Button state images")}</strong>
          <button type="button" onClick={onChooseButtonNormal}>
            {selectedButton.buttonAssetId
              ? translateText("Replace normal-state image")
              : translateText("Choose normal-state image")}
          </button>
          <button type="button" onClick={onChooseButtonPressed}>
            {pressedAssetId || selectedButton.buttonPressedAssetId
              ? translateText("Replace pressed-state image")
              : translateText("Choose pressed-state image")}
          </button>
          {pendingButtonNormalAssetName ? (
            <small>
              {translateText("Pending application")}: {pendingButtonNormalAssetName}
            </small>
          ) : null}
          {pendingButtonPressedAssetName ? (
            <small>
              {translateText("Pending application")}: {pendingButtonPressedAssetName}
            </small>
          ) : null}
        </div>
      ) : null}
      {!selection && !isRippleHintPreset ? (
        <div className="playable-preview-motion-assets playable-preview-motion-button-state-assets">
          <strong>{translateText("Button images")}</strong>
          <button
            type="button"
            aria-label={translateText(baseAssetId ? "Replace normal-state image" : "Choose normal-state image")}
            onClick={onChooseBase}
          >
            {baseAssetId
              ? translateText("Replace normal image")
              : translateText("Choose normal image")}
          </button>
          <button
            type="button"
            aria-label={translateText(pressedAssetId ? "Replace pressed-state image" : "Choose pressed-state image")}
            onClick={onChooseButtonPressed}
          >
            {pressedAssetId
              ? translateText("Replace pressed image")
              : translateText("Choose pressed image")}
          </button>
        </div>
      ) : null}
      </div>
      {timingControls}
      {selection &&
      selection.tag !== "button" &&
      kind !== "button-feedback" &&
      !isBounceClickPreset ? (
        <label className="playable-preview-motion-exit">
          <span>{translateText(mode === "visual" ? "After playback" : "After success")}</span>
          <select
            value={signal}
            aria-label={translateText("Success or auto-continue exit")}
            onChange={(event) => setSignal(event.target.value)}
          >
            <option value="" disabled>
              {translateText("Choose an exit")}
            </option>
            {signals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {!signals.length ? (
        <small className="playable-preview-motion-notice">
          <InfoCircle size={13} />
          <span>{translateText("No connected exit. The button plays but cannot navigate.")}</span>
        </small>
      ) : null}
      {kind !== "button-feedback" && mode === "interactive" ? (
        <label>
          <span>{translateText("On timeout, go to")}</span>
          <select
            value={timeoutSignal}
            aria-label={translateText("Timeout exit")}
            onChange={(event) => setTimeoutSignal(event.target.value)}
          >
            <option value="" disabled>
              {translateText("Choose timeout exit")}
            </option>
            {signals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {kind !== "button-feedback" &&
      mode === "interactive" &&
      (kind === "hold-charge" ||
        interaction === "hold" ||
        kind === "swipe-button") ? (
        <label>
          <span>{translateText("Action timeout (seconds)")}</span>
          <input
            type="number"
            min={duration}
            max="3600"
            step="0.1"
            value={timeoutDuration}
            aria-label={translateText("Action timeout (seconds)")}
            onChange={(event) => setTimeoutDuration(event.target.value)}
          />
        </label>
      ) : null}
      <div className="playable-preview-motion-actions playable-preview-motion-command-actions">
        {selection ? (
          <button
            className="playable-preview-motion-apply-button"
            type="button"
            disabled={!valid || !interactionValid}
            onClick={async () => {
              if (selectedButton) {
                if (
                  buttonLabel.trim() !== selectedButton.text
                )
                  if (
                    !(await onEditButtonLabel?.(
                      selectedButton,
                      buttonLabel.trim(),
                    ))
                  )
                    return;
                if (
                  selectedButtonSignal &&
                  selectedButtonSignal !== selectedButton.signal &&
                  onWriteButtonSignal
                ) {
                  const saved = await onWriteButtonSignal(
                    selectedButton,
                    selectedButtonSignal,
                  );
                  setSharedExitNotice(
                    saved
                      ? "Button output updated."
                      : "Could not update the button output.",
                  );
                  if (!saved) return;
                }
              }
              const nextConfig =
                selectedButton &&
                config.kind !== "button-feedback" &&
                selectedButtonSignal
                  ? { ...config, signal: selectedButtonSignal }
                  : config;
              await onApply(
                nextConfig,
                true,
                selectedButton &&
                  buttonLabel.trim() !== selectedButton.text
                  ? buttonLabel.trim()
                  : undefined,
              );
            }}
          >
            {translateText("Apply to current selection", readLanguage())}
          </button>
        ) : null}
        {!selection && onAddButtonPreset ? (
          <span
            className="playable-preview-disabled-button-tooltip"
            data-tooltip={addButtonDisabledReason || undefined}
            role={addButtonDisabledReason ? "note" : undefined}
            aria-label={addButtonDisabledReason || undefined}
            tabIndex={addButtonDisabledReason ? 0 : undefined}
          >
            <button
              type="button"
              disabled={Boolean(addButtonDisabledReason)}
              onClick={confirmAddButton}
            >
              {translateText("Confirm add", readLanguage())}
            </button>
          </span>
        ) : null}
      </div>
    </details>
  );
}

function PreviewTimeline({
  state,
  onSeek,
  onTogglePlay,
}: {
  state: PlayableMediaState;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
}) {
  const currentTime = Math.min(Math.max(0, state.currentTime), state.duration);
  return (
    <div className="playable-preview-timeline" aria-label={t("playableWorkbench.videoTimeline")}>
      <button
        className="playable-preview-timeline-play"
        type="button"
        title={state.paused ? t("playableWorkbench.play") : t("playableWorkbench.pause")}
        aria-label={state.paused ? t("playableWorkbench.play") : t("playableWorkbench.pause")}
        onClick={onTogglePlay}
      >
        {state.paused ? <Play size={15} /> : <Pause size={15} />}
      </button>
      {state.duration > 0 ? (
        <>
          <span>{formatMediaTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={state.duration}
            step="0.01"
            value={currentTime}
            aria-label={t("playableWorkbench.videoProgress")}
            onChange={(event) => onSeek(Number(event.target.value))}
          />
          <span>{formatMediaTime(state.duration)}</span>
        </>
      ) : null}
    </div>
  );
}

function formatMediaTime(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function renderParenthetical(text: string) {
  const match = text.match(/^(.*?)(\s*[（(].*[）)])$/);
  if (!match) return text;
  return (
    <>
      {match[1]}
      <small className="playable-preview-secondary-text">{match[2]}</small>
    </>
  );
}

function useSystemFonts(): {
  fonts: readonly string[];
  fontDirectoryName?: string;
  addFontDirectory: () => Promise<void>;
  scanSystemFonts: () => Promise<void>;
} {
  const [fonts, setFonts] = useState<readonly string[]>(FALLBACK_SYSTEM_FONTS);
  const [fontDirectoryName, setFontDirectoryName] = useState<string>();
  const bridge = window.putengGameDesktop?.fonts;
  const mergeFonts = useCallback((next: readonly string[]) => {
    if (!next.length) return;
    setFonts((current) =>
      [...new Set([...current, ...next])].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ),
    );
  }, []);
  useEffect(() => {
    let active = true;
    if (bridge) {
      void bridge.list().then(
        (next) => {
          if (active) mergeFonts(next);
        },
        () => undefined,
      );
    } else {
      void scanBrowserSystemFonts()
        .then((next) => {
          if (active) mergeFonts(next);
        })
        .catch(() => undefined);
      void rememberedBrowserFontDirectory()
        .then((directory) => {
          if (!active || !directory) return;
          setFontDirectoryName(directory.name);
          mergeFonts(directory.families);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [bridge, mergeFonts]);
  const addFontDirectory = useCallback(async () => {
    if (bridge) {
      const next = await bridge.addDirectory();
      if (next) mergeFonts(next);
      return;
    }
    const directory = await chooseBrowserFontDirectory();
    if (!directory) return;
    setFontDirectoryName(directory.name);
    mergeFonts(directory.families);
  }, [bridge, mergeFonts]);
  const scanSystemFonts = useCallback(async () => {
    const next = bridge
      ? await bridge.list()
      : await scanBrowserSystemFonts();
    mergeFonts(next);
  }, [bridge, mergeFonts]);
  return {
    fonts,
    ...(fontDirectoryName ? { fontDirectoryName } : {}),
    addFontDirectory,
    scanSystemFonts,
  };
}

/**
 * Freehand strokes over the preview, in project viewport pixels. Strokes stay
 * visible after drawing ends, until the chat message that carries them.
 */
export function DrawingLayer({
  viewport,
  strokes,
  drawing,
  onStroke,
}: {
  viewport: { width: number; height: number };
  strokes: readonly PlayableStroke[];
  drawing: boolean;
  onStroke: (stroke: PlayableStroke) => void;
}) {
  const [current, setCurrent] = useState<{
    pointerId: number;
    points: { x: number; y: number }[];
  }>();
  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(
        ((event.clientX - bounds.left) / bounds.width) * viewport.width,
      ),
      y: Math.round(
        ((event.clientY - bounds.top) / bounds.height) * viewport.height,
      ),
    };
  };
  const finish = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (current?.pointerId !== event.pointerId) return;
    onStroke(current.points);
    setCurrent(undefined);
  };
  const width = Math.max(3, Math.round(viewport.width / 240));
  return (
    <svg
      className={`playable-drawing-layer${drawing ? " is-drawing" : ""}`}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      preserveAspectRatio="none"
      aria-label={drawing ? t("sceneWorkbench.drawing") : undefined}
      aria-hidden={drawing ? undefined : true}
      onPointerDown={(event) => {
        if (!drawing || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setCurrent({ pointerId: event.pointerId, points: [point(event)] });
      }}
      onPointerMove={(event) => {
        if (current?.pointerId !== event.pointerId) return;
        const next = point(event);
        const last = current.points.at(-1)!;
        if (Math.abs(next.x - last.x) + Math.abs(next.y - last.y) < 2) return;
        setCurrent({ ...current, points: [...current.points, next] });
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {[...strokes, ...(current ? [current.points] : [])].map(
        (stroke, index) =>
          stroke.length === 1 ? (
            <circle
              key={index}
              cx={stroke[0]!.x}
              cy={stroke[0]!.y}
              r={width / 2}
            />
          ) : (
            <polyline
              key={index}
              points={stroke.map(({ x, y }) => `${x},${y}`).join(" ")}
              strokeWidth={width}
            />
          ),
      )}
    </svg>
  );
}

export function AlignmentGuides({
  viewport,
  guides,
  onChange,
  selectedGuideId,
  onSelectGuide,
}: {
  viewport: { width: number; height: number };
  guides: readonly PlayableAlignmentGuide[];
  onChange: (guides: PlayableAlignmentGuide[]) => void;
  selectedGuideId?: string;
  onSelectGuide: (id: string) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const dragPointer = useRef<number | undefined>(undefined);
  const guidesRef = useRef(guides);
  const [drag, setDrag] = useState<{ id: string; position: number }>();
  guidesRef.current = guides;

  const positionAt = (
    clientX: number,
    clientY: number,
    axis: PlayableAlignmentGuide["axis"],
  ) => {
    const bounds = svg.current?.getBoundingClientRect();
    if (!bounds) return undefined;
    const size = axis === "horizontal" ? bounds.height : bounds.width;
    if (!size) return undefined;
    const offset =
      axis === "horizontal"
        ? clientY - bounds.top
        : clientX - bounds.left;
    return Math.min(1, Math.max(0, offset / size));
  };
  const moveGuide = (id: string, position: number) => {
    onChange(
      guidesRef.current.map((guide) =>
        guide.id === id ? { ...guide, position } : guide,
      ),
    );
  };
  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag || dragPointer.current !== event.pointerId) return;
    const guide = guidesRef.current.find(({ id }) => id === drag.id);
    const position = guide
      ? (positionAt(event.clientX, event.clientY, guide.axis) ?? drag.position)
      : drag.position;
    moveGuide(drag.id, position);
    dragPointer.current = undefined;
    setDrag(undefined);
    try {
      svg.current?.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture is not available in every embedded preview.
    }
  };

  return (
    <svg
      ref={svg}
      className="playable-alignment-guides"
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      preserveAspectRatio="none"
      aria-label={t("playableWorkbench.alignmentGuides")}
      onPointerMove={(event) => {
        if (!drag || dragPointer.current !== event.pointerId) return;
        const guide = guidesRef.current.find(({ id }) => id === drag.id);
        const position = guide
          ? positionAt(event.clientX, event.clientY, guide.axis)
          : undefined;
        if (position !== undefined) setDrag({ id: drag.id, position });
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      {guides.map((guide, index) => {
        const position =
          drag?.id === guide.id ? drag.position : guide.position;
        const horizontal = guide.axis === "horizontal";
        const selected = guide.id === selectedGuideId;
        const x1 = horizontal ? 0 : position * viewport.width;
        const y1 = horizontal ? position * viewport.height : 0;
        const x2 = horizontal ? viewport.width : position * viewport.width;
        const y2 = horizontal ? position * viewport.height : viewport.height;
        return (
          <g
            key={guide.id}
            className={`${horizontal ? "is-horizontal" : "is-vertical"}${selected ? " is-selected" : ""}`}
            role="slider"
            tabIndex={0}
            aria-label={`${t(horizontal ? "playableWorkbench.horizontalGuide" : "playableWorkbench.verticalGuide")} ${index + 1}`}
            aria-orientation={horizontal ? "vertical" : "horizontal"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(position * 100)}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              onSelectGuide(guide.id);
              dragPointer.current = event.pointerId;
              setDrag({
                id: guide.id,
                position:
                  positionAt(event.clientX, event.clientY, guide.axis) ??
                  guide.position,
              });
              try {
                svg.current?.setPointerCapture(event.pointerId);
              } catch {
                // Pointer capture is not available in every embedded preview.
              }
            }}
            onKeyDown={(event) => {
              const direction = horizontal
                ? event.key === "ArrowUp"
                  ? -1
                  : event.key === "ArrowDown"
                    ? 1
                    : 0
                : event.key === "ArrowLeft"
                  ? -1
                  : event.key === "ArrowRight"
                    ? 1
                    : 0;
              if (!direction) return;
              event.preventDefault();
              onSelectGuide(guide.id);
              moveGuide(
                guide.id,
                Math.min(
                  1,
                  Math.max(
                    0,
                    guide.position +
                      direction * (event.shiftKey ? 0.05 : 0.01),
                  ),
                ),
              );
            }}
          >
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className="playable-alignment-guide-hit"
            />
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className="playable-alignment-guide-line"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Where chosen media goes: canvas, background, chat, or a selected button. */
type MediaTarget =
  | "backdrop"
  | "chat"
  | "button"
  | "button-pressed"
  | "canvas"
  | "motion-ring"
  | "motion-bar"
  | "motion-swipe"
  | "motion-base"
  | "motion-pressed"
  | "settings-button"
  | "return-button"
  | "button-sound";

/**
 * Chooses an image or a video from the Library, or uploads a new one.
 * `elements` holds the picker and the file input, and must be rendered.
 */
export function useMediaChooser(
  onAsset: (asset: PlayableAssetRequest, target: MediaTarget) => void,
  onError: (text: string) => void,
) {
  const [library, setLibrary] = useState<LibraryAsset[]>();
  const [sourceFolders, setSourceFolders] = useState<LibrarySourceFolders>({});
  const [pickerView, setPickerView] = useState<"small" | "medium" | "large" | "list">("small");
  const [sessionImportedAssetIds, setSessionImportedAssetIds] = useState<ReadonlySet<string>>(
    () => new Set(SESSION_IMPORTED_ASSET_IDS),
  );
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<LibraryPickerCategory>("image");
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<MediaTarget>("chat");
  const imageOnlyTarget = isImageOnlyTarget(target.current);
  const audioOnlyTarget = isAudioOnlyTarget(target.current);
  const categories = audioOnlyTarget
    ? PICKER_CATEGORIES.filter(({ id }) => id === "audio" || id === "custom")
    : imageOnlyTarget
      ? PICKER_CATEGORIES.filter(
          ({ id }) => id !== "video" && id !== "audio",
        )
      : PICKER_CATEGORIES;
  const pickerOpen = library !== undefined;

  useEffect(() => {
    if (!pickerOpen) return;
    let disposed = false;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const next = await loadLibraryAssets();
        if (!disposed) {
          setLibrary((current) => {
            if (!current) return current;
            const unchanged =
              current.length === next.length &&
              current.every((asset, index) => {
                const candidate = next[index];
                return (
                  candidate?.id === asset.id &&
                  candidate.name === asset.name &&
                  candidate.size === asset.size &&
                  candidate.modifiedAt === asset.modifiedAt
                );
              });
            return unchanged ? current : next;
          });
        }
      } catch {
        // Keep the picker usable; the next refresh will retry.
      } finally {
        refreshing = false;
      }
    };
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [pickerOpen]);

  const use = (asset: LibraryAsset) => {
    const type = playableAssetType(asset.mediaType);
    if (
      type !== "image" &&
      type !== "video" &&
      !(audioOnlyTarget && type === "audio")
    )
      return onError(
        t("sceneWorkbench.notMedia", { name: asset.name }),
      );
    if (isImageOnlyTarget(target.current) && type !== "image")
      return onError(`${asset.name} is not an image`);
    if (isAudioOnlyTarget(target.current) && type !== "audio")
      return onError(`${asset.name} is not audio`);
    onAsset(
      {
        name: asset.name,
        type,
        source: { kind: "library", assetId: asset.id },
      },
      target.current,
    );
  };

  const chooseSourceFolder = async (category: LibrarySourceFolderCategory) => {
    const select = window.putengGameDesktop?.selectLibraryDirectory;
    try {
      if (!select) {
        const name = await chooseBrowserLibraryFolder(category);
        if (name) setSourceFolders((folders) => ({ ...folders, [category]: name }));
        setLibrary(await loadLibraryAssets());
        return;
      }
      const folder = await select();
      if (!folder) return;
      setSourceFolders(await setLibrarySourceFolder(category, folder));
      setLibrary(await loadLibraryAssets());
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      onError(translateText(errorMessage(cause), readLanguage()));
    }
  };

  const clearSourceFolder = async (category: LibrarySourceFolderCategory) => {
    try {
      if (!window.putengGameDesktop?.selectLibraryDirectory) {
        await clearBrowserLibraryFolder(category);
        setSourceFolders((folders) => {
          const next = { ...folders };
          delete next[category];
          return next;
        });
        return;
      }
      setSourceFolders(await setLibrarySourceFolder(category, undefined));
      setLibrary(await loadLibraryAssets());
    } catch (cause) {
      onError(translateText(errorMessage(cause), readLanguage()));
    }
  };

  const refreshSourceFolders = async () => {
    try {
      setLibrary(await loadLibraryAssets());
    } catch (cause) {
      onError(translateText(errorMessage(cause), readLanguage()));
      throw cause;
    }
  };

  const elements = (
    <>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={
          target.current === "button" ||
          isImageOnlyTarget(target.current)
            ? ".png,.jpg,.jpeg,.webp"
            : isAudioOnlyTarget(target.current)
              ? ".mp3,.wav"
              : ASSET_UPLOAD_ACCEPT
        }
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (!files.length) return;
          setUploading(true);
          void (async () => {
            try {
              if (files.length === 1) {
                const asset = await uploadLibraryFile(files[0]!);
                SESSION_IMPORTED_ASSET_IDS.add(asset.id);
                setSessionImportedAssetIds(new Set(SESSION_IMPORTED_ASSET_IDS));
                setLibrary(undefined);
                use(asset);
                return;
              }

              const results = await uploadLibraryFiles(files);
              const imported = results.flatMap((result) =>
                result.status === "fulfilled" ? [result.value] : [],
              );
              for (const asset of imported)
                SESSION_IMPORTED_ASSET_IDS.add(asset.id);
              if (imported.length) {
                setSessionImportedAssetIds(new Set(SESSION_IMPORTED_ASSET_IDS));
                setCategory("custom");
                setLibrary(await loadLibraryAssets());
              }

              const failures = results.flatMap((result, index) =>
                result.status === "rejected"
                  ? [`${files[index]!.name}: ${errorMessage(result.reason)}`]
                  : [],
              );
              if (failures.length) {
                onError(
                  `${translateText("Some files could not be imported", readLanguage())}: ${failures.join("; ")}`,
                );
              }
            } catch (cause) {
              onError(
                t("sceneWorkbench.uploadFailed", {
                  error: errorMessage(cause),
                }),
              );
            } finally {
              setUploading(false);
            }
          })();
        }}
      />
      {library ? (
        <LibraryAssetPicker
          inline
          sessionImportedAssetIds={sessionImportedAssetIds}
          onRemoveFromSession={(asset) => {
            SESSION_IMPORTED_ASSET_IDS.delete(asset.id);
            setSessionImportedAssetIds(new Set(SESSION_IMPORTED_ASSET_IDS));
          }}
          title={
            target.current === "backdrop"
              ? t("sceneWorkbench.chooseBackground")
              : target.current === "button"
                ? t("playableWorkbench.chooseButtonImage")
                : target.current === "button-pressed"
                  ? t("playableWorkbench.chooseButtonPressedStateImage")
                  : target.current === "motion-ring"
                    ? translateText("Choose a progress ring image", readLanguage())
                    : target.current === "motion-bar"
                      ? translateText("Choose a progress bar image", readLanguage())
                    : target.current === "motion-swipe"
                      ? translateText("Choose a swipe direction image", readLanguage())
                    : target.current === "motion-base"
                      ? translateText("Choose a button base image", readLanguage())
                    : target.current === "motion-pressed"
                      ? translateText("Choose a pressed-state image", readLanguage())
                  : target.current === "canvas"
                    ? translateText("Picture-in-picture", readLanguage())
                    : target.current === "button-sound"
                      ? t("playableWorkbench.chooseButtonSound")
                    : translateText("Add reference video/image", readLanguage())
          }
          categoryFilter={category}
          uploadLabel={t(
            uploading ? "assetCanvas.importing" : "playableWorkbench.import",
          )}
          viewMode={pickerView}
          onViewModeChange={setPickerView}
          sourceFolders={sourceFolders}
          onChooseSourceFolder={(folderCategory) => void chooseSourceFolder(folderCategory)}
          onClearSourceFolder={(folderCategory) => void clearSourceFolder(folderCategory)}
          onRefreshSourceFolders={refreshSourceFolders}
          assets={library.filter((asset) => {
            const type = playableAssetType(asset.mediaType);
            return type === "image" || type === "video" || type === "audio";
          })}
          uploading={uploading}
          onUpload={
            category === "custom" ? () => fileInput.current?.click() : undefined
          }
          onClose={() => setLibrary(undefined)}
          onSelect={(asset) => {
            setLibrary(undefined);
            use(asset);
          }}
        />
      ) : null}
    </>
  );

  const navigation = library ? (
    <nav
      className="playable-preview-library-tabs"
      role="tablist"
      aria-label={translateText("Asset categories", readLanguage())}
      aria-orientation="vertical"
      onKeyDown={(event) => {
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const currentIndex = categories.findIndex(({ id }) => id === category);
        const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
        const next = categories[(currentIndex + direction + categories.length) % categories.length]!;
        setCategory(next.id);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-picker-category="${next.id}"]`)?.focus();
      }}
    >
      {categories.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          id={`story-picker-tab-${id}`}
          data-picker-category={id}
          type="button"
          role="tab"
          aria-selected={category === id}
          aria-controls="story-video-picker-list"
          onClick={() => setCategory(id)}
        >
          <Icon size={17} aria-hidden="true" />
          <span>{translateText(label, readLanguage())}</span>
        </button>
      ))}
    </nav>
  ) : null;

  return {
    uploading,
    elements,
    navigation,
    isOpen: Boolean(library),
    /** Opens the matching category in the Library, with one-file import available. */
    choose: (to: MediaTarget) => {
      target.current = to;
      setCategory(defaultPickerCategory(to));
      void Promise.all([loadLibraryAssets(), listLibrarySourceFolders(), browserLibraryFolderNames()]).then(
        ([assets, folders, browserFolders]) => {
          setLibrary(assets);
          setSourceFolders({ ...browserFolders, ...folders });
        },
        (cause) => onError(`Could not open the Library: ${errorMessage(cause)}`),
      );
    },
  };
}

export function defaultPickerCategory(
  target: MediaTarget,
): "video" | "image" | "audio" | "custom" {
  if (isAudioOnlyTarget(target)) return "audio";
  if (isImageOnlyTarget(target)) return "custom";
  return target === "backdrop" ? "video" : "image";
}

function isImageOnlyTarget(target: MediaTarget): boolean {
  return target === "button" ||
    target === "button-pressed" ||
    target === "motion-ring" ||
    target === "motion-bar" ||
    target === "motion-swipe" ||
    target === "motion-base" ||
    target === "motion-pressed" ||
    target === "settings-button" ||
    target === "return-button";
}

function isAudioOnlyTarget(target: MediaTarget): boolean {
  return target === "button-sound";
}

/** Scene media controls in the inspector. */
export function MediaMenu({
  disabled,
  uploading,
  canSetBackdrop,
  canRemoveBackdrop,
  canSetBackdropLoop,
  backdropLoop,
  pictureInPictureVideoLoop,
  noInputMode,
  canEnableVideoEndAutoAdvance,
  videoEndAutoAdvance,
  onChoose,
  onRemoveBackdrop,
  onBackdropLoopChange,
  onPictureInPictureVideoLoopChange,
  onNoInputModeChange,
  onVideoEndAutoAdvanceChange,
}: {
  disabled: boolean;
  uploading: boolean;
  canSetBackdrop: boolean;
  canRemoveBackdrop: boolean;
  canSetBackdropLoop: boolean;
  backdropLoop: boolean;
  pictureInPictureVideoLoop: boolean;
  noInputMode: PlayableNoInputMode | undefined;
  canEnableVideoEndAutoAdvance: boolean;
  videoEndAutoAdvance: boolean;
  onChoose: (to: MediaTarget) => void;
  onRemoveBackdrop: () => void;
  onBackdropLoopChange: (loop: boolean) => void;
  onPictureInPictureVideoLoopChange: (loop: boolean) => void;
  onNoInputModeChange: (mode: PlayableNoInputMode) => void;
  onVideoEndAutoAdvanceChange: (enabled: boolean) => void;
}) {
  const language = readLanguage();
  const unavailable = disabled || uploading;
  const choose = (to: MediaTarget) => () => {
    onChoose(to);
  };

  return (
    <details
      className="playable-preview-media"
      aria-label={translateText("Scene settings")}
      open
    >
      <summary>
        {uploading ? <LoaderCircle className="spin" size={13} /> : null}
        {translateText("Scene settings", language)}
      </summary>
      <div className="playable-preview-popover is-media" role="group">
        <div className="playable-preview-media-group">
          <div className="playable-preview-media-group-title">
            {t("playableWorkbench.backgroundVideoSettings")}
          </div>
          <button
            type="button"
            disabled={unavailable || !canSetBackdrop}
            title={
              canSetBackdrop
                ? translateText("Show it behind this Scene", language)
                : translateText(
                    "This Scene has no background to set; add it to the chat instead",
                    language,
                  )
            }
            onClick={choose("backdrop")}
          >
            <Image size={13} />
            <span>
              {renderParenthetical(
                translateText("Add video/image (background video)", language),
              )}
            </span>
          </button>
          {canSetBackdropLoop ? (
            <PlaybackModeOptions
              label={translateText("Background video playback", language)}
              loop={backdropLoop}
              disabled={unavailable}
              onChange={onBackdropLoopChange}
            />
          ) : null}
          <div className="playable-preview-media-heading">
            {translateText("Interaction mode", language)}
          </div>
          {canSetBackdropLoop ? (
            <label className="playable-video-end-auto-advance">
              <input
                type="checkbox"
                checked={videoEndAutoAdvance}
                disabled={unavailable || (backdropLoop && !videoEndAutoAdvance)}
                title={
                  !canEnableVideoEndAutoAdvance
                    ? translateText(
                        "Requires exactly one connected story Exit",
                        language,
                      )
                    : backdropLoop
                      ? translateText(
                          "Turn off looping to use video-end navigation",
                          language,
                        )
                      : undefined
                }
                onChange={(event) =>
                  onVideoEndAutoAdvanceChange(event.target.checked)
                }
              />
              <span>
                {translateText(
                  "Automatically continue when the video ends",
                  language,
                )}
              </span>
            </label>
          ) : null}
          <div
            className="playable-no-input-options"
            role="radiogroup"
            aria-label={translateText("Interaction mode", language)}
          >
            {(
              [
                ["continue", "Play without input"],
                ["wait", "Wait for input to play"],
              ] as const
            ).map(([mode, label]) => (
              <label key={mode}>
                <input
                  type="radio"
                  name="playable-no-input-mode"
                  value={mode}
                  checked={noInputMode === mode}
                  disabled={unavailable}
                  onChange={() => onNoInputModeChange(mode)}
                />
                <span>{translateText(label, language)}</span>
              </label>
            ))}
          </div>
          {noInputMode === undefined ? (
            <small>
              {translateText(
                "Existing behavior is unchanged until you choose an option.",
                language,
              )}
            </small>
          ) : null}
          {canRemoveBackdrop ? (
            <button
              type="button"
              disabled={unavailable}
              title={t("playableWorkbench.removeSceneBackground")}
              onClick={onRemoveBackdrop}
            >
              <ImageOff size={13} />
              <span>{translateText("Remove background", language)}</span>
            </button>
          ) : null}
        </div>
        <div className="playable-preview-media-group">
          <div className="playable-preview-media-group-title">
            {t("playableWorkbench.pictureInPictureSettings")}
          </div>
          <button
            type="button"
            disabled={unavailable}
            onClick={choose("canvas")}
          >
            <Image size={13} />
            <span>
              {renderParenthetical(
                translateText("Add video/image (picture-in-picture)", language),
              )}
            </span>
          </button>
          <PlaybackModeOptions
            label={translateText("Picture-in-picture video playback", language)}
            loop={pictureInPictureVideoLoop}
            disabled={unavailable}
            onChange={onPictureInPictureVideoLoopChange}
          />
        </div>
      </div>
    </details>
  );
}

export function GameFunctionSettings({
  disabled,
  uploading,
  globalFontFamily,
  fonts,
  fontDirectoryName,
  onChangeGlobalFontFamily,
  onScanSystemFonts,
  onAddFontDirectory,
  onChooseSettingsButtonIcon,
  settingsButtonIconPending,
  settingsButtonIconApplying,
  onConfirmSettingsButtonIcon,
  returnButtonIconPending,
  returnButtonIconApplying,
  onChooseReturnButtonIcon,
  onConfirmReturnButtonIcon,
  buttonSoundSelected,
  onChooseButtonSound,
  onRemoveButtonSound,
}: {
  disabled: boolean;
  uploading: boolean;
  globalFontFamily: string;
  fonts: readonly string[];
  fontDirectoryName?: string;
  onChangeGlobalFontFamily: (fontFamily: string) => void;
  onScanSystemFonts: () => Promise<void>;
  onAddFontDirectory: () => Promise<void>;
  onChooseSettingsButtonIcon: () => void;
  settingsButtonIconPending: boolean;
  settingsButtonIconApplying: boolean;
  onConfirmSettingsButtonIcon: () => void;
  returnButtonIconPending: boolean;
  returnButtonIconApplying: boolean;
  onChooseReturnButtonIcon: () => void;
  onConfirmReturnButtonIcon: () => void;
  buttonSoundSelected: boolean;
  onChooseButtonSound: () => void;
  onRemoveButtonSound: () => void;
}) {
  const unavailable = disabled || uploading;
  const language = readLanguage();
  const [fontAction, setFontAction] = useState<"scan" | "folder">();
  const [fontError, setFontError] = useState("");
  const runFontAction = async (
    action: "scan" | "folder",
    run: () => Promise<void>,
  ) => {
    setFontAction(action);
    setFontError("");
    try {
      await run();
    } catch {
      setFontError(t("playableWorkbench.fontAccessError"));
    } finally {
      setFontAction(undefined);
    }
  };
  return (
    <section
      className="playable-preview-media-group playable-preview-game-function-settings"
      aria-label={t("playableWorkbench.gameFunctionSettings")}
    >
      <div className="playable-preview-media-heading playable-global-font-heading">
        <span>{t("playableWorkbench.globalFont")}</span>
        <small className="playable-global-font-description">
          {t("playableWorkbench.globalFontDescription")}
        </small>
      </div>
      <div className="playable-global-font-row">
        <label className="playable-global-font-control">
          <select
            aria-label={t("playableWorkbench.globalFont")}
            value={globalFontFamily}
            disabled={unavailable}
            onChange={(event) => onChangeGlobalFontFamily(event.target.value)}
          >
            <option value="">
              {t("playableWorkbench.useElementFonts")}
            </option>
            {[
              ...new Set([
                ...(globalFontFamily ? [globalFontFamily] : []),
                ...fonts,
              ]),
            ].map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </label>
        <div className="playable-global-font-actions">
          <button
            type="button"
            disabled={unavailable || fontAction !== undefined}
            aria-label={t("playableWorkbench.scanSystemFonts")}
            title={t("playableWorkbench.scanSystemFonts")}
            aria-busy={fontAction === "scan"}
            onClick={() =>
              void runFontAction("scan", onScanSystemFonts)
            }
          >
            {fontAction === "scan" ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <Type size={14} />
            )}
          </button>
          <button
            type="button"
            disabled={unavailable || fontAction !== undefined}
            aria-label={t("playableWorkbench.addFontFolder")}
            title={t("playableWorkbench.addFontFolder")}
            aria-busy={fontAction === "folder"}
            onClick={() =>
              void runFontAction("folder", onAddFontDirectory)
            }
          >
            {fontAction === "folder" ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <FolderOpen size={14} />
            )}
          </button>
        </div>
      </div>
      {fontDirectoryName ? (
        <small className="playable-global-font-folder">
          {t("playableWorkbench.fontFolderSelected", {
            name: fontDirectoryName,
          })}
        </small>
      ) : null}
      {fontError ? (
        <small className="playable-global-font-error" role="alert">
          {fontError}
        </small>
      ) : null}
      <div className="playable-preview-media-heading">
        {translateText("Game settings button", language)}
      </div>
      <div className="playable-preview-media-button-actions">
        <button
          type="button"
          className="playable-preview-media-button-choice"
          disabled={unavailable}
          onClick={onChooseSettingsButtonIcon}
        >
          <Image size={13} />
          <span>
            {translateText(
              "Choose settings button icon from Library",
              language,
            )}
          </span>
        </button>
        {settingsButtonIconPending ? (
          <button
            type="button"
            className="playable-preview-media-button-confirm"
            aria-label={t("playableWorkbench.confirmSettingsButtonIcon")}
            title={t(
              settingsButtonIconApplying
                ? "playableWorkbench.applyingSettingsButtonIcon"
                : "playableWorkbench.confirmSettingsButtonIcon",
            )}
            disabled={unavailable || settingsButtonIconApplying}
            aria-busy={settingsButtonIconApplying}
            onClick={onConfirmSettingsButtonIcon}
          >
            {settingsButtonIconApplying ? (
              <LoaderCircle className="spin" size={13} />
            ) : null}
            <span>
              {t(
                settingsButtonIconApplying
                  ? "playableWorkbench.applyingSettingsButtonIcon"
                  : "playableWorkbench.confirmSettingsButtonIcon",
              )}
            </span>
          </button>
        ) : null}
      </div>
      <div className="playable-preview-media-heading">
        {t("playableWorkbench.returnButton")}
      </div>
      <div className="playable-preview-media-button-actions">
        <button
          type="button"
          className="playable-preview-media-button-choice"
          disabled={unavailable}
          onClick={onChooseReturnButtonIcon}
        >
          <Image size={13} />
          <span>{t("playableWorkbench.chooseReturnButtonIcon")}</span>
        </button>
        {returnButtonIconPending ? (
          <button
            type="button"
            className="playable-preview-media-button-confirm"
            aria-label={t("playableWorkbench.confirmReturnButtonIcon")}
            title={t(
              returnButtonIconApplying
                ? "playableWorkbench.applyingReturnButtonIcon"
                : "playableWorkbench.confirmReturnButtonIcon",
            )}
            disabled={unavailable || returnButtonIconApplying}
            aria-busy={returnButtonIconApplying}
            onClick={onConfirmReturnButtonIcon}
          >
            {returnButtonIconApplying ? (
              <LoaderCircle className="spin" size={13} />
            ) : (
              <Check size={13} />
            )}
            <span>
              {t(
                returnButtonIconApplying
                  ? "playableWorkbench.applyingReturnButtonIcon"
                  : "playableWorkbench.confirmReturnButtonIcon",
              )}
            </span>
          </button>
        ) : null}
      </div>
      <div className="playable-preview-media-heading">
        {t("playableWorkbench.buttonSound")}
      </div>
      <button
        type="button"
        disabled={unavailable}
        onClick={onChooseButtonSound}
      >
        <Music2 size={13} />
        <span>
          {t(
            buttonSoundSelected
              ? "playableWorkbench.replaceButtonSound"
              : "playableWorkbench.chooseButtonSound",
          )}
        </span>
      </button>
      {buttonSoundSelected ? (
        <button
          type="button"
          disabled={unavailable}
          onClick={onRemoveButtonSound}
        >
          <X size={13} />
          <span>{t("playableWorkbench.removeButtonSound")}</span>
        </button>
      ) : null}
    </section>
  );
}

function PlaybackModeOptions({
  label,
  loop,
  disabled,
  onChange,
}: {
  label: string;
  loop: boolean;
  disabled: boolean;
  onChange: (loop: boolean) => void;
}) {
  return (
    <>
      <div className="playable-preview-media-heading">{label}</div>
      <div
        className="playable-preview-media-playback"
        role="radiogroup"
        aria-label={label}
      >
        {[false, true].map((value) => (
          <label key={String(value)}>
            <input
              type="radio"
              name={label}
              checked={loop === value}
              disabled={disabled}
              onChange={() => onChange(value)}
            />
            <span>
              {translateText(value ? "Loop" : "Play once", readLanguage())}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

/** Shows short messages over the preview; each fades after a few seconds. */
function usePreviewToasts() {
  const [toasts, setToasts] = useState<PreviewToast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const show = useCallback(
    (toast: Omit<PreviewToast, "id">) => {
      const id = nextId.current++;
      setToasts((current) =>
        [...current, { ...toast, id }].slice(-TOAST_LIMIT),
      );
      timers.current.set(
        id,
        setTimeout(
          () => dismiss(id),
          toast.targetNodeId || toast.tone === "error"
            ? TOAST_LONG_MS
            : TOAST_MS,
        ),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return { toasts, show, dismiss };
}

const TOAST_ICONS: Record<PreviewToast["tone"], IconComponent> = {
  info: ArrowRight,
  warning: InfoCircle,
  error: InfoCircle,
};

/**
 * The top of the preview: the Scene's errors, which stay until they are gone,
 * then what the preview did instead of navigating.
 */
function PreviewToasts({
  errors,
  toasts,
  onFix,
  onOpenNode,
  onDismiss,
}: {
  errors: readonly string[];
  toasts: readonly PreviewToast[];
  onFix: () => void;
  onOpenNode: (nodeId: string) => void;
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className="playable-preview-toasts"
      aria-live="polite"
      aria-label={translateText("What happened in the preview")}
    >
      {errors.length ? (
        <p className="playable-preview-toast is-error" role="alert">
          <InfoCircle size={12} />
          <span title={errors.join("\n")}>
            {errors[0]}
            {errors.length > 1
              ? t("sceneWorkbench.moreErrors", { count: errors.length - 1 })
              : ""}
          </span>
          <button type="button" title={translateText("Ask the AI to fix this")} onClick={onFix}>
            {translateText("Fix")}
          </button>
        </p>
      ) : null}
      {toasts.map((toast) => {
        const Icon = TOAST_ICONS[toast.tone];
        return (
          <p
            key={toast.id}
            className={`playable-preview-toast is-${toast.tone}`}
            role={toast.tone === "error" ? "alert" : undefined}
          >
            <Icon size={12} />
            <span title={toast.text}>{toast.text}</span>
            {toast.targetNodeId ? (
              <button
                type="button"
                onClick={() => {
                  onDismiss(toast.id);
                  onOpenNode(toast.targetNodeId!);
                }}
              >
                {translateText("Open")}
              </button>
            ) : null}
            <button
              type="button"
              className="playable-preview-toast-close"
              aria-label={translateText("Dismiss")}
              onClick={() => onDismiss(toast.id)}
            >
              <X size={11} />
            </button>
          </p>
        );
      })}
    </div>
  );
}

/**
 * What one navigation report says. The author just used the Exit, so the
 * message only names where the game would go.
 */
function reportToast(
  graph: NodeGraph,
  report: NodeRuntimeSnapshot["reports"][number],
): Omit<PreviewToast, "id"> {
  if (!report.targetNodeId) {
    return {
      tone: "warning",
      text:
        report.kind === "back"
          ? t("sceneWorkbench.nowhereBack")
          : t("sceneWorkbench.opensNothing"),
    };
  }
  const title =
    playableNodeById(graph, report.targetNodeId)?.title ?? report.targetNodeId;
  const text =
    report.kind === "back"
      ? t("sceneWorkbench.wouldBack", { title })
      : report.kind === "restart"
        ? t("sceneWorkbench.wouldRestart", { title })
        : report.kind === "continue"
          ? t("sceneWorkbench.wouldContinue", { title })
          : t("sceneWorkbench.wouldOpen", { title });
  return { tone: "info", text, targetNodeId: report.targetNodeId };
}

/**
 * What is wrong in this Scene: the build error, project issues, and errors in
 * the preview, each once. Exits that go nowhere show on the canvas instead.
 */
function previewErrors(
  graph: NodeGraph,
  node: PlayableNode,
  issues: readonly PlayableProjectValidationIssue[],
  buildError: string | undefined,
  snapshot: NodeRuntimeSnapshot | undefined,
  diagnostics: readonly { message: string }[],
): string[] {
  const titleOf = (nodeId: string) =>
    playableNodeById(graph, nodeId)?.title ?? nodeId;
  return [
    ...new Set([
      ...(buildError ? [buildError] : []),
      ...issues.map((issue) => issue.message),
      ...(snapshot?.errors ?? []).map((error) =>
        error.nodeId && error.nodeId !== node.id
          ? `${titleOf(error.nodeId)}: ${error.message}`
          : error.message,
      ),
      ...diagnostics.map((diagnostic) => diagnostic.message),
    ]),
  ];
}

/** The chat request behind Fix. */
function fixErrorsRequest(title: string, errors: readonly string[]): string {
  const one = errors.length === 1;
  return `The preview of ${title} shows ${one ? "this error" : "these errors"}:\n${errors.map((error) => `- ${error}`).join("\n")}\nFix ${one ? "it" : "them"}.`;
}

/**
 * Builds the project's current sources for a Workbench preview. A rebuild
 * with identical output keeps the running preview.
 */
export function usePlayablePreviewRuntime(
  projectId: string,
  nodeId: string,
  revision: number,
  skipNextRevision?: { current: number },
): PreviewRuntime {
  const [runtime, setRuntime] = useState<PreviewRuntime>({});
  const runtimeKey = useRef<string | undefined>(undefined);
  const assetCache = useRef(new Map<string, Blob>());
  const graphRef = useRef<NodeGraph | undefined>(undefined);
  const lastRevision = useRef({ projectId, revision });
  const loadAssets = useCallback(
    (assetIds: readonly string[]) => {
      const graph = graphRef.current;
      if (!graph) throw new Error("Scene Assets are not available yet.");
      return loadPlayableAssets(projectId, graph, assetCache.current, assetIds);
    },
    [projectId],
  );

  useEffect(() => {
    const previous = lastRevision.current;
    if (previous.projectId !== projectId) {
      runtimeKey.current = undefined;
      assetCache.current.clear();
      graphRef.current = undefined;
    }
    const revisionDelta =
      previous.projectId === projectId
        ? Math.max(0, revision - previous.revision)
        : 0;
    lastRevision.current = { projectId, revision };
    // Never skip the first runtime load: an edit can finish while that load is
    // still in flight, and skipping its replacement would leave the preview empty.
    const canKeepRunningPreview = runtimeKey.current !== undefined;
    if (skipNextRevision && revisionDelta > 0 && skipNextRevision.current > 0) {
      const skippedRevisions = Math.min(
        revisionDelta,
        skipNextRevision.current,
      );
      skipNextRevision.current -= skippedRevisions;
      if (canKeepRunningPreview && skippedRevisions === revisionDelta) return;
    }
    let disposed = false;
    void getNodeRuntime(projectId)
      .then(async (result) => {
        if (!result.available)
          throw new Error("This project has no Scenes yet.");
        graphRef.current = result.definition.graph;
        const key = playableRuntimeKey(result.definition);
        const selectedNode =
          result.definition.graph.nodes.find((node) => node.id === nodeId) ??
          result.definition.graph.nodes.find(
            (node) => node.id === result.definition.graph.entryNodeId,
          );
        if (!selectedNode)
          throw new Error("This project has no Scenes yet.");
        const assets = await loadAssets(selectedNode.assets);
        if (disposed) return;
        if (key === runtimeKey.current) {
          setRuntime((current) => ({
            ...current,
            definition: result.definition,
            assets: { ...current.assets, ...assets },
            loadAssets,
            error: undefined,
          }));
          return;
        }
        runtimeKey.current = key;
        setRuntime({ definition: result.definition, assets, loadAssets });
      })
      .catch((cause) => {
        if (!disposed)
          setRuntime((current) => ({ ...current, error: errorMessage(cause) }));
      });
    return () => {
      disposed = true;
    };
  }, [projectId, nodeId, revision, skipNextRevision, loadAssets]);

  return runtime;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
