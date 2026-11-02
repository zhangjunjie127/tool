import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  changeNodeCodebase,
  NodeCodebaseError,
} from "./playable-codebase.js";
import { playablePreset, PLAYABLE_PRESET_IDS } from "./playable-presets.js";
import { freePlayablePosition, type NodeEditorLayout } from "../shared/playable-codebase.js";
import { withPlayableEntry } from "../shared/playable-graph.js";
import { playableEdgeId } from "../shared/playable-editor.js";
import { layoutPlayableStoryTreeNodes } from "../shared/playable-story-tree-layout.js";
import { syncPlayableStoryTreeContent } from "../shared/playable-story-tree-content.js";
import { storyTreeGenerationRoutes, storyTreeOperationMotion, type StoryTreeGenerationRoute } from "../shared/playable-story-tree-actions.js";
import {
  completePlayableStoryTreeRoutes,
  playableStoryTreeExitLabel,
} from "../shared/playable-story-tree-routes.js";
import { addPlayableNodeAsset } from "../shared/playable-editor.js";
import {
  playableBackdrop,
  setPlayableBackdrop,
} from "../shared/playable-backdrop.js";
import type {
  NodeGraph,
  PlayableNavigationMode,
  PlayableSignal,
} from "../shared/playable-nodes.js";
import {
  PLAYABLE_MOTION_ATTRIBUTES,
  setPlayableNoInputMode,
  motionAttributes,
  type PlayableMotionConfig,
} from "../shared/playable-motion.js";
import {
  finalizePlayableStoryTreeRemovals,
  fingerprint,
  isPlayableStoryTree,
  playableStoryTreeSections,
  recommendedPlayableStoryTreeNodePreset,
  type PlayableStoryTree,
  type PlayableStoryTreeCanvasSnapshot,
  type PlayableStoryTreeSection,
} from "../shared/playable-story-tree.js";
import {
  insertPlayableButtonPreset,
  replacePlayableSignalButtonText,
} from "../shared/playable-motion.js";

const NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_TITLE_LENGTH = 120;

export interface AddPlayableNodeRequest {
  preset: string;
  id: string;
  title?: string;
  position?: { x: number; y: number };
}

export interface AddPlayableNodeResult {
  id: string;
  title: string;
  preset: string;
  /** Workspace-relative paths written for the new Node. */
  files: string[];
  signals: string[];
  /** What the author usually wants next, for the Agent to act on. */
  brief: string;
}

export interface ImportPlayableSceneRequest {
  preset: string;
  title: string;
  id?: string;
  /** 1-based scene numbers this scene can lead to. */
  outgoing?: Array<{
    target: number;
    signal?: string;
    label?: string;
    mode?: PlayableNavigationMode;
  }>;
}

export interface ImportPlayableScriptRequest {
  scenes: ImportPlayableSceneRequest[];
}

export interface ImportPlayableScriptResult {
  nodes: Array<{ id: string; title: string; preset: string }>;
  edges: Array<{ source: string; signal: string; target: string }>;
}

export interface SyncPlayableStoryTreeResult {
  applied: boolean;
  tree?: PlayableStoryTree;
  addedNodes: number;
  addedVideos: number;
  skippedVideoAssignments: number;
  updatedNodes: number;
  pendingLinks: number;
  confirmations: Array<{
    nodeId: string;
    title: string;
    changes: string[];
  }>;
}

/**
 * Creates a Node from a Preset: copies the Preset source into `nodes/<id>/`,
 * adds the Node with its starter Signals to graph.json, and places it on the
 * canvas. The editor and the Agent both go through here, so a Node created
 * either way is identical.
 */
export async function addPlayableNode(
  workspacePath: string,
  request: AddPlayableNodeRequest,
): Promise<AddPlayableNodeResult> {
  const preset = playablePreset(request.preset);
  if (!preset) {
    throw new NodeCodebaseError(
      `Unknown Preset "${request.preset}". Available Presets: ${PLAYABLE_PRESET_IDS.join(", ")}.`,
    );
  }
  if (!NODE_ID_PATTERN.test(request.id)) {
    throw new NodeCodebaseError(
      `Invalid Node ID "${request.id}". Use letters, digits, dots, dashes, and underscores, starting with a letter or digit.`,
    );
  }
  const source = {
    html: `nodes/${request.id}/index.html`,
    css: `nodes/${request.id}/style.css`,
    javascript: `nodes/${request.id}/node.js`,
  };
  let title = "";
  // Read and written as one step, so a save from the editor cannot land in between and be lost.
  await changeNodeCodebase(workspacePath, (codebase) => {
    // Nodes are named in order, not after their Preset: a Preset is only a starting point.
    title = (request.title ?? nextNodeTitle(codebase.graph.nodes)).trim().slice(0, MAX_TITLE_LENGTH);
    if (!title) throw new NodeCodebaseError("A Node title is required.");

    if (codebase.graph.nodes.some((node) => node.id === request.id)) {
      throw new NodeCodebaseError(`Node "${request.id}" already exists.`);
    }
    // Without a title the starter text keeps the Preset's own wording.
    const starter = preset.source(request.title ? title : preset.label);
    const starterHtml =
      setPlayableNoInputMode(starter.html, "continue") ?? starter.html;
    // The first Node of an empty project becomes its Start.
    const graph = withPlayableEntry({
      ...codebase.graph,
      initialState: {
        ...preset.initialState,
        ...codebase.graph.initialState,
      },
      ...(preset.variables || codebase.graph.variables
        ? {
            variables: {
              ...preset.variables,
              ...codebase.graph.variables,
            },
          }
        : {}),
      nodes: [
        ...codebase.graph.nodes,
        {
          id: request.id,
          title,
          source,
          assets: [],
          signals: preset.signals.map((signal) => ({ ...signal })),
          ...(preset.story ? { story: { ...preset.story } } : {}),
        },
      ],
    });
    const editorLayout: NodeEditorLayout = {
      ...codebase.editorLayout,
      nodes: {
        ...codebase.editorLayout.nodes,
        [request.id]: request.position ?? freePlayablePosition(codebase.editorLayout),
      },
    };
    return {
      graph,
      editorLayout,
      sources: {
        [source.html]: starterHtml,
        [source.css]: starter.css,
        [source.javascript]: starter.javascript,
      },
    };
  });
  return {
    id: request.id,
    title,
    preset: preset.id,
    files: [source.html, source.css, source.javascript],
    signals: preset.signals.map((signal) => signal.id),
    brief: preset.brief,
  };
}

/** Creates a script's scenes in order, then routes their Signals in one graph update. */
export async function importPlayableScript(
  workspacePath: string,
  request: ImportPlayableScriptRequest,
): Promise<ImportPlayableScriptResult> {
  if (!request.scenes.length || request.scenes.length > 500) {
    throw new NodeCodebaseError("A script must contain between 1 and 500 scenes.");
  }
  const normalized = request.scenes.map((scene, index) => {
    const preset = playablePreset(scene.preset);
    if (!preset) throw new NodeCodebaseError(`Unknown Preset "${scene.preset}" at scene ${index + 1}.`);
    const title = scene.title.trim().slice(0, MAX_TITLE_LENGTH);
    if (!title) throw new NodeCodebaseError(`Scene ${index + 1} needs a title.`);
    if (scene.id !== undefined && !NODE_ID_PATTERN.test(scene.id)) {
      throw new NodeCodebaseError(`Invalid Node ID "${scene.id}" at scene ${index + 1}.`);
    }
    return { ...scene, preset: preset.id, title };
  });

  let result: ImportPlayableScriptResult = { nodes: [], edges: [] };
  await changeNodeCodebase(workspacePath, (codebase) => {
    if (codebase.graph.nodes.length + normalized.length > 500) {
      throw new NodeCodebaseError("The project cannot contain more than 500 scenes.");
    }
    const graph = structuredClone(codebase.graph);
    const layout = structuredClone(codebase.editorLayout);
    const takenIds = new Set(graph.nodes.map((node) => node.id));
    const added: AddPlayableNodeResult[] = [];
    const sources: Record<string, string> = {};
    for (const [index, scene] of normalized.entries()) {
      const id = scene.id ?? uniqueImportedNodeId(scene.title, index, [...takenIds]);
      if (takenIds.has(id)) {
        throw new NodeCodebaseError(`Node "${id}" already exists.`);
      }
      const preset = playablePreset(scene.preset)!;
      const source = {
        html: `nodes/${id}/index.html`,
        css: `nodes/${id}/style.css`,
        javascript: `nodes/${id}/node.js`,
      };
      const starter = preset.source(scene.title);
      sources[source.html] =
        setPlayableNoInputMode(starter.html, "continue") ?? starter.html;
      sources[source.css] = starter.css;
      sources[source.javascript] = starter.javascript;
      graph.initialState = { ...preset.initialState, ...graph.initialState };
      if (preset.variables || graph.variables) {
        graph.variables = { ...preset.variables, ...graph.variables };
      }
      graph.nodes.push({
        id,
        title: scene.title,
        source,
        assets: [],
        signals: preset.signals.map((signal) => ({ ...signal })),
        ...(preset.story ? { story: { ...preset.story } } : {}),
      });
      layout.nodes[id] = freePlayablePosition(layout);
      takenIds.add(id);
      added.push({
        id,
        title: scene.title,
        preset: preset.id,
        files: [source.html, source.css, source.javascript],
        signals: preset.signals.map((signal) => signal.id),
        brief: preset.brief,
      });
    }

    for (const [index, scene] of normalized.entries()) {
      const source = graph.nodes.find((node) => node.id === added[index]!.id);
      if (!source) throw new NodeCodebaseError(`Imported scene ${index + 1} was not found after creation.`);
      const routes = scene.outgoing ?? (index < normalized.length - 1 ? [{ target: index + 2 }] : []);
      const usedSignals = new Set(graph.edges.filter((edge) => edge.source.nodeId === source.id).map((edge) => edge.source.signal));
      for (const [routeIndex, route] of routes.entries()) {
        if (!Number.isInteger(route.target) || route.target < 1 || route.target > normalized.length) {
          throw new NodeCodebaseError(`Scene ${index + 1} has an invalid target scene number.`);
        }
        const target = added[route.target - 1];
        if (!target) throw new NodeCodebaseError(`Scene ${index + 1} targets missing scene ${route.target}.`);
        const signalId = route.signal?.trim() || availableSignalId(source.signals, usedSignals, routeIndex);
        let signal = source.signals.find((candidate) => candidate.id === signalId);
        if (!signal) {
          signal = { id: signalId, label: route.label?.trim() || `前往${target.title}` };
          source.signals.push(signal);
        } else if (route.label?.trim()) {
          signal.label = route.label.trim().slice(0, MAX_TITLE_LENGTH);
        }
        if (usedSignals.has(signal.id)) continue;
        usedSignals.add(signal.id);
        const edge = {
          id: playableEdgeId(graph.edges, source.id, signal.id),
          source: { nodeId: source.id, signal: signal.id },
          targetNodeId: target.id,
          mode: route.mode ?? "replace",
        };
        graph.edges.push(edge);
        result.edges.push({ source: source.id, signal: signal.id, target: target.id });
      }
    }
    graph.entryNodeId = codebase.graph.nodes.length
      ? graph.entryNodeId
      : added[0]!.id;
    result.nodes = added.map((node) => ({
      id: node.id,
      title: node.title,
      preset: node.preset,
    }));
    return {
      graph: withPlayableEntry(graph),
      editorLayout: layout,
      sources,
    };
  });
  return result;
}

/** Creates missing story Scenes and applies only changed tree-managed content. */
export async function syncPlayableStoryTree(
  workspacePath: string,
  previousTree: PlayableStoryTree | undefined,
  incomingTree: PlayableStoryTree,
  confirmOverwrite = false,
  mode: "generate" | "update" = "update",
  nodePresetOverrides: Readonly<Record<string, string>> = {},
  nodeVideoAssignments: Readonly<
    Record<string, { assetId: string; name: string }>
  > = {},
  persistTree?: (tree: PlayableStoryTree) => Promise<void>,
): Promise<SyncPlayableStoryTreeResult> {
  if (!isPlayableStoryTree(incomingTree)) {
    throw new NodeCodebaseError("The story tree does not match its schema.");
  }
  incomingTree = completePlayableStoryTreeRoutes(incomingTree);

  const sectionIds = new Set(playableStoryTreeSections(incomingTree).map((section) => section.id));
  for (const [sectionId, presetId] of Object.entries(nodePresetOverrides)) {
    if (!sectionIds.has(sectionId)) {
      throw new NodeCodebaseError(`Unknown story tree scene "${sectionId}" in preset selection.`);
    }
    if (!playablePreset(presetId)) {
      throw new NodeCodebaseError(`Unknown node preset "${presetId}" for scene "${sectionId}".`);
    }
  }
  for (const [sectionId, asset] of Object.entries(nodeVideoAssignments)) {
    if (!sectionIds.has(sectionId)) {
      throw new NodeCodebaseError(`Unknown story tree scene "${sectionId}" in video selection.`);
    }
    if (mode !== "generate") {
      throw new NodeCodebaseError("Background videos can only be assigned while generating missing scenes.");
    }
    if (!asset.assetId.trim() || !asset.name.trim()) {
      throw new NodeCodebaseError(`The selected background video for "${sectionId}" is invalid.`);
    }
  }

  let result: SyncPlayableStoryTreeResult = {
    applied: false,
    addedNodes: 0,
    addedVideos: 0,
    skippedVideoAssignments: 0,
    updatedNodes: 0,
    pendingLinks: incomingTree.links.filter((link) => link.status === "suggested").length,
    confirmations: [],
  };

  await changeNodeCodebase(workspacePath, async (codebase) => {
    let graph = structuredClone(codebase.graph);
    const layout = structuredClone(codebase.editorLayout);
    const previousSections = new Map(
      playableStoryTreeSections(previousTree ?? { version: 1, chapters: [], links: [] })
        .map((section) => [section.id, section]),
    );
    const sections = playableStoryTreeSections(incomingTree);
    const previousEntrySection = playableStoryTreeSections(
      previousTree ?? { version: 1, chapters: [], links: [] },
    ).find((section) => !section.sourceRemoved && section.canvasNodeId);
    const incomingEntrySection = sections.find((section) => !section.sourceRemoved);
    const nodeIds = new Map<string, string>();
    const newlyCreated = new Set<string>();
    const createdNodeIds = new Set<string>();
    const occupiedIds = new Set(graph.nodes.map((node) => node.id));

    for (const [index, section] of sections.entries()) {
      const previous = previousSections.get(section.id);
      const savedId = section.canvasNodeId ?? previous?.canvasNodeId;
      if (section.sourceRemoved) {
        if (savedId && graph.nodes.some((node) => node.id === savedId)) {
          nodeIds.set(section.id, savedId);
        }
        continue;
      }
      if (savedId && graph.nodes.some((node) => node.id === savedId)) {
        nodeIds.set(section.id, savedId);
        continue;
      }
      const baseId = storyNodeId(section.id, index);
      const recoverable = graph.nodes.find(
        (node) =>
          (node.id === baseId || node.id.startsWith(`${baseId}-`)) &&
          node.title === section.title,
      );
      if (recoverable) {
        nodeIds.set(section.id, recoverable.id);
        continue;
      }
      const id = uniqueStoryNodeId(baseId, occupiedIds);
      occupiedIds.add(id);
      nodeIds.set(section.id, id);
      newlyCreated.add(section.id);
    }

    const createdSources: Record<string, string> = {};
    const sourceHtmlCache = new Map<string, string>();
    const sourceHtml = async (node: NodeGraph["nodes"][number]): Promise<string> => {
      const created = createdSources[node.source.html];
      if (created !== undefined) return created;
      const cached = sourceHtmlCache.get(node.source.html);
      if (cached !== undefined) return cached;
      const content = await readFile(
        path.join(workspacePath, ...node.source.html.split("/")),
        "utf8",
      );
      sourceHtmlCache.set(node.source.html, content);
      return content;
    };
    const confirmations: SyncPlayableStoryTreeResult["confirmations"] = [];
    if (
      mode === "update" &&
      previousEntrySection?.canvasNodeId &&
      incomingEntrySection &&
      previousEntrySection.id !== incomingEntrySection.id &&
      graph.entryNodeId === previousEntrySection.canvasNodeId
    ) {
      confirmations.push({
        nodeId: incomingEntrySection.canvasNodeId ?? incomingEntrySection.id,
        title: incomingEntrySection.title,
        changes: ["The story entry Scene will be updated."],
      });
    }
    for (const section of mode === "update" ? sections : []) {
      if (section.sourceRemoved) continue;
      const previous = previousSections.get(section.id);
      if (!previous?.canvasNodeId) continue;
      const node = graph.nodes.find((candidate) => candidate.id === previous.canvasNodeId);
      if (!node) {
        confirmations.push({
          nodeId: previous.canvasNodeId,
          title: section.title,
          changes: ["The linked Scene was deleted from the canvas and will be recreated."],
        });
        continue;
      }
      const changes: string[] = [];
      const baseline = previous.canvasSnapshot;
      if (section.title !== (baseline?.title ?? previous.title)) {
        changes.push("The Scene title will be updated from the story tree.");
      }
      if (baseline && node.title !== baseline.title) {
        changes.push("The Scene title was edited on the canvas.");
      }
      const contentSync = syncPlayableStoryTreeContent(
        await sourceHtml(node),
        section.id,
        previous,
        section,
        baseline?.beats,
      );
      if (contentSync.changed) {
        changes.push("Story-tree scene content will be updated.");
      }
      if (contentSync.editedBeatIds.length) {
        changes.push("A story-tree beat was edited on the canvas and will be replaced.");
      }
      const outgoingLinks = storyTreeGenerationRoutes(incomingTree, section);
      const desired = outgoingLinks
        .map((link) => ({
          label: playableStoryTreeExitLabel(link.label, sections.find((item) => item.id === link.toSectionId)?.title),
          targetSectionId: link.toSectionId,
        }))
        .sort(compareExitTarget);
      const routesChanged = baseline && (
        !sameExitTargets(baseline.exits, desired) ||
        !storyActionTargetsMatch(baseline, outgoingLinks)
      );
      if (routesChanged) {
        changes.push("The Scene's tree connections will be updated.");
      }
      if (routesChanged && !liveManagedExitsMatch(node, graph.edges, baseline.exits, previousTree)) {
        changes.push("Tree-managed connections were edited on the canvas.");
      }
      if (baseline) {
        const buttons = baseline.storyButtons ?? [];
        const currentLinks = outgoingLinks;
        for (const [routeIndex, link] of currentLinks.entries()) {
          const previousActionButton = buttons.find(
            (button) => link.action && button.beatId === link.action.id,
          );
          const oldExit = baseline.exits.find(
            (exit) => exit.id === previousActionButton?.signal,
          ) ?? baseline.exits.find(
            (exit) => exit.targetSectionId === link.toSectionId &&
              exit.label === playableStoryTreeExitLabel(link.label, sections.find((item) => item.id === link.toSectionId)?.title),
          ) ?? baseline.exits[routeIndex];
          const managedButton = buttons.find(
            (button) => button.signal === oldExit?.id,
          );
          if (!managedButton) continue;
          const actionBeat = link.action;
          if (!storyActionChanged(previous, section, managedButton.beatId, actionBeat?.id)) {
            continue;
          }
          changes.push("A generated story button will be updated.");
          const liveButton = findManagedStoryButton(await sourceHtml(node), managedButton.signal);
          if (!liveButton || fingerprint(liveButton) !== managedButton.signature) {
            changes.push("A generated story button was edited on the canvas.");
          }
        }
      }
      if (changes.length) confirmations.push({ nodeId: node.id, title: node.title, changes });
    }

    const confirmationsByNode = new Map<string, SyncPlayableStoryTreeResult["confirmations"][number]>();
    for (const confirmation of confirmations) {
      const existing = confirmationsByNode.get(confirmation.nodeId);
      if (!existing) {
        confirmationsByNode.set(confirmation.nodeId, {
          ...confirmation,
          changes: [...new Set(confirmation.changes)],
        });
      } else {
        existing.changes = [...new Set([...existing.changes, ...confirmation.changes])];
      }
    }
    result.confirmations = [...confirmationsByNode.values()];
    if (result.confirmations.length && !confirmOverwrite) return undefined;

    for (const section of mode === "update" ? sections : []) {
      if (!section.sourceRemoved || !section.canvasNodeId) continue;
      const node = graph.nodes.find((candidate) => candidate.id === section.canvasNodeId);
      if (node) node.storyTreeDetached = true;
    }

    const nextTree = structuredClone(incomingTree);
    const treeSections = new Map(
      playableStoryTreeSections(nextTree).map((section) => [section.id, section]),
    );
    const updatedNodeIds = new Set<string>();
    const markUpdated = (nodeId: string) => {
      if (updatedNodeIds.has(nodeId)) return;
      updatedNodeIds.add(nodeId);
      result.updatedNodes += 1;
    };
    const ensureExitButton = async (
      node: NodeGraph["nodes"][number],
      signalId: string,
      label: string,
      routeIndex: number,
      routeCount: number,
      config?: PlayableMotionConfig,
      beatId?: string,
      adoptExisting = false,
    ) => {
      let html = await sourceHtml(node);
      if (htmlHasSignal(html, signalId)) {
        if (createdNodeIds.has(node.id) || adoptExisting) {
          const marked = markStoryTreeButtonBySignal(html, signalId, beatId);
          if (marked !== html) {
            html = marked;
            createdSources[node.source.html] = html;
            sourceHtmlCache.set(node.source.html, html);
          }
          const configured = updateManagedStoryButton(html, signalId, beatId, config);
          if (configured && configured !== html) {
            html = configured;
            createdSources[node.source.html] = configured;
            sourceHtmlCache.set(node.source.html, configured);
          }
          const relabeled = replacePlayableSignalButtonText(html, node.source.html, signalId, label);
          if (relabeled && relabeled !== html) {
            createdSources[node.source.html] = relabeled;
            sourceHtmlCache.set(node.source.html, relabeled);
          }
        }
        return;
      }
      const buttonId = uniqueStoryButtonId(signalId, html);
      const inserted = insertPlayableButtonPreset(
        html,
        node.source.html,
        buttonId,
        signalId,
        label,
        config,
        undefined,
        undefined,
        label,
        undefined,
        undefined,
        storyExitButtonPosition(routeIndex, routeCount),
      );
      if (!inserted) {
        throw new NodeCodebaseError(
          `Could not add the "${label}" Exit button to Scene "${node.title}".`,
        );
      }
      const generatedHtml = markStoryTreeButton(
        inserted.html,
        buttonId,
        beatId,
      );
      const configuredHtml = updateManagedStoryButton(
        generatedHtml,
        signalId,
        beatId,
        config,
      ) ?? generatedHtml;
      createdSources[node.source.html] = configuredHtml;
      sourceHtmlCache.set(node.source.html, configuredHtml);
    };
    for (const [index, section] of sections.entries()) {
      if (section.sourceRemoved) continue;
      const nodeId = nodeIds.get(section.id)!;
      const targetSection = treeSections.get(section.id)!;
      const oldSection = previousSections.get(section.id);
      let node = graph.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) {
        const presetId =
          nodePresetOverrides[section.id] ??
          recommendedPlayableStoryTreeNodePreset(section);
        const preset = playablePreset(presetId);
        if (!preset) throw new NodeCodebaseError(`Unknown node preset "${presetId}".`);
        const source = {
          html: `nodes/${nodeId}/index.html`,
          css: `nodes/${nodeId}/style.css`,
          javascript: `nodes/${nodeId}/node.js`,
        };
        // Compose story choices from the editor's button presets, not the
        // Choice demo's two buttons beneath the generated story-text panel.
        const composeChoices = presetId === "choice" &&
          section.beats.some((beat) => beat.kind === "choice");
        const starter = (composeChoices ? playablePreset("blank")! : preset).source(section.title);
        createdSources[source.html] =
          setPlayableNoInputMode(
            starter.html,
            section.beats.some((beat) => beat.kind === "choice" || beat.kind === "operation")
              ? "wait"
              : "continue",
          ) ?? starter.html;
        createdSources[source.css] = starter.css;
        createdSources[source.javascript] = starter.javascript;
        graph.initialState = { ...preset.initialState, ...graph.initialState };
        if (preset.variables || graph.variables) {
          graph.variables = { ...preset.variables, ...graph.variables };
        }
        node = {
          id: nodeId,
          title: section.title.slice(0, MAX_TITLE_LENGTH),
          source,
          assets: [],
          signals: composeChoices ? [] : preset.signals.map((signal) => ({ ...signal })),
          ...(preset.story ? { story: { ...preset.story } } : {}),
        };
        graph.nodes.push(node);
        createdNodeIds.add(nodeId);
        result.addedNodes += 1;
      }
      if (mode === "generate" && oldSection?.canvasNodeId && !newlyCreated.has(section.id)) {
        targetSection.canvasNodeId = nodeId;
        const snapshot = oldSection.canvasSnapshot ?? {
          title: node.title,
          exits: [],
        };
        const exits = [...snapshot.exits];
        const managedTargets = new Set(
          exits.map((exit) => exit.targetSectionId),
        );
        const linksToNewScenes = storyTreeGenerationRoutes(incomingTree, section).filter(
          (link) =>
            link.fromSectionId === section.id &&
            newlyCreated.has(link.toSectionId) &&
            !managedTargets.has(link.toSectionId),
        );
        const html = await sourceHtml(node);
        const canReuseNext =
          linksToNewScenes.length === 1 &&
          node.signals.some((signal) => signal.id === "next") &&
          !graph.edges.some(
            (edge) =>
              edge.source.nodeId === nodeId &&
              edge.source.signal === "next",
          );
        let nextIsAvailable = canReuseNext;
        const assignedSignals = new Set<string>();
        for (const [routeIndex, link] of linksToNewScenes.entries()) {
          const targetNodeId = nodeIds.get(link.toSectionId);
          if (!targetNodeId) continue;
          const label = playableStoryTreeExitLabel(link.label, treeSections.get(link.toSectionId)?.title);
          const actionBeat = link.action;
          const buttonText = actionBeat
            ? storyTreeActionLabel(actionBeat)
            : storyExitButtonText(
            link.label,
            treeSections.get(link.toSectionId)?.title,
          );
          const reusableButtonSignal = findReusableStoryButtonSignal(
            node.signals,
            html,
            assignedSignals,
            link.label,
            treeSections.get(link.toSectionId)?.title,
            routeIndex,
            linksToNewScenes.length,
          );
          const signalId = nextIsAvailable
            ? "next"
            : reusableButtonSignal ??
              uniqueStorySignalId(
                storySignalId(link.id),
                new Set(node.signals.map((signal) => signal.id)),
              );
          nextIsAvailable = false;
          assignedSignals.add(signalId);
          const signal = node.signals.find(
            (candidate) => candidate.id === signalId,
          );
          if (signal) signal.label = label;
          else node.signals.push({ id: signalId, label });
          await ensureExitButton(
            node,
            signalId,
            buttonText,
            routeIndex,
            linksToNewScenes.length,
            actionBeat?.kind === "operation"
              ? storyTreeOperationMotion(actionBeat, signalId)
              : undefined,
            actionBeat?.id,
          );
          graph.edges.push({
            id: playableEdgeId(graph.edges, nodeId, signalId),
            source: { nodeId, signal: signalId },
            targetNodeId,
            mode: "replace",
          });
          exits.push({
            id: signalId,
            label,
            targetSectionId: link.toSectionId,
          });
        }
        targetSection.canvasSnapshot = {
          ...snapshot,
          exits,
          storyButtons: storyButtonSnapshots(
            await sourceHtml(node),
            exits.map((exit) => exit.id),
          ),
        };
        continue;
      }
      delete node.storyTreeDetached;

      if (oldSection?.canvasNodeId && node.title !== section.title.slice(0, MAX_TITLE_LENGTH)) {
        node.title = section.title.slice(0, MAX_TITLE_LENGTH);
        markUpdated(nodeId);
      }

      const desiredLinks = storyTreeGenerationRoutes(incomingTree, section);
      const oldManagedExits = oldSection?.canvasSnapshot?.exits ?? [];
      const canUpdateExits = createdNodeIds.has(nodeId) ||
        !oldSection?.canvasSnapshot ||
        !storyActionTargetsMatch(oldSection.canvasSnapshot, desiredLinks) ||
        !sameExitTargets(oldManagedExits, desiredLinks.map((link) => ({
          label: playableStoryTreeExitLabel(link.label, treeSections.get(link.toSectionId)?.title),
          targetSectionId: link.toSectionId,
        })));
      let exits = oldManagedExits;
      if (canUpdateExits) {
        if (!createdNodeIds.has(nodeId)) markUpdated(nodeId);
        const oldManagedSignalIds = new Set(oldManagedExits.map((exit) => exit.id));
        node.signals = node.signals.filter((signal) => !oldManagedSignalIds.has(signal.id));
        graph.edges = graph.edges.filter(
          (edge) =>
            edge.source.nodeId !== nodeId ||
            !oldManagedSignalIds.has(edge.source.signal),
        );

        const usedSignals = new Set(node.signals.map((signal) => signal.id));
        const assignedSignals = new Set<string>();
        const reservedActionSignals = new Set(
          (oldSection?.canvasSnapshot?.storyButtons ?? [])
            .filter((button) => button.beatId && desiredLinks.some((link) => link.action?.id === button.beatId))
            .map((button) => button.signal),
        );
        const html = await sourceHtml(node);
        exits = [];
        for (const [routeIndex, link] of desiredLinks.entries()) {
          const targetNodeId = nodeIds.get(link.toSectionId)!;
          const stableId = storySignalId(link.id);
          const previousButton = oldSection?.canvasSnapshot?.storyButtons?.find(
            (button) => link.action && button.beatId === link.action.id &&
              !assignedSignals.has(button.signal),
          );
          const reusableExit = (previousButton
            ? oldManagedExits.find((exit) => exit.id === previousButton.signal)
            : undefined) ?? oldManagedExits.find(
            (exit) =>
              !assignedSignals.has(exit.id) &&
              !reservedActionSignals.has(exit.id) &&
              exit.label === (link.label || "继续").slice(0, MAX_TITLE_LENGTH) &&
              exit.targetSectionId === link.toSectionId,
          );
          const positionalExit = oldManagedExits[routeIndex];
          const fallbackExit = positionalExit &&
            !assignedSignals.has(positionalExit.id) &&
            !reservedActionSignals.has(positionalExit.id)
              ? positionalExit
              : undefined;
          const reuseStarterSignal =
            desiredLinks.length === 1 &&
            node.signals.some((signal) => signal.id === "next");
          const reusableButtonSignal = findReusableStoryButtonSignal(
            node.signals,
            html,
            assignedSignals,
            link.label,
            treeSections.get(link.toSectionId)?.title,
            routeIndex,
            desiredLinks.length,
          );
          let signalId =
            reusableExit?.id ??
            fallbackExit?.id ??
            reusableButtonSignal ??
            (reuseStarterSignal ? "next" : stableId);
          if (assignedSignals.has(signalId)) {
            signalId = uniqueStorySignalId(stableId, usedSignals);
          }
          assignedSignals.add(signalId);
          usedSignals.add(signalId);
          const label = playableStoryTreeExitLabel(link.label, treeSections.get(link.toSectionId)?.title);
          const actionBeat = link.action;
          const buttonText = actionBeat
            ? storyTreeActionLabel(actionBeat)
            : storyExitButtonText(
            link.label,
            treeSections.get(link.toSectionId)?.title,
          );
          const existingSignal = node.signals.find((signal) => signal.id === signalId);
          if (existingSignal) existingSignal.label = label;
          else node.signals.push({ id: signalId, label });
          const missingActionBinding = Boolean(actionBeat) &&
            !oldSection?.canvasSnapshot?.storyButtons?.some(
              (button) => button.signal === signalId,
            );
          if (!reusableExit || missingActionBinding) {
            await ensureExitButton(
              node,
              signalId,
              buttonText,
              routeIndex,
              desiredLinks.length,
              actionBeat?.kind === "operation"
                ? storyTreeOperationMotion(actionBeat, signalId)
                : undefined,
              actionBeat?.id,
              Boolean(reusableButtonSignal) || missingActionBinding,
            );
          }
          if (createdNodeIds.has(nodeId)) {
            const updatedHtml = await sourceHtml(node);
            const relabeled = replacePlayableSignalButtonText(
              updatedHtml,
              node.source.html,
              signalId,
              buttonText,
            );
            if (relabeled) {
              createdSources[node.source.html] = relabeled;
              sourceHtmlCache.set(node.source.html, relabeled);
            }
          }
          if (targetNodeId && !treeSections.get(link.toSectionId)?.sourceRemoved) {
            graph.edges.push({
              id: playableEdgeId(graph.edges, nodeId, signalId),
              source: { nodeId, signal: signalId },
              targetNodeId,
              mode: "replace",
            });
          }
          exits.push({
            id: signalId,
            label,
            targetSectionId: link.toSectionId,
          });
        }
        const retainedExitIds = new Set(exits.map((exit) => exit.id));
        for (const removedExit of oldManagedExits) {
          if (retainedExitIds.has(removedExit.id)) continue;
          const removed = removeManagedStoryButton(
            await sourceHtml(node),
            removedExit.id,
          );
          if (removed !== undefined) {
            createdSources[node.source.html] = removed;
            sourceHtmlCache.set(node.source.html, removed);
            if (!createdNodeIds.has(nodeId)) markUpdated(nodeId);
          }
        }
      }
      if (!createdNodeIds.has(nodeId)) {
        for (const [routeIndex, link] of desiredLinks.entries()) {
          const oldActionButton = oldSection?.canvasSnapshot?.storyButtons?.find(
            (button) => link.action && button.beatId === link.action.id,
          );
          const signalId = canUpdateExits
            ? exits[routeIndex]?.id
            : oldActionButton?.signal ?? exits.find((exit) =>
              exit.targetSectionId === link.toSectionId &&
              exit.label === playableStoryTreeExitLabel(link.label, treeSections.get(link.toSectionId)?.title),
            )?.id;
          if (!signalId) continue;
          const previousButton = oldSection?.canvasSnapshot?.storyButtons?.find(
            (button) => button.signal === signalId,
          );
          if (!previousButton) continue;
          const actionBeat = link.action;
          if (!storyActionChanged(
            oldSection,
            section,
            previousButton.beatId,
            actionBeat?.id,
          )) continue;
          const html = await sourceHtml(node);
          const configured = updateManagedStoryButton(
            html,
            signalId,
            actionBeat?.id,
            actionBeat?.kind === "operation"
              ? storyTreeOperationMotion(actionBeat, signalId)
              : undefined,
          );
          if (configured !== undefined && configured !== html) {
            createdSources[node.source.html] = configured;
            sourceHtmlCache.set(node.source.html, configured);
            markUpdated(nodeId);
            const newText = actionBeat
              ? storyTreeActionLabel(actionBeat)
              : storyExitButtonText(
                link.label,
                treeSections.get(link.toSectionId)?.title,
              );
            const relabeled = replacePlayableSignalButtonText(
              configured,
              node.source.html,
              signalId,
              newText,
            );
            if (relabeled && relabeled !== configured) {
              createdSources[node.source.html] = relabeled;
              sourceHtmlCache.set(node.source.html, relabeled);
            }
          }
        }
      }
      const contentSync = syncPlayableStoryTreeContent(
        await sourceHtml(node),
        section.id,
        createdNodeIds.has(nodeId) ? undefined : oldSection,
        section,
        createdNodeIds.has(nodeId) ? [] : oldSection?.canvasSnapshot?.beats,
        confirmOverwrite,
      );
      if (contentSync.changed) {
        createdSources[node.source.html] = contentSync.html;
        sourceHtmlCache.set(node.source.html, contentSync.html);
        if (!createdNodeIds.has(nodeId)) markUpdated(nodeId);
      }
      const videoAssignment =
        mode === "generate" ? nodeVideoAssignments[section.id] : undefined;
      if (videoAssignment) {
        const html = await sourceHtml(node);
        const backdropState = playableBackdrop(html);
        if (backdropState === "missing") {
          const declared = addPlayableNodeAsset(graph, node.id, {
            name: videoAssignment.name,
            type: "video",
            source: {
              kind: "library",
              assetId: videoAssignment.assetId,
            },
          });
          graph = declared.graph;
          node = graph.nodes.find((candidate) => candidate.id === nodeId)!;
          const withVideo = setPlayableBackdrop(
            html,
            declared.assetId,
            "video",
          );
          if (withVideo === undefined) {
            result.skippedVideoAssignments += 1;
          } else {
            createdSources[node.source.html] = withVideo;
            sourceHtmlCache.set(node.source.html, withVideo);
            result.addedVideos += 1;
            if (!createdNodeIds.has(nodeId)) markUpdated(nodeId);
          }
        } else if (backdropState === undefined) {
          result.skippedVideoAssignments += 1;
        }
      }
      targetSection.canvasNodeId = nodeId;
      targetSection.canvasSnapshot = {
        title: node.title,
        exits,
        beats: contentSync.beats,
        storyButtons: storyButtonSnapshots(
          await sourceHtml(node),
          exits.map((exit) => exit.id),
        ),
      };
      if (newlyCreated.has(section.id) && index === 0 && codebase.graph.nodes.length === 0) {
        graph.entryNodeId = nodeId;
      }
    }

    const incomingEntryNodeId = incomingEntrySection
      ? nodeIds.get(incomingEntrySection.id)
      : undefined;
    if (
      mode === "update" &&
      incomingEntryNodeId &&
      previousEntrySection?.canvasNodeId &&
      graph.entryNodeId === previousEntrySection.canvasNodeId &&
      incomingEntryNodeId !== previousEntrySection.canvasNodeId
    ) {
      graph.entryNodeId = incomingEntryNodeId;
      if (!createdNodeIds.has(incomingEntryNodeId)) {
        markUpdated(incomingEntryNodeId);
      }
    }

    const storyTreePositions = layoutPlayableStoryTreeNodes({
      sections,
      links: incomingTree.links,
      nodeIds,
      newNodeIds: createdNodeIds,
      fixedPositions: Object.fromEntries(
        Object.entries(layout.nodes).filter(([nodeId]) => !createdNodeIds.has(nodeId)),
      ),
      entryNodeId: graph.entryNodeId,
      viewport: graph.viewport,
    });
    Object.assign(layout.nodes, storyTreePositions);

    if (graph.nodes.length > 500) {
      throw new NodeCodebaseError("The project cannot contain more than 500 scenes.");
    }
    if (graph.edges.length > 2_000) {
      throw new NodeCodebaseError("The project cannot contain more than 2,000 connections.");
    }
    if (graph.nodes.some((node) => node.signals.length > 100)) {
      throw new NodeCodebaseError("A Scene cannot contain more than 100 Exits.");
    }

    result.applied = true;
    result.tree = mode === "update"
      ? finalizePlayableStoryTreeRemovals(nextTree)
      : nextTree;
    return {
      graph: withPlayableEntry(graph),
      editorLayout: layout,
      sources: createdSources,
    };
  }, async () => {
    if (result.applied && result.tree) await persistTree?.(result.tree);
  });
  return result;
}

function storyNodeId(sectionId: string, index: number): string {
  const slug = sectionId
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return (`story-${slug || `scene-${index + 1}`}`).slice(0, 120);
}

function uniqueStoryNodeId(base: string, taken: ReadonlySet<string>): string {
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) {
    id = `${base.slice(0, 120 - String(suffix).length - 1)}-${suffix}`;
  }
  return id;
}

function storySignalId(linkId: string): string {
  const slug = linkId
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `story-${(slug || "exit").slice(0, 110)}`;
}

function uniqueStorySignalId(base: string, taken: ReadonlySet<string>): string {
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) {
    id = `${base.slice(0, 120 - String(suffix).length - 1)}-${suffix}`;
  }
  return id;
}

function storyExitButtonText(label: string, targetTitle?: string): string {
  const normalized = label.trim();
  return (isGenericStoryExitLabel(normalized)
    ? targetTitle || normalized || "继续"
    : normalized).slice(0, MAX_TITLE_LENGTH);
}

function isGenericStoryExitLabel(label: string): boolean {
  return !label || ["继续", "下一集", "主线汇合"].includes(label);
}

function storyTreeActionLabel(
  beat: PlayableStoryTreeSection["beats"][number],
): string {
  return beat.text
    .replace(/^(?:选项|选择|操作)\s*(?:[A-Z]\s*\d*|[一二三四五六七八九十\d]+)?\s*[:：、.．-]?\s*/u, "")
    .trim()
    .slice(0, MAX_TITLE_LENGTH) || beat.text.slice(0, MAX_TITLE_LENGTH);
}

function markStoryTreeButton(
  html: string,
  buttonId: string,
  beatId?: string,
): string {
  const escapedId = buttonId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opening = new RegExp(
    `<button\\b(?=[^>]*\\bid=(["'])${escapedId}\\1)[^>]*>`,
    "i",
  );
  return html.replace(opening, (tag) =>
    `${tag.slice(0, -1)} data-putenggame-story-tree-generated="true"${beatId ? ` data-putenggame-story-tree-beat-id="${escapeStoryAttribute(beatId)}"` : ""}>`,
  );
}

function markStoryTreeButtonBySignal(
  html: string,
  signalId: string,
  beatId?: string,
): string {
  const escapedSignal = signalId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opening = new RegExp(
    `<button\\b(?=[^>]*\\bdata-signal=(["'])${escapedSignal}\\1)[^>]*>`,
    "i",
  );
  return html.replace(opening, (tag) => {
    const cleaned = tag
      .replace(/\sdata-putenggame-story-tree-generated=(["'])[^"']*\1/gi, "")
      .replace(/\sdata-putenggame-story-tree-beat-id=(["'])[^"']*\1/gi, "");
    return `${cleaned.slice(0, -1)} data-putenggame-story-tree-generated="true"${beatId ? ` data-putenggame-story-tree-beat-id="${escapeStoryAttribute(beatId)}"` : ""}>`;
  });
}

function updateManagedStoryButton(
  html: string,
  signalId: string,
  beatId: string | undefined,
  config: PlayableMotionConfig | undefined,
): string | undefined {
  const button = findManagedStoryButtonBounds(html, signalId);
  if (!button) return undefined;
  let openingTag = html.slice(button.start, button.openEnd);
  const operationAttributes = [
    PLAYABLE_MOTION_ATTRIBUTES.kind,
    PLAYABLE_MOTION_ATTRIBUTES.mode,
    PLAYABLE_MOTION_ATTRIBUTES.duration,
    PLAYABLE_MOTION_ATTRIBUTES.timeoutDuration,
    PLAYABLE_MOTION_ATTRIBUTES.signal,
    PLAYABLE_MOTION_ATTRIBUTES.timeoutSignal,
    PLAYABLE_MOTION_ATTRIBUTES.interaction,
    PLAYABLE_MOTION_ATTRIBUTES.requiredCount,
  ];
  openingTag = openingTag.replace(
    new RegExp(
      `\\s(?:${operationAttributes.map((attribute) => attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})=(?:"[^"]*"|'[^']*'|[^\\s>]+)`,
      "gi",
    ),
    "",
  ).replace(/\sdata-putenggame-story-tree-beat-id=(["'])[^"']*\1/gi, "");
  if (beatId) {
    openingTag = `${openingTag.slice(0, -1)} data-putenggame-story-tree-beat-id="${escapeStoryAttribute(beatId)}">`;
  }
  if (config) {
    const attributes = motionAttributes(config)
      .split(/\s+/u)
      .filter((attribute) => operationAttributes.includes(
        attribute.slice(0, attribute.indexOf("=")) as typeof operationAttributes[number],
      ));
    if (attributes.length) {
      openingTag = `${openingTag.slice(0, -1)} ${attributes.join(" ")}>`;
    }
  }
  return `${html.slice(0, button.start)}${openingTag}${html.slice(button.openEnd, button.end)}${html.slice(button.end)}`;
}

function findManagedStoryButton(
  html: string,
  signalId: string,
): string | undefined {
  const button = findManagedStoryButtonBounds(html, signalId);
  return button ? html.slice(button.start, button.end) : undefined;
}

function findManagedStoryButtonBounds(
  html: string,
  signalId: string,
): { start: number; openEnd: number; end: number } | undefined {
  const escapedSignal = signalId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opening = new RegExp(
    `<button\\b(?=[^>]*\\bdata-signal=(["'])${escapedSignal}\\1)(?=[^>]*\\bdata-putenggame-story-tree-generated=(["'])true\\2)[^>]*>`,
    "i",
  ).exec(html);
  if (!opening || opening.index === undefined) return undefined;
  const openEnd = opening.index + opening[0].length;
  const closing = /<\/button\s*>/gi;
  closing.lastIndex = openEnd;
  const closeMatch = closing.exec(html);
  if (!closeMatch || closeMatch.index === undefined) return undefined;
  return {
    start: opening.index,
    openEnd,
    end: closeMatch.index + closeMatch[0].length,
  };
}

function removeManagedStoryButton(
  html: string,
  signalId: string,
): string | undefined {
  const button = findManagedStoryButtonBounds(html, signalId);
  if (!button) return undefined;
  return `${html.slice(0, button.start)}${html.slice(button.end)}`;
}

function storyButtonSnapshots(
  html: string,
  signals: readonly string[],
): NonNullable<PlayableStoryTree["chapters"][number]["episodes"][number]["sections"][number]["canvasSnapshot"]>["storyButtons"] {
  return signals.flatMap((signal) => {
    const markup = findManagedStoryButton(html, signal);
    if (!markup) return [];
    const beatId = /\bdata-putenggame-story-tree-beat-id=(["'])([^"']+)\1/i.exec(markup)?.[2];
    return [{
      signal,
      ...(beatId ? { beatId } : {}),
      signature: fingerprint(markup),
    }];
  });
}

function storyActionChanged(
  previousSection: PlayableStoryTreeSection | undefined,
  nextSection: PlayableStoryTreeSection,
  previousBeatId: string | undefined,
  nextBeatId: string | undefined,
): boolean {
  if (previousBeatId !== nextBeatId) return Boolean(previousBeatId || nextBeatId);
  if (!previousBeatId) return false;
  const previousBeat = previousSection?.beats.find((beat) => beat.id === previousBeatId);
  const nextBeat = nextSection.beats.find((beat) => beat.id === nextBeatId);
  return previousBeat?.kind !== nextBeat?.kind ||
    previousBeat?.text !== nextBeat?.text;
}

function escapeStoryAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlHasSignal(html: string, signalId: string): boolean {
  const escaped = signalId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\bdata-signal=(["'])${escaped}\\1`, "i").test(html);
}

function findReusableStoryButtonSignal(
  signals: readonly PlayableSignal[],
  html: string,
  assigned: ReadonlySet<string>,
  linkLabel: string,
  targetTitle: string | undefined,
  routeIndex: number,
  routeCount: number,
): string | undefined {
  const candidates = signals.filter(
    (signal) =>
      signal.role !== "navigation" &&
      !assigned.has(signal.id) &&
      htmlHasSignal(html, signal.id),
  );
  const labels = new Set(
    [linkLabel, targetTitle]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLocaleLowerCase()),
  );
  const matchingLabel = candidates.find((signal) =>
    labels.has(signal.label.trim().toLocaleLowerCase()),
  );
  if (matchingLabel) return matchingLabel.id;

  const letter = String.fromCharCode("a".charCodeAt(0) + routeIndex);
  const option = candidates.find(
    (signal) =>
      signal.id === `option-${letter}` &&
      /^option\s+[a-z]$/i.test(signal.label.trim()),
  );
  if (option && routeCount > 0) return option.id;
  return undefined;
}

function uniqueStoryButtonId(signalId: string, html: string): string {
  const base = `putenggame-button-${signalId}`;
  let id = base;
  for (let suffix = 2; html.includes(`id="${id}"`); suffix += 1) {
    id = `${base}-${suffix}`;
  }
  return id;
}

function storyExitButtonPosition(
  index: number,
  count: number,
): { x: number; y: number } {
  const row = Math.floor(index / 4);
  const column = index % 4;
  const columns = Math.min(4, count - row * 4);
  return {
    x: columns === 1 ? 50 : 18 + (64 * column) / (columns - 1),
    y: Math.max(8, 84 - row * 14),
  };
}

function compareExitTarget(
  left: { label: string; targetSectionId: string },
  right: { label: string; targetSectionId: string },
): number {
  return left.targetSectionId.localeCompare(right.targetSectionId) ||
    left.label.localeCompare(right.label);
}

function sameExitTargets(
  left: readonly { label: string; targetSectionId: string }[],
  right: readonly { label: string; targetSectionId: string }[],
): boolean {
  const normalize = (items: readonly { label: string; targetSectionId: string }[]) =>
    items.map((item) => `${item.label}\0${item.targetSectionId}`).sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function storyActionTargetsMatch(
  snapshot: PlayableStoryTreeCanvasSnapshot,
  routes: readonly StoryTreeGenerationRoute[],
): boolean {
  return routes.every((route) => {
    const beatId = route.action?.id;
    if (!beatId) return true;
    const button = snapshot.storyButtons?.find((item) => item.beatId === beatId);
    const exit = snapshot.exits.find((item) => item.id === button?.signal);
    return exit?.targetSectionId === route.toSectionId;
  });
}

function liveManagedExitsMatch(
  node: { id: string; signals: PlayableSignal[] },
  edges: NodeGraph["edges"],
  exits: readonly { id: string; label: string; targetSectionId: string }[],
  previousTree: PlayableStoryTree | undefined,
): boolean {
  const sections = new Map(
    playableStoryTreeSections(previousTree ?? { version: 1, chapters: [], links: [] })
      .map((section) => [section.id, section]),
  );
  return exits.every((exit) => {
    const signal = node.signals.find((candidate) => candidate.id === exit.id);
    const edge = edges.find(
      (candidate) => candidate.source.nodeId === node.id && candidate.source.signal === exit.id,
    );
    const targetSection = sections.get(exit.targetSectionId);
    if (!targetSection || targetSection.sourceRemoved) {
      return Boolean(signal && signal.label === exit.label && !edge);
    }
    return Boolean(
      signal &&
      edge &&
      signal.label === exit.label &&
      targetSection?.canvasNodeId === edge.targetNodeId,
    );
  });
}

function availableSignalId(signals: readonly PlayableSignal[], used: ReadonlySet<string>, routeIndex: number): string {
  const available = signals.find((signal) => signal.role !== "navigation" && !used.has(signal.id));
  if (available) return available.id;
  return `outcome-${routeIndex + 1}`;
}

function uniqueImportedNodeId(title: string, index: number, taken: readonly string[]): string {
  const base = title
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || `scene-${index + 1}`;
  const existing = new Set(taken);
  let id = base;
  for (let suffix = 2; existing.has(id); suffix += 1) id = `${base}-${suffix}`;
  return id;
}

/** The first free "Node N", counting from the Nodes already in the graph. */
function nextNodeTitle(nodes: readonly { title: string }[]): string {
  const taken = new Set(nodes.map((node) => node.title));
  for (let number = nodes.length + 1; ; number += 1) {
    if (!taken.has(`Node ${number}`)) return `Node ${number}`;
  }
}

