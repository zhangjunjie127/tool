import {
  changeNodeCodebase,
  NodeCodebaseError,
  readNodeCodebase,
} from "./playable-codebase.js";
import { playablePreset, PLAYABLE_PRESET_IDS } from "./playable-presets.js";
import { freePlayablePosition, type NodeEditorLayout } from "../shared/playable-codebase.js";
import { withPlayableEntry } from "../shared/playable-graph.js";
import { playableEdgeId } from "../shared/playable-editor.js";
import type { PlayableNavigationMode, PlayableSignal } from "../shared/playable-nodes.js";
import { setPlayableNoInputMode } from "../shared/playable-motion.js";

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
  if (!request.scenes.length || request.scenes.length > 100) {
    throw new NodeCodebaseError("A script must contain between 1 and 100 scenes.");
  }
  const normalized = request.scenes.map((scene, index) => {
    const preset = playablePreset(scene.preset);
    if (!preset) throw new NodeCodebaseError(`Unknown Preset "${scene.preset}" at scene ${index + 1}.`);
    const title = scene.title.trim().slice(0, MAX_TITLE_LENGTH);
    if (!title) throw new NodeCodebaseError(`Scene ${index + 1} needs a title.`);
    return { ...scene, preset: preset.id, title };
  });

  const added: AddPlayableNodeResult[] = [];
  const existing = await readNodeCodebase(workspacePath);
  const takenIds = existing.graph.nodes.map((node) => node.id);
  for (const [index, scene] of normalized.entries()) {
    const id = uniqueImportedNodeId(scene.title, index, [...takenIds, ...added.map((node) => node.id)]);
    added.push(await addPlayableNode(workspacePath, {
      preset: scene.preset,
      id,
      title: scene.title,
    }));
  }

  const edges: ImportPlayableScriptResult["edges"] = [];
  await changeNodeCodebase(workspacePath, (codebase) => {
    const nodes = codebase.graph.nodes.map((node) => ({ ...node, signals: node.signals.map((signal) => ({ ...signal })) }));
    const graphEdges = [...codebase.graph.edges];
    for (const [index, scene] of normalized.entries()) {
      const source = nodes.find((node) => node.id === added[index]!.id);
      if (!source) throw new NodeCodebaseError(`Imported scene ${index + 1} was not found after creation.`);
      const routes = scene.outgoing ?? (index < normalized.length - 1 ? [{ target: index + 2 }] : []);
      const usedSignals = new Set(graphEdges.filter((edge) => edge.source.nodeId === source.id).map((edge) => edge.source.signal));
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
          id: playableEdgeId(graphEdges, source.id, signal.id),
          source: { nodeId: source.id, signal: signal.id },
          targetNodeId: target.id,
          mode: route.mode ?? "replace",
        };
        graphEdges.push(edge);
        edges.push({ source: source.id, signal: signal.id, target: target.id });
      }
    }
    return {
      graph: withPlayableEntry({ ...codebase.graph, nodes, edges: graphEdges }),
      editorLayout: codebase.editorLayout,
    };
  });
  return { nodes: added.map((node) => ({ id: node.id, title: node.title, preset: node.preset })), edges };
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

