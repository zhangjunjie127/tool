import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { t } from "./i18n.js";

export type PlayableEdgeData = {
  mode?: "push" | "replace";
  nodeSelected?: boolean;
  provisional?: boolean;
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
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const showFlow = Boolean(props.data?.nodeSelected && !props.data?.provisional);

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerStart={markerStart}
        markerEnd={markerEnd}
        {...props}
        style={props.data?.provisional ? { ...props.style, stroke: "var(--warning)" } : props.style}
        label={props.data?.provisional ? t("storyTree.provisionalConnection") : props.label}
        labelX={labelX}
        labelY={labelY}
      />
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
