import {
  ArrowDownUp,
  Clapperboard,
  Code2,
  FileText,
  House,
  LoaderCircle,
  PanelToggle,
  Play,
  Share2,
  Settings,
} from "./icons.js";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  type CSSProperties,
} from "react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
  useNodesInitialized,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import { snapCanvasPosition } from "./canvas-alignment.js";
import {
  EditorCanvas,
  isTextEntry,
  undoShortcut,
  type CanvasContextMenuState,
} from "./editor-canvas.js";
import type { ProjectState, PromptContext } from "../shared/contracts.js";
import {
  affectionSignalIds,
  writePlayableAffectionConfig,
  type PlayableAffectionConfig,
} from "../shared/playable-affection.js";
import {
  rebasePlayableCodebase,
  samePlayableGraph,
  type NodeCodebase,
  type NodeCodebaseUpdate,
  type NodeEditorLayout,
} from "../shared/playable-codebase.js";
import {
  arrangePlayableNodes,
  fitPlayableCanvasToAllNodes,
  focusPlayableCanvasNode,
  unconnectedPlayableNodeIds,
} from "./playable-flow.js";
import { type NodeGraph, type PlayableNode } from "../shared/playable-nodes.js";
import type {
  PlayableStoryTreeCanvasEdge,
  PlayableStoryTreeCanvasStatus,
} from "../shared/playable-story-tree.js";
import {
  playableTranslateValue,
  setPlayableElementStyle,
  setPlayableElementTiming,
  setPlayableElementTransform,
  setPlayableElementTranslate,
} from "../shared/playable-move.js";
import {
  insertPlayableButtonPreset,
  insertPlayableMediaElement,
  PLAYABLE_BUTTON_ASSET_SCALE_MAX,
  PLAYABLE_BUTTON_ASSET_SCALE_MIN,
  PLAYABLE_BUTTON_PRESET_STYLE,
  PLAYABLE_MOTION_ATTRIBUTES,
  playableNoInputMode,
  removePlayableSignalAttributes,
  setPlayableNoInputMode,
  type PlayableNoInputMode,
  type PlayableButtonAction,
  setPlayableElementAttributes,
  type PlayableMotionConfig,
} from "../shared/playable-motion.js";
import type { PlayablePickResult } from "../shared/playable-picker.js";
import {
  isPlayableStoryEnding,
  withPlayableStoryOption,
} from "../shared/playable-story-map.js";
import type {
  NodePlayerDefinition,
  PlayableDeleteEdit,
  PlayableElementClipboardCommand,
  PlayableElementCopy,
  PlayableInteractionTimingEdit,
  PlayableMove,
  PlayableTextCreate,
  PlayableTextEdit,
  PlayableTextStyleEdit,
  PlayableTransformEdit,
} from "../shared/playable-player-protocol.js";

import {
  parsePlayableSourceLocation,
  playableSourceLocationByCssPath,
  insertPlayableElementCopies,
  insertPlayableText,
  removePlayableElement,
  removePlayableElementByCssPath,
  removePlayableTextPart,
  replacePlayableElementText,
} from "../shared/playable-text-edit.js";
import {
  clearPlayableBackdrop,
  playableBackdrop,
  playableBackdropAsset,
  playableBackdropLoops,
  playablePictureInPictureVideoLoops,
  setPlayableBackdrop,
  setPlayableBackdropLoop,
  setPlayablePictureInPictureVideoLoop,
} from "../shared/playable-backdrop.js";
import {
  addPlayableGraphAsset,
  addPlayableNodeAsset,
  deletePlayableButtonSignals,
  deletePlayableSignal,
  playableEdgeId,
  removeOrphanedPlayableButtonSignals,
  setPlayableSignalLabel,
  playableThumbnailHash,
  type PlayablePresetSummary,
  type PlayableProjectValidationIssue,
  type PlayableThumbnailManifest,
} from "../shared/playable-editor.js";
import {
  normalizePlayableSettingsButtonPosition,
  normalizePlayableSettingsButtonSize,
} from "../shared/playable-settings-button.js";
import { normalizePlayableReturnButton } from "../shared/playable-return-button.js";
import {
  addPlayableNode,
  ApiError,
  buildInteractiveStory,
  getNodeCodebase,
  getPlayableBackdropEffects,
  getPlayableValidation,
  getWorkspaceFile,
  listPlayablePresets,
  listPlayableThumbnails,
  updateNodeCodebase,
  updatePlayableBackdropEffects,
  type InteractiveStoryExportFormat,
} from "./api.js";
import { PublishDialog, type PublishDetails } from "./publish-dialog.js";
import { WorkspaceCodeView } from "./coding-workspace.js";
import { playtestHash } from "./routes.js";
import {
  PlayableNodeWorkbench,
  type PlayableAssetRequest,
  type PlayableHistoryItem,
  type PlaytestStart,
} from "./playable-node-workbench.js";
import { PlayableEdge } from "./playable-edge.js";
import { PlayableProjectSettingsDialog } from "./playable-project-settings-dialog.js";
import { requestPlaytestStart } from "./playable-playtest.js";
import type { PlayableChatState } from "./playable-chat.js";
import {
  DEFAULT_PLAYABLE_BACKDROP_EFFECTS,
  type PlayableBackdropEffects,
} from "../shared/playable-backdrop-effects.js";
import {
  buildCodebase,
  createFlowNode,
  nodeIdForIssuePath,
  toFlowEdge,
  toFlowNode,
  uniqueNodeId,
  type GraphMeta,
  type PlayableFlowData,
  type PlayableFlowNode,
} from "./playable-flow.js";
import {
  playableEditorHistoryKey,
  preservePlayableEditorView,
  samePlayableEditorHistoryState,
} from "./playable-editor-history.js";
import {
  createPlayableClipboard,
  duplicatePlayableSelection,
  parsePlayableClipboard,
  type CopiedPlayableSelection,
} from "./playable-canvas-clipboard.js";
import {
  PLAYABLE_NODE_TYPES,
  PlayableCanvasContext,
} from "./playable-node-card.js";
import { routePlayableClipboardShortcut } from "./playable-editor-shortcuts.js";
import {
  PlayableAddControl,
  PlayableCanvasContextMenu,
  PlayableEmptyCanvas,
} from "./playable-canvas-menus.js";
import { WorkspaceTabs, type WorkspaceTabOption } from "./workspace-tabs.js";
import { useDesktopSave } from "./desktop-close-guard.js";
import { t, translateText } from "./i18n.js";

const DEFAULT_CANVAS_VIEWPORT = { x: 64, y: 32, zoom: 1 };
const CanvasWorkspace = lazy(() =>
  import("./canvas-workspace.js").then((module) => ({
    default: module.CanvasWorkspace,
  })),
);

const HISTORY_LIMIT = 50;
const SAVE_ATTEMPTS = 3;
const PROJECT_CHANGED = translateText(
  "The project changed while you were editing, so its latest version was loaded. Make your last change again.",
);

function sourceLocationForPick(
  html: string,
  pick: PlayablePickResult,
): ReturnType<typeof parsePlayableSourceLocation> {
  const original = pick.source
    ? parsePlayableSourceLocation(pick.source)
    : undefined;
  if (!original) return undefined;
  if (!new RegExp(`^${pick.tag}#[a-z][\\w-]*$`, "i").test(pick.cssPath))
    return original;
  const current = playableSourceLocationByCssPath(
    html,
    pick.cssPath,
    pick.tag,
  );
  return current ? { ...original, ...current } : undefined;
}

/** A step to undo or redo: the codebase, and the source files as they were, when the step wrote any. */
interface HistoryEntry {
  id: number;
  label: string;
  createdAt: number;
  codebase: NodeCodebase;
  sources?: Record<string, string>;
}

/**
 * The editor for a Playable Nodes project: one canvas of Nodes, one edge per
 * Signal.
 * It speaks the editor's words (Scene, Exit, Variables); code and
 * graph.json keep the engine's (Node, Signal, State).
 */
export function PlayableEditorWorkspace({
  project,
  agentBusy,
  publishing,
  workspaceRevision = 0,
  openFileRequest,
  onPublish,
  publishDialog,
  onOpenPublish,
  onClosePublish,
  chatOnRight = false,
  chatCollapsed = false,
  onHome,
  onToggleChat,
  onChatContextChange,
  onStoryTreeVisibilityChange,
  onCanvasNodeIdsChange,
  onCanvasEdgesChange,
  storyTreeCanvasStatus,
  storyTreeCanvasSyncProgress,
  storyTreeCanvasFitAfterRevision,
  storyTreeCanvasFocusRequest,
  onAskAgent,
  onSendToAgent,
  designOpen = false,
  onDesignOpenChange,
  onDesignSaveReady,
  onCanvasSaveReady,
  onDesignContextChange,
  onProjectUpdated,
}: {
  project: ProjectState;
  onProjectUpdated?: (project: ProjectState) => void;
  agentBusy: boolean;
  publishing: boolean;
  workspaceRevision?: number;
  openFileRequest?: { path: string; id: number };
  onPublish: (details: PublishDetails) => Promise<boolean>;
  publishDialog?: "open" | "success";
  onOpenPublish: () => void;
  onClosePublish: () => void;
  chatOnRight?: boolean;
  chatCollapsed?: boolean;
  onHome?: () => void;
  onToggleChat?: () => void;
  designOpen?: boolean;
  onDesignOpenChange?: (open: boolean) => void;
  /** Receives what the open Workbench adds to the next chat message. */
  onChatContextChange?: (state: PlayableChatState | undefined) => void;
  onStoryTreeVisibilityChange?: (visible: boolean) => void;
  onCanvasNodeIdsChange?: (nodeIds: readonly string[]) => void;
  onCanvasEdgesChange?: (
    edges: readonly PlayableStoryTreeCanvasEdge[],
  ) => void;
  storyTreeCanvasStatus?: PlayableStoryTreeCanvasStatus;
  storyTreeCanvasSyncProgress?: "generate" | "update";
  storyTreeCanvasFitAfterRevision?: number;
  storyTreeCanvasFocusRequest?: { sequence: number; nodeId: string };
  /** Puts a request in the chat prompt. */
  onAskAgent?: (text: string) => void;
  onDesignSaveReady?: (save: (() => Promise<void>) | undefined) => void;
  onCanvasSaveReady?: (save: (() => Promise<void>) | undefined) => void;
  onDesignContextChange?: (context: PromptContext | undefined) => void;
  /** Sends a request to the AI now, with the open Node as context. */
  onSendToAgent?: (text: string, contexts: PromptContext[]) => Promise<boolean>;
}) {
  const projectId = project.id;
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [loadedWorkspaceRevision, setLoadedWorkspaceRevision] =
    useState<number>();
  const [notice, setNotice] = useState<string>();
  const [graphMeta, setGraphMeta] = useState<GraphMeta>();
  const [nodes, setNodes] = useState<PlayableFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [editorLayout, setEditorLayout] = useState<NodeEditorLayout>({
    version: 1,
    nodes: {},
    viewport: DEFAULT_CANVAS_VIEWPORT,
    view: "canvas",
  });
  const [workspaceView, setWorkspaceView] = useState<"canvas" | "code">(
    "canvas",
  );
  const [codeRevision, setCodeRevision] = useState(0);
  const [fileRequest, setFileRequest] = useState(openFileRequest);
  const [designHeaderActions, setDesignHeaderActions] =
    useState<HTMLDivElement | null>(null);
  const designLeave = useRef<((action: () => void) => void) | undefined>(
    undefined,
  );
  const registerDesignLeave = useCallback(
    (leave: ((action: () => void) => void) | undefined) => {
      designLeave.current = leave;
    },
    [],
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [openedNodeId, setOpenedNodeId] = useState<string>();
  const [elementClipboardCommand, setElementClipboardCommand] =
    useState<PlayableElementClipboardCommand>();
  const elementClipboardSequence = useRef(0);
  const [canvasContextMenu, setCanvasContextMenu] =
    useState<CanvasContextMenuState>();
  const [copiedSelection, setCopiedSelection] =
    useState<CopiedPlayableSelection>();
  const [presets, setPresets] = useState<PlayablePresetSummary[]>([]);
  const [issues, setIssues] = useState<PlayableProjectValidationIssue[]>([]);
  const [builtDefinitionState, setBuiltDefinitionState] = useState<{
    projectId: string;
    workspaceRevision: number;
    codeRevision: number;
    definition: NodePlayerDefinition;
  }>();
  const builtDefinition =
    builtDefinitionState?.projectId === projectId &&
    builtDefinitionState.workspaceRevision === workspaceRevision &&
    builtDefinitionState.codeRevision === codeRevision
      ? builtDefinitionState.definition
      : undefined;
  const [thumbnails, setThumbnails] = useState<PlayableThumbnailManifest>();
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [backdropEffects, setBackdropEffects] =
    useState<PlayableBackdropEffects>(DEFAULT_PLAYABLE_BACKDROP_EFFECTS);
  const [building, setBuilding] = useState(false);
  const [playtesting, setPlaytesting] = useState(false);
  const [writing, setWriting] = useState(false);
  const latestCodebase = useRef<NodeCodebase | undefined>(undefined);
  const repairingButtonSignals = useRef(new Set<string>());
  const canvas = useRef<ReactFlowInstance<PlayableFlowNode, Edge>>(null);
  /** What the editor last read from or wrote to disk, and the revision a save has to start from. */
  const diskCodebase = useRef<
    { codebase: NodeCodebase; revision: string } | undefined
  >(undefined);
  /** Counts the versions loaded from disk, so a save queued before a load is not written over it. */
  const diskGeneration = useRef(0);
  const queuedCodebase = useRef<string | undefined>(undefined);
  const saveChain = useRef(Promise.resolve());
  const undoHistory = useRef<HistoryEntry[]>([]);
  const redoHistory = useRef<HistoryEntry[]>([]);
  /** What the editor last wrote to each source file it changed, for undo to swap back. */
  const writtenSources = useRef<Record<string, string>>({});
  const historyObserved = useRef<NodeCodebase | undefined>(undefined);
  const historyObservedJson = useRef<string | undefined>(undefined);
  const historyPendingBase = useRef<NodeCodebase | undefined>(undefined);
  const historyPendingLabel = useRef<string | undefined>(undefined);
  const historyNextLabel = useRef<string | undefined>(undefined);
  const historyTimer = useRef<number | undefined>(undefined);
  const historyGestureBase = useRef<NodeCodebase | undefined>(undefined);
  const historySequence = useRef(0);
  const [historyRevision, setHistoryRevision] = useState(0);
  const handledStoryTreeCanvasRequest = useRef(0);
  const handledStoryTreeCanvasFitRevision = useRef<number | undefined>(
    undefined,
  );
  const handledStoryTreeCanvasFocusSequence = useRef(0);

  const codebase = useMemo(
    () =>
      graphMeta
        ? buildCodebase(graphMeta, nodes, edges, editorLayout, workspaceView)
        : undefined,
    [graphMeta, nodes, edges, editorLayout, workspaceView],
  );
  const canvasNodeIdsKey = useMemo(
    () => nodes.map((node) => node.id).join("\u0000"),
    [nodes],
  );
  latestCodebase.current = codebase;
  const playerViewport = graphMeta?.viewport ?? { width: 1280, height: 720 };
  const playerViewportAspect = playerViewport.width / playerViewport.height;
  const canvasStageWidth = 440 * Math.min(1, playerViewportAspect);
  const canvasStageHeight = 440 / Math.max(1, playerViewportAspect);
  const canUndo = Boolean(
    historyPendingBase.current || undoHistory.current.length,
  );
  const canRedo = !historyPendingBase.current && redoHistory.current.length > 0;
  const historyItems = useMemo<PlayableHistoryItem[]>(
    () => [
      {
        id: "current",
        label: t("playableWorkbench.historyCurrentVersion"),
        createdAt: Date.now(),
        current: true,
      },
      ...undoHistory.current
        .slice()
        .reverse()
        .map((entry, offset) => ({
          id: `history-${entry.id}`,
          label: t("playableWorkbench.historyBefore", { label: entry.label }),
          createdAt: entry.createdAt,
          current: false,
          restoreIndex: undoHistory.current.length - offset - 1,
        })),
    ],
    [historyRevision],
  );
  const openedNode =
    !designOpen && workspaceView === "canvas" && phase === "ready"
      ? nodes.find((node) => node.id === openedNodeId)?.data.node
      : undefined;

  useEffect(() => {
    onStoryTreeVisibilityChange?.(
      !designOpen && workspaceView === "canvas" && !openedNodeId,
    );
  }, [designOpen, onStoryTreeVisibilityChange, openedNodeId, workspaceView]);

  useEffect(() => {
    const request = storyTreeCanvasFocusRequest;
    if (
      !request ||
      request.sequence <= handledStoryTreeCanvasRequest.current
    )
      return;
    handledStoryTreeCanvasRequest.current = request.sequence;
    if (designOpen) onDesignOpenChange?.(false);
    setWorkspaceView("canvas");
    setOpenedNodeId(undefined);
  }, [
    designOpen,
    onDesignOpenChange,
    storyTreeCanvasFocusRequest,
  ]);

  const selectStoryTreeCanvasNode = useCallback((nodeId: string) => {
    setCanvasContextMenu(undefined);
    setSelectedEdgeId(undefined);
    setNodes((current) =>
      current.map((node) => ({ ...node, selected: node.id === nodeId })),
    );
  }, []);

  const saveCanvasViewport = useCallback(
    (viewport: { x: number; y: number; zoom: number }) => {
      setEditorLayout((current) => ({ ...current, viewport }));
    },
    [],
  );

  useEffect(() => {
    if (phase === "ready")
      onCanvasNodeIdsChange?.(
        canvasNodeIdsKey ? canvasNodeIdsKey.split("\u0000") : [],
      );
  }, [canvasNodeIdsKey, onCanvasNodeIdsChange, phase]);

  useEffect(() => {
    if (phase !== "ready") return;
    onCanvasEdgesChange?.(
      edges.flatMap((edge) =>
        edge.sourceHandle
          ? [
              {
                sourceNodeId: edge.source,
                sourceSignalId: edge.sourceHandle,
                targetNodeId: edge.target,
              },
            ]
          : [],
      ),
    );
  }, [edges, onCanvasEdgesChange, phase]);

  // A Playtest window asks the editor to open the Node it is showing.
  useEffect(
    () =>
      window.putengGameDesktop?.onOpenPlayableNode?.(
        (targetProjectId, nodeId) => {
          if (targetProjectId !== projectId) return;
          setWorkspaceView("canvas");
          openNode(nodeId);
        },
      ),
    [projectId],
  );

  // Whether the open Scene has a background the editor can set, and whether it shows anything yet.
  const [backdrop, setBackdrop] = useState<"missing" | "set">();
  const [backdropType, setBackdropType] = useState<"image" | "video">();
  const [backdropLoop, setBackdropLoop] = useState(false);
  const [pictureInPictureVideoLoop, setPictureInPictureVideoLoop] =
    useState(true);
  const [noInputMode, setNoInputMode] = useState<
    PlayableNoInputMode | undefined
  >();
  const openedHtml = openedNode?.source.html;
  useEffect(() => {
    setBackdrop(undefined);
    setBackdropType(undefined);
    setBackdropLoop(false);
    setPictureInPictureVideoLoop(true);
    setNoInputMode(undefined);
    if (!openedHtml) return;
    let disposed = false;
    void getWorkspaceFile(projectId, openedHtml).then(
      (file) => {
        if (!disposed) {
          setBackdrop(
            file.content !== undefined && !file.truncated
              ? playableBackdrop(file.content)
              : undefined,
          );
          const html =
            file.content !== undefined && !file.truncated
              ? file.content
              : undefined;
          const current = latestCodebase.current;
          const currentNode = current?.graph.nodes.find(
            (node) => node.id === openedNode?.id,
          );
          if (html && current && currentNode) {
            const repairedGraph = removeOrphanedPlayableButtonSignals(
              current.graph,
              currentNode.id,
              html,
            );
            if (repairedGraph !== current.graph) {
              const repairedNode = repairedGraph.nodes.find(
                (node) => node.id === currentNode.id,
              );
              const retainedSignals = new Set(
                repairedNode?.signals.map((signal) => signal.id),
              );
              const removedSignals = currentNode.signals
                .filter((signal) => !retainedSignals.has(signal.id))
                .map((signal) => signal.id);
              const repairKey = `${currentNode.id}:${removedSignals.join(",")}`;
              if (!repairingButtonSignals.current.has(repairKey)) {
                repairingButtonSignals.current.add(repairKey);
                void writeSources(
                  repairedGraph,
                  {},
                  {},
                  t("playableWorkbench.historyCleanupButtonExits"),
                ).then(
                  () => repairingButtonSignals.current.delete(repairKey),
                  () => repairingButtonSignals.current.delete(repairKey),
                );
              }
            }
          }
          setBackdropType(html ? playableBackdropAsset(html)?.type : undefined);
          setBackdropLoop(html ? playableBackdropLoops(html) : false);
          setPictureInPictureVideoLoop(
            html ? playablePictureInPictureVideoLoops(html) : true,
          );
          setNoInputMode(html ? playableNoInputMode(html) : undefined);
        }
      },
      () => undefined,
    );
    return () => {
      disposed = true;
    };
  }, [projectId, openedHtml, openedNode?.id, workspaceRevision, codeRevision]);

  // An undo or an Agent edit can remove the open Node; go back to the canvas.
  useEffect(() => {
    if (
      phase === "ready" &&
      openedNodeId &&
      !nodes.some((node) => node.id === openedNodeId)
    )
      setOpenedNodeId(undefined);
  }, [phase, nodes, openedNodeId]);

  useEffect(() => {
    if (openFileRequest) setFileRequest(openFileRequest);
  }, [openFileRequest?.id]);

  useEffect(() => {
    if (!openFileRequest) return;
    setOpenedNodeId(undefined);
    setWorkspaceView("code");
  }, [openFileRequest?.id]);

  useEffect(() => {
    let disposed = false;
    setPhase("loading");
    setLoadedWorkspaceRevision(undefined);
    canvas.current = null;
    resetHistory();
    setCanvasContextMenu(undefined);
    setCopiedSelection(undefined);
    void Promise.all([
      getNodeCodebase(projectId),
      getPlayableBackdropEffects(projectId),
      listPlayablePresets().catch(() => ({
        presets: [] as PlayablePresetSummary[],
      })),
    ])
      .then(([loaded, effects, catalog]) => {
        if (disposed) return;
        applyCodebase(loaded, { diskRevision: loaded.revision });
        setLoadedWorkspaceRevision(workspaceRevision);
        setBackdropEffects(effects);
        setPresets(catalog.presets);
        setPhase("ready");
      })
      .catch((error) => {
        if (disposed) return;
        setNotice(errorMessage(error));
        setPhase("error");
      });
    return () => {
      disposed = true;
    };
  }, [projectId, workspaceRevision]);

  useEffect(() => {
    if (phase !== "ready") return;
    let disposed = false;
    void getPlayableValidation(projectId)
      .then((result) => {
        if (disposed) return;
        setIssues(result.issues);
        setBuiltDefinitionState(
          result.definition
            ? {
                projectId,
                workspaceRevision,
                codeRevision,
                definition: result.definition,
              }
            : undefined,
        );
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [phase, projectId, codeRevision, workspaceRevision]);

  useEffect(() => {
    setThumbnails(undefined);
  }, [projectId]);

  // Submit every missing thumbnail; the desktop limits hidden windows, while
  // this effect owns the batch and publishes each completed capture. A new
  // build reads the cache again, including Nodes cancelled before they ran.
  useEffect(() => {
    const capture = window.putengGameDesktop?.captureNodeThumbnail;
    const batchId = crypto.randomUUID();
    let disposed = false;
    let capturing = false;
    void (async () => {
      const manifest = await listPlayableThumbnails(projectId);
      if (disposed) return;
      setThumbnails(manifest);
      if (!capture || !builtDefinition) return;
      const pending = builtDefinition.graph.nodes.flatMap((node) => {
        const hash = playableThumbnailHash(builtDefinition, node.id);
        return hash && manifest[node.id]?.hash !== hash
          ? [{ nodeId: node.id, hash }]
          : [];
      });
      if (!pending.length) return;
      capturing = true;
      await Promise.all(
        pending.map(async ({ nodeId, hash }) => {
          const captured = await capture(
            projectId,
            nodeId,
            builtDefinition.graph.viewport,
            batchId,
          ).catch(() => false);
          if (!captured || disposed) return;
          const updated = await listPlayableThumbnails(projectId);
          if (disposed || updated[nodeId]?.hash !== hash) return;
          setThumbnails((cached) => ({
            ...cached,
            [nodeId]: updated[nodeId]!,
          }));
        }),
      );
    })().catch(() => {});
    return () => {
      disposed = true;
      if (capturing)
        void window.putengGameDesktop
          ?.cancelNodeThumbnails?.(batchId)
          .catch(() => {});
    };
  }, [projectId, builtDefinition]);

  /**
   * Adopts a whole codebase into the editor. `diskRevision` says it is what
   * the files hold, which makes the serialized form the save baseline, so
   * opening a project does not write it straight back; an undo has to save,
   * so it passes nothing.
   */
  function applyCodebase(
    loaded: NodeCodebase,
    options: { diskRevision?: string } = {},
  ): NodeCodebase {
    const { nodes: graphNodes, edges: graphEdges, ...meta } = loaded.graph;
    const view = loaded.editorLayout.view === "code" ? "code" : "canvas";
    const flowNodes = graphNodes.map((node) =>
      toFlowNode(node, loaded.editorLayout),
    );
    const flowEdges = graphEdges.map(toFlowEdge);
    setGraphMeta(meta);
    setNodes(flowNodes);
    setEdges(flowEdges);
    setEditorLayout(loaded.editorLayout);
    setWorkspaceView(view);
    const applied = buildCodebase(
      meta,
      flowNodes,
      flowEdges,
      loaded.editorLayout,
      view,
    );
    latestCodebase.current = applied;
    if (options.diskRevision !== undefined) {
      queuedCodebase.current = JSON.stringify(applied);
      diskCodebase.current = {
        codebase: applied,
        revision: options.diskRevision,
      };
      diskGeneration.current += 1;
    }
    observeHistory(applied);
    setSelectedEdgeId(undefined);
    return applied;
  }

  /** History steps are whole codebases, so none may outlive the version on disk they were taken from. */
  function resetHistory(): void {
    window.clearTimeout(historyTimer.current);
    undoHistory.current = [];
    redoHistory.current = [];
    writtenSources.current = {};
    historyObserved.current = undefined;
    historyObservedJson.current = undefined;
    historyPendingBase.current = undefined;
    historyPendingLabel.current = undefined;
    historyNextLabel.current = undefined;
    historyGestureBase.current = undefined;
    historySequence.current = 0;
  }

  /** Loads a version that reached disk while the editor was open, as reopening the project would. */
  function adoptDiskCodebase(loaded: NodeCodebase, revision: string): void {
    resetHistory();
    applyCodebase(loaded, { diskRevision: revision });
    setCodeRevision((current) => current + 1);
    updateHistoryControls();
  }

  /**
   * Writes a codebase from the revision the editor last saw, and resolves
   * with whether it was written. graph.json and editor/layout.json are not
   * written over a version the editor has not seen: when the Agent changed
   * the graph since, moved Scenes, the viewport, and edited source files are
   * saved on its graph, and a change to the graph itself is given up for it.
   */
  async function writeCodebase(
    next: NodeCodebaseUpdate,
    queuedGeneration: number,
  ): Promise<boolean> {
    let generation = queuedGeneration;
    let outgoing = next;
    /** The save baseline while a carried layout is on its way, to drop if it does not arrive. */
    let carriedBaseline: string | undefined;
    try {
      for (let attempt = 1; ; attempt += 1) {
        const disk = diskCodebase.current;
        if (generation !== diskGeneration.current || !disk) {
          // A newer version was loaded since this save was queued. Its graph is
          // the one to keep; only a save that would not have changed it is let go quietly.
          if (
            !outgoing.sources &&
            !outgoing.sourceDeletions &&
            disk &&
            samePlayableGraph(outgoing.graph, disk.codebase.graph)
          )
            return false;
          throw new Error(PROJECT_CHANGED);
        }
        try {
          const saved = await updateNodeCodebase(projectId, {
            ...outgoing,
            revision: disk.revision,
          });
          if (generation === diskGeneration.current) {
            diskCodebase.current = {
              codebase: {
                graph: outgoing.graph,
                editorLayout: outgoing.editorLayout,
              },
              revision: saved.revision,
            };
          }
          return true;
        } catch (cause) {
          if (!(cause instanceof ApiError) || cause.status !== 409) throw cause;
          if (attempt === SAVE_ATTEMPTS)
            throw new Error(
              "The project keeps changing. Try again in a moment.",
            );
        }
        const remote = await getNodeCodebase(projectId);
        if (generation !== diskGeneration.current) continue;
        if (
          samePlayableGraph(remote.graph, disk.codebase.graph) &&
          JSON.stringify(remote.editorLayout) ===
            JSON.stringify(disk.codebase.editorLayout)
        ) {
          // Formatting changed, so retry without resetting the editor or its history.
          diskCodebase.current = {
            codebase: disk.codebase,
            revision: remote.revision,
          };
          continue;
        }
        // Rebase the request first (a copy is not shown until its sources are saved),
        // then carry edits made on the canvas while it waited.
        const pending = rebasePlayableCodebase(disk.codebase, outgoing, remote);
        const carried = pending
          ? rebasePlayableCodebase(
              disk.codebase,
              latestCodebase.current ?? outgoing,
              pending,
            )
          : undefined;
        adoptDiskCodebase(remote, remote.revision);
        if (!carried) throw new Error(PROJECT_CHANGED);
        // Shown before it is saved, so what the author does meanwhile is done to the graph from disk.
        const shown = applyCodebase(carried);
        carriedBaseline = JSON.stringify(shown);
        queuedCodebase.current = carriedBaseline;
        generation = diskGeneration.current;
        outgoing = { ...outgoing, ...shown };
      }
    } catch (cause) {
      // The carried layout is shown but not on disk; let the next change save it.
      if (
        carriedBaseline !== undefined &&
        queuedCodebase.current === carriedBaseline
      )
        queuedCodebase.current = undefined;
      throw cause;
    }
  }

  function updateHistoryControls(): void {
    setHistoryRevision((revision) => revision + 1);
  }

  function observeHistory(next: NodeCodebase): void {
    historyObserved.current = structuredClone(next);
    historyObservedJson.current = playableEditorHistoryKey(next);
  }

  function beginHistoryAction(label: string): void {
    commitPendingHistory();
    historyNextLabel.current = label;
  }

  function createHistoryEntry(
    snapshot: NodeCodebase,
    sources?: Record<string, string>,
    label = t("playableWorkbench.historyEdit"),
  ): HistoryEntry {
    return {
      id: ++historySequence.current,
      label,
      createdAt: Date.now(),
      codebase: structuredClone(snapshot),
      ...(sources ? { sources } : {}),
    };
  }

  function pushUndoSnapshot(
    snapshot: NodeCodebase,
    sources?: Record<string, string>,
    label = t("playableWorkbench.historyEdit"),
  ): HistoryEntry {
    const entry = createHistoryEntry(snapshot, sources, label);
    undoHistory.current.push(entry);
    if (undoHistory.current.length > HISTORY_LIMIT) undoHistory.current.shift();
    return entry;
  }

  function commitPendingHistory(): void {
    window.clearTimeout(historyTimer.current);
    historyTimer.current = undefined;
    const pending = historyPendingBase.current;
    if (!pending) return;
    pushUndoSnapshot(pending, undefined, historyPendingLabel.current);
    historyPendingBase.current = undefined;
    historyPendingLabel.current = undefined;
    updateHistoryControls();
  }

  /**
   * Puts the editor back to a history entry, and the source files it names
   * back to what they held then. The entry for the other stack keeps what
   * the files hold now, so the step can be taken again.
   */
  function restoreHistory(
    entry: HistoryEntry,
    current: NodeCodebase,
  ): { entry: HistoryEntry; saved: Promise<void> } {
    const sources = entry.sources;
    const reverse: HistoryEntry = {
      id: ++historySequence.current,
      label: entry.label,
      createdAt: Date.now(),
      codebase: structuredClone(current),
    };
    if (sources) {
      reverse.sources = Object.fromEntries(
        Object.keys(sources).map((path) => [
          path,
          writtenSources.current[path] ?? "",
        ]),
      );
      writtenSources.current = { ...writtenSources.current, ...sources };
    }
    const target = preservePlayableEditorView(entry.codebase, current);
    applyCodebase(target);
    const saved = sources
      ? save({ ...target, sources })
      : Promise.resolve();
    updateHistoryControls();
    return { entry: reverse, saved };
  }

  function undoEditorChange(): Promise<void> | undefined {
    if (!codebase) return undefined;
    historyNextLabel.current = undefined;
    window.clearTimeout(historyTimer.current);
    historyTimer.current = undefined;
    const pending = historyPendingBase.current;
    const next = pending
      ? createHistoryEntry(pending, undefined, historyPendingLabel.current)
      : undoHistory.current.pop();
    if (!next) return undefined;
    historyPendingBase.current = undefined;
    historyPendingLabel.current = undefined;
    historyNextLabel.current = undefined;
    const restored = restoreHistory(next, codebase);
    redoHistory.current.push(restored.entry);
    return restored.saved;
  }

  function redoEditorChange(): Promise<void> | undefined {
    if (!codebase || historyPendingBase.current) return undefined;
    historyNextLabel.current = undefined;
    const next = redoHistory.current.pop();
    if (!next) return undefined;
    const restored = restoreHistory(next, codebase);
    undoHistory.current.push(restored.entry);
    return restored.saved;
  }

  async function restoreHistoryAt(index: number): Promise<void> {
    if (!codebase) return;
    commitPendingHistory();
    if (index < 0 || index >= undoHistory.current.length) return;
    const viewState = latestCodebase.current ?? codebase;
    let current = viewState;
    let lastSave: Promise<void> | undefined;
    while (undoHistory.current.length > index) {
      const next = undoHistory.current.pop();
      if (!next) break;
      const restored = restoreHistory(next, current);
      redoHistory.current.push(restored.entry);
      current = preservePlayableEditorView(next.codebase, viewState);
      lastSave = restored.saved;
    }
    try {
      await lastSave;
    } catch (cause) {
      setNotice(
        `${t("playableWorkbench.errorRestoreHistory")}: ${errorMessage(cause)}`,
      );
    }
    updateHistoryControls();
  }

  function beginHistoryGesture(): void {
    if (!codebase) return;
    commitPendingHistory();
    historyNextLabel.current = undefined;
    historyGestureBase.current = structuredClone(codebase);
  }

  function finishHistoryGesture(): void {
    window.setTimeout(() => {
      const base = historyGestureBase.current;
      const current = latestCodebase.current;
      historyGestureBase.current = undefined;
      if (!base || !current || samePlayableEditorHistoryState(base, current))
        return;
      pushUndoSnapshot(base, undefined, t("playableWorkbench.historyMoveScene"));
      redoHistory.current = [];
      observeHistory(current);
      updateHistoryControls();
    }, 0);
  }

  function arrangeStoryNodes(): void {
    const instance = canvas.current;
    if (!instance || nodes.length < 2 || !codebase) return;
    const positions = arrangePlayableNodes(
      instance.getNodes(),
      instance.getEdges(),
      codebase.graph.entryNodeId,
    );
    if (
      nodes.every((node) => {
        const position = positions[node.id];
        return (
          position?.x === node.position.x && position?.y === node.position.y
        );
      })
    )
      return;

    beginHistoryGesture();
    redoHistory.current = [];
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        position: positions[node.id] ?? node.position,
      })),
    );
    window.requestAnimationFrame(() => {
      const fit = canvas.current?.fitView({ padding: 0.2, duration: 200 });
      if (fit) void fit.then(finishHistoryGesture, finishHistoryGesture);
      else finishHistoryGesture();
    });
  }

  useEffect(() => {
    if (phase !== "ready" || !codebase) return;
    const serialized = playableEditorHistoryKey(codebase);
    if (!historyObserved.current || historyObservedJson.current === undefined) {
      observeHistory(codebase);
      updateHistoryControls();
      return;
    }
    if (serialized === historyObservedJson.current) return;
    if (historyGestureBase.current) {
      observeHistory(codebase);
      return;
    }
    if (!historyPendingBase.current) {
      historyPendingBase.current = structuredClone(historyObserved.current);
      historyPendingLabel.current =
        historyNextLabel.current ?? t("playableWorkbench.historyEditScene");
      historyNextLabel.current = undefined;
    }
    redoHistory.current = [];
    observeHistory(codebase);
    window.clearTimeout(historyTimer.current);
    historyTimer.current = window.setTimeout(commitPendingHistory, 450);
    updateHistoryControls();
  }, [codebase, phase]);

  useEffect(() => () => window.clearTimeout(historyTimer.current), []);

  useEffect(() => {
    if (workspaceView === "code" || projectSettingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        isTextEntry(event.target) ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey)
      )
        return;
      if (
        routePlayableClipboardShortcut(
          event,
          Boolean(openedNodeId),
          (action) =>
            setElementClipboardCommand({
              action,
              sequence: ++elementClipboardSequence.current,
            }),
          (action) => {
            if (action === "copy") {
              if (!nodes.some((node) => node.selected)) return false;
              event.preventDefault();
              void copySelection();
              return true;
            }
            event.preventDefault();
            void pasteSelectionAt(pastePosition());
            return true;
          },
        )
      )
        return;
      const step = undoShortcut(event);
      if (!step) return;
      if (openedNodeId) return;
      event.preventDefault();
      void (step === "redo" ? redoEditorChange() : undoEditorChange())?.catch(
        () => {},
      );
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    codebase,
    copiedSelection,
    nodes,
    workspaceView,
    projectSettingsOpen,
    openedNodeId,
  ]);

  // A navigation Exit has no line for the canvas to delete, so a connection
  // selected from its Exit row is deleted here, as a drawn one is.
  const selectedNavigation = Boolean(
    selectedEdgeId &&
    edges.some(
      (edge) =>
        edge.id === selectedEdgeId &&
        nodes
          .find((node) => node.id === edge.source)
          ?.data.node.signals.some(
            (signal) =>
              signal.id === edge.sourceHandle && signal.role === "navigation",
          ),
    ),
  );
  useEffect(() => {
    if (!selectedNavigation || openedNodeId || projectSettingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key !== "Delete" && event.key !== "Backspace") ||
        isTextEntry(event.target)
      )
        return;
    beginHistoryAction(t("playableWorkbench.historyDeleteConnection"));
      setEdges((current) =>
        current.filter((edge) => edge.id !== selectedEdgeId),
      );
      setSelectedEdgeId(undefined);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNavigation, selectedEdgeId, openedNodeId, projectSettingsOpen]);

  const save = useCallback(
    (next: NodeCodebaseUpdate): Promise<void> => {
      const serialized = JSON.stringify(next);
      if (serialized === queuedCodebase.current) return saveChain.current;
      queuedCodebase.current = serialized;
      const generation = diskGeneration.current;
      const written = saveChain.current
        .catch(() => undefined)
        .then(() => writeCodebase(next, generation));
      const operation = written.then(() => undefined);
      saveChain.current = operation;
      void written.then(
        (saved) => {
          // A save let go for a newer version on disk leaves that version's notice in place.
          if (!saved) return;
          setNotice(undefined);
          // Source edits also update the in-memory codebase. Keep the queued
          // value in the same shape as the later autosave, otherwise that
          // autosave writes the same graph a second time and refreshes the
          // live preview unnecessarily.
          if (queuedCodebase.current === serialized)
            queuedCodebase.current = JSON.stringify({
              graph: next.graph,
              editorLayout: next.editorLayout,
            });
          setCodeRevision((revision) => revision + 1);
        },
        (error) => {
          if (queuedCodebase.current === serialized)
            queuedCodebase.current = undefined;
          setNotice(`Could not save your changes: ${errorMessage(error)}`);
        },
      );
      return operation;
    },
    [projectId],
  );

  const flushCurrentCanvas = useCallback(async () => {
    const pending = latestCodebase.current;
    if (!pending) return saveChain.current;
    // React Flow delays onMoveEnd while scrolling; read the displayed view on close.
    const viewport =
      workspaceView === "canvas" && !designOpen
        ? canvas.current?.getViewport()
        : undefined;
    await save(
      viewport
        ? { ...pending, editorLayout: { ...pending.editorLayout, viewport } }
        : pending,
    );
  }, [designOpen, save, workspaceView]);

  useDesktopSave(flushCurrentCanvas);

  useEffect(() => {
    if (phase !== "ready") return;
    onCanvasSaveReady?.(flushCurrentCanvas);
    return () => onCanvasSaveReady?.(undefined);
  }, [flushCurrentCanvas, onCanvasSaveReady, phase]);

  useEffect(() => {
    if (phase !== "ready" || !codebase) return;
    const timeout = window.setTimeout(() => {
      void save(codebase).catch(() => {});
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [codebase, phase, save]);

  useEffect(() => {
    if (phase !== "ready") return;
    const flushPendingCodebase = () => {
      const pending = latestCodebase.current;
      const disk = diskCodebase.current?.codebase;
      if (
        !pending ||
        (disk &&
          JSON.stringify({
            graph: pending.graph,
            editorLayout: pending.editorLayout,
          }) === JSON.stringify(disk))
      )
        return;
      const viewport =
        workspaceView === "canvas" && !designOpen
          ? canvas.current?.getViewport()
          : undefined;
      const outgoing = viewport
        ? {
            ...pending,
            editorLayout: { ...pending.editorLayout, viewport },
          }
        : pending;
      void save(outgoing).catch(() => {});
    };
    window.addEventListener("pagehide", flushPendingCodebase);
    return () => window.removeEventListener("pagehide", flushPendingCodebase);
  }, [designOpen, phase, save, workspaceView]);

  useEffect(
    () => () => {
      const pending = latestCodebase.current;
      if (pending) void save(pending).catch(() => {});
    },
    [save],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<PlayableFlowNode>[]) => {
      setNodes((current) => applyNodeChanges(changes, current));
    },
    [],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (changes.some((change) => change.type === "remove"))
      beginHistoryAction(t("playableWorkbench.historyDeleteConnection"));
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  /** One Signal leads to one Node, so a new edge replaces the Signal's old one. */
  function onConnect(connection: Connection): void {
    const { source, target, sourceHandle } = connection;
    if (!source || !target || !sourceHandle) return;
    if (
      edges.some(
        (edge) =>
          edge.source === source &&
          edge.sourceHandle === sourceHandle &&
          edge.target === target &&
          edge.data?.mode !== "push",
      )
    )
      return;
    beginHistoryAction(t("playableWorkbench.historyConnectExit"));
    setEdges((current) => {
      const kept = current.filter(
        (edge) => edge.source !== source || edge.sourceHandle !== sourceHandle,
      );
      return [
        ...kept,
        toFlowEdge({
          id: playableEdgeId(kept, source, sourceHandle),
          source: { nodeId: source, signal: sourceHandle },
          targetNodeId: target,
          mode: "replace",
        }),
      ];
    });
  }

  /** Selects a connection, as clicking its line does. */
  function selectEdge(edgeId: string): void {
    setCanvasContextMenu(undefined);
    setNodes((current) =>
      current.map((node) =>
        node.selected ? { ...node, selected: false } : node,
      ),
    );
    setSelectedEdgeId(edgeId);
  }

  function renameNode(nodeId: string, title: string): void {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: { ...node.data, node: { ...node.data.node, title } },
            }
          : node,
      ),
    );
  }

  function setStoryOption(
    nodeId: string,
    option: "hidden" | "ending",
    value: boolean,
  ): void {
    const existing = nodes.find((node) => node.id === nodeId)?.data.node;
    if (!existing || existing.story?.[option] === value) return;
    beginHistoryAction(
      option === "ending"
        ? t("playableWorkbench.historySetEndingScene")
        : t("playableWorkbench.historyHideScene"),
    );
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                node: withPlayableStoryOption(node.data.node, option, value),
              },
            }
          : node,
      ),
    );
  }

  /**
   * Adopts a graph edited as a whole (by the Workbench inspector) while
   * keeping canvas positions and selection.
   */
  function applyGraph(next: NodeGraph): void {
    const current = latestCodebase.current ?? codebase;
    if (current) latestCodebase.current = { ...current, graph: next };
    const { nodes: graphNodes, edges: graphEdges, ...meta } = next;
    setGraphMeta(meta);
    setNodes((current) =>
      current.map((node) => {
        const updated = graphNodes.find(
          (candidate) => candidate.id === node.id,
        );
        return updated
          ? { ...node, data: { ...node.data, node: updated } }
          : node;
      }),
    );
    setEdges((current) =>
      graphEdges.map((edge) => {
        const flow = toFlowEdge(edge);
        return current.find((candidate) => candidate.id === edge.id)?.selected
          ? { ...flow, selected: true }
          : flow;
      }),
    );
  }

  /** Adopts a graph and saves it now, instead of on the next autosave. */
  async function writeGraph(
    graph: NodeGraph,
    label = t("playableWorkbench.historyAddSceneAsset"),
  ): Promise<void> {
    const current = latestCodebase.current ?? codebase;
    if (!current) return;
    beginHistoryAction(label);
    applyGraph(graph);
    await save({ graph, editorLayout: current.editorLayout });
  }

  async function writeSettingsButtonIcon(
    asset: PlayableAssetRequest,
  ): Promise<string | undefined> {
    const current = latestCodebase.current ?? codebase;
    if (!current || asset.type !== "image") return undefined;
    const declared = addPlayableGraphAsset(current.graph, asset);
    const position = normalizePlayableSettingsButtonPosition(
      current.graph.settingsButton,
      current.graph.viewport,
    );
    const graph = declared.graph;
    const previousAssetId = graph.settingsButton?.iconAssetId;
    graph.settingsButton = {
      ...graph.settingsButton,
      ...position,
      iconAssetId: declared.assetId,
    };
    if (
      previousAssetId &&
      previousAssetId !== declared.assetId &&
      graph.returnButton?.iconAssetId !== previousAssetId &&
      !graph.nodes.some((node) => node.assets.includes(previousAssetId))
    )
      delete graph.assets[previousAssetId];
    await writeGraph(graph, t("playableWorkbench.historySetSettingsButtonIcon"));
    return declared.assetId;
  }

  async function writeSettingsButtonPosition(position: {
    x: number;
    y: number;
  }): Promise<boolean> {
    const current = latestCodebase.current ?? codebase;
    if (!current) return false;
    const normalized = normalizePlayableSettingsButtonPosition(
      position,
      current.graph.viewport,
    );
    const graph = {
      ...current.graph,
      settingsButton: {
        ...current.graph.settingsButton,
        ...normalized,
      },
    };
    await writeGraph(graph, t("playableWorkbench.historyMoveSettingsButton"));
    return true;
  }

  async function writeSettingsButtonSize(size: number): Promise<boolean> {
    const current = latestCodebase.current ?? codebase;
    if (!current) return false;
    const graph = { ...current.graph };
    graph.settingsButton = {
      ...normalizePlayableSettingsButtonPosition(
        graph.settingsButton,
        graph.viewport,
      ),
      ...graph.settingsButton,
      size: normalizePlayableSettingsButtonSize(size),
    };
    await writeGraph(
      graph,
      t("playableWorkbench.historySetSettingsButtonSize"),
    );
    return true;
  }

  async function writeReturnButtonIcon(
    asset: PlayableAssetRequest,
  ): Promise<string | undefined> {
    const current = latestCodebase.current ?? codebase;
    if (!current || asset.type !== "image") return undefined;
    const declared = addPlayableGraphAsset(current.graph, asset);
    const normalized = normalizePlayableReturnButton(
      current.graph.returnButton,
      current.graph.viewport,
    );
    const graph = declared.graph;
    const previousAssetId = graph.returnButton?.iconAssetId;
    graph.returnButton = {
      ...normalized,
      ...graph.returnButton,
      iconAssetId: declared.assetId,
    };
    if (
      previousAssetId &&
      previousAssetId !== declared.assetId &&
      graph.settingsButton?.iconAssetId !== previousAssetId &&
      !graph.nodes.some((node) => node.assets.includes(previousAssetId))
    )
      delete graph.assets[previousAssetId];
    await writeGraph(graph, t("playableWorkbench.historySetReturnButtonIcon"));
    return declared.assetId;
  }

  async function writeReturnButtonPosition(position: {
    x: number;
    y: number;
  }): Promise<boolean> {
    const current = latestCodebase.current ?? codebase;
    if (!current) return false;
    const normalized = normalizePlayableReturnButton(
      { ...current.graph.returnButton, ...position },
      current.graph.viewport,
    );
    const graph = {
      ...current.graph,
      returnButton: {
        ...current.graph.returnButton,
        ...normalized,
      },
    };
    await writeGraph(graph, t("playableWorkbench.historyMoveReturnButton"));
    return true;
  }

  async function writeReturnButtonSize(size: number): Promise<boolean> {
    const current = latestCodebase.current ?? codebase;
    if (!current) return false;
    const normalized = normalizePlayableReturnButton(
      { ...current.graph.returnButton, size },
      current.graph.viewport,
    );
    const graph = {
      ...current.graph,
      returnButton: {
        ...normalized,
        ...current.graph.returnButton,
        size: normalized.size,
      },
    };
    await writeGraph(graph, t("playableWorkbench.historySetReturnButtonSize"));
    return true;
  }

  async function writeButtonSound(asset: PlayableAssetRequest): Promise<void> {
    const current = latestCodebase.current ?? codebase;
    if (!current || asset.type !== "audio") return;
    const declared = addPlayableGraphAsset(current.graph, asset);
    const graph = declared.graph;
    const previousAssetId = graph.buttonSoundAssetId;
    graph.buttonSoundAssetId = declared.assetId;
    if (
      previousAssetId &&
      previousAssetId !== declared.assetId &&
      graph.settingsButton?.iconAssetId !== previousAssetId &&
      graph.returnButton?.iconAssetId !== previousAssetId &&
      !graph.nodes.some((node) => node.assets.includes(previousAssetId))
    )
      delete graph.assets[previousAssetId];
    await writeGraph(graph, t("playableWorkbench.historySetButtonSound"));
  }

  async function removeButtonSound(): Promise<void> {
    const current = latestCodebase.current ?? codebase;
    const previousAssetId = current?.graph.buttonSoundAssetId;
    if (!current || !previousAssetId) return;
    const graph = { ...current.graph };
    delete graph.buttonSoundAssetId;
    if (
      graph.settingsButton?.iconAssetId !== previousAssetId &&
      graph.returnButton?.iconAssetId !== previousAssetId &&
      !graph.nodes.some((node) => node.assets.includes(previousAssetId))
    )
      delete graph.assets[previousAssetId];
    await writeGraph(graph, t("playableWorkbench.historyRemoveButtonSound"));
  }

  async function writeGlobalFontFamily(fontFamily: string): Promise<void> {
    const current = latestCodebase.current ?? codebase;
    if (!current) return;
    const family = fontFamily.trim();
    if (family.length > 120 || current.graph.globalFontFamily === family) return;
    const graph = structuredClone(current.graph);
    if (family) graph.globalFontFamily = family;
    else delete graph.globalFontFamily;
    await writeGraph(
      graph,
      t("playableWorkbench.historySetGlobalFont"),
    );
  }

  /**
   * Adopts a graph and writes source files with it as one undoable step.
   * `before` holds what the files held, for undo to put back.
   */
  async function writeSources(
    graph: NodeGraph,
    sources: Record<string, string>,
    before: Record<string, string>,
    label = t("playableWorkbench.historyEditScene"),
  ): Promise<HistoryEntry | undefined> {
    const current = latestCodebase.current ?? codebase;
    if (!current) return undefined;
    commitPendingHistory();
    // The base stops the graph change from being recorded as a separate step.
    const base = structuredClone(current);
    historyGestureBase.current = base;
    const generation = diskGeneration.current;
    try {
      applyGraph(graph);
      await save({ graph, editorLayout: current.editorLayout, sources });
    } finally {
      if (historyGestureBase.current === base)
        historyGestureBase.current = undefined;
    }
    // The save loaded the Agent's changes; undoing to `base` would take them back.
    if (generation !== diskGeneration.current) return undefined;
    writtenSources.current = { ...writtenSources.current, ...sources };
    const entry = pushUndoSnapshot(base, before, label);
    redoHistory.current = [];
    if (latestCodebase.current) observeHistory(latestCodebase.current);
    updateHistoryControls();
    return entry;
  }

  /**
   * Writes a text edit from the preview back to the surface HTML that holds
   * it, and renames the Exit it labels. False when it cannot be done in place.
   */
  async function writeText(edit: PlayableTextEdit): Promise<boolean> {
    const graph = codebase?.graph;
    const location = edit.pick.source
      ? parsePlayableSourceLocation(edit.pick.source)
      : undefined;
    const node = graph?.nodes.find(
      (candidate) => candidate.id === edit.pick.nodeId,
    );
    if (!graph || !location || !node || node.source.html !== location.file)
      return false;
    const file = await getWorkspaceFile(projectId, location.file);
    const before = file.truncated ? undefined : file.content;
    const html =
      before === undefined
        ? undefined
        : replacePlayableElementText(
            before,
            location,
            edit.sourceBefore ?? edit.before,
            edit.after,
          );
    if (before === undefined || html === undefined) return false;
    const signal = node.signals.find(
      (candidate) => candidate.id === edit.pick.signal,
    );
    const originalText = edit.sourceBefore ?? edit.before;
    const next =
      signal && signal.label.trim() === originalText.trim()
        ? setPlayableSignalLabel(graph, node.id, signal.id, edit.after.trim())
        : graph;
    await writeSources(
      next,
      { [location.file]: html },
      { [location.file]: before },
      t("playableWorkbench.historyEditText"),
    );
    return true;
  }

  /** Adds new text at the preview position as one undoable source edit. */
  async function writeTextCreate(
    edit: PlayableTextCreate,
  ): Promise<string | undefined> {
    const graph = codebase?.graph;
    const node = graph?.nodes.find((candidate) => candidate.id === edit.nodeId);
    if (!graph || !node) return undefined;
    const path = node.source.html;
    const file = await getWorkspaceFile(projectId, path);
    if (file.content === undefined || file.truncated) return undefined;
    const before = file.content;
    const inserted = insertPlayableText(before, edit);
    if (!inserted) return undefined;
    await writeSources(
      graph,
      { [path]: inserted.html },
      { [path]: before },
      t("playableWorkbench.historyAddText"),
    );
    return `${path}:${inserted.line}:${inserted.column}`;
  }

  async function writeElementCopies(
    copies: PlayableElementCopy[],
  ): Promise<Record<string, string> | undefined> {
    const graph = codebase?.graph;
    const node = graph?.nodes.find(
      (candidate) => candidate.id === openedNodeId,
    );
    if (
      !graph ||
      !node ||
      copies.some(
        (copy) =>
          copy.pick.nodeId !== node.id ||
          !copy.pick.source ||
          copy.pick.mediaSlot === "backdrop",
      )
    )
      return undefined;
    const source = node.source.html;
    const file = await getWorkspaceFile(projectId, source);
    if (file.content === undefined || file.truncated) return undefined;
    const inserted = insertPlayableElementCopies(
      file.content,
      source,
      copies.map((copy) => {
        const location = parsePlayableSourceLocation(copy.pick.source!);
        if (!location || location.file !== source)
          throw new Error(t("playableWorkbench.errorAssetSourceChanged"));
        return {
          location,
          tag: copy.pick.tag,
          html: copy.html,
          ids: copy.ids,
        };
      }),
    );
    if (!inserted) throw new Error(t("playableWorkbench.errorCannotCopyAssets"));
    await writeSources(
      graph,
      { [source]: inserted.html },
      { [source]: file.content },
      t("playableWorkbench.historyPasteAssets"),
    );
    return inserted.sources;
  }

  /** Writes a font choice made by the Text tool back to the selected element. */
  async function writeTextStyle(edit: PlayableTextStyleEdit): Promise<boolean> {
    const graph = codebase?.graph;
    const location = edit.pick.source
      ? parsePlayableSourceLocation(edit.pick.source)
      : undefined;
    const node = graph?.nodes.find(
      (candidate) => candidate.id === edit.pick.nodeId,
    );
    if (
      !graph ||
      !location ||
      !node ||
      node.source.html !== location.file ||
      !edit.inPlace
    )
      return false;
    const file = await getWorkspaceFile(projectId, location.file);
    const before = file.truncated ? undefined : file.content;
    if (before === undefined) return false;
    const property =
      edit.property === "fontFamily" ? "font-family" : "font-size";
    const value =
      edit.property === "fontFamily"
        ? edit.value.replace(/[;"']/g, "").trim()
        : edit.value;
    const html = setPlayableElementStyle(
      before,
      location,
      edit.pick.tag,
      property,
      value,
    );
    if (html === undefined) return false;
    await writeSources(
      graph,
      { [location.file]: html },
      { [location.file]: before },
      t("playableWorkbench.historyChangeTextStyle"),
    );
    return true;
  }

  /** Writes a non-video element's appearance delay back to its source element. */
  async function writeInteractionTimings(
    edits: PlayableInteractionTimingEdit[],
  ): Promise<boolean> {
    const graph = codebase?.graph;
    if (!graph || !edits.length) return false;
    const resolved = edits.map((edit) => {
      const location = edit.pick.source
        ? parsePlayableSourceLocation(edit.pick.source)
        : undefined;
      const node = graph.nodes.find(
        (candidate) => candidate.id === edit.pick.nodeId,
      );
      return location &&
        node &&
        node.source.html === location.file &&
        edit.inPlace &&
        edit.pick.tag !== "video"
        ? { edit, location }
        : undefined;
    });
    if (resolved.some((entry) => !entry)) return false;
    const items = resolved.filter(
      (entry): entry is NonNullable<(typeof resolved)[number]> =>
        entry !== undefined,
    );
    const grouped = new Map<string, (typeof items)[number][]>();
    for (const item of items) {
      const group = grouped.get(item.location.file) ?? [];
      group.push(item);
      grouped.set(item.location.file, group);
    }
    const sources: Record<string, string> = {};
    const before: Record<string, string> = {};
    for (const [sourceFile, group] of grouped) {
      const file = await getWorkspaceFile(projectId, sourceFile);
      const original = file.truncated ? undefined : file.content;
      if (original === undefined) return false;
      const located = group.map(({ edit }) => {
        const location = sourceLocationForPick(original, edit.pick);
        return location?.file === sourceFile
          ? { edit, location }
          : undefined;
      });
      if (located.some((item) => !item)) return false;
      let html = original;
      for (const { edit, location } of located
        .filter(
          (item): item is NonNullable<(typeof located)[number]> =>
            item !== undefined,
        )
        .sort(
          (first, second) =>
            second.location.line - first.location.line ||
            second.location.column - first.location.column,
        )) {
        const updated = setPlayableElementTiming(
          html,
          location,
          edit.pick.tag,
          edit.delaySeconds,
          edit.endSeconds,
        );
        if (updated === undefined) return false;
        html = updated;
      }
      sources[sourceFile] = html;
      before[sourceFile] = original;
    }
    await writeSources(
      graph,
      sources,
      before,
      t("playableWorkbench.historyAdjustAssetTiming"),
    );
    return true;
  }

  async function writeMotion(
    pick: PlayablePickResult,
    config: PlayableMotionConfig | undefined,
    assetId?: string,
    applyButtonPreset = false,
  ): Promise<boolean> {
    const graph = (latestCodebase.current ?? codebase)?.graph;
    const location = pick.source
      ? parsePlayableSourceLocation(pick.source)
      : undefined;
    const node = graph?.nodes.find((candidate) => candidate.id === pick.nodeId);
    if (!graph || !location || !node || node.source.html !== location.file)
      return false;
    const file = await getWorkspaceFile(projectId, location.file);
    const before = file.truncated ? undefined : file.content;
    if (before === undefined) return false;
    const html = setPlayableElementAttributes(before, location, pick.tag, {
      [PLAYABLE_MOTION_ATTRIBUTES.kind]: config?.kind,
      [PLAYABLE_MOTION_ATTRIBUTES.mode]: config?.mode,
      [PLAYABLE_MOTION_ATTRIBUTES.duration]:
        config === undefined ? undefined : String(config.duration),
      [PLAYABLE_MOTION_ATTRIBUTES.timeoutDuration]:
        config?.timeoutDuration === undefined
          ? undefined
          : String(config.timeoutDuration),
      [PLAYABLE_MOTION_ATTRIBUTES.signal]: config?.signal,
      [PLAYABLE_MOTION_ATTRIBUTES.timeoutSignal]: config?.timeoutSignal,
      [PLAYABLE_MOTION_ATTRIBUTES.interaction]: config?.interaction,
      [PLAYABLE_MOTION_ATTRIBUTES.requiredCount]:
        config?.requiredCount === undefined
          ? undefined
          : String(config.requiredCount),
      [PLAYABLE_MOTION_ATTRIBUTES.ringAsset]: config?.ringAssetId,
      [PLAYABLE_MOTION_ATTRIBUTES.ringAssetScale]:
        config?.ringAssetScale === undefined
          ? undefined
          : String(config.ringAssetScale),
      [PLAYABLE_MOTION_ATTRIBUTES.barAsset]: config?.barAssetId,
      [PLAYABLE_MOTION_ATTRIBUTES.barAssetScale]:
        config?.barAssetScale === undefined
          ? undefined
          : String(config.barAssetScale),
      [PLAYABLE_MOTION_ATTRIBUTES.barAssetOffsetX]:
        config?.barAssetOffsetX === undefined
          ? undefined
          : String(config.barAssetOffsetX),
      [PLAYABLE_MOTION_ATTRIBUTES.barAssetOffsetY]:
        config?.barAssetOffsetY === undefined
          ? undefined
          : String(config.barAssetOffsetY),
      [PLAYABLE_MOTION_ATTRIBUTES.barLayer]: config?.barLayer,
      [PLAYABLE_MOTION_ATTRIBUTES.swipeAsset]: config?.swipeAssetId,
      [PLAYABLE_MOTION_ATTRIBUTES.swipeStyle]: config?.swipeStyle,
      [PLAYABLE_MOTION_ATTRIBUTES.swipeBehavior]: config?.swipeBehavior,
      [PLAYABLE_MOTION_ATTRIBUTES.disappearAfterSwipe]:
        config?.disappearAfterSwipe ? "true" : undefined,
      [PLAYABLE_MOTION_ATTRIBUTES.ringFill]: config?.ringFill,
      [PLAYABLE_MOTION_ATTRIBUTES.ringRotation]: config?.ringRotation,
      [PLAYABLE_MOTION_ATTRIBUTES.pressEffect]: config?.pressEffect,
      [PLAYABLE_MOTION_ATTRIBUTES.effectColor]: config?.effectColor,
      [PLAYABLE_MOTION_ATTRIBUTES.effectAnchorX]:
        config?.effectAnchorX === undefined
          ? undefined
          : String(config.effectAnchorX),
      [PLAYABLE_MOTION_ATTRIBUTES.effectAnchorY]:
        config?.effectAnchorY === undefined
          ? undefined
          : String(config.effectAnchorY),
      [PLAYABLE_MOTION_ATTRIBUTES.effectOffsetX]:
        config?.effectOffsetX === undefined
          ? undefined
          : String(config.effectOffsetX),
      [PLAYABLE_MOTION_ATTRIBUTES.effectOffsetY]:
        config?.effectOffsetY === undefined
          ? undefined
          : String(config.effectOffsetY),
      [PLAYABLE_MOTION_ATTRIBUTES.feedback]: config?.feedback,
      [PLAYABLE_MOTION_ATTRIBUTES.buttonShape]: config?.buttonShape,
      [PLAYABLE_MOTION_ATTRIBUTES.asset]: assetId ?? pick.buttonAssetId,
    });
    if (html === undefined) return false;
    let updatedHtml = html;
    if (applyButtonPreset && pick.tag.toLowerCase() === "button") {
      const styles: readonly (readonly [
        | "background"
        | "border"
        | "border-radius"
        | "color"
        | "width"
        | "height"
        | "min-width"
        | "min-height"
        | "padding"
        | "aspect-ratio",
        string | undefined,
      ])[] = [
        ["background", PLAYABLE_BUTTON_PRESET_STYLE.background],
        ["border", PLAYABLE_BUTTON_PRESET_STYLE.border],
        [
          "border-radius",
          config?.buttonShape === "circle"
            ? "50%"
            : PLAYABLE_BUTTON_PRESET_STYLE.borderRadius,
        ],
        ["color", PLAYABLE_BUTTON_PRESET_STYLE.color],
        ["width", config?.buttonShape === "circle" ? "5em" : undefined],
        ["height", config?.buttonShape === "circle" ? "5em" : undefined],
        ["min-width", config?.buttonShape === "circle" ? "0" : "14cqw"],
        ["min-height", config?.buttonShape === "circle" ? "0" : undefined],
        ["padding", config?.buttonShape === "circle" ? "0" : "1cqh 2cqw"],
        ["aspect-ratio", config?.buttonShape === "circle" ? "1" : undefined],
      ];
      for (const [property, value] of styles) {
        const styled = setPlayableElementStyle(
          updatedHtml,
          location,
          pick.tag,
          property,
          value,
        );
        if (styled === undefined) return false;
        updatedHtml = styled;
      }
    }
    await writeSources(
      graph,
      { [location.file]: updatedHtml },
      { [location.file]: before },
      assetId
        ? t("playableWorkbench.historyReplaceButtonAsset")
        : applyButtonPreset
          ? t("playableWorkbench.historyApplyButtonPreset")
          : config
            ? t("playableWorkbench.historySetAnimation")
            : t("playableWorkbench.historyRemoveAnimation"),
    );
    return true;
  }

  async function writeButtonAssetScale(
    pick: PlayablePickResult,
    scaleX: number,
    scaleY: number,
  ): Promise<boolean> {
    const graph = codebase?.graph;
    const location = pick.source
      ? parsePlayableSourceLocation(pick.source)
      : undefined;
    const node = graph?.nodes.find((candidate) => candidate.id === pick.nodeId);
    if (
      !graph ||
      !location ||
      !node ||
      node.source.html !== location.file ||
      pick.tag !== "button" ||
      !pick.buttonAssetId ||
      !Number.isInteger(scaleX) ||
      !Number.isInteger(scaleY) ||
      scaleX < PLAYABLE_BUTTON_ASSET_SCALE_MIN ||
      scaleX > PLAYABLE_BUTTON_ASSET_SCALE_MAX ||
      scaleY < PLAYABLE_BUTTON_ASSET_SCALE_MIN ||
      scaleY > PLAYABLE_BUTTON_ASSET_SCALE_MAX
    )
      return false;
    const file = await getWorkspaceFile(projectId, location.file);
    const before = file.truncated ? undefined : file.content;
    if (before === undefined) return false;
    const html = setPlayableElementAttributes(before, location, pick.tag, {
      [PLAYABLE_MOTION_ATTRIBUTES.assetScale]:
        scaleX === scaleY && scaleX !== 100 ? String(scaleX) : undefined,
      [PLAYABLE_MOTION_ATTRIBUTES.assetScaleX]:
        scaleX === scaleY ? undefined : String(scaleX),
      [PLAYABLE_MOTION_ATTRIBUTES.assetScaleY]:
        scaleX === scaleY ? undefined : String(scaleY),
    });
    if (html === undefined) return false;
    if (html !== before)
      await writeSources(
        graph,
        { [location.file]: html },
        { [location.file]: before },
        t("playableWorkbench.historyResizeButtonBackground"),
      );
    return true;
  }

  async function replaceButtonAsset(
    pick: PlayablePickResult,
    asset: PlayableAssetRequest,
  ): Promise<string | undefined> {
    const current = latestCodebase.current;
    const graph = current?.graph;
    const location = pick.source
      ? parsePlayableSourceLocation(pick.source)
      : undefined;
    const node = graph?.nodes.find((candidate) => candidate.id === pick.nodeId);
    if (
      !graph ||
      !location ||
      !node ||
      node.source.html !== location.file ||
      pick.tag !== "button" ||
      asset.type !== "image"
    )
      return undefined;
    const file = await getWorkspaceFile(projectId, location.file);
    const before = file.truncated ? undefined : file.content;
    if (before === undefined) return undefined;
    const withAsset = addPlayableNodeAsset(graph, node.id, asset);
    let html = setPlayableElementAttributes(before, location, pick.tag, {
      [PLAYABLE_MOTION_ATTRIBUTES.asset]: withAsset.assetId,
    });
    if (html === undefined) return undefined;
    for (const [property, value] of [["background", "transparent"]] as const) {
      const updated = setPlayableElementStyle(
        html,
        location,
        pick.tag,
        property,
        value,
      );
      if (updated === undefined) return undefined;
      html = updated;
    }
    await writeSources(
      withAsset.graph,
      { [location.file]: html },
      { [location.file]: before },
      t("playableWorkbench.historyReplaceButtonAsset"),
    );
    return withAsset.assetId;
  }

  async function setButtonPressedAsset(
    pick: PlayablePickResult,
    asset: PlayableAssetRequest,
  ): Promise<string | undefined> {
    const graph = latestCodebase.current?.graph;
    const location = pick.source
      ? parsePlayableSourceLocation(pick.source)
      : undefined;
    const node = graph?.nodes.find((candidate) => candidate.id === pick.nodeId);
    if (
      !graph ||
      !location ||
      !node ||
      node.source.html !== location.file ||
      pick.tag !== "button" ||
      asset.type !== "image"
    )
      return undefined;
    const file = await getWorkspaceFile(projectId, location.file);
    const before = file.truncated ? undefined : file.content;
    if (before === undefined) return undefined;
    const declared = addPlayableNodeAsset(graph, node.id, asset);
    const html = setPlayableElementAttributes(before, location, pick.tag, {
      [PLAYABLE_MOTION_ATTRIBUTES.pressedAsset]: declared.assetId,
    });
    if (html === undefined) return undefined;
    await writeSources(
      declared.graph,
      { [location.file]: html },
      { [location.file]: before },
      t("playableWorkbench.historySetPressedState"),
    );
    return declared.assetId;
  }

  async function insertMediaAsset(
    nodeId: string,
    asset: PlayableAssetRequest,
    pictureInPictureLoop = true,
  ): Promise<{ assetId: string; source: string } | undefined> {
    const graph = latestCodebase.current?.graph;
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!graph || !node || (asset.type !== "image" && asset.type !== "video"))
      return undefined;
    const path = node.source.html;
    const file = await getWorkspaceFile(projectId, path);
    const before = file.truncated ? undefined : file.content;
    if (before === undefined) return undefined;
    const declared = addPlayableNodeAsset(graph, nodeId, asset);
    const inserted = insertPlayableMediaElement(
      before,
      path,
      declared.assetId,
      asset.type,
      `putenggame-media-${Math.random().toString(36).slice(2, 10)}`,
      pictureInPictureLoop,
    );
    if (!inserted) return undefined;
    await writeSources(
      declared.graph,
      { [path]: inserted.html },
      { [path]: before },
      t("playableWorkbench.historyAddAssetToCanvas"),
    );
    return { assetId: declared.assetId, source: inserted.source };
  }

  async function addButtonPreset(
    nodeId: string,
    config?: PlayableMotionConfig,
    assetId?: string,
    reuseExistingSignals = false,
    buttonSignal?: string,
    pressedAssetId?: string,
    buttonText?: string,
    fontFamily?: string,
    buttonAction?: PlayableButtonAction,
  ): Promise<{
    id: string;
    source: string;
    signal?: string;
    label: string;
    timeoutSignal?: string;
  } | undefined> {
    const graph = latestCodebase.current?.graph;
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!graph || !node) return undefined;
    const usedSignals = new Set(node.signals.map((signal) => signal.id));
    let index = 1;
    while (usedSignals.has(`button-${index}`)) index += 1;
    const requestedSignal =
      buttonAction === "story-map"
        ? "story-map"
        : buttonAction === "back" || buttonAction === "continue"
          ? undefined
        : reuseExistingSignals
          ? buttonSignal || config?.signal
          : undefined;
    const signal =
      buttonAction === "continue" || buttonAction === "back"
        ? undefined
        : requestedSignal &&
            (usedSignals.has(requestedSignal) || buttonAction === "story-map")
          ? requestedSignal
          : `button-${index}`;
    let timeoutSignal: string | undefined;
    if (config?.mode === "interactive" && config.kind !== "button-feedback") {
      const requestedTimeout =
        reuseExistingSignals &&
        config.timeoutSignal &&
        usedSignals.has(config.timeoutSignal)
          ? config.timeoutSignal
          : undefined;
      if (requestedTimeout) timeoutSignal = requestedTimeout;
      else {
        timeoutSignal = `${signal ?? "button"}-failure`;
        let suffix = 2;
        while (usedSignals.has(timeoutSignal))
          timeoutSignal = `${signal ?? "button"}-failure-${suffix++}`;
      }
    }
    const label =
      config?.kind === "hold-charge"
        ? t("playableWorkbench.defaultHoldChargeText")
        : config?.kind === "progress-ring"
          ? t("playableWorkbench.defaultRingCountdownText")
          : config?.kind === "countdown"
            ? t("playableWorkbench.defaultCountdownText")
              : config?.kind === "swipe-button"
                ? t("playableWorkbench.defaultSwipeButtonText")
            : config?.kind === "progress-bar"
              ? t("playableWorkbench.defaultProgressBarText")
              : config?.feedback === "ripple-hint"
                ? t("playableWorkbench.defaultRippleHintText")
              : t("playableWorkbench.defaultButtonText");
    const id = `putenggame-button-${Math.random().toString(36).slice(2, 10)}`;
    const file = await getWorkspaceFile(projectId, node.source.html);
    const before = file.truncated ? undefined : file.content;
    if (before === undefined) return undefined;
    const inserted = insertPlayableButtonPreset(
      before,
      node.source.html,
      id,
      signal,
      label,
      config
        ? {
            ...config,
            ...(config.kind === "button-feedback" &&
            config.interaction !== "multi-click"
              ? {}
              : !signal
              ? {}
              : { signal }),
            ...(timeoutSignal ? { timeoutSignal } : {}),
          }
        : undefined,
      assetId,
      pressedAssetId,
      buttonText === undefined ? label : buttonText.trim(),
      fontFamily,
      buttonAction,
    );
    if (!inserted) return undefined;
    const next = structuredClone(graph);
    const nextNode = next.nodes.find((candidate) => candidate.id === nodeId)!;
    if (signal && !usedSignals.has(signal))
      nextNode.signals.push({
        id: signal,
        label: buttonAction === "story-map" ? buttonText?.trim() || label : label,
        ...(buttonAction === "story-map" ? { role: "navigation" as const } : {}),
      });
    if (timeoutSignal && !usedSignals.has(timeoutSignal))
      next.nodes.find((candidate) => candidate.id === nodeId)!.signals.push({
        id: timeoutSignal,
        label: `${label}失败`,
      });
    await writeSources(
      next,
      { [node.source.html]: inserted.html },
      { [node.source.html]: before },
      t("playableWorkbench.historyAddButtonPreset"),
    );
    return {
      id,
      source: inserted.source,
      ...(signal ? { signal } : {}),
      label,
      ...(timeoutSignal ? { timeoutSignal } : {}),
    };
  }

  async function createSharedAnswerSignals(nodeId: string): Promise<boolean> {
    const graph = latestCodebase.current?.graph;
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!graph || !node) return false;
    const outcomes = [
      { id: "answer-correct", label: t("playableWorkbench.correct") },
      { id: "answer-incorrect", label: t("playableWorkbench.incorrect") },
    ];
    const missing = outcomes.filter(
      (outcome) => !node.signals.some((signal) => signal.id === outcome.id),
    );
    if (!missing.length) return true;
    const next = structuredClone(graph);
    next.nodes
      .find((candidate) => candidate.id === nodeId)!
      .signals.push(...missing);
    await writeSources(
      next,
      {},
      {},
      t("playableWorkbench.historyCreateSharedExits"),
    );
    return true;
  }

  async function deleteSharedAnswerSignals(nodeId: string): Promise<boolean> {
    const graph = latestCodebase.current?.graph;
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!graph || !node) return false;
    const ids = new Set(["answer-correct", "answer-incorrect"]);
    const existing = node.signals.filter((signal) => ids.has(signal.id));
    if (!existing.length) return true;

    const file = await getWorkspaceFile(projectId, node.source.html);
    const before = file.truncated ? undefined : file.content;
    if (before === undefined) return false;
    const html = removePlayableSignalAttributes(before, ids);
    const next = existing.reduce(
      (current, signal) => deletePlayableSignal(current, nodeId, signal.id),
      graph,
    );
    await writeSources(
      next,
      { [node.source.html]: html },
      { [node.source.html]: before },
      t("playableWorkbench.historyDeleteSharedExits"),
    );
    return true;
  }

  async function writeButtonSignal(
    pick: PlayablePickResult,
    signalId: string,
  ): Promise<boolean> {
    const graph = codebase?.graph;
    const location = pick.source
      ? parsePlayableSourceLocation(pick.source)
      : undefined;
    const node = graph?.nodes.find((candidate) => candidate.id === pick.nodeId);
    if (
      !graph ||
      !location ||
      !node ||
      node.source.html !== location.file ||
      !node.signals.some((signal) => signal.id === signalId)
    )
      return false;
    const file = await getWorkspaceFile(projectId, location.file);
    const before = file.truncated ? undefined : file.content;
    if (before === undefined) return false;
    const html = setPlayableElementAttributes(before, location, pick.tag, {
      "data-signal": signalId,
      [PLAYABLE_MOTION_ATTRIBUTES.signal]: pick.motion ? signalId : undefined,
    });
    if (html === undefined) return false;
    let next = graph;
    const previousSignal = pick.signal;
    if (previousSignal && previousSignal !== signalId) {
      const javascript = await getWorkspaceFile(
        projectId,
        node.source.javascript,
      );
      const htmlStillUsesSignal = [
        ...html.matchAll(
          /\bdata-(?:signal|putenggame-motion-signal|putenggame-motion-timeout)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
        ),
      ].some(
        (match) =>
          (match[1] ?? match[2] ?? match[3]) === previousSignal,
      );
      const sourceMayUseSignal =
        javascript.truncated ||
        javascript.content === undefined ||
        javascript.content.includes(previousSignal);
      if (!htmlStillUsesSignal && !sourceMayUseSignal)
        next = deletePlayableSignal(graph, node.id, previousSignal);
    }
    await writeSources(
      next,
      { [location.file]: html },
      { [location.file]: before },
      t("playableWorkbench.historyAdjustButtonExit"),
    );
    return true;
  }

  async function writeButtonSignalLabel(
    pick: PlayablePickResult,
    signalId: string,
    label: string,
  ): Promise<boolean> {
    const graph = codebase?.graph;
    const signal = graph?.nodes
      .find((candidate) => candidate.id === pick.nodeId)
      ?.signals.find((candidate) => candidate.id === signalId);
    if (!graph || !signal || !label.trim()) return false;
    if (signal.label === label.trim()) return true;
    const next = setPlayableSignalLabel(graph, pick.nodeId, signalId, label);
    if (next === graph) return false;
    await writeGraph(next, t("playableWorkbench.historyRenameButtonExit"));
    return true;
  }

  async function writeAffectionConfig(
    nodeId: string,
    config: PlayableAffectionConfig,
  ): Promise<void> {
    const graph = codebase?.graph;
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!graph || !node) throw new Error("Scene no longer exists");
    if (
      !config.characters.length ||
      config.characters.length > 500 ||
      !config.choices.length ||
      config.choices.length > 50 ||
      new Set(config.characters.map((character) => character.id)).size !==
        config.characters.length ||
      new Set(config.choices.map((choice) => choice.id)).size !==
        config.choices.length ||
      config.characters.some(
        (character) =>
          character.id.length > 120 ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(character.id) ||
          !character.name.trim() ||
          character.name.length > 40 ||
          !Number.isInteger(character.initial) ||
          character.initial < 0 ||
          character.initial > 10,
      ) ||
      config.choices.some(
        (choice) =>
          choice.id.length > 120 ||
          !/^[a-z][a-z0-9_-]*$/.test(choice.id) ||
          !choice.label.trim() ||
          choice.label.length > 100 ||
          !config.characters.some(
            (character) => character.id === choice.characterId,
          ) ||
          !Number.isInteger(choice.delta) ||
          choice.delta < -10 ||
          choice.delta > 10 ||
          !Number.isInteger(choice.threshold) ||
          choice.threshold < 0 ||
          choice.threshold > 10,
      )
    ) {
      throw new Error("Please check the character, choice, and value settings");
    }
    const signalIds = [...affectionSignalIds(config)];
    if (
      signalIds.length !== config.choices.length * 2 ||
      signalIds.some((id) => id.length > 120 || !/^[a-z][a-z0-9-]*$/.test(id))
    ) {
      throw new Error(
        "Exit IDs must use lowercase letters, numbers, or hyphens and be unique",
      );
    }
    const file = await getWorkspaceFile(projectId, node.source.html);
    const before = file.truncated ? undefined : file.content;
    if (before === undefined) throw new Error("Could not read Scene source");
    const html = writePlayableAffectionConfig(before, config);
    if (html === undefined)
      throw new Error("Affection settings were not found in this Scene");
    const labels = new Map<string, string>();
    config.choices.forEach((choice) => {
      labels.set(
        choice.successSignal,
        `${choice.label.trim()} · Threshold met`,
      );
      labels.set(
        choice.fallbackSignal,
        `${choice.label.trim()} · Below threshold`,
      );
    });
    const next = structuredClone(graph);
    const nextNode = next.nodes.find((candidate) => candidate.id === nodeId)!;
    nextNode.signals = signalIds.map((id) => ({
      id,
      label: (labels.get(id) ?? id).slice(0, 120),
    }));
    next.edges = next.edges.filter(
      (edge) => edge.source.nodeId !== nodeId || labels.has(edge.source.signal),
    );
    for (const character of config.characters) {
      next.initialState[character.id] = character.initial;
      next.variables ??= {};
      next.variables[character.id] =
        `${character.name.trim()}'s affection, carried across Scenes`;
    }
    await writeSources(
      next,
      { [node.source.html]: html },
      { [node.source.html]: before },
      t("playableWorkbench.historyAdjustAffection"),
    );
  }

  /**
   * Writes a move from the preview back to the `style` of the element in the
   * surface HTML that holds it. False when it cannot be done in place.
   */
  async function writeMove(move: PlayableMove): Promise<boolean> {
    const graph = codebase?.graph;
    const previewLocation = move.pick.source
      ? parsePlayableSourceLocation(move.pick.source)
      : undefined;
    const node = graph?.nodes.find(
      (candidate) => candidate.id === move.pick.nodeId,
    );
    if (
      !graph ||
      !previewLocation ||
      !node ||
      node.source.html !== previewLocation.file
    )
      return false;
    const file = await getWorkspaceFile(projectId, previewLocation.file);
    const before = file.truncated ? undefined : file.content;
    const location = before
      ? sourceLocationForPick(before, move.pick)
      : undefined;
    const html =
      before === undefined || location === undefined
        ? undefined
        : move.part === "button-label"
          ? move.pick.tag !== "button" || !move.pick.buttonAssetId
            ? undefined
            : setPlayableElementAttributes(before, location, "button", {
                [PLAYABLE_MOTION_ATTRIBUTES.labelTranslate]:
                  playableTranslateValue(move.translate),
              })
          : setPlayableElementTranslate(
              before,
              location,
              move.pick.tag,
              move.translate,
            );
    if (before === undefined || html === undefined) return false;
    if (html !== before)
      await writeSources(
        graph,
        { [previewLocation.file]: html },
        { [previewLocation.file]: before },
        move.part === "button-label"
          ? t("playableWorkbench.historyMoveButtonText")
          : t("playableWorkbench.historyMoveElement"),
      );
    return true;
  }

  /** Writes a selected element's visual scale and rotation back to its source. */
  async function writeTransform(edit: PlayableTransformEdit): Promise<boolean> {
    const graph = codebase?.graph;
    const location = edit.pick.source
      ? parsePlayableSourceLocation(edit.pick.source)
      : undefined;
    const node = graph?.nodes.find(
      (candidate) => candidate.id === edit.pick.nodeId,
    );
    if (
      !graph ||
      !location ||
      !node ||
      node.source.html !== location.file ||
      !edit.inPlace
    )
      return false;
    const file = await getWorkspaceFile(projectId, location.file);
    const before = file.truncated ? undefined : file.content;
    if (before === undefined) return false;
    const currentLocation = sourceLocationForPick(before, edit.pick);
    if (!currentLocation) return false;
    const html = setPlayableElementTransform(
      before,
      currentLocation,
      edit.pick.tag,
      edit.pick.tag.toLowerCase() === "button"
        ? { ...edit.transform, originX: 50, originY: 50 }
        : edit.transform,
    );
    if (html === undefined) return false;
    await writeSources(
      graph,
      { [currentLocation.file]: html },
      { [currentLocation.file]: before },
      t("playableWorkbench.historyTransformElement"),
    );
    return true;
  }

  /** Removes a selected element from the source surface HTML. */
  async function writeDelete(edit: PlayableDeleteEdit): Promise<boolean> {
    const graph = codebase?.graph;
    const location = edit.pick.source
      ? parsePlayableSourceLocation(edit.pick.source)
      : undefined;
    const node = graph?.nodes.find(
      (candidate) => candidate.id === edit.pick.nodeId,
    );
    if (
      !graph ||
      !location ||
      !node ||
      node.source.html !== location.file ||
      !edit.inPlace ||
      edit.pick.mediaSlot === "backdrop"
    )
      return false;
    const file = await getWorkspaceFile(projectId, location.file);
    const before = file.truncated ? undefined : file.content;
    if (before === undefined) return false;
    const stableIdSelector = new RegExp(
      `^${edit.pick.tag}#[a-z][\\w-]*$`,
      "i",
    ).test(edit.pick.cssPath);
    const html =
      edit.part === "button-label"
        ? removePlayableTextPart(
            before,
            location,
            edit.pick.tag,
            edit.pick.text,
            edit.pick.sourceText,
          )
        : stableIdSelector
          ? removePlayableElementByCssPath(
              before,
              edit.pick.cssPath,
              edit.pick.tag,
            )
          : removePlayableElement(before, location, edit.pick.tag);
    if (html === undefined) return false;
    const next =
      edit.part !== "button-label" &&
      edit.pick.tag.toLowerCase() === "button" &&
      edit.pick.signal
        ? deletePlayableButtonSignals(graph, node.id, edit.pick.signal)
        : graph;
    await writeSources(
      next,
      { [location.file]: html },
      { [location.file]: before },
      t("playableWorkbench.historyDeleteElement"),
    );
    return true;
  }

  /**
   * Declares a video or image and shows it as the Node's background. The
   * Asset it replaces stays declared, since other code may still use it.
   * Resolves with a way to put the background back, or undefined when the
   * Node's HTML has no single background to set.
   */
  async function writeBackdrop(
    nodeId: string,
    asset: PlayableAssetRequest,
  ): Promise<string | undefined> {
    const graph = codebase?.graph;
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!graph || !node || (asset.type !== "image" && asset.type !== "video"))
      return undefined;
    const path = node.source.html;
    const file = await getWorkspaceFile(projectId, path);
    if (file.content === undefined || file.truncated) return undefined;
    const before = file.content;
    const declared = addPlayableNodeAsset(graph, nodeId, asset);
    const html = setPlayableBackdrop(before, declared.assetId, asset.type);
    if (html === undefined) return undefined;
    await writeSources(
      declared.graph,
      { [path]: html },
      { [path]: before },
      t("playableWorkbench.historySetBackground"),
    );
    return declared.assetId;
  }

  /**
   * Takes the Asset off the Node's background. The Asset stays declared,
   * since other code may still use it. Resolves false when the Node's HTML
   * has no single background to clear.
   */
  async function removeBackdrop(nodeId: string): Promise<boolean> {
    const graph = codebase?.graph;
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!graph || !node) return false;
    const path = node.source.html;
    const file = await getWorkspaceFile(projectId, path);
    if (file.content === undefined || file.truncated) return false;
    const before = file.content;
    const html = clearPlayableBackdrop(before);
    if (html === undefined) return false;
    if (html !== before)
      await writeSources(
        graph,
        { [path]: html },
        { [path]: before },
        t("playableWorkbench.historyRemoveBackground"),
      );
    return true;
  }

  async function writeBackdropLoop(
    nodeId: string,
    loop: boolean,
  ): Promise<boolean> {
    const graph = codebase?.graph;
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!graph || !node) return false;
    const path = node.source.html;
    const file = await getWorkspaceFile(projectId, path);
    if (file.content === undefined || file.truncated) return false;
    const before = file.content;
    const html = setPlayableBackdropLoop(before, loop);
    if (html === undefined) return false;
    if (html !== before)
      await writeSources(
        graph,
        { [path]: html },
        { [path]: before },
        t("playableWorkbench.historySetBackgroundPlayback"),
      );
    setBackdropLoop(loop);
    return true;
  }

  async function writePictureInPictureVideoLoop(
    nodeId: string,
    loop: boolean,
  ): Promise<boolean> {
    const graph = codebase?.graph;
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!graph || !node) return false;
    const path = node.source.html;
    const file = await getWorkspaceFile(projectId, path);
    if (file.content === undefined || file.truncated) return false;
    const before = file.content;
    const html = setPlayablePictureInPictureVideoLoop(before, loop);
    if (html === undefined) return false;
    if (html !== before)
      await writeSources(
        graph,
        { [path]: html },
        { [path]: before },
        t("playableWorkbench.historySetPictureInPicturePlayback"),
      );
    setPictureInPictureVideoLoop(loop);
    return true;
  }

  async function writeNoInputMode(
    nodeId: string,
    mode: PlayableNoInputMode | undefined,
  ): Promise<boolean> {
    const graph = codebase?.graph;
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!graph || !node) return false;
    const path = node.source.html;
    const file = await getWorkspaceFile(projectId, path);
    if (file.content === undefined || file.truncated) return false;
    const before = file.content;
    const html = setPlayableNoInputMode(before, mode);
    if (html === undefined) return false;
    if (html !== before)
      await writeSources(
        graph,
        { [path]: html },
        { [path]: before },
        t("playableWorkbench.historySetNoInputBehavior"),
      );
    setNoInputMode(mode);
    return true;
  }

  async function writeVideoEndAutoAdvance(
    nodeId: string,
    enabled: boolean,
  ): Promise<boolean> {
    const graph = latestCodebase.current?.graph ?? codebase?.graph;
    const node = graph?.nodes.find((candidate) => candidate.id === nodeId);
    if (!graph || !node) return false;
    if (node.videoEndAutoAdvance === enabled) return true;
    const next = structuredClone(graph);
    const updated = next.nodes.find((candidate) => candidate.id === nodeId);
    if (!updated) return false;
    if (enabled) updated.videoEndAutoAdvance = true;
    else delete updated.videoEndAutoAdvance;
    await writeGraph(
      next,
      t("playableWorkbench.historySetVideoEndAutoAdvance"),
    );
    return true;
  }

  function openNode(nodeId: string): void {
    setCanvasContextMenu(undefined);
    setSelectedEdgeId(undefined);
    setOpenedNodeId(nodeId);
  }

  function setEntryNode(nodeId: string): void {
    if (graphMeta?.entryNodeId === nodeId) return;
    beginHistoryAction(t("playableWorkbench.historySetStartScene"));
    setGraphMeta((current) =>
      current ? { ...current, entryNodeId: nodeId } : current,
    );
  }

  /**
   * Drops the Node and its edges from the graph. The Node's files stay on disk
   * so an undo brings the Node back complete. When the Start is removed,
   * buildCodebase makes the first remaining Node the Start; removing the last
   * Node leaves an empty project.
   */
  function removeNodes(removed: ReadonlySet<string>): void {
    if (!removed.size || !nodes.some((node) => removed.has(node.id))) return;
    beginHistoryAction(t("playableWorkbench.historyDeleteScene"));
    setNodes((current) => current.filter((node) => !removed.has(node.id)));
    setEdges((current) =>
      current.filter(
        (edge) => !removed.has(edge.source) && !removed.has(edge.target),
      ),
    );
    setSelectedEdgeId(undefined);
  }

  function clearSelection(): void {
    setSelectedEdgeId(undefined);
    setNodes((current) =>
      current.map((node) =>
        node.selected ? { ...node, selected: false } : node,
      ),
    );
  }

  function selectCanvasNode(nodeId: string): void {
    setSelectedEdgeId(undefined);
    setNodes((current) =>
      current.map((node) => ({ ...node, selected: node.id === nodeId })),
    );
  }

  function updateCanvasViewport(viewport: {
    x: number;
    y: number;
    zoom: number;
  }): void {
    setEditorLayout((current) => ({ ...current, viewport }));
  }

  /**
   * Creates a Node through the same endpoint the Agent uses, so a Node added
   * here and a Node added in chat are identical, then reloads the written files.
   */
  async function addNodeFromPreset(
    presetId: string,
    position: { x: number; y: number },
  ): Promise<void> {
    if (!codebase || writing) return;
    setWriting(true);
    try {
      commitPendingHistory();
      const generation = diskGeneration.current;
      await save(codebase);
      // After a save that loaded the Agent's changes, undoing to `codebase` would take them back.
      if (generation === diskGeneration.current)
        pushUndoSnapshot(codebase, undefined, t("playableWorkbench.historyAddScene"));
      redoHistory.current = [];
      await addPlayableNode(projectId, {
        preset: presetId,
        id: uniqueNodeId(presetId, new Set(nodes.map((node) => node.id))),
        position: snapCanvasPosition(position),
      });
      const loaded = await getNodeCodebase(projectId);
      applyCodebase(loaded, { diskRevision: loaded.revision });
      setCodeRevision((revision) => revision + 1);
      updateHistoryControls();
    } catch (cause) {
      undoHistory.current.pop();
      setNotice(errorMessage(cause));
    } finally {
      setWriting(false);
    }
  }

  function pastePosition(): { x: number; y: number } {
    const selected = nodes.filter((node) => node.selected);
    if (selected.length) {
      return {
        x: Math.min(...selected.map((node) => node.position.x)) + 60,
        y: Math.min(...selected.map((node) => node.position.y)) + 60,
      };
    }
    const element = document.querySelector<HTMLElement>(
      ".interactive-story-canvas .react-flow",
    );
    const bounds = element?.getBoundingClientRect();
    return (
      canvas.current?.screenToFlowPosition({
        x: (bounds?.left ?? 0) + (bounds?.width ?? window.innerWidth) / 2,
        y: (bounds?.top ?? 0) + (bounds?.height ?? window.innerHeight) / 2,
      }) ?? { x: 80, y: 180 }
    );
  }

  async function copySelection(nodeId?: string): Promise<void> {
    const selected = nodes.filter((node) => node.selected);
    const sourceNodes = selected.length
      ? selected
      : nodeId
        ? nodes.filter((node) => node.id === nodeId)
        : [];
    if (!sourceNodes.length) return;
    try {
      const sources = Object.fromEntries(
        await Promise.all(
          sourceNodes.map(
            async (flowNode) =>
              [
                flowNode.id,
                await readNodeSources(projectId, flowNode.data.node),
              ] as const,
          ),
        ),
      );
      const value = createPlayableClipboard(
        sourceNodes.map((node) => ({ ...node, selected: true })),
        edges,
        sources,
      );
      setCopiedSelection(value);
      void navigator.clipboard
        ?.writeText(JSON.stringify(value))
        .catch(() => {});
    } catch (cause) {
      setNotice(errorMessage(cause));
    }
  }

  async function pasteSelectionAt(position: {
    x: number;
    y: number;
  }): Promise<void> {
    let copy = copiedSelection;
    if (!copy) {
      const text = await navigator.clipboard?.readText().catch(() => "");
      copy = text ? parsePlayableClipboard(text) : undefined;
      if (copy) setCopiedSelection(copy);
    }
    if (copy) await insertNodeCopy(copy, position);
  }

  /** A paste is a real copy: every source file gets a new Node ID path. */
  async function insertNodeCopy(
    copy: CopiedPlayableSelection,
    position: { x: number; y: number },
  ): Promise<void> {
    if (!graphMeta || !codebase || writing) return;
    setWriting(true);
    try {
      commitPendingHistory();
      pushUndoSnapshot(codebase, undefined, t("playableWorkbench.historyPasteScene"));
      redoHistory.current = [];
      const duplicated = duplicatePlayableSelection(
        copy,
        position,
        new Set(nodes.map((node) => node.id)),
        new Set(edges.map((edge) => edge.id)),
      );
      const nextNodes = [
        ...nodes.map((node) =>
          node.selected ? { ...node, selected: false } : node,
        ),
        ...duplicated.nodes.map((item) => {
          const flowNode = createFlowNode(item.node, item.position);
          return { ...flowNode, selected: true };
        }),
      ];
      const nextEdges = [...edges, ...duplicated.edges];
      const next = buildCodebase(
        graphMeta,
        nextNodes,
        nextEdges,
        editorLayout,
        workspaceView,
      );
      const update: NodeCodebaseUpdate = {
        ...next,
        sources: Object.assign(
          {},
          ...duplicated.nodes.map((item) => item.sources),
        ),
      };
      await save(update);
      // The sources are written, so the canvas state alone is what autosave compares next;
      // unless an autosave of the canvas without the copy was queued meanwhile, which the next one has to put right.
      if (queuedCodebase.current === JSON.stringify(update))
        queuedCodebase.current = JSON.stringify(next);
      setNodes(nextNodes);
      setEdges(nextEdges);
      setSelectedEdgeId(undefined);
      observeHistory(next);
      updateHistoryControls();
    } catch (cause) {
      undoHistory.current.pop();
      setNotice(errorMessage(cause));
    } finally {
      setWriting(false);
    }
  }

  async function duplicateNode(nodeId: string): Promise<void> {
    const flowNode = nodes.find((candidate) => candidate.id === nodeId);
    if (!flowNode) return;
    const node = flowNode.data.node;
    try {
      const sources = await readNodeSources(projectId, node);
      await insertNodeCopy(
        {
          format: "putenggame/playable-nodes",
          version: 1,
          nodes: [{ node, position: flowNode.position, sources }],
          edges: [],
        },
        { x: flowNode.position.x + 60, y: flowNode.position.y + 60 },
      );
    } catch (cause) {
      setNotice(errorMessage(cause));
    }
  }

  /** Opens the Playtest window; `start` plays from a Scene instead of the saved game. */
  async function startPlaytest(start?: PlaytestStart): Promise<void> {
    if (!codebase || building || playtesting) return;
    setPlaytesting(true);
    if (!start) clearSelection();
    try {
      await save(codebase);
      if (start) requestPlaytestStart(projectId, start);
      if (window.putengGameDesktop) {
        await window.putengGameDesktop.openPlaytest(
          projectId,
          codebase.graph.viewport,
        );
      } else {
        window.open(
          new URL(playtestHash(projectId), window.location.href).href,
          "putenggame-playtest",
        );
      }
    } catch (cause) {
      setNotice(errorMessage(cause));
    } finally {
      setPlaytesting(false);
    }
  }

  async function exportGame(format: InteractiveStoryExportFormat): Promise<void> {
    if (!codebase || building) return;
    setBuilding(true);
    try {
      await save(codebase);
      const artifact = await buildInteractiveStory(projectId, format);
      const url = URL.createObjectURL(artifact);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${project.name}-${format}.${format === "pico-apk" ? "apk" : "zip"}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } finally {
      setBuilding(false);
    }
  }

  async function publishGame(details: PublishDetails): Promise<boolean> {
    if (!codebase)
      throw new Error(
        "The game is still loading. Try publishing again when it is ready.",
      );
    await save(codebase);
    return onPublish(details);
  }

  // A navigation Exit's line is hidden; its Exit row names the target.
  const renderedEdges = useMemo(() => {
    const navigation = new Set(
      nodes.flatMap((node) =>
        node.data.node.signals
          .filter((signal) => signal.role === "navigation")
          .map((signal) => `${node.id}\u0000${signal.id}`),
      ),
    );
    const selectedNodeIds = new Set(
      nodes.filter((node) => node.selected).map((node) => node.id),
    );
    return edges.map((edge) => {
      const selectedNodeConnected =
        selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target);
      const className =
        [
          edge.className,
          selectedNodeConnected ? "playable-edge-node-selected" : undefined,
        ]
          .filter(Boolean)
          .join(" ") || undefined;
      return {
        ...edge,
        ...(className ? { className } : {}),
        data: { ...edge.data, nodeSelected: selectedNodeConnected },
        ...(navigation.has(`${edge.source}\u0000${edge.sourceHandle}`)
          ? { hidden: true }
          : {}),
      };
    });
  }, [nodes, edges]);
  const renderedNodes = useMemo(() => {
    const pendingRemovalNodeIds = new Set(
      storyTreeCanvasStatus?.pendingRemovalNodeIds ?? [],
    );
    const unconnectedNodeIds = unconnectedPlayableNodeIds(
      nodes.map((node) => node.id),
      edges,
    );
    const titles = new Map(
      nodes.map((node) => [node.id, node.data.node.title]),
    );
    const connected = new Map<string, PlayableFlowData["connected"]>();
    for (const edge of edges) {
      if (!edge.sourceHandle) continue;
      connected.set(edge.source, {
        ...connected.get(edge.source),
        [edge.sourceHandle]: {
          edgeId: edge.id,
          target: titles.get(edge.target) ?? edge.target,
          selected: edge.id === selectedEdgeId,
        },
      });
    }
    const nodeIssues = new Map<string, string[]>();
    const failed = new Set<string>();
    for (const issue of issues) {
      const owner = issue.surfaceId ?? nodeIdForIssuePath(issue.path, nodes);
      if (!owner) continue;
      nodeIssues.set(owner, [...(nodeIssues.get(owner) ?? []), issue.message]);
      if (issue.phase === "compiler") failed.add(owner);
    }
    return nodes.map((node): PlayableFlowNode => {
      const cached = thumbnails?.[node.id];
      // Without a successful build the current hash is unknown, so a cached
      // thumbnail is not called stale; a failing Node is dimmed instead.
      const hash = builtDefinition
        ? playableThumbnailHash(builtDefinition, node.id)
        : undefined;
      const runtimeBackdrop = builtDefinition?.compiled.nodes[node.id]?.html
        ? playableBackdropAsset(builtDefinition.compiled.nodes[node.id].html)
        : undefined;
      const coverAssetId =
        runtimeBackdrop?.assetId ??
        node.data.node.assets.find((id) => {
          const type = graphMeta?.assets[id]?.type;
          return type === "image" || type === "video";
        });
      return {
        ...node,
        data: {
          node: node.data.node,
          entry: codebase?.graph.entryNodeId === node.id,
          ending: isPlayableStoryEnding(node.data.node),
          issues: nodeIssues.get(node.id) ?? [],
          connected: connected.get(node.id) ?? {},
          failed: failed.has(node.id),
          ...(unconnectedNodeIds.has(node.id) ? { unconnected: true } : {}),
          ...(pendingRemovalNodeIds.has(node.id)
            ? { storyTreeStatus: "pending-removal" as const }
            : node.data.node.storyTreeDetached
              ? { storyTreeStatus: "detached" as const }
              : {}),
          ...(cached
            ? {
                thumbnail: {
                  capturedAt: cached.capturedAt,
                  stale: Boolean(hash && hash !== cached.hash),
                },
              }
            : {}),
          ...(coverAssetId
            ? { coverAsset: graphMeta!.assets[coverAssetId] }
            : {}),
        },
      };
    });
  }, [
    nodes,
    edges,
    selectedEdgeId,
    issues,
    graphMeta,
    codebase,
    thumbnails,
    builtDefinition,
    storyTreeCanvasStatus,
  ]);
  const canvasPlayer = useMemo(
    () => ({
      projectId,
      onRenameNode: renameNode,
      onSelectEdge: selectEdge,
      onOpenNode: openNode,
    }),
    [projectId],
  );
  const projectIssues = issues.filter(
    (issue) => !issue.surfaceId && !nodeIdForIssuePath(issue.path, nodes),
  );
  const tabs: WorkspaceTabOption<"canvas" | "design" | "code">[] = [
    { id: "canvas", label: t("storyEditor.tab.story"), icon: Clapperboard },
    ...(onDesignOpenChange
      ? [{ id: "design" as const, label: t("workspace.tab.design"), icon: FileText }]
      : []),
    { id: "code", label: t("workspace.tab.code"), icon: Code2 },
  ];
  const renderNavigation = () => (
    <div className={`viewer-navigation${chatOnRight ? " is-chat-right" : ""}`}>
      {chatOnRight && onHome ? (
        <button
          className="icon-button pane-header-action workspace-home-button"
          type="button"
          onClick={onHome}
          title={translateText("Home")}
          aria-label={translateText("Home")}
        >
          <House size={14} />
        </button>
      ) : null}
      <WorkspaceTabs
        tabs={tabs}
        active={designOpen ? "design" : workspaceView}
        onChange={(tab) => {
          const navigate = () => {
            if (tab !== "design") {
              if (tab === "code") clearSelection();
              setWorkspaceView(tab);
            }
            onDesignOpenChange?.(tab === "design");
          };
          if (designOpen && designLeave.current) designLeave.current(navigate);
          else navigate();
        }}
      />
    </div>
  );

  return (
    <section
      className={`viewer-pane interactive-story-workspace playable-editor-workspace${openedNode ? " is-node-editor-open" : ""}`}
      data-active-tab={designOpen ? "design" : workspaceView}
      aria-label={translateText("Playable Nodes workspace")}
      style={
        {
          "--story-viewport-ratio": `${playerViewport.width} / ${playerViewport.height}`,
          "--story-viewport-aspect": playerViewportAspect,
          "--story-canvas-stage-width": `${canvasStageWidth}px`,
          "--story-canvas-stage-height": `${canvasStageHeight}px`,
        } as CSSProperties
      }
    >
      <header className="pane-header viewer-header interactive-story-header window-drag-handle">
        <span
          className="workspace-navigation-drag-exclusion"
          aria-hidden="true"
        />
        {renderNavigation()}
        <div
          className={`viewer-publish${designOpen ? " design-header-actions" : ""}`}
          ref={setDesignHeaderActions}
        >
          {!designOpen ? (
            <>
              <button
                className="icon-button pane-header-action"
                type="button"
                title={translateText("Project settings")}
                aria-label={translateText("Project settings")}
                aria-haspopup="dialog"
                disabled={phase !== "ready"}
                onClick={() => setProjectSettingsOpen(true)}
              >
                <Settings size={14} />
              </button>
              <button
                className="icon-button pane-header-action"
                type="button"
                data-tooltip={
                  playtesting
                    ? t("storyEditor.openingPlaytest")
                    : t("storyEditor.playtestWindow")
                }
                aria-label={translateText("Playtest")}
                disabled={phase !== "ready" || building || playtesting}
                onClick={() => void startPlaytest()}
              >
                {playtesting ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Play size={14} />
                )}
              </button>
              <button
                className="publish-button workspace-publish-button"
                type="button"
                title={t(publishing ? "workspace.publishing" : "workspace.publish")}
                aria-label={t(publishing ? "workspace.publishing" : "workspace.publish")}
                disabled={agentBusy || publishing || building}
                onClick={onOpenPublish}
              >
                {publishing ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Share2 size={14} />
                )}
                <span>{translateText("Publish")}</span>
              </button>
              {chatOnRight && chatCollapsed && onToggleChat ? (
                <button
                  className="icon-button pane-header-action"
                  type="button"
                  title={translateText("Show chat")}
                  aria-label={translateText("Show chat")}
                  onClick={onToggleChat}
                >
                  <PanelToggle size={14} />
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </header>
      {designOpen ? (
        <Suspense
          fallback={
            <div className="design-loading">
              <LoaderCircle className="spin" size={18} />
            </div>
          }
        >
          <CanvasWorkspace
            project={project}
            onProjectUpdated={onProjectUpdated}
            headerActionsTarget={designHeaderActions}
            onLeaveReady={registerDesignLeave}
            onSaveReady={onDesignSaveReady}
            onContextChange={onDesignContextChange}
          />
        </Suspense>
      ) : workspaceView !== "code" ? (
        <div className="interactive-story-body">
          <div className="interactive-story-canvas">
            {phase === "loading" ? (
              <div className="story-canvas-state">{translateText("Loading Scenes...")}</div>
            ) : null}
            {phase === "error" ? (
              <div className="story-canvas-state story-canvas-state-error">
                {notice}
              </div>
            ) : null}
            {phase === "ready" ? (
              <PlayableCanvasContext.Provider value={canvasPlayer}>
                <EditorCanvas<PlayableFlowNode>
                  nodes={renderedNodes}
                  edges={renderedEdges}
                  onInit={(instance) => {
                    canvas.current = instance;
                  }}
                  nodeTypes={PLAYABLE_NODE_TYPES}
                  edgeTypes={{ playable: PlayableEdge }}
                  addControl={
                    <PlayableAddControl
                      presets={presets}
                      busy={writing}
                      onAdd={(presetId, position) =>
                        void addNodeFromPreset(presetId, position)
                      }
                    />
                  }
                  arrangeControl={
                    <button
                      type="button"
                      title={translateText("Arrange nodes")}
                      aria-label={translateText("Arrange nodes")}
                      disabled={writing || nodes.length < 2}
                      onClick={arrangeStoryNodes}
                    >
                      <ArrowDownUp size={18} />
                    </button>
                  }
                  onOpenMenu={setCanvasContextMenu}
                  deleteKeyCode={
                    openedNode || projectSettingsOpen
                      ? null
                      : ["Backspace", "Delete"]
                  }
                  onNodesChange={onNodesChange}
                  onNodeDragStart={() => {
                    setCanvasContextMenu(undefined);
                    beginHistoryGesture();
                  }}
                  onNodeDragStop={finishHistoryGesture}
                  onMoveStart={() => setCanvasContextMenu(undefined)}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onMoveEnd={(_event, viewport) =>
                    setEditorLayout((current) => ({ ...current, viewport }))
                  }
                  onEdgeClick={(_event, edge) => setSelectedEdgeId(edge.id)}
                  onNodeClick={() => {
                    setCanvasContextMenu(undefined);
                    setSelectedEdgeId(undefined);
                  }}
                  onNodeDoubleClick={(_event, node) => openNode(node.id)}
                  onPaneClick={() => {
                    setCanvasContextMenu(undefined);
                    clearSelection();
                  }}
                  onNodeContextMenu={(_event, node) => {
                    setSelectedEdgeId(undefined);
                    setNodes((current) => {
                      const clickedWasSelected = current.some(
                        (candidate) =>
                          candidate.id === node.id && candidate.selected,
                      );
                      return clickedWasSelected
                        ? current
                        : current.map((candidate) => ({
                            ...candidate,
                            selected: candidate.id === node.id,
                          }));
                    });
                  }}
                  onNodesDelete={(deleted) =>
                    removeNodes(new Set(deleted.map((node) => node.id)))
                  }
                  isValidConnection={(connection) =>
                    Boolean(
                      connection.source &&
                      connection.target &&
                      connection.sourceHandle,
                    )
                  }
                  defaultViewport={editorLayout.viewport}
                >
                  <PlayableStoryTreeCanvasController
                    workspaceReady={
                      loadedWorkspaceRevision === workspaceRevision
                    }
                    workspaceRevision={workspaceRevision}
                    fitAfterRevision={storyTreeCanvasFitAfterRevision}
                    focusRequest={storyTreeCanvasFocusRequest}
                    handledFitRevision={handledStoryTreeCanvasFitRevision}
                    handledFocusSequence={
                      handledStoryTreeCanvasFocusSequence
                    }
                    onSelectNode={selectStoryTreeCanvasNode}
                    onViewportChange={saveCanvasViewport}
                  />
                  {nodes.length ? null : (
                    <PlayableEmptyCanvas
                      presets={presets}
                      busy={writing}
                      onAdd={(presetId, position) =>
                        void addNodeFromPreset(presetId, position)
                      }
                    />
                  )}
                </EditorCanvas>
              </PlayableCanvasContext.Provider>
            ) : null}
            {canvasContextMenu ? (
              <PlayableCanvasContextMenu
                menu={canvasContextMenu}
                presets={presets}
                canUndo={canUndo}
                canRedo={canRedo}
                canPaste={Boolean(copiedSelection) && !writing}
                busy={writing}
                isEntry={
                  canvasContextMenu.nodeId === codebase?.graph.entryNodeId
                }
                selectedCount={nodes.filter((node) => node.selected).length}
                story={storyOptions(
                  nodes.find((node) => node.id === canvasContextMenu.nodeId)
                    ?.data.node,
                )}
                onClose={() => setCanvasContextMenu(undefined)}
                onUndo={() => void undoEditorChange()?.catch(() => {})}
                onRedo={() => void redoEditorChange()?.catch(() => {})}
                onPaste={() => {
                  void pasteSelectionAt(canvasContextMenu.flowPosition);
                }}
                onAdd={(presetId) =>
                  void addNodeFromPreset(
                    presetId,
                    canvasContextMenu.flowPosition,
                  )
                }
                onOpen={() => {
                  if (canvasContextMenu.nodeId)
                    openNode(canvasContextMenu.nodeId);
                }}
                onCopy={() => {
                  void copySelection(canvasContextMenu.nodeId);
                }}
                onDuplicate={() => {
                  if (canvasContextMenu.nodeId)
                    void duplicateNode(canvasContextMenu.nodeId);
                }}
                onSetEntry={() => {
                  if (canvasContextMenu.nodeId)
                    setEntryNode(canvasContextMenu.nodeId);
                }}
                onStoryOption={(option, value) => {
                  if (canvasContextMenu.nodeId)
                    setStoryOption(canvasContextMenu.nodeId, option, value);
                }}
                onDelete={() => {
                  if (canvasContextMenu.nodeId)
                    removeNodes(new Set([canvasContextMenu.nodeId]));
                }}
              />
            ) : null}
            {notice && phase === "ready" ? (
              <div className="story-save-notice" role="alert">
                {notice}
              </div>
            ) : null}
            {projectIssues.length && phase === "ready" ? (
              <div className="story-play-issue" role="alert">
                <div>
                  <strong>{translateText("The project does not compile")}</strong>
                  <span>{projectIssues[0]!.message}</span>
                </div>
              </div>
            ) : null}
            {storyTreeCanvasSyncProgress ? (
              <div
                className="story-tree-canvas-sync-overlay"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <div className="story-tree-canvas-sync-card">
                  <LoaderCircle
                    className="spin story-tree-canvas-sync-spinner"
                    size={24}
                    aria-hidden="true"
                  />
                  <strong>
                    {t(
                      storyTreeCanvasSyncProgress === "generate"
                        ? "storyTree.generateCanvasProgress"
                        : "storyTree.updateCanvasProgress",
                    )}
                  </strong>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <main className="story-code-view" aria-label={translateText("Playable Nodes code")}>
          <WorkspaceCodeView
            projectId={projectId}
            revision={workspaceRevision + codeRevision}
            openFileRequest={fileRequest}
          />
        </main>
      )}
      {openedNode && codebase ? (
        <PlayableNodeWorkbench
          projectId={projectId}
          node={openedNode}
          graph={codebase.graph}
          guides={codebase.editorLayout.sceneGuides?.[openedNode.id] ?? []}
          onGuidesChange={(guides) =>
            setEditorLayout((current) => {
              const sceneGuides = { ...current.sceneGuides };
              if (guides.length) sceneGuides[openedNode.id] = guides;
              else delete sceneGuides[openedNode.id];
              const { sceneGuides: _previousGuides, ...layout } = current;
              return {
                ...layout,
                ...(Object.keys(sceneGuides).length ? { sceneGuides } : {}),
              };
            })
          }
          history={historyItems}
          onRestoreHistory={restoreHistoryAt}
          issues={issues}
          revision={workspaceRevision + codeRevision}
          onClose={() => setOpenedNodeId(undefined)}
          onOpenNode={openNode}
          onRename={(title) => renameNode(openedNode.id, title)}
          {...(onAskAgent ? { onAskAgent } : {})}
          {...(onSendToAgent ? { onSendToAgent } : {})}
          onWriteText={writeText}
          onWriteTextCreate={writeTextCreate}
          onWriteElementCopies={writeElementCopies}
          onHistoryCommand={(command) => {
            return command === "undo"
              ? undoEditorChange()
              : redoEditorChange();
          }}
          elementClipboardCommand={elementClipboardCommand}
          onElementClipboardCommandApplied={(sequence) =>
            setElementClipboardCommand((current) =>
              current?.sequence === sequence ? undefined : current,
            )
          }
          onWriteTextStyle={writeTextStyle}
          onWriteInteractionTimings={writeInteractionTimings}
          onWriteMotion={writeMotion}
          onReplaceButtonAsset={replaceButtonAsset}
          onSetButtonPressedAsset={setButtonPressedAsset}
          onInsertMediaAsset={(asset, loop) =>
            insertMediaAsset(openedNode.id, asset, loop)
          }
          onAddButtonPreset={(
            config,
            assetId,
            reuseExistingSignals,
            buttonSignal,
            pressedAssetId,
            buttonText,
            fontFamily,
            buttonAction,
          ) =>
            addButtonPreset(
              openedNode.id,
              config,
              assetId,
              reuseExistingSignals,
              buttonSignal,
              pressedAssetId,
              buttonText,
              fontFamily,
              buttonAction,
            )
          }
          onCreateSharedAnswerSignals={() =>
            createSharedAnswerSignals(openedNode.id)
          }
          onDeleteSharedAnswerSignals={() =>
            deleteSharedAnswerSignals(openedNode.id)
          }
          onWriteButtonSignal={writeButtonSignal}
          onWriteButtonSignalLabel={writeButtonSignalLabel}
          onWriteButtonAssetScale={writeButtonAssetScale}
          onWriteMove={writeMove}
          onWriteTransform={writeTransform}
          onWriteDelete={writeDelete}
          onWriteAffection={(config) =>
            writeAffectionConfig(openedNode.id, config)
          }
          onAddAsset={async (asset) => {
            const { graph, assetId } = addPlayableNodeAsset(
              codebase.graph,
              openedNode.id,
              asset,
            );
            await writeGraph(graph);
            return assetId;
          }}
          onSetSettingsButtonIcon={writeSettingsButtonIcon}
          onWriteSettingsButtonPosition={writeSettingsButtonPosition}
          onWriteSettingsButtonSize={writeSettingsButtonSize}
          onSetReturnButtonIcon={writeReturnButtonIcon}
          onWriteReturnButtonPosition={writeReturnButtonPosition}
          onWriteReturnButtonSize={writeReturnButtonSize}
          onSetButtonSound={writeButtonSound}
          onRemoveButtonSound={removeButtonSound}
          onWriteGlobalFontFamily={writeGlobalFontFamily}
          onSetBackdrop={(asset) => writeBackdrop(openedNode.id, asset)}
          onRemoveBackdrop={() => removeBackdrop(openedNode.id)}
          onWriteBackdropLoop={(loop) => writeBackdropLoop(openedNode.id, loop)}
          pictureInPictureVideoLoop={pictureInPictureVideoLoop}
          onWritePictureInPictureVideoLoop={(loop) =>
            writePictureInPictureVideoLoop(openedNode.id, loop)
          }
          onWriteNoInputMode={(mode) =>
            writeNoInputMode(openedNode.id, mode)
          }
          onWriteVideoEndAutoAdvance={(enabled) =>
            writeVideoEndAutoAdvance(openedNode.id, enabled)
          }
          {...(backdrop ? { backdrop } : {})}
          {...(backdropType ? { backdropType } : {})}
          backdropLoop={backdropLoop}
          noInputMode={noInputMode}
          videoEndAutoAdvance={openedNode.videoEndAutoAdvance === true}
          backdropEffects={backdropEffects}
          onPlayFromHere={(start) => void startPlaytest(start)}
          onChatContextChange={onChatContextChange}
        />
      ) : null}
      {openedNode && notice ? (
        <div className="story-save-notice is-over-workbench" role="alert">
          {notice}
        </div>
      ) : null}
      {!designOpen && projectSettingsOpen && codebase ? (
        <PlayableProjectSettingsDialog
          project={project}
          graph={codebase.graph}
          backdropEffects={backdropEffects}
          exporting={building}
          canExport={!agentBusy && !publishing && !building}
          onSave={async (viewport, effects) => {
            if (
              viewport.width !== codebase.graph.viewport.width ||
              viewport.height !== codebase.graph.viewport.height
            ) {
              const graph = { ...codebase.graph, viewport };
              await save({ graph, editorLayout: codebase.editorLayout });
              applyGraph(graph);
            }
            if (
              effects.vignette !== backdropEffects.vignette ||
              effects.grain !== backdropEffects.grain
            ) {
              setBackdropEffects(
                await updatePlayableBackdropEffects(projectId, effects),
              );
            }
          }}
          onExport={exportGame}
          onClose={() => setProjectSettingsOpen(false)}
        />
      ) : null}
      {publishDialog ? (
        <PublishDialog
          project={project}
          publishing={publishing}
          justPublished={publishDialog === "success"}
          onClose={onClosePublish}
          onPublish={publishGame}
        />
      ) : null}
    </section>
  );
}

function PlayableStoryTreeCanvasController({
  workspaceReady,
  workspaceRevision,
  fitAfterRevision,
  focusRequest,
  handledFitRevision,
  handledFocusSequence,
  onSelectNode,
  onViewportChange,
}: {
  workspaceReady: boolean;
  workspaceRevision: number;
  fitAfterRevision?: number;
  focusRequest?: { sequence: number; nodeId: string };
  handledFitRevision: { current: number | undefined };
  handledFocusSequence: { current: number };
  onSelectNode: (nodeId: string) => void;
  onViewportChange: (viewport: { x: number; y: number; zoom: number }) => void;
}) {
  const nodesInitialized = useNodesInitialized();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const { fitView, getNodes, getViewport } =
    useReactFlow<PlayableFlowNode, Edge>();

  useEffect(() => {
    if (!workspaceReady || !nodesInitialized || width <= 0 || height <= 0)
      return;

    const nodes = getNodes();
    const focusPending =
      focusRequest &&
      focusRequest.sequence > handledFocusSequence.current;
    const fitPending =
      fitAfterRevision !== undefined &&
      fitAfterRevision <= workspaceRevision &&
      fitAfterRevision > (handledFitRevision.current ?? -1);

    if (focusPending) {
      handledFocusSequence.current = focusRequest.sequence;
      if (nodes.some((node) => node.id === focusRequest.nodeId)) {
        if (fitPending) handledFitRevision.current = fitAfterRevision;
        onSelectNode(focusRequest.nodeId);
        let disposed = false;
        void focusPlayableCanvasNode(fitView, focusRequest.nodeId).then(
          (focused) => {
            if (!disposed && focused) onViewportChange(getViewport());
          },
        );
        return () => {
          disposed = true;
        };
      }
    }

    if (fitPending) {
      handledFitRevision.current = fitAfterRevision;
      if (!nodes.length) return;
      let disposed = false;
      void fitPlayableCanvasToAllNodes(fitView).then((fitted) => {
        if (!disposed && fitted) onViewportChange(getViewport());
      });
      return () => {
        disposed = true;
      };
    }
  }, [
    fitAfterRevision,
    focusRequest,
    fitView,
    getNodes,
    getViewport,
    handledFitRevision,
    handledFocusSequence,
    height,
    nodesInitialized,
    onSelectNode,
    onViewportChange,
    workspaceReady,
    workspaceRevision,
    width,
  ]);

  return null;
}

async function readNodeSources(
  projectId: string,
  node: PlayableNode,
): Promise<Record<string, string>> {
  const paths = [node.source.html, node.source.css, node.source.javascript];
  const files = await Promise.all(
    paths.map((path) => getWorkspaceFile(projectId, path)),
  );
  return Object.fromEntries(
    paths.map((path, index) => [path, files[index]?.content ?? ""]),
  );
}

/** How a Scene shows on the Story map, for its context menu. */
function storyOptions(node: PlayableNode | undefined): {
  onMap: boolean;
  ending: boolean;
} {
  return {
    onMap: !node?.story?.hidden,
    ending: node ? isPlayableStoryEnding(node) : false,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
