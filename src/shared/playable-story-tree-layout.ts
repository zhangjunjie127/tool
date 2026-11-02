import type {
  PlayableStoryTreeLink,
  PlayableStoryTreeSection,
} from "./playable-story-tree.js";

type Position = { x: number; y: number };

const NODE_STAGE_WIDTH = 440;
const NODE_LABEL_HEIGHT = 28;
const NODE_GAP = 140;
const CANVAS_ORIGIN = 80;

/**
 * Positions only newly created canvas Nodes. Existing Nodes are treated as
 * fixed obstacles; confirmed and provisional tree links both guide the layout.
 */
export function layoutPlayableStoryTreeNodes({
  sections,
  links,
  nodeIds,
  newNodeIds,
  fixedPositions,
  entryNodeId,
  viewport,
}: {
  sections: readonly PlayableStoryTreeSection[];
  links: readonly PlayableStoryTreeLink[];
  nodeIds: ReadonlyMap<string, string>;
  newNodeIds: ReadonlySet<string>;
  fixedPositions: Readonly<Record<string, Position>>;
  entryNodeId?: string;
  viewport: { width: number; height: number };
}): Record<string, Position> {
  const activeSections = sections.filter(
    (section) => !section.sourceRemoved && nodeIds.has(section.id),
  );
  if (!activeSections.length || !newNodeIds.size) return {};

  const sectionOrder = new Map(
    activeSections.map((section, index) => [section.id, index]),
  );
  const routes = new Map<string, string[]>();
  const incoming = new Set<string>();
  for (const link of links) {
    if (
      !sectionOrder.has(link.fromSectionId) ||
      !sectionOrder.has(link.toSectionId)
    )
      continue;
    const targets = routes.get(link.fromSectionId) ?? [];
    if (!targets.includes(link.toSectionId)) targets.push(link.toSectionId);
    routes.set(link.fromSectionId, targets);
    incoming.add(link.toSectionId);
  }
  for (const targets of routes.values()) {
    targets.sort(
      (left, right) => sectionOrder.get(left)! - sectionOrder.get(right)!,
    );
  }

  const entrySection = activeSections.find(
    (section) => nodeIds.get(section.id) === entryNodeId,
  );
  const firstRoot =
    entrySection ??
    activeSections.find((section) => !incoming.has(section.id)) ??
    activeSections[0]!;
  const outgoing = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  const componentBySection = new Map<string, number>();
  const components: string[][] = [];
  const visiting = new Set<string>();
  const visit = (source: string, component: number, ordered: string[]) => {
    componentBySection.set(source, component);
    visiting.add(source);
    const targets: string[] = [];
    for (const target of routes.get(source) ?? []) {
      // Return links remain in the graph but must not create layout cycles.
      if (visiting.has(target)) continue;
      const targetComponent = componentBySection.get(target);
      if (targetComponent !== undefined && targetComponent !== component) continue;
      if (targetComponent === undefined) visit(target, component, ordered);
      targets.push(target);
      parents.set(target, [...(parents.get(target) ?? []), source]);
    }
    outgoing.set(source, targets);
    visiting.delete(source);
    ordered.push(source);
  };
  const roots = [
    firstRoot,
    ...activeSections.filter((section) => !incoming.has(section.id)),
    ...activeSections,
  ];
  for (const root of roots) {
    if (componentBySection.has(root.id)) continue;
    const ordered: string[] = [];
    visit(root.id, components.length, ordered);
    components.push(ordered.reverse());
  }

  const depthBySection = new Map<string, number>();
  const pathBySection = new Map<string, string[]>();
  let nextDepth = 0;
  for (const component of components) {
    for (const id of component) {
      const predecessors = parents.get(id) ?? [];
      depthBySection.set(id, predecessors.length
        ? Math.max(...predecessors.map((parent) => depthBySection.get(parent)!)) + 1
        : nextDepth);
      const paths = predecessors.map((parent) => {
        const branchPath = pathBySection.get(parent)!;
        return (outgoing.get(parent)?.length ?? 0) > 1
          ? [...branchPath, id]
          : branchPath;
      });
      // The common branch ancestry restores the correct axis at each merge,
      // including nested branches; ordinary continuations retain their lane.
      const common = [...(paths[0] ?? [])];
      for (const branchPath of paths.slice(1)) {
        let length = 0;
        while (length < common.length && common[length] === branchPath[length]) length += 1;
        common.length = length;
      }
      pathBySection.set(id, common);
    }
    nextDepth = Math.max(...depthBySection.values()) + 1;
  }

  type Lane = { path: string[]; first: number; last: number; row: number };
  const lanes = new Map<string, Lane>();
  for (const [id, branchPath] of pathBySection) {
    for (let length = 1; length <= branchPath.length; length += 1) {
      const prefix = branchPath.slice(0, length);
      const key = JSON.stringify(prefix);
      const depth = depthBySection.get(id)!;
      const lane = lanes.get(key) ?? { path: prefix, first: depth, last: depth, row: 0 };
      lane.first = Math.min(lane.first, depth);
      lane.last = Math.max(lane.last, depth);
      lanes.set(key, lane);
    }
  }
  const sortedLanes = [...lanes.values()].sort((left, right) => {
    for (let index = 0; index < Math.min(left.path.length, right.path.length); index += 1) {
      const delta = sectionOrder.get(left.path[index]!)! - sectionOrder.get(right.path[index]!)!;
      if (delta) return delta;
    }
    return left.path.length - right.path.length;
  });
  const placedLanes: Lane[] = [];
  for (const lane of sortedLanes) {
    const parent = lanes.get(JSON.stringify(lane.path.slice(0, -1)));
    lane.row = (parent?.row ?? -1) + 1;
    while (placedLanes.some((other) =>
      other.row === lane.row && other.first <= lane.last && lane.first <= other.last,
    )) lane.row += 1;
    placedLanes.push(lane);
  }
  const rowBySection = new Map([...pathBySection].map(([id, branchPath]) => [
    id, lanes.get(JSON.stringify(branchPath))?.row ?? 0,
  ]));

  const aspect = viewport.width / Math.max(1, viewport.height);
  const nodeWidth = NODE_STAGE_WIDTH * Math.min(1, aspect);
  const nodeHeight = NODE_STAGE_WIDTH / Math.max(1, aspect) + NODE_LABEL_HEIGHT;
  const columnStep = nodeWidth + NODE_GAP;
  const rowStep = nodeHeight + NODE_GAP;
  const occupied = Object.values(fixedPositions).map((position) => ({
    ...position,
  }));
  const actualPositionsBySection = new Map<string, Position>();
  for (const section of activeSections) {
    const nodeId = nodeIds.get(section.id)!;
    const fixedPosition = fixedPositions[nodeId];
    if (fixedPosition) actualPositionsBySection.set(section.id, fixedPosition);
  }
  const componentOrigins = components.map((component) => {
    const anchor = component.find((id) =>
      pathBySection.get(id)?.length === 0 && actualPositionsBySection.has(id),
    ) ??
      component.find((id) => actualPositionsBySection.has(id));
    if (!anchor) return undefined;
    const position = actualPositionsBySection.get(anchor)!;
    return {
      x: position.x - depthBySection.get(anchor)! * columnStep,
      y: position.y - rowBySection.get(anchor)! * rowStep,
    };
  });
  const mainY = componentOrigins.find((origin) => origin !== undefined)?.y ?? CANVAS_ORIGIN;
  const componentRight = new Map<number, number>();
  for (const [id, position] of actualPositionsBySection) {
    const component = componentBySection.get(id)!;
    componentRight.set(component, Math.max(componentRight.get(component) ?? -Infinity, position.x));
  }
  const positions: Record<string, Position> = {};
  const newSections = activeSections
    .filter((section) => {
      const nodeId = nodeIds.get(section.id);
      return Boolean(nodeId && newNodeIds.has(nodeId));
    })
    .sort(
      (left, right) =>
        depthBySection.get(left.id)! - depthBySection.get(right.id)! ||
        rowBySection.get(left.id)! - rowBySection.get(right.id)! ||
        sectionOrder.get(left.id)! - sectionOrder.get(right.id)!,
    );

  for (const section of newSections) {
    const nodeId = nodeIds.get(section.id)!;
    const component = componentBySection.get(section.id)!;
    const origin = componentOrigins[component] ?? { x: CANVAS_ORIGIN, y: mainY };
    const predecessors = parents.get(section.id) ?? [];
    const position = {
      x: Math.max(
        origin.x + depthBySection.get(section.id)! * columnStep,
        ...predecessors.map((parent) => actualPositionsBySection.get(parent)!.x + columnStep),
      ),
      y: origin.y + rowBySection.get(section.id)! * rowStep,
    };
    if (!predecessors.length && !componentOrigins[component]) {
      for (const [earlier, right] of componentRight) {
        if (earlier < component) position.x = Math.max(position.x, right + columnStep);
      }
    }
    while (
      occupied.some((other) =>
        overlapsWithGap(position, other, nodeWidth, nodeHeight),
      )
    ) {
      position.x += columnStep;
    }
    positions[nodeId] = position;
    actualPositionsBySection.set(section.id, position);
    occupied.push(position);
    componentRight.set(component, Math.max(componentRight.get(component) ?? -Infinity, position.x));
  }

  return positions;
}

function overlapsWithGap(
  left: Position,
  right: Position,
  width: number,
  height: number,
): boolean {
  return !(
    left.x + width + NODE_GAP <= right.x ||
    right.x + width + NODE_GAP <= left.x ||
    left.y + height + NODE_GAP <= right.y ||
    right.y + height + NODE_GAP <= left.y
  );
}
