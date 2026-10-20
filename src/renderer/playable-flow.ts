import { type Edge, type Node } from "@xyflow/react";
import type { NodeCodebase, NodeEditorLayout } from "../shared/playable-codebase.js";
import { withPlayableEntry } from "../shared/playable-graph.js";
import {
  type NodeGraph,
  type NodeSource,
  type PlayableEdge,
  type PlayableAssetDefinition,
  type PlayableNode,
} from "../shared/playable-nodes.js";

export type GraphMeta = Omit<NodeGraph, "nodes" | "edges">;

/** Object type, not an interface, so React Flow accepts it as node data. */
export type PlayableFlowData = {
  node: PlayableNode;
  entry: boolean;
  /** The Story Map counts the Node as an ending, by its `story.ending` or by its Signals. */
  ending: boolean;
  /** Compiler and graph issues that belong to this Node. */
  issues: string[];
  /** Where each connected Signal leads: its edge, the target Scene's title, and whether the edge is selected. */
  connected: Record<string, { edgeId: string; target: string; selected: boolean }>;
  /** The Node does not compile; its card keeps its last good thumbnail, dimmed. */
  failed: boolean;
  /** The cached screenshot of the Node, and whether its source changed since. */
  thumbnail?: { capturedAt: string; stale: boolean };
  /** Shown instead of a thumbnail before the Node was ever previewed. */
  coverAsset?: PlayableAssetDefinition;
};

export type PlayableFlowNode = Node<PlayableFlowData, "playable">;

/** The single place the editor turns canvas state back into files on disk. */
export function buildCodebase(
  meta: GraphMeta,
  nodes: readonly PlayableFlowNode[],
  edges: readonly Edge[],
  layout: NodeEditorLayout,
  view: "canvas" | "code",
): NodeCodebase {
  return {
    graph: withPlayableEntry({
      ...meta,
      nodes: nodes.map((node) => node.data.node),
      edges: edges.flatMap((edge) => toPlayableEdge(edge) ?? []),
    }),
    editorLayout: {
      ...layout,
      view,
      nodes: Object.fromEntries(nodes.map((node) => [node.id, {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      }])),
    },
  };
}

export function toFlowNode(node: PlayableNode, layout: NodeEditorLayout): PlayableFlowNode {
  return createFlowNode(node, layout.nodes[node.id] ?? { x: 80, y: 180 });
}

export function createFlowNode(node: PlayableNode, position: { x: number; y: number }): PlayableFlowNode {
  return {
    id: node.id,
    type: "playable",
    position,
    deletable: true,
    data: { node, entry: false, ending: false, issues: [], connected: {}, failed: false },
  };
}

/** Lays out the entry story from left to right, then places remaining components after it. */
export function arrangePlayableNodes(
  nodes: readonly PlayableFlowNode[],
  edges: readonly Edge[],
  entryNodeId: string,
): Record<string, { x: number; y: number }> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  }
  for (const [source, sourceEdges] of outgoing) {
    const signals = nodeById.get(source)!.data.node.signals;
    sourceEdges.sort((left, right) =>
      signals.findIndex((signal) => signal.id === left.sourceHandle)
      - signals.findIndex((signal) => signal.id === right.sourceHandle),
    );
  }

  const depthById = new Map<string, number>();
  const orderById = new Map<string, number>();
  let nextOrder = 0;
  let maxDepth = -1;
  const visit = (roots: readonly string[], depth: number): number => {
    const queue = roots.filter((id) => !depthById.has(id));
    for (const id of queue) {
      depthById.set(id, depth);
      orderById.set(id, nextOrder++);
    }
    let componentMaxDepth = depth;
    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index]!;
      const nodeDepth = depthById.get(id)!;
      componentMaxDepth = Math.max(componentMaxDepth, nodeDepth);
      for (const edge of outgoing.get(id) ?? []) {
        if (depthById.has(edge.target)) continue;
        depthById.set(edge.target, nodeDepth + 1);
        orderById.set(edge.target, nextOrder++);
        queue.push(edge.target);
      }
    }
    return componentMaxDepth;
  };

  if (nodeById.has(entryNodeId)) maxDepth = visit([entryNodeId], 0);
  let remaining = nodes.filter((node) => !depthById.has(node.id));
  while (remaining.length) {
    const remainingIds = new Set(remaining.map((node) => node.id));
    const hasIncoming = new Set(
      edges
        .filter((edge) => remainingIds.has(edge.target) && remainingIds.has(edge.source))
        .map((edge) => edge.target),
    );
    const roots = remaining
      .filter((node) => !hasIncoming.has(node.id))
      .map((node) => node.id);
    maxDepth = visit(roots.length ? roots : [remaining[0]!.id], maxDepth + 1);
    remaining = nodes.filter((node) => !depthById.has(node.id));
  }

  const columns = new Map<number, PlayableFlowNode[]>();
  for (const node of nodes) {
    const depth = depthById.get(node.id) ?? 0;
    columns.set(depth, [...(columns.get(depth) ?? []), node]);
  }
  for (const column of columns.values()) {
    column.sort((left, right) => orderById.get(left.id)! - orderById.get(right.id)!);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  let x = 80;
  for (const depth of [...columns.keys()].sort((left, right) => left - right)) {
    const column = columns.get(depth)!;
    let y = 80;
    let width = 0;
    for (const node of column) {
      const nodeWidth = node.measured?.width ?? node.width ?? 280;
      const nodeHeight = node.measured?.height ?? node.height ?? 220;
      width = Math.max(width, nodeWidth);
      positions[node.id] = { x, y };
      y += nodeHeight + 80;
    }
    x += width + 180;
  }
  return positions;
}

export function toFlowEdge(edge: PlayableEdge): Edge {
  return {
    id: edge.id,
    type: "playable",
    source: edge.source.nodeId,
    sourceHandle: edge.source.signal,
    target: edge.targetNodeId,
    data: { mode: edge.mode },
    ...(edge.mode === "push" ? { label: "↩ Back", className: "playable-edge-push" } : {}),
  };
}

export function toPlayableEdge(edge: Edge): PlayableEdge | undefined {
  if (!edge.sourceHandle) return undefined;
  return {
    id: edge.id,
    source: { nodeId: edge.source, signal: edge.sourceHandle },
    targetNodeId: edge.target,
    mode: edge.data?.mode === "push" ? "push" : "replace",
  };
}

export function nodeSourcePaths(id: string): NodeSource {
  return {
    html: `nodes/${id}/index.html`,
    css: `nodes/${id}/style.css`,
    javascript: `nodes/${id}/node.js`,
  };
}

export function uniqueNodeId(base: string, taken: ReadonlySet<string>): string {
  const slug = base.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[-_]+|[-_]+$/g, "") || "node";
  if (!taken.has(slug)) return slug;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${slug}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Compiler issues carry a file path; the owning Node is the one that wrote it. */
export function nodeIdForIssuePath(path: string, nodes: readonly PlayableFlowNode[]): string | undefined {
  return nodes.find((node) => path === node.data.node.source.html
    || path === node.data.node.source.css
    || path === node.data.node.source.javascript
    || path.startsWith(`nodes/${node.id}/`))?.id;
}
