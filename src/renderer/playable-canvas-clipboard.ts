import type { Edge } from "@xyflow/react";
import { snapCanvasPosition } from "./canvas-alignment.js";
import { nodeSourcePaths, type PlayableFlowNode } from "./playable-flow.js";
import { playableEdgeId } from "../shared/playable-editor.js";
import type { NodeSource, PlayableNode } from "../shared/playable-nodes.js";

export interface CopiedPlayableNode {
  node: PlayableNode;
  position: { x: number; y: number };
  sources: Record<string, string>;
}

export interface CopiedPlayableSelection {
  format: "putenggame/playable-nodes";
  version: 1;
  nodes: CopiedPlayableNode[];
  edges: Edge[];
}

export interface DuplicatedPlayableSelection {
  nodes: CopiedPlayableNode[];
  edges: Edge[];
}

export function createPlayableClipboard(
  nodes: readonly PlayableFlowNode[],
  edges: readonly Edge[],
  sources: Readonly<Record<string, Record<string, string>>>,
): CopiedPlayableSelection {
  const selected = nodes.filter((node) => node.selected);
  const ids = new Set(selected.map((node) => node.id));
  return {
    format: "putenggame/playable-nodes",
    version: 1,
    nodes: selected.map((flowNode) => ({
      node: structuredClone(flowNode.data.node),
      position: { ...flowNode.position },
      sources: structuredClone(sources[flowNode.id] ?? {}),
    })),
    edges: edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) => structuredClone(edge)),
  };
}

export function parsePlayableClipboard(text: string): CopiedPlayableSelection | undefined {
  if (text.length > 8 * 1024 * 1024) return undefined;
  try {
    const value = JSON.parse(text) as CopiedPlayableSelection;
    if (
      value?.format !== "putenggame/playable-nodes" ||
      value.version !== 1 ||
      !Array.isArray(value.nodes) ||
      value.nodes.length === 0 ||
      !Array.isArray(value.edges)
    ) return undefined;
    if (value.nodes.some((item) => !item?.node?.id || !Number.isFinite(item.position?.x) || !Number.isFinite(item.position?.y))) return undefined;
    return structuredClone(value);
  } catch {
    return undefined;
  }
}

export function duplicatePlayableSelection(
  copy: CopiedPlayableSelection,
  position: { x: number; y: number },
  takenNodeIds: ReadonlySet<string>,
  takenEdgeIds: ReadonlySet<string>,
): DuplicatedPlayableSelection {
  if (!copy.nodes.length) return { nodes: [], edges: [] };
  const nodeIds = new Map<string, string>();
  const usedNodeIds = new Set(takenNodeIds);
  for (const item of copy.nodes) {
    const id = uniqueNodeId(item.node.id, usedNodeIds);
    usedNodeIds.add(id);
    nodeIds.set(item.node.id, id);
  }

  const left = Math.min(...copy.nodes.map((item) => item.position.x));
  const top = Math.min(...copy.nodes.map((item) => item.position.y));
  const nodes = copy.nodes.map((item) => {
    const id = nodeIds.get(item.node.id)!;
    const source = nodeSourcePaths(id);
    return {
      node: { ...structuredClone(item.node), id, source },
      position: snapCanvasPosition({
        x: position.x + item.position.x - left,
        y: position.y + item.position.y - top,
      }),
      sources: remapSources(item.node.source, source, item.sources),
    };
  });

  const usedEdgeIds = new Set(takenEdgeIds);
  const edges = copy.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => {
      const source = nodeIds.get(edge.source)!;
      const id = edge.sourceHandle
        ? playableEdgeId([...usedEdgeIds].map((value) => ({ id: value })), source, edge.sourceHandle)
        : uniqueEdgeId(edge.id, usedEdgeIds);
      usedEdgeIds.add(id);
      return {
        ...structuredClone(edge),
        id,
        source,
        target: nodeIds.get(edge.target)!,
        selected: false,
      };
    });
  return { nodes, edges };
}

function remapSources(
  previous: NodeSource,
  next: NodeSource,
  sources: Record<string, string>,
): Record<string, string> {
  const paths = new Map([
    [previous.html, next.html],
    [previous.css, next.css],
    [previous.javascript, next.javascript],
  ]);
  return Object.fromEntries(
    Object.entries(sources).map(([path, content]) => [paths.get(path) ?? path, content]),
  );
}

function uniqueNodeId(base: string, taken: ReadonlySet<string>): string {
  const slug = base.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[-_]+|[-_]+$/g, "") || "node";
  if (!taken.has(slug)) return slug;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${slug}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function uniqueEdgeId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
