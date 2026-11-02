import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  Check,
  Download,
  GitBranch,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "./icons.js";
import {
  diffPlayableStoryTrees,
  playableStoryTreeSections,
  playableStoryTreeNeedsRouteReview,
  playableStoryTreeCanvasStatus,
  reconcilePlayableStoryTree,
  removePlayableStoryTreeChapter,
  removePlayableStoryTreeEpisode,
  removePlayableStoryTreeSection,
  recommendedPlayableStoryTreeNodePreset,
  type PlayableStoryTree,
  type PlayableStoryTreeCanvasEdge,
  type PlayableStoryTreeCanvasStatus,
  type PlayableStoryTreeChapter,
  type PlayableStoryTreeDiff,
  type PlayableStoryTreeEpisode,
  type PlayableStoryTreeSection,
  type PlayableStoryTreeWarning,
} from "../shared/playable-story-tree.js";
import type { AgentModelRef } from "../shared/contracts.js";
import {
  analyzePlayableStoryTree as analyzeStoryTreeWithAi,
  getPlayableStoryTree,
  listLibraryAssets,
  listPlayablePresets,
  savePlayableStoryTree,
  syncPlayableStoryTree,
} from "./api.js";
import { rankPlayableStoryVideos } from "../shared/playable-story-video-match.js";
import { importPlayableScreenplay } from "./playable-script-import.js";
import {
  createPlayableStoryTreeDocx,
  createPlayableStoryTreePrintHtml,
  formatPlayableStoryTreeMarkdownForExport,
} from "./playable-story-tree-export.js";
import { PlayableStoryTreeOutline } from "./playable-story-tree-outline.js";
import { StoryTreeInlineNameEditor } from "./playable-story-tree-inline-name-editor.js";
import { t, translateText } from "./i18n.js";

interface PlayableStoryTreePanelProps {
  projectId: string;
  visible: boolean;
  model?: AgentModelRef;
  canvasNodeIds?: readonly string[];
  canvasEdges?: readonly PlayableStoryTreeCanvasEdge[];
  onBeforeSync?: () => Promise<void>;
  onCanvasSyncComplete?: (mode: "generate" | "update") => void;
  onCanvasSyncProgressChange?: (
    mode: "generate" | "update" | undefined,
  ) => void;
  onCanvasNodeSelect?: (nodeId: string) => void;
  onCanvasStatusChange?: (status: PlayableStoryTreeCanvasStatus) => void;
}

type Confirmation = {
  nodeId: string;
  title: string;
  changes: string[];
};

const confirmationChangeKeys = {
  "The linked Scene was deleted from the canvas and will be recreated.":
    "storyTree.confirmSceneRecreated",
  "The Scene title will be updated from the story tree.":
    "storyTree.confirmSceneTitleUpdated",
  "The Scene title was edited on the canvas.":
    "storyTree.confirmSceneTitleEdited",
  "Story-tree scene content will be updated.":
    "storyTree.confirmSceneContentUpdated",
  "A story-tree beat was edited on the canvas and will be replaced.":
    "storyTree.confirmSceneBeatEdited",
  "The Scene's tree connections will be updated.":
    "storyTree.confirmSceneRoutesUpdated",
  "Tree-managed connections were edited on the canvas.":
    "storyTree.confirmSceneRoutesEdited",
  "A generated story button will be updated.":
    "storyTree.confirmStoryButtonUpdated",
  "A generated story button was edited on the canvas.":
    "storyTree.confirmStoryButtonEdited",
  "The story entry Scene will be updated.":
    "storyTree.confirmEntrySceneUpdated",
} as const;

export function PlayableStoryTreePanel({
  projectId,
  visible,
  model,
  canvasNodeIds,
  canvasEdges,
  onBeforeSync,
  onCanvasSyncComplete,
  onCanvasSyncProgressChange,
  onCanvasNodeSelect,
  onCanvasStatusChange,
}: PlayableStoryTreePanelProps) {
  const [tree, setTree] = useState<PlayableStoryTree>();
  const [revision, setRevision] = useState<string>();
  const [selectedSectionId, setSelectedSectionId] = useState<string>();
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [diff, setDiff] = useState<PlayableStoryTreeDiff>();
  const [pendingAnalysis, setPendingAnalysis] = useState<{
    tree: PlayableStoryTree;
    revision: string;
    diff: PlayableStoryTreeDiff;
  }>();
  const [warnings, setWarnings] = useState<PlayableStoryTreeWarning[]>([]);
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [generationPreviewOpen, setGenerationPreviewOpen] = useState(false);
  const [generationPresetOverrides, setGenerationPresetOverrides] = useState<
    Record<string, string>
  >({});
  const [videoCandidates, setVideoCandidates] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [generationVideoAssignments, setGenerationVideoAssignments] =
    useState<Record<string, string>>({});
  const [videoCatalogLoading, setVideoCatalogLoading] = useState(false);
  const [videoCatalogError, setVideoCatalogError] = useState("");
  const videoCatalogRequest = useRef(0);
  const [nodePresets, setNodePresets] = useState<
    Awaited<ReturnType<typeof listPlayablePresets>>["presets"]
  >([]);
  const [presetCatalogLoading, setPresetCatalogLoading] = useState(true);
  const [presetCatalogError, setPresetCatalogError] = useState("");
  const [pendingSyncMode, setPendingSyncMode] = useState<"generate" | "update">(
    "update",
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [operation, setOperation] = useState<"chapters" | "tree">("chapters");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const existingCanvasNodeIds = useMemo(
    () => (canvasNodeIds ? new Set(canvasNodeIds) : undefined),
    [canvasNodeIds],
  );

  const allSections = useMemo(
    () => (tree ? playableStoryTreeSections(tree) : []),
    [tree],
  );
  const sections = useMemo(
    () => allSections.filter((section) => !section.sourceRemoved),
    [allSections],
  );
  const removedSections = useMemo(
    () => allSections.filter((section) => section.sourceRemoved),
    [allSections],
  );
  const pendingNodeSections = useMemo(
    () =>
      tree?.chapters.flatMap((chapter) =>
        chapter.episodes.flatMap((episode) =>
          episode.sections
            .filter(
              (section) =>
                !section.sourceRemoved &&
                (!section.canvasNodeId ||
                  (existingCanvasNodeIds &&
                    !existingCanvasNodeIds.has(section.canvasNodeId))),
            )
            .map((section) => ({
              section,
              chapterTitle: chapter.title,
              episodeTitle: episode.title,
            })),
        ),
      ) ?? [],
    [existingCanvasNodeIds, tree],
  );
  const videoMatchesBySection = useMemo(
    () =>
      new Map(
        pendingNodeSections.map(({ section, chapterTitle, episodeTitle }) => [
          section.id,
          rankPlayableStoryVideos(
            {
              chapterTitle,
              episodeTitle,
              episodeNumber: section.episodeNumber,
              sceneTitle: section.title,
            },
            videoCandidates,
          ),
        ]),
      ),
    [pendingNodeSections, videoCandidates],
  );

  useEffect(() => {
    let disposed = false;
    setPresetCatalogLoading(true);
    void listPlayablePresets()
      .then(({ presets }) => {
        if (!disposed) {
          setNodePresets(presets);
          setPresetCatalogError("");
        }
      })
      .catch((cause) => {
        if (!disposed) setPresetCatalogError(errorText(cause));
      })
      .finally(() => {
        if (!disposed) setPresetCatalogLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (tree)
      onCanvasStatusChange?.(
        playableStoryTreeCanvasStatus(tree, existingCanvasNodeIds),
      );
  }, [tree, existingCanvasNodeIds, onCanvasStatusChange]);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError("");
    setNotice("");
    setPendingAnalysis(undefined);
    void getPlayableStoryTree(projectId)
      .then((detail) => {
        if (disposed) return;
        setTree(detail.tree ?? emptyTree());
        setRevision(detail.revision);
        setSelectedSectionId(
          detail.tree
            ? playableStoryTreeSections(detail.tree)[0]?.id
            : undefined,
        );
        setOpenItems(openFirstStoryTreeItems(detail.tree));
      })
      .catch((cause) => {
        if (!disposed) setError(errorText(cause));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (
      !tree ||
      !selectedSectionId ||
      sections.some((section) => section.id === selectedSectionId)
    )
      return;
    setSelectedSectionId(sections[0]?.id);
  }, [sections, selectedSectionId, tree]);

  function updateTree(
    change: (current: PlayableStoryTree) => PlayableStoryTree,
  ): void {
    setTree((current) => (current ? change(current) : current));
    setDirty(true);
    setConfirmations([]);
    setPendingAnalysis(undefined);
    setGenerationPreviewOpen(false);
    setOperation("chapters");
    setNotice("");
    setError("");
  }

  function confirmRoute(routeId: string): void {
    if (!tree || busy) return;
    const nextTree = structuredClone(tree);
    const route = nextTree.links.find((link) => link.id === routeId);
    if (!route || route.status !== "suggested") return;
    route.status = "confirmed";
    setTree(nextTree);
    setDirty(true);
    setConfirmations([]);
    setPendingAnalysis(undefined);
    setGenerationPreviewOpen(false);
    setOperation("tree");
    setNotice(t("storyTree.routeConfirmedNotice"));
    setError("");
  }

  async function importFile(file?: File): Promise<void> {
    if (!file) return;
    setBusy(true);
    setOperation("chapters");
    setError("");
    setNotice("");
    setDiff(undefined);
    try {
      const parsed = await importPlayableScreenplay(file);
      setWarnings(parsed.warnings);
      setPendingAnalysis(undefined);
      setGenerationPreviewOpen(false);
      if (parsed.warnings.includes("no-scenes")) {
        throw new Error(t("storyTree.warningNoScenes"));
      }
      if (tree && playableStoryTreeSections(tree).length) {
        const reconciled = reconcilePlayableStoryTree(tree, parsed.tree);
        setTree(reconciled.tree);
        setDiff(reconciled.diff);
        setSelectedSectionId(playableStoryTreeSections(reconciled.tree)[0]?.id);
        setOpenItems(openFirstStoryTreeItems(reconciled.tree));
        setNotice(t("storyTree.importMerged"));
      } else {
        setTree(parsed.tree);
        setSelectedSectionId(playableStoryTreeSections(parsed.tree)[0]?.id);
        setOpenItems(openFirstStoryTreeItems(parsed.tree));
        setNotice(t("storyTree.importComplete"));
      }
      setDirty(true);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function saveTree(): Promise<void> {
    if (!tree || revision === undefined || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await savePlayableStoryTree(projectId, tree, revision);
      setTree(saved.tree);
      setRevision(saved.revision);
      setDirty(false);
      setDiff(undefined);
      setConfirmations([]);
      setPendingAnalysis(undefined);
      setNotice(t("storyTree.saved"));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function analyzeTree(): Promise<void> {
    if (!tree || revision === undefined || busy) return;
    setBusy(true);
    setOperation("chapters");
    setError("");
    setNotice("");
    setPendingAnalysis(undefined);
    try {
      const result = model
        ? await analyzeStoryTreeWithAi(projectId, tree, revision, model)
        : await analyzeStoryTreeWithAi(projectId, tree, revision);
      if (!result.analyzedSections) {
        setNotice(t("storyTree.alreadyAnalyzed"));
        return;
      }
      setPendingAnalysis({
        tree: result.tree,
        revision: result.revision,
        diff: diffPlayableStoryTrees(tree, result.tree),
      });
      setNotice(
        t("storyTree.analysisReady", { count: result.analyzedSections }),
      );
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function applyAnalysis(): Promise<void> {
    if (!pendingAnalysis || busy) return;
    setBusy(true);
    setOperation("chapters");
    setError("");
    try {
      const saved = await savePlayableStoryTree(
        projectId,
        pendingAnalysis.tree,
        pendingAnalysis.revision,
      );
      setTree(saved.tree);
      setRevision(saved.revision);
      setDirty(false);
      setDiff(undefined);
      setPendingAnalysis(undefined);
      setConfirmations([]);
      setNotice(
        t("storyTree.analysisApplied", {
          changed: pendingAnalysis.diff.changed.length,
          routes: pendingAnalysis.diff.changedLinks.length,
        }),
      );
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function synchronize(
    mode: "generate" | "update",
    confirmOverwrite = false,
    nodePresetOverrides?: Record<string, string>,
    nodeVideoAssignments?: Record<string, string>,
  ): Promise<void> {
    if (!tree || revision === undefined || busy) return;
    setBusy(true);
    setOperation("tree");
    setPendingSyncMode(mode);
    setError("");
    setNotice("");
    onCanvasSyncProgressChange?.(mode);
    try {
      await onBeforeSync?.();
      const result = Object.keys(nodeVideoAssignments ?? {}).length
        ? await syncPlayableStoryTree(
            projectId,
            tree,
            revision,
            confirmOverwrite,
            mode,
            nodePresetOverrides,
            nodeVideoAssignments,
          )
        : await syncPlayableStoryTree(
            projectId,
            tree,
            revision,
            confirmOverwrite,
            mode,
            nodePresetOverrides,
          );
      if (!result.applied || !result.tree) {
        setConfirmations(result.confirmations);
        setPendingSyncMode(mode);
        if (!result.confirmations.length)
          setNotice(t("storyTree.nothingToConfirm"));
        return;
      }
      setTree(result.tree);
      setRevision(result.revision);
      onCanvasSyncComplete?.(mode);
      setDirty(false);
      setDiff(undefined);
      setConfirmations([]);
      setPendingAnalysis(undefined);
      if (mode === "generate") {
        setGenerationPreviewOpen(false);
        videoCatalogRequest.current += 1;
      }
      const completion = t(
        mode === "generate"
          ? "storyTree.generateComplete"
          : "storyTree.syncComplete",
        {
          added: result.addedNodes,
          videos: result.addedVideos,
          updated: result.updatedNodes,
          pending: result.pendingLinks,
        },
      );
      setNotice(
        result.skippedVideoAssignments
          ? `${completion} ${t("storyTree.videoAssignmentsSkipped", {
              count: result.skippedVideoAssignments,
            })}`
          : completion,
      );
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
      onCanvasSyncProgressChange?.(undefined);
    }
  }

  function openGenerationPreview(): void {
    setOperation("tree");
    setError("");
    if (loading) {
      setGenerationPreviewOpen(false);
      setNotice(t("storyTree.treeStillLoading"));
      return;
    }
    if (!tree || !sections.length) {
      setGenerationPreviewOpen(false);
      setNotice(t("storyTree.noScenesToGenerate"));
      return;
    }
    if (!pendingNodeSections.length) {
      setGenerationPreviewOpen(false);
      setNotice(t("storyTree.noPendingNodes"));
      return;
    }
    setNotice("");
    setGenerationPresetOverrides(
      Object.fromEntries(
        pendingNodeSections.map(({ section }) => [
          section.id,
          recommendedPlayableStoryTreeNodePreset(section),
        ]),
      ),
    );
    setVideoCandidates([]);
    setGenerationVideoAssignments({});
    setGenerationPreviewOpen(true);
    setOperation("tree");
    void loadGenerationVideoCandidates();
  }

  async function loadGenerationVideoCandidates(): Promise<void> {
    const requestId = ++videoCatalogRequest.current;
    setVideoCatalogLoading(true);
    setVideoCatalogError("");
    try {
      const assets = await listLibraryAssets();
      if (requestId !== videoCatalogRequest.current) return;
      const videos = assets
        .filter(
          (asset) =>
            asset.mediaType === "video" &&
            asset.purpose !== "reference" &&
            !asset.referenceOnly,
        )
        .map(({ id, name }) => ({ id, name }));
      setVideoCandidates(videos);
      setGenerationVideoAssignments(
        Object.fromEntries(
          pendingNodeSections.flatMap(
            ({ section, chapterTitle, episodeTitle }) => {
              const match = rankPlayableStoryVideos(
                {
                  chapterTitle,
                  episodeTitle,
                  episodeNumber: section.episodeNumber,
                  sceneTitle: section.title,
                },
                videos,
              );
              return match.recommendedAssetId
                ? [[section.id, match.recommendedAssetId]]
                : [];
            },
          ),
        ),
      );
    } catch (cause) {
      if (requestId === videoCatalogRequest.current) {
        setVideoCatalogError(errorText(cause));
        setGenerationVideoAssignments({});
      }
    } finally {
      if (requestId === videoCatalogRequest.current)
        setVideoCatalogLoading(false);
    }
  }

  function closeGenerationPreview(): void {
    videoCatalogRequest.current += 1;
    setGenerationPreviewOpen(false);
  }

  function updateGenerationVideo(sectionId: string, assetId: string): void {
    setGenerationVideoAssignments((current) => {
      const next = { ...current };
      if (assetId) next[sectionId] = assetId;
      else delete next[sectionId];
      return next;
    });
  }

  function retryPresetCatalog(): void {
    setPresetCatalogLoading(true);
    setPresetCatalogError("");
    void listPlayablePresets()
      .then(({ presets }) => setNodePresets(presets))
      .catch((cause) => setPresetCatalogError(errorText(cause)))
      .finally(() => setPresetCatalogLoading(false));
  }

  function updateGenerationPreset(sectionId: string, presetId: string): void {
    setGenerationPresetOverrides((current) => ({
      ...current,
      [sectionId]: presetId,
    }));
  }

  function patchSection(
    sectionId: string,
    patch: Partial<PlayableStoryTreeSection>,
  ): void {
    updateTree((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) => ({
        ...chapter,
        episodes: chapter.episodes.map((episode) => ({
          ...episode,
          sections: episode.sections.map((section) =>
            section.id === sectionId ? { ...section, ...patch } : section,
          ),
        })),
      })),
    }));
  }

  function patchChapter(chapterId: string, title: string): void {
    updateTree((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) =>
        chapter.id === chapterId ? { ...chapter, title } : chapter,
      ),
    }));
  }

  function patchEpisode(
    episodeId: string,
    patch: Partial<PlayableStoryTreeEpisode>,
  ): void {
    updateTree((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) => ({
        ...chapter,
        episodes: chapter.episodes.map((episode) =>
          episode.id === episodeId ? { ...episode, ...patch } : episode,
        ),
      })),
    }));
  }

  function addChapter(): void {
    const chapterNumber = (tree?.chapters.length ?? 0) + 1;
    const chapterId = uniqueId(`chapter-manual-${chapterNumber}`);
    updateTree((current) => ({
      ...current,
      chapters: [
        ...current.chapters,
        {
          id: chapterId,
          title: t("storyTree.newChapter"),
          episodes: [],
        },
      ],
    }));
    setSelectedSectionId(undefined);
    setOpenItems((current) => new Set([...current, chapterId]));
  }

  function removeChapter(chapterId: string): void {
    if (!tree) return;
    const removedIds = new Set(
      tree.chapters
        .find((chapter) => chapter.id === chapterId)
        ?.episodes.flatMap((episode) =>
          episode.sections.map((section) => section.id),
        ) ?? [],
    );
    updateTree((current) => removePlayableStoryTreeChapter(current, chapterId));
    if (selectedSectionId && removedIds.has(selectedSectionId)) {
      setSelectedSectionId(undefined);
    }
    setOpenItems((current) => {
      const next = new Set(current);
      next.delete(chapterId);
      return next;
    });
  }

  function removeEpisode(chapterId: string, episodeId: string): void {
    if (!tree) return;
    const removedIds = new Set(
      tree.chapters
        .find((chapter) => chapter.id === chapterId)
        ?.episodes.find((episode) => episode.id === episodeId)
        ?.sections.map((section) => section.id) ?? [],
    );
    updateTree((current) =>
      removePlayableStoryTreeEpisode(current, chapterId, episodeId),
    );
    if (selectedSectionId && removedIds.has(selectedSectionId)) {
      setSelectedSectionId(undefined);
    }
    setOpenItems((current) => {
      const next = new Set(current);
      next.delete(episodeId);
      return next;
    });
  }

  function removeSection(
    chapterId: string,
    episodeId: string,
    sectionId: string,
  ): void {
    if (!tree) return;
    updateTree((current) =>
      removePlayableStoryTreeSection(
        current,
        chapterId,
        episodeId,
        sectionId,
      ),
    );
    if (selectedSectionId === sectionId) setSelectedSectionId(undefined);
  }

  function addEpisode(chapterId?: string): void {
    if (!tree) return;
    const targetChapter =
      tree.chapters.find((chapter) => chapter.id === chapterId) ??
      tree.chapters.at(-1);
    if (!targetChapter) {
      addChapter();
      return;
    }
    const number = nextEpisodeNumber(tree);
    const episode: PlayableStoryTreeEpisode = {
      id: uniqueId(`${targetChapter.id}-episode-${number}`),
      number,
      title: `第${number}集`,
      sections: [],
    };
    updateTree((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) =>
        chapter.id === targetChapter.id
          ? { ...chapter, episodes: [...chapter.episodes, episode] }
          : chapter,
      ),
    }));
    setSelectedSectionId(undefined);
    setOpenItems(
      (current) => new Set([...current, targetChapter.id, episode.id]),
    );
  }

  function addSection(episodeId?: string): void {
    if (!tree) return;
    const episodes = tree.chapters.flatMap((chapter) => chapter.episodes);
    const target =
      episodes.find((episode) => episode.id === episodeId) ??
      tree.chapters
        .flatMap((chapter) => chapter.episodes)
        .find((episode) =>
          episode.sections.some((section) => !section.sourceRemoved),
        );
    if (!target) {
      addChapter();
      return;
    }
    const sceneNumber =
      Math.max(0, ...target.sections.map((section) => section.sceneNumber)) + 1;
    const id = uniqueId(`manual-ep-${target.number}-scene-${sceneNumber}`);
    const title = t("storyTree.newScene");
    const section: PlayableStoryTreeSection = {
      id,
      episodeNumber: target.number,
      sceneNumber,
      title,
      kind: "scene",
      objective: "",
      prerequisite: "",
      beats: [],
      scriptText: "",
      sourceManaged: false,
      sourceSnapshot: { heading: title, body: "", title, beats: [] },
    };
    updateTree((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) => ({
        ...chapter,
        episodes: chapter.episodes.map((episode) =>
          episode.id === target.id
            ? { ...episode, sections: [...episode.sections, section] }
            : episode,
        ),
      })),
    }));
    setSelectedSectionId(id);
    setOpenItems(
      (current) => new Set([...current, ...findParentIds(tree, target.id)]),
    );
  }

  function restoreSection(sectionId: string): void {
    patchSection(sectionId, { sourceRemoved: false });
    setSelectedSectionId(sectionId);
  }

  function exportTree(format: "pdf" | "docx" | "md"): void {
    if (!tree) return;
    if (format === "pdf") {
      const popup = window.open("", "_blank");
      if (!popup) {
        setOperation("tree");
        setError(t("storyTree.exportPopupBlocked"));
        return;
      }
      popup.opener = null;
      popup.document.open();
      popup.document.write(createPlayableStoryTreePrintHtml(tree));
      popup.document.close();
      setTimeout(() => popup.print(), 250);
      setNotice(t("storyTree.pdfPrintTip"));
      return;
    }
    const blob =
      format === "docx"
        ? new Blob([copyToArrayBuffer(createPlayableStoryTreeDocx(tree))], {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          })
        : new Blob([formatPlayableStoryTreeMarkdownForExport(tree)], {
            type: "text/markdown;charset=utf-8",
          });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(tree.source?.fileName ?? "story-tree")}.${format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  function closeExportMenu(event: MouseEvent<HTMLButtonElement>): void {
    const menu = event.currentTarget.closest("details");
    if (menu instanceof HTMLDetailsElement) menu.open = false;
  }

  function toggleOpen(id: string, open: boolean): void {
    setOpenItems((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectStorySection(sectionId: string): void {
    setSelectedSectionId(sectionId);
    const section = sections.find((item) => item.id === sectionId);
    const nodeId = section?.canvasNodeId;
    if (
      nodeId &&
      (!existingCanvasNodeIds || existingCanvasNodeIds.has(nodeId))
    )
      onCanvasNodeSelect?.(nodeId);
  }

  const canvasStatus = tree
    ? playableStoryTreeCanvasStatus(tree, existingCanvasNodeIds)
    : { pendingRemovalNodeIds: [], pendingGenerationCount: 0 };
  const activeSectionIds = new Set(sections.map((section) => section.id));
  const activeLinks =
    tree?.links.filter(
      (link) =>
        activeSectionIds.has(link.fromSectionId) &&
        activeSectionIds.has(link.toSectionId),
    ) ?? [];
  const incomingRouteSectionIds = new Set(
    activeLinks.map((link) => link.toSectionId),
  );
  const outgoingRouteSectionIds = new Set(
    activeLinks.map((link) => link.fromSectionId),
  );
  const pendingRouteCount = activeLinks.filter(
    (link) => link.status === "suggested",
  ).length;
  const visibleWarnings: PlayableStoryTreeWarning[] = [
    ...warnings.filter((warning) => warning !== "routes-need-review"),
    ...(tree && playableStoryTreeNeedsRouteReview(tree)
      ? (["routes-need-review"] as const)
      : []),
  ];
  const incompleteRouteSectionCount = sections.filter(
    (section, index) =>
      (index > 0 && !incomingRouteSectionIds.has(section.id)) ||
      (section.kind !== "ending" &&
        !outgoingRouteSectionIds.has(section.id)),
  ).length;

  const pendingSectionChanges = useMemo(
    () =>
      pendingAnalysis && tree
        ? findAnalysisChanges(
            tree,
            pendingAnalysis.tree,
            pendingAnalysis.diff.changed,
          )
        : [],
    [pendingAnalysis, tree],
  );
  const pendingLinkChanges = useMemo(
    () =>
      pendingAnalysis && tree
        ? findAnalysisLinkChanges(
            tree,
            pendingAnalysis.tree,
            pendingAnalysis.diff.changedLinks,
          )
        : [],
    [pendingAnalysis, tree],
  );

  return (
    <section
      className={`story-tree-panel${visible ? "" : " is-hidden"}`}
      aria-label={t("storyTree.title")}
      aria-hidden={!visible}
    >
      {loading ? (
        <div className="story-tree-state">
          <LoaderCircle className="spin" size={16} />
          {t("storyTree.loading")}
        </div>
      ) : error && !tree ? (
        <div className="story-tree-error" role="alert">
          {error}
        </div>
      ) : (
        <div className="story-tree-panes">
          <section
            className="story-tree-pane story-tree-chapters-pane"
            aria-label={t("storyTree.chapterTab")}
          >
            <header className="story-tree-header">
              <div className="story-tree-heading">
                <strong>{t("storyTree.chapterTab")}</strong>
              </div>
              <div className="story-tree-header-actions">
                <span className="story-tree-chapter-count">
                  {tree?.chapters.length ?? 0}
                </span>
                <button
                  type="button"
                  title={t("storyTree.importScript")}
                  aria-label={t("storyTree.importScript")}
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={15} />
                </button>
                <input
                  ref={fileInput}
                  className="story-tree-file-input"
                  type="file"
                  accept=".docx,.txt"
                  onChange={(event) =>
                    void importFile(event.currentTarget.files?.[0])
                  }
                />
              </div>
            </header>
            <div className="story-tree-chapter-actions">
              <button type="button" onClick={addChapter} disabled={busy}>
                <Plus size={14} />
                {t("storyTree.addChapter")}
              </button>
            </div>
            <div
              className="story-tree-chapter-list"
              aria-label={t("storyTree.chapterTab")}
            >
              {!tree?.chapters.some(
                (chapter) =>
                  !chapter.episodes.length ||
                  chapter.episodes.some(
                    (episode) =>
                      !episode.sections.length ||
                      episode.sections.some(
                        (section) => !section.sourceRemoved,
                      ),
                  ),
              ) ? (
                null
              ) : (
                tree?.chapters
                  .filter(
                    (chapter) =>
                      !chapter.episodes.length ||
                      chapter.episodes.some(
                        (episode) =>
                          !episode.sections.length ||
                          episode.sections.some(
                            (section) => !section.sourceRemoved,
                          ),
                      ),
                  )
                  .map((chapter) => (
                    <details
                      key={chapter.id}
                      open={openItems.has(chapter.id)}
                      onToggle={(event) =>
                        toggleOpen(chapter.id, event.currentTarget.open)
                      }
                    >
                      <summary className="story-tree-chapter-summary">
                        <StoryTreeInlineNameEditor
                          value={chapter.title}
                          displayValue={displayChapterTitle(chapter.title)}
                          afterDisplay={
                            <small className="story-tree-row-count">
                              {chapter.episodes.reduce(
                                (count, episode) =>
                                  count +
                                  episode.sections.filter(
                                    (section) => !section.sourceRemoved,
                                  ).length,
                                0,
                              )}
                            </small>
                          }
                          label={t("storyTree.renameChapter")}
                          disabled={busy}
                          onSave={(title) => patchChapter(chapter.id, title)}
                        />
                        <button
                          type="button"
                          className="story-tree-delete-item story-tree-row-delete"
                          title={t("storyTree.removeChapter")}
                          aria-label={t("storyTree.removeChapter")}
                          disabled={busy}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            removeChapter(chapter.id);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </summary>
                      {chapter.episodes
                        .filter(
                          (episode) =>
                            !episode.sections.length ||
                            episode.sections.some(
                              (section) => !section.sourceRemoved,
                            ),
                        )
                        .map((episode) => (
                          <details
                            className="story-tree-episode"
                            key={episode.id}
                            open={openItems.has(episode.id)}
                            onToggle={(event) =>
                              toggleOpen(episode.id, event.currentTarget.open)
                            }
                          >
                            <summary>
                              <StoryTreeInlineNameEditor
                                value={episode.title}
                                displayValue={
                                  episode.title === `第${episode.number}集`
                                    ? t("storyTree.episodeLabel", {
                                        number: episode.number,
                                      })
                                    : episode.title
                                }
                                afterDisplay={
                                  <small
                                    className="story-tree-row-count"
                                    title={t("storyTree.episodeNodeCount", {
                                      count: episode.sections.filter(
                                        (section) => !section.sourceRemoved,
                                      ).length,
                                    })}
                                  >
                                    {episode.sections.filter(
                                      (section) => !section.sourceRemoved,
                                    ).length}
                                  </small>
                                }
                                label={t("storyTree.renameEpisode")}
                                disabled={busy}
                                onSave={(title) =>
                                  patchEpisode(episode.id, { title })
                                }
                              />
                              <button
                                type="button"
                                className="story-tree-delete-item story-tree-row-delete"
                                title={t("storyTree.removeEpisode")}
                                aria-label={t("storyTree.removeEpisode")}
                                disabled={busy}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  removeEpisode(chapter.id, episode.id);
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </summary>
                            <div className="story-tree-section-list">
                              {episode.sections
                                .filter((section) => !section.sourceRemoved)
                                .map((section) => (
                                  <div
                                    key={section.id}
                                    className="story-tree-section-entry"
                                  >
                                    <StoryTreeInlineNameEditor
                                      value={section.title}
                                      label={t("storyTree.renameScene")}
                                      disabled={busy}
                                      onSave={(title) =>
                                        patchSection(section.id, { title })
                                      }
                                      displayClassName={`story-tree-section-select${section.id === selectedSectionId ? " is-selected" : ""}`}
                                      displayTitle={section.title}
                                      displayContent={
                                        <>
                                          <span>{section.title}</span>
                                          {!section.canvasNodeId ? (
                                            <small className="story-tree-item-status is-pending-generation">
                                              {t("storyTree.pendingGeneration")}
                                            </small>
                                          ) : null}
                                          {section.sourcePending ? (
                                            <i
                                              aria-label={t(
                                                "storyTree.needsReview",
                                              )}
                                            />
                                          ) : null}
                                        </>
                                      }
                                      displaySelected={
                                        section.id === selectedSectionId
                                      }
                                      afterDisplay={
                                        <span
                                          className="story-tree-row-count is-spacer"
                                          aria-hidden="true"
                                        />
                                      }
                                      onDisplayClick={() => {
                                        selectStorySection(section.id);
                                        setOpenItems(
                                          (current) =>
                                            new Set([
                                              ...current,
                                              chapter.id,
                                              episode.id,
                                            ]),
                                        );
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className="story-tree-delete-item story-tree-row-delete"
                                      title={t("storyTree.removeScene")}
                                      aria-label={t("storyTree.removeScene")}
                                      disabled={busy}
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        removeSection(
                                          chapter.id,
                                          episode.id,
                                          section.id,
                                        );
                                      }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                ))}
                              <button
                                className="story-tree-add-inline"
                                type="button"
                                disabled={busy}
                                onClick={() => addSection(episode.id)}
                              >
                                <Plus size={13} />
                                {t("storyTree.addScene")}
                              </button>
                            </div>
                          </details>
                        ))}
                      <button
                        className="story-tree-add-inline"
                        type="button"
                        disabled={busy}
                        onClick={() => addEpisode(chapter.id)}
                      >
                        <Plus size={13} />
                        {t("storyTree.addEpisode")}
                      </button>
                    </details>
                  ))
              )}
              {removedSections.length ? (
                <details className="story-tree-detached-scenes">
                  <summary>
                    <span>{t("storyTree.pendingRemovalsTitle")}</span>
                    <small>{removedSections.length}</small>
                  </summary>
                  {removedSections.map((section) => (
                    <div key={section.id}>
                      <span>{section.title}</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => restoreSection(section.id)}
                      >
                        {t("storyTree.restoreScene")}
                      </button>
                    </div>
                  ))}
                </details>
              ) : null}
              {!sections.length ? (
                <div className="story-tree-empty story-tree-chapter-empty">
                  <p>{t("storyTree.empty")}</p>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload size={14} />
                    {t("storyTree.importScript")}
                  </button>
                </div>
              ) : null}
              {diff ? (
                <div className="story-tree-diff" role="status">
                  {t("storyTree.diffSummary", {
                    added: diff.added.length,
                    changed: diff.changed.length,
                    unchanged: diff.unchanged.length,
                    removed: diff.removed.length,
                  })}
                  {diff.removed.length ? (
                    <small>{t("storyTree.removedNotDeleted")}</small>
                  ) : null}
                </div>
              ) : null}
              {visibleWarnings.map((warning) => (
                <p className="story-tree-warning" key={warning}>
                  {t(
                    warning === "no-scenes"
                      ? "storyTree.warningNoScenes"
                      : warning === "unnamed-chapter"
                        ? "storyTree.warningUnnamedChapter"
                        : "storyTree.warningRoutesNeedReview",
                  )}
                </p>
              ))}
            </div>

            {pendingAnalysis ? (
              <div
                className="story-tree-analysis-preview"
                role="region"
                aria-label={t("storyTree.analysisPreviewTitle")}
              >
                <strong>{t("storyTree.analysisPreviewTitle")}</strong>
                <small>
                  {t("storyTree.analysisPreviewCounts", {
                    changed: pendingAnalysis.diff.changed.length,
                    routes: pendingAnalysis.diff.changedLinks.length,
                    unchanged: pendingAnalysis.diff.unchanged.length,
                  })}
                </small>
                <div className="story-tree-analysis-changes">
                  {pendingSectionChanges.map(({ before, after, changes }) => (
                    <div key={after.id}>
                      <b>{after.title}</b>
                      {changes.map((change) => (
                        <small key={change}>{change}</small>
                      ))}
                    </div>
                  ))}
                  {pendingLinkChanges.map((change) => (
                    <div key={change.id}>
                      <b>{t("storyTree.analysisLink")}</b>
                      <small>{change.text}</small>
                    </div>
                  ))}
                  {!pendingSectionChanges.length &&
                  !pendingLinkChanges.length ? (
                    <small>{t("storyTree.analysisNoContentChanges")}</small>
                  ) : null}
                </div>
                <div className="story-tree-analysis-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPendingAnalysis(undefined)}
                  >
                    {t("storyTree.discardAnalysis")}
                  </button>
                  <button
                    className="is-primary"
                    type="button"
                    disabled={busy}
                    onClick={() => void applyAnalysis()}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : (
                      <Check size={14} />
                    )}
                    {t("storyTree.applyAnalysis")}
                  </button>
                </div>
              </div>
            ) : null}
            {operation === "chapters" && notice ? (
              <p className="story-tree-notice" role="status">
                {notice}
              </p>
            ) : null}
            {operation === "chapters" && error ? (
              <p className="story-tree-error" role="alert">
                {error}
              </p>
            ) : null}
            <footer className="story-tree-footer story-tree-chapter-footer">
              <button
                type="button"
                disabled={!tree || !dirty || busy}
                onClick={() => void saveTree()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Check size={14} />
                )}
                {t(dirty ? "storyTree.save" : "storyTree.saved")}
              </button>
              <button
                className="is-primary"
                type="button"
                disabled={
                  !tree || !sections.length || busy || Boolean(pendingAnalysis)
                }
                onClick={() => void analyzeTree()}
              >
                {busy && operation === "chapters" ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Sparkles size={14} />
                )}
                {t("storyTree.updateTree")}
              </button>
            </footer>
          </section>

          <section
            className="story-tree-pane story-tree-outline-pane"
            aria-label={t("storyTree.treeTab")}
          >
            <header className="story-tree-header">
              <div className="story-tree-heading">
                <GitBranch size={16} />
                <strong>{t("storyTree.treeTab")}</strong>
                <span>{sections.length}</span>
              </div>
            </header>
            <div className="story-tree-sync-status" role="status">
              {canvasStatus.pendingGenerationCount ? (
                <span className="is-pending-generation">
                  {t("storyTree.pendingGenerationCount", {
                    count: canvasStatus.pendingGenerationCount,
                  })}
                </span>
              ) : null}
              {canvasStatus.pendingRemovalNodeIds.length ? (
                <span className="is-pending-removal">
                  {t("storyTree.pendingRemovalCount", {
                    count: canvasStatus.pendingRemovalNodeIds.length,
                  })}
                </span>
              ) : null}
              {pendingRouteCount ? (
                <span className="is-pending-route">
                  {t("storyTree.pendingRouteCount", {
                    count: pendingRouteCount,
                  })}
                </span>
              ) : null}
              {incompleteRouteSectionCount ? (
                <span className="is-missing-route">
                  {t("storyTree.incompleteRouteCount", {
                    count: incompleteRouteSectionCount,
                  })}
                </span>
              ) : null}
              {!canvasStatus.pendingGenerationCount &&
              !canvasStatus.pendingRemovalNodeIds.length &&
              !pendingRouteCount &&
              !incompleteRouteSectionCount ? (
                <span>{t("storyTree.canvasUpToDate")}</span>
              ) : null}
            </div>
            {generationPreviewOpen ? (
              <section
                className="story-tree-generation-preview"
                aria-label={t("storyTree.generationPreview")}
              >
                <header>
                  <div>
                    <strong>{t("storyTree.generationPreview")}</strong>
                    <small>
                      {t("storyTree.generationPreviewCount", {
                        count: pendingNodeSections.length,
                      })}
                    </small>
                  </div>
                  <button
                    type="button"
                    aria-label={t("storyTree.cancelGeneration")}
                    disabled={busy}
                    onClick={closeGenerationPreview}
                  >
                    {t("storyTree.cancelGeneration")}
                  </button>
                </header>
                {presetCatalogLoading ? (
                  <p className="story-tree-generation-state">
                    <LoaderCircle className="spin" size={14} />
                    {t("storyTree.loadingPresets")}
                  </p>
                ) : presetCatalogError || !nodePresets.length ? (
                  <div className="story-tree-generation-error" role="alert">
                    <span>
                      {presetCatalogError || t("storyTree.presetCatalogUnavailable")}
                    </span>
                    <button
                      type="button"
                      disabled={presetCatalogLoading}
                      onClick={retryPresetCatalog}
                    >
                      {t("storyTree.retryPresets")}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="story-tree-video-scan">
                      {videoCatalogLoading ? (
                        <span className="story-tree-generation-state">
                          <LoaderCircle className="spin" size={14} />
                          {t("storyTree.scanningBackgroundVideos")}
                        </span>
                      ) : null}
                      {!videoCatalogLoading && videoCatalogError ? (
                        <div
                          className="story-tree-video-error"
                          role="status"
                        >
                          <span>
                            {t("storyTree.backgroundVideoScanFailed")}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void loadGenerationVideoCandidates()
                            }
                          >
                            {t("storyTree.retryVideoScan")}
                          </button>
                        </div>
                      ) : null}
                      {!videoCatalogLoading && !videoCatalogError ? (
                        <small>
                          {t("storyTree.backgroundVideoSelectionCount", {
                            selected: Object.keys(generationVideoAssignments)
                              .length,
                            total: pendingNodeSections.length,
                          })}
                        </small>
                      ) : null}
                    </div>
                    <div className="story-tree-generation-list">
                      {pendingNodeSections.map(
                        ({ section, chapterTitle, episodeTitle }) => {
                          const recommended =
                            recommendedPlayableStoryTreeNodePreset(section);
                          const recommendedLabel = nodePresets.find(
                            (preset) => preset.id === recommended,
                          )?.label ?? recommended;
                          return (
                            <div
                              className="story-tree-generation-row"
                              key={section.id}
                            >
                              <div className="story-tree-generation-info">
                                <strong title={section.title}>
                                  {section.title}
                                </strong>
                                <small>
                                  {chapterTitle} · {episodeTitle} ·{" "}
                                  {t(storyTreeSectionKindTranslationKey(section.kind))}{" "}
                                  ·{" "}
                                  {t("storyTree.recommendedPreset", {
                                    preset: translateText(recommendedLabel),
                                  })}
                                </small>
                              </div>
                              <label className="story-tree-preset-choice">
                                <span className="sr-only">
                                  {t("storyTree.nodePresetFor", {
                                    title: section.title,
                                  })}
                                </span>
                                <select
                                  value={
                                    generationPresetOverrides[section.id] ??
                                    recommended
                                  }
                                  disabled={busy}
                                  onChange={(event) =>
                                    updateGenerationPreset(
                                      section.id,
                                      event.currentTarget.value,
                                    )
                                  }
                                >
                                  {nodePresets.map((preset) => (
                                    <option key={preset.id} value={preset.id}>
                                      {translateText(preset.label)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="story-tree-video-choice">
                                <span>
                                  {t("storyTree.backgroundVideo")}
                                </span>
                                <select
                                  value={
                                    generationVideoAssignments[section.id] ??
                                    ""
                                  }
                                  disabled={
                                    busy ||
                                    videoCatalogLoading ||
                                    Boolean(videoCatalogError) ||
                                    !videoCandidates.length
                                  }
                                  onChange={(event) =>
                                    updateGenerationVideo(
                                      section.id,
                                      event.currentTarget.value,
                                    )
                                  }
                                >
                                  <option value="">
                                    {videoCandidates.length
                                      ? t("storyTree.noBackgroundVideo")
                                      : t("storyTree.noVideoCandidates")}
                                  </option>
                                  {(
                                    videoMatchesBySection.get(section.id)
                                      ?.candidates ?? []
                                  ).map(({ asset }) => (
                                    <option
                                      key={asset.id}
                                      value={asset.id}
                                    >
                                      {asset.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          );
                        },
                      )}
                    </div>
                    <footer>
                      <button
                        className="is-primary"
                        type="button"
                        disabled={busy || !pendingNodeSections.length}
                        onClick={() =>
                          void synchronize(
                            "generate",
                            false,
                            generationPresetOverrides,
                            generationVideoAssignments,
                          )
                        }
                      >
                        {busy && pendingSyncMode === "generate" ? (
                          <LoaderCircle className="spin" size={14} />
                        ) : (
                          <Plus size={14} />
                        )}
                        {t("storyTree.confirmGenerateNodes", {
                          count: pendingNodeSections.length,
                        })}
                      </button>
                    </footer>
                  </>
                )}
              </section>
            ) : null}
            {!sections.length ? (
              <div
                className="story-tree-navigation"
                aria-label={t("storyTree.structure")}
              >
                <div className="story-tree-empty">
                  <p>{t("storyTree.empty")}</p>
                </div>
              </div>
            ) : (
              <PlayableStoryTreeOutline
                tree={tree ?? emptyTree()}
                selectedSectionId={selectedSectionId}
                canvasNodeIds={canvasNodeIds}
                canvasEdges={canvasEdges}
                onSelectSection={selectStorySection}
                onConfirmRoute={confirmRoute}
                disabled={busy}
              />
            )}
            {confirmations.length ? (
              <div className="story-tree-confirmation" role="alert">
                <strong>{t("storyTree.confirmTitle")}</strong>
                <p>{t("storyTree.confirmDescription")}</p>
                {confirmations.slice(0, 8).map((item) => (
                  <div key={item.nodeId}>
                    <b>{item.title}</b>
                    {item.changes.map((change) => (
                      <small key={change}>
                        {confirmationChangeKeys[
                          change as keyof typeof confirmationChangeKeys
                        ]
                          ? t(
                            confirmationChangeKeys[
                              change as keyof typeof confirmationChangeKeys
                            ],
                          )
                          : change}
                      </small>
                    ))}
                  </div>
                ))}
                {confirmations.length > 8 ? (
                  <small>
                    {t("storyTree.moreConflicts", {
                      count: confirmations.length - 8,
                    })}
                  </small>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void synchronize(
                      pendingSyncMode,
                      true,
                      pendingSyncMode === "generate"
                        ? generationPresetOverrides
                        : undefined,
                      pendingSyncMode === "generate"
                        ? generationVideoAssignments
                        : undefined,
                    )
                  }
                >
                  <Check size={14} />
                  {t("storyTree.confirmSync")}
                </button>
              </div>
            ) : null}
            {operation === "tree" && notice ? (
              <p className="story-tree-notice" role="status">
                {notice}
              </p>
            ) : null}
            {operation === "tree" && error ? (
              <p className="story-tree-error" role="alert">
                {error}
              </p>
            ) : null}
            <footer className="story-tree-footer story-tree-tree-footer">
              <details className="story-tree-export-menu">
                <summary>
                  <Download size={14} />
                  {t("storyTree.export")}
                </summary>
                <div role="menu" aria-label={t("storyTree.export")}>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!tree || !sections.length}
                    onClick={(event) => {
                      closeExportMenu(event);
                      exportTree("pdf");
                    }}
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!tree || !sections.length}
                    onClick={(event) => {
                      closeExportMenu(event);
                      exportTree("docx");
                    }}
                  >
                    Word
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!tree || !sections.length}
                    onClick={(event) => {
                      closeExportMenu(event);
                      exportTree("md");
                    }}
                  >
                    Markdown
                  </button>
                </div>
              </details>
              <button
                type="button"
                disabled={busy}
                onClick={openGenerationPreview}
              >
                {presetCatalogLoading ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Plus size={14} />
                )}
                {t("storyTree.generateNodes")}
              </button>
              <button
                className="is-primary"
                type="button"
                disabled={!tree || busy}
                onClick={() => void synchronize("update")}
              >
                {busy &&
                operation === "tree" &&
                pendingSyncMode === "update" ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <GitBranch size={14} />
                )}
                {t("storyTree.updateNodes")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function emptyTree(): PlayableStoryTree {
  return { version: 1, chapters: [], links: [] };
}

function openFirstStoryTreeItems(
  tree: PlayableStoryTree | undefined,
): Set<string> {
  const firstChapter = tree?.chapters[0];
  const firstEpisode = firstChapter?.episodes[0];
  return new Set(
    [firstChapter?.id, firstEpisode?.id].filter((id): id is string =>
      Boolean(id),
    ),
  );
}

function displayChapterTitle(title: string): string {
  if (title === "待命名篇章") return t("storyTree.untitledChapter");
  if (title === "未分章") return t("storyTree.unassignedChapter");
  return title;
}

function uniqueId(base: string): string {
  const suffix =
    globalThis.crypto?.randomUUID?.().replaceAll("-", "") ?? `${Date.now()}`;
  return `${base.slice(0, 90)}-${suffix.slice(0, 24)}`;
}

function nextEpisodeNumber(tree: PlayableStoryTree | undefined): number {
  return (
    Math.max(
      0,
      ...(tree?.chapters.flatMap((chapter) =>
        chapter.episodes.map((episode) => episode.number),
      ) ?? []),
    ) + 1
  );
}

function findParentIds(tree: PlayableStoryTree, episodeId: string): string[] {
  for (const chapter of tree.chapters) {
    if (chapter.episodes.some((episode) => episode.id === episodeId)) {
      return [chapter.id, episodeId];
    }
  }
  return [];
}

function findAnalysisChanges(
  beforeTree: PlayableStoryTree,
  afterTree: PlayableStoryTree,
  changedIds: readonly string[],
): Array<{
  before: PlayableStoryTreeSection;
  after: PlayableStoryTreeSection;
  changes: string[];
}> {
  const beforeSections = new Map(
    playableStoryTreeSections(beforeTree).map((section) => [
      section.id,
      section,
    ]),
  );
  const afterSections = new Map(
    playableStoryTreeSections(afterTree).map((section) => [
      section.id,
      section,
    ]),
  );
  return changedIds.flatMap((id) => {
    const before = beforeSections.get(id);
    const after = afterSections.get(id);
    if (!before || !after) return [];
    const changes: string[] = [];
    const addChange = (label: string, oldValue: string, newValue: string) => {
      if (oldValue !== newValue) {
        changes.push(
          `${label}: ${shortPreview(oldValue)} → ${shortPreview(newValue)}`,
        );
      }
    };
    addChange(t("storyTree.analysisFieldTitle"), before.title, after.title);
    addChange(
      t("storyTree.analysisFieldKind"),
      sectionKindName(before.kind),
      sectionKindName(after.kind),
    );
    addChange(
      t("storyTree.analysisFieldObjective"),
      before.objective,
      after.objective,
    );
    addChange(
      t("storyTree.analysisFieldPrerequisite"),
      before.prerequisite,
      after.prerequisite,
    );
    addChange(
      t("storyTree.analysisFieldBeats"),
      before.beats.map((beat) => beat.text).join(" / "),
      after.beats.map((beat) => beat.text).join(" / "),
    );
    addChange(
      t("storyTree.analysisFieldScreenplay"),
      before.scriptText,
      after.scriptText,
    );
    return changes.length ? [{ before, after, changes }] : [];
  });
}

function findAnalysisLinkChanges(
  beforeTree: PlayableStoryTree,
  afterTree: PlayableStoryTree,
  changedIds: readonly string[],
): Array<{ id: string; text: string }> {
  const oldLinks = new Map(beforeTree.links.map((link) => [link.id, link]));
  const beforeSections = new Map(
    playableStoryTreeSections(beforeTree).map((section) => [
      section.id,
      section.title,
    ]),
  );
  const afterSections = new Map(
    playableStoryTreeSections(afterTree).map((section) => [
      section.id,
      section.title,
    ]),
  );
  return changedIds.flatMap((id) => {
    const before = oldLinks.get(id);
    const after = afterTree.links.find((link) => link.id === id);
    const link = after ?? before;
    if (!link) return [];
    const format = (item: typeof link) =>
      `${beforeSections.get(item.fromSectionId) ?? afterSections.get(item.fromSectionId) ?? item.fromSectionId} → ${item.label || t("storyTree.unconfirmedRoute")} → ${afterSections.get(item.toSectionId) ?? beforeSections.get(item.toSectionId) ?? item.toSectionId} (${t(`storyTree.${item.status}`)})`;
    const text =
      before && after
        ? `${shortPreview(format(before))} → ${shortPreview(format(after))}`
        : after
          ? `${t("storyTree.analysisLinkAdded")}: ${shortPreview(format(after))}`
          : `${t("storyTree.analysisLinkRemoved")}: ${shortPreview(format(before!))}`;
    return [{ id, text }];
  });
}

function sectionKindName(kind: PlayableStoryTreeSection["kind"]): string {
  return t(storyTreeSectionKindTranslationKey(kind));
}

function storyTreeSectionKindTranslationKey(
  kind: PlayableStoryTreeSection["kind"],
):
  | "storyTree.kindScene"
  | "storyTree.kindBranch"
  | "storyTree.kindMerge"
  | "storyTree.kindEnding" {
  return kind === "branch"
    ? "storyTree.kindBranch"
    : kind === "merge"
      ? "storyTree.kindMerge"
      : kind === "ending"
        ? "storyTree.kindEnding"
        : "storyTree.kindScene";
}

function shortPreview(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim() || "（空）";
  return [...normalized].length > 180
    ? `${[...normalized].slice(0, 177).join("")}…`
    : normalized;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function safeFileName(name: string): string {
  return (
    name.replace(/\.[^.]+$/u, "").replace(/[^\p{L}\p{N}._-]+/gu, "-") ||
    "story-tree"
  );
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
