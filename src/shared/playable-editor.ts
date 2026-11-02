import type { NodeGraphValidationIssue } from "./playable-graph-validation.js";
import type {
  NodeGraph,
  PlayableAssetDefinition,
  PlayableAssetType,
  JsonValue,
} from "./playable-nodes.js";
import type { NodePlayerDefinition } from "./playable-player-protocol.js";

export interface PlayableProjectValidationIssue {
  phase: "graph" | "compiler";
  code: NodeGraphValidationIssue["code"] | "invalid-json" | "missing-graph" | string;
  path: string;
  message: string;
  /** Node ID, when the issue belongs to one Node. */
  surfaceId?: string;
}

export interface PlayableProjectValidationResult {
  ok: boolean;
  missing?: boolean;
  issues: PlayableProjectValidationIssue[];
  definition?: NodePlayerDefinition;
}

/** A Preset as offered to the editor's add-node menu. */
export interface PlayablePresetSummary {
  id: string;
  label: string;
  /** One line for the author. */
  summary: string;
}

export interface PlayableAddedNode {
  id: string;
  title: string;
  preset: string;
  files: string[];
  signals: string[];
  brief: string;
}

/** A Variable's value in author words: Yes/No, "empty", "3 items". */
export function describePlayableValue(value: JsonValue): string {
  if (value === null) return "nothing";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value === "" ? "empty" : `"${value}"`;
  if (Array.isArray(value)) return value.length === 0 ? "empty" : value.length === 1 ? "1 item" : `${value.length} items`;
  const size = Object.keys(value).length;
  return size === 0 ? "empty" : size === 1 ? "1 field" : `${size} fields`;
}

export function renamePlayableSignal(
  graph: NodeGraph,
  nodeId: string,
  oldId: string,
  newId: string,
): NodeGraph {
  const next = structuredClone(graph);
  const node = next.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || !newId || node.signals.some((signal) => signal.id === newId && signal.id !== oldId)) {
    return graph;
  }
  node.signals = node.signals.map((signal) => signal.id === oldId ? { ...signal, id: newId } : signal);
  next.edges = next.edges.map((edge) => edge.source.nodeId === nodeId && edge.source.signal === oldId
    ? { ...edge, source: { ...edge.source, signal: newId } }
    : edge);
  return next;
}

export function deletePlayableSignal(
  graph: NodeGraph,
  nodeId: string,
  signalId: string,
): NodeGraph {
  const next = structuredClone(graph);
  const node = next.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return graph;
  node.signals = node.signals.filter((signal) => signal.id !== signalId);
  next.edges = next.edges.filter((edge) => edge.source.nodeId !== nodeId || edge.source.signal !== signalId);
  return next;
}

export function deletePlayableButtonSignals(
  graph: NodeGraph,
  nodeId: string,
  signalId: string,
): NodeGraph {
  if (!/^button-\d+$/.test(signalId))
    return deletePlayableSignal(graph, nodeId, signalId);
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return graph;
  return node.signals
    .filter(
      (signal) =>
        signal.id === signalId ||
        new RegExp(`^${signalId}-failure(?:-\\d+)?$`).test(signal.id),
    )
    .reduce(
      (current, signal) =>
        deletePlayableSignal(current, nodeId, signal.id),
      graph,
    );
}

export function removeOrphanedPlayableButtonSignals(
  graph: NodeGraph,
  nodeId: string,
  html: string,
): NodeGraph {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return graph;
  const presentSignals = new Set<string>();
  for (const match of html.matchAll(
    /\b(?:data-signal|data-putenggame-motion-timeout)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  )) {
    const signal = match[1] ?? match[2] ?? match[3];
    if (signal) presentSignals.add(signal);
  }
  const orphaned = node.signals
    .filter(
      (signal) =>
        /^button-(?:\d+(?:-failure(?:-\d+)?)?|failure(?:-\d+)?)$/.test(signal.id) &&
        !presentSignals.has(signal.id),
    )
    .map((signal) => signal.id);
  const declared = new Set(node.signals.map((signal) => signal.id));
  const missing = [...presentSignals].filter(
    (signalId) =>
      /^button-(?:\d+(?:-failure(?:-\d+)?)?|failure(?:-\d+)?)$/.test(signalId) &&
      !declared.has(signalId),
  );
  if (!orphaned.length && !missing.length) return graph;
  const cleaned = orphaned.reduce(
    (current, signalId) => deletePlayableSignal(current, nodeId, signalId),
    graph,
  );
  const next = structuredClone(cleaned);
  const nextNode = next.nodes.find((candidate) => candidate.id === nodeId)!;
  nextNode.signals.push(
    ...missing.map((signalId) => ({
      id: signalId,
      label:
        signalId.endsWith("-failure") || /-failure-\d+$/.test(signalId)
          ? "按钮失败"
          : "按钮",
    })),
  );
  return next;
}

export function setPlayableSignalLabel(
  graph: NodeGraph,
  nodeId: string,
  signalId: string,
  label: string,
): NodeGraph {
  const next = structuredClone(graph);
  const node = next.nodes.find((candidate) => candidate.id === nodeId);
  const trimmed = label.trim();
  if (!node || !trimmed) return graph;
  node.signals = node.signals.map((signal) => signal.id === signalId ? { ...signal, label: trimmed.slice(0, 120) } : signal);
  return next;
}

/**
 * A new edge's ID: `<source>-<signal>`, which graph.json's ID pattern allows,
 * numbered when another edge already has it.
 */
export function playableEdgeId(edges: readonly { id: string }[], nodeId: string, signalId: string): string {
  const base = `${nodeId}-${signalId}`;
  const taken = new Set(edges.map((edge) => edge.id));
  let id = base;
  for (let index = 2; taken.has(id); index += 1) id = `${base}-${index}`;
  return id;
}

export function playableAssetType(mediaType: string): PlayableAssetType | undefined {
  const kind = mediaType.split("/")[0];
  return kind === "image" || kind === "video" || kind === "audio" ? kind : undefined;
}

/** A readable Asset ID from a file name, unique within `taken`. */
export function playableAssetId(name: string, taken: ReadonlySet<string>): string {
  const slug = name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .slice(0, 100) || "asset";
  if (!taken.has(slug)) return slug;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${slug}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Declares an Asset on a Node. A source the graph already declares keeps its
 * Asset ID, so the same Library file is never declared twice.
 */
export function addPlayableNodeAsset(
  graph: NodeGraph,
  nodeId: string,
  asset: { name: string } & PlayableAssetDefinition,
): { graph: NodeGraph; assetId: string } {
  const declared = addPlayableGraphAsset(graph, asset);
  const next = declared.graph;
  const node = next.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return { graph, assetId: declared.assetId };
  if (!node.assets.includes(declared.assetId)) node.assets.push(declared.assetId);
  return { graph: next, assetId: declared.assetId };
}

/** Declares a graph-wide Asset without adding it to a particular Scene. */
export function addPlayableGraphAsset(
  graph: NodeGraph,
  asset: { name: string } & PlayableAssetDefinition,
): { graph: NodeGraph; assetId: string } {
  const next = structuredClone(graph);
  const existing = Object.entries(next.assets).find(([, definition]) =>
    JSON.stringify(definition.source) === JSON.stringify(asset.source),
  )?.[0];
  const assetId =
    existing ?? playableAssetId(asset.name, new Set(Object.keys(next.assets)));
  if (!existing) next.assets[assetId] = { type: asset.type, source: asset.source };
  return { graph: next, assetId };
}

/** Removes editor-managed HTML references to Assets that no longer exist. */
export function removePlayableAssetReferences(
  html: string,
  assetIds: ReadonlySet<string>,
): string {
  let next = html;
  for (const id of assetIds) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(
      new RegExp(
        `\\s+(?:data-putenggame-asset|data-putenggame-button-asset|data-putenggame-button-pressed-asset|data-asset)\\s*=\\s*(?:"${escaped}"|'${escaped}'|${escaped}(?=[\\s>/]))`,
        "gi",
      ),
      "",
    );
  }
  return next;
}

/** Removes the Asset from the Node, and from the graph once nothing declares it. */
export function removePlayableNodeAsset(graph: NodeGraph, nodeId: string, assetId: string): NodeGraph {
  const next = structuredClone(graph);
  const node = next.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return graph;
  node.assets = node.assets.filter((id) => id !== assetId);
  if (!next.nodes.some((candidate) => candidate.assets.includes(assetId))) delete next.assets[assetId];
  return next;
}

/**
 * Identifies what a preview session runs. Node titles, Signal labels, and the
 * graph title are editor text the Runtime never reads, so renaming them keeps
 * the running preview.
 */
export function playableRuntimeKey(definition: NodePlayerDefinition): string {
  const {
    title: _title,
    nodes,
    settingsButton,
    returnButton,
    buttonSoundAssetId,
    globalFontFamily: _globalFontFamily,
    assets,
    ...graph
  } = definition.graph;
  const sceneAssets = Object.fromEntries(
    Object.entries(assets).filter(
      ([assetId]) =>
        (assetId !== settingsButton?.iconAssetId &&
          assetId !== returnButton?.iconAssetId &&
          assetId !== buttonSoundAssetId) ||
        nodes.some((node) => node.assets.includes(assetId)),
    ),
  );
  return JSON.stringify({
    graph: {
      ...graph,
      assets: sceneAssets,
      nodes: nodes.map(({ title: _nodeTitle, signals, ...node }) => ({
        ...node,
        signals: signals.map((signal) => signal.id),
      })),
    },
    compiled: definition.compiled,
  });
}

/** Node ID to the thumbnail cached for it in `.putenggame/thumbnails/`. */
export type PlayableThumbnailManifest = Record<string, { hash: string; capturedAt: string }>;

/**
 * Identifies what a Node thumbnail shows: the Node's compiled output, the
 * Assets it declares, and the viewport. A cached thumbnail with another hash
 * is stale.
 */
export function playableThumbnailHash(definition: NodePlayerDefinition, nodeId: string): string | undefined {
  const { graph, compiled } = definition;
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  const surface = compiled.nodes[nodeId];
  if (!node || !surface) return undefined;
  const assetIds = [...node.assets].sort();
  return hashText(JSON.stringify({
    node: [surface.html, surface.css, surface.javascript],
    assets: assetIds.map((id) => [id, graph.assets[id] ?? null]),
    viewport: graph.viewport,
  }));
}

/** cyrb53: a fast 53-bit string hash, enough to tell cache entries apart. */
function hashText(text: string): string {
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909);
  return (4294967296 * (2097151 & second) + (first >>> 0)).toString(16).padStart(14, "0");
}
