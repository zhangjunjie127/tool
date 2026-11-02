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
 * fixed obstacles; suggested tree links guide the layout but never create edges.
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
  const outgoing = new Map<string, string[]>();
  const parentBySection = new Map<string, string>();
  const branchOffsetBySection = new Map<string, number>();
  const incoming = new Set<string>();
  for (const link of links) {
    if (
      !sectionOrder.has(link.fromSectionId) ||
      !sectionOrder.has(link.toSectionId)
    )
      continue;
    outgoing.set(link.fromSectionId, [
      ...(outgoing.get(link.fromSectionId) ?? []),
      link.toSectionId,
    ]);
    incoming.add(link.toSectionId);
  }
  for (const targets of outgoing.values()) {
    targets.sort(
      (left, right) => sectionOrder.get(left)! - sectionOrder.get(right)!,
    );
  }

  const depthBySection = new Map<string, number>();
  const rowBySection = new Map<string, number>();
  let nextRow = 1;
  const visitComponent = (
    root: string,
    startDepth: number,
    startRow: number,
  ) => {
    depthBySection.set(root, startDepth);
    rowBySection.set(root, startRow);
    const queue = [root];
    for (let index = 0; index < queue.length; index += 1) {
      const source = queue[index]!;
      const targets = (outgoing.get(source) ?? []).filter(
        (target) => !depthBySection.has(target),
      );
      for (const [targetIndex, target] of targets.entries()) {
        const branchOffset = targets.length > 1 ? targetIndex + 1 : 0;
        depthBySection.set(target, depthBySection.get(source)! + 1);
        rowBySection.set(target, rowBySection.get(source)! + branchOffset);
        parentBySection.set(target, source);
        branchOffsetBySection.set(target, branchOffset);
        if (branchOffset > 0)
          nextRow = Math.max(nextRow, rowBySection.get(target)! + 1);
        queue.push(target);
      }
    }
  };

  const entrySection = activeSections.find(
    (section) => nodeIds.get(section.id) === entryNodeId,
  );
  const firstRoot =
    entrySection ??
    activeSections.find((section) => !incoming.has(section.id)) ??
    activeSections[0]!;
  visitComponent(firstRoot.id, 0, 0);

  while (depthBySection.size < activeSections.length) {
    const remaining = activeSections.filter(
      (section) => !depthBySection.has(section.id),
    );
    const root =
      remaining.find(
        (section) =>
          !remaining.some((candidate) =>
            (outgoing.get(candidate.id) ?? []).includes(section.id),
          ),
      ) ?? remaining[0]!;
    const nextDepth = Math.max(...depthBySection.values()) + 1;
    visitComponent(root.id, nextDepth, nextRow++);
  }

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
    const parentId = parentBySection.get(section.id);
    const parentPosition = parentId
      ? actualPositionsBySection.get(parentId)
      : undefined;
    const fixedChildId = (outgoing.get(section.id) ?? []).find((target) =>
      actualPositionsBySection.has(target),
    );
    const fixedChildPosition = fixedChildId
      ? actualPositionsBySection.get(fixedChildId)
      : undefined;
    const x = parentPosition
      ? parentPosition.x + columnStep
      : fixedChildPosition
        ? Math.max(CANVAS_ORIGIN, fixedChildPosition.x - columnStep)
        : CANVAS_ORIGIN + depthBySection.get(section.id)! * columnStep;
    let row = parentPosition
      ? 0
      : fixedChildPosition
        ? Math.max(
            0,
            Math.round((fixedChildPosition.y - CANVAS_ORIGIN) / rowStep),
          )
        : rowBySection.get(section.id)!;
    let position = {
      x,
      y: parentPosition
        ? parentPosition.y +
          (branchOffsetBySection.get(section.id) ?? 0) * rowStep
        : fixedChildPosition
          ? fixedChildPosition.y
          : CANVAS_ORIGIN + row * rowStep,
    };
    while (
      occupied.some((other) =>
        overlapsWithGap(position, other, nodeWidth, nodeHeight),
      )
    ) {
      row += 1;
      position = {
        x,
        y:
          parentPosition || fixedChildPosition
            ? position.y + rowStep
            : CANVAS_ORIGIN + row * rowStep,
      };
    }
    positions[nodeId] = position;
    actualPositionsBySection.set(section.id, position);
    occupied.push(position);
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
