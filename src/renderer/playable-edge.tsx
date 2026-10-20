import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";

export type PlayableEdgeData = {
  mode?: "push" | "replace";
  nodeSelected?: boolean;
};

type PlayableFlowEdge = Edge<PlayableEdgeData>;

/** Keeps the normal edge intact and layers a moving highlight over selected connections. */
export function PlayableEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerStart,
  markerEnd,
  ...props
}: EdgeProps<PlayableFlowEdge>) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const showFlow = Boolean(props.data?.nodeSelected);

  return (
    <>
      <BaseEdge path={edgePath} markerStart={markerStart} markerEnd={markerEnd} {...props} />
      {showFlow ? (
        <>
          <path className="playable-edge-flow-tail" d={edgePath} pathLength={1} aria-hidden="true" />
          <path className="playable-edge-flow-mid" d={edgePath} pathLength={1} aria-hidden="true" />
          <path className="playable-edge-flow-highlight" d={edgePath} pathLength={1} aria-hidden="true" />
        </>
      ) : null}
    </>
  );
}
