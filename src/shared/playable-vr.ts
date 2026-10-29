export type PlayableVrEye = "left" | "right";

export interface PlayableVrButtonPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlayableVrTargetRay {
  inputSource: XRInputSource;
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
}

export function playableVrTargetRays(
  frame: Pick<XRFrame, "getPose">,
  referenceSpace: XRReferenceSpace,
  inputSources: readonly XRInputSource[],
): PlayableVrTargetRay[] {
  return inputSources.flatMap((inputSource) => {
    if (inputSource.targetRayMode === "screen") return [];
    const pose = frame.getPose(inputSource.targetRaySpace, referenceSpace);
    return pose ? [{ inputSource, ...playableVrRayFromPose(pose.transform) }] : [];
  });
}

export function playableVrRayFromPose(pose: {
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
}): {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
} {
  const { x, y, z, w } = pose.orientation;
  return {
    origin: {
      x: pose.position.x,
      y: pose.position.y,
      z: pose.position.z,
    },
    direction: {
      x: -2 * (x * z + w * y),
      y: 2 * (w * x - y * z),
      z: -(1 - 2 * (x * x + y * y)),
    },
  };
}

/** Maps a normalized 180-degree ERP position to spherical angles in radians. */
export function playableErpAngles(position: Pick<PlayableVrButtonPosition, "x" | "y">): {
  yaw: number;
  pitch: number;
} {
  return {
    yaw: (Math.max(0, Math.min(1, position.x)) - 0.5) * Math.PI,
    pitch: (0.5 - Math.max(0, Math.min(1, position.y))) * Math.PI,
  };
}

/** Converts ERP angles to a unit direction in the headset's forward-facing space. */
export function playableErpDirection(position: Pick<PlayableVrButtonPosition, "x" | "y">): {
  x: number;
  y: number;
  z: number;
} {
  const { yaw, pitch } = playableErpAngles(position);
  const horizontal = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * horizontal,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * horizontal,
  };
}

/** Maps normalized horizontal ERP coordinates to the selected SBS eye. */
export function playableStereoErpU(u: number, eye: PlayableVrEye): number {
  const normalized = Math.max(0, Math.min(1, u));
  return (normalized + (eye === "right" ? 1 : 0)) / 2;
}

/** Returns the center point of an interactive element in normalized ERP space. */
export function playableErpButtonCenter(
  position: PlayableVrButtonPosition,
): { x: number; y: number } {
  return {
    x: position.x + position.width / 2,
    y: position.y + position.height / 2,
  };
}
