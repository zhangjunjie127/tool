import { expect, it } from "vitest";
import {
  playableErpAngles,
  playableErpButtonCenter,
  playableErpDirection,
  playableVrRayFromPose,
  playableVrTargetRays,
  playableStereoErpU,
} from "../src/shared/playable-vr.js";
import { vi } from "vitest";

it("maps the center of a 180 ERP frame to the forward equator", () => {
  expect(playableErpAngles({ x: 0.5, y: 0.5 })).toEqual({ yaw: 0, pitch: 0 });
});

it("maps the left and right frame edges to the 180 degree limits", () => {
  expect(playableErpAngles({ x: 0, y: 0 })).toEqual({
    yaw: -Math.PI / 2,
    pitch: Math.PI / 2,
  });
  expect(playableErpAngles({ x: 1, y: 1 })).toEqual({
    yaw: Math.PI / 2,
    pitch: -Math.PI / 2,
  });
});

it("maps the center and edges to the forward-facing 180-degree hemisphere", () => {
  expect(playableErpDirection({ x: 0.5, y: 0.5 })).toEqual({
    x: 0,
    y: 0,
    z: -1,
  });
  const left = playableErpDirection({ x: 0.25, y: 0.5 });
  expect(left.x).toBeCloseTo(-Math.SQRT1_2);
  expect(left.y).toBeCloseTo(0);
  expect(left.z).toBeCloseTo(-Math.SQRT1_2);
  const right = playableErpDirection({ x: 0.75, y: 0.5 });
  expect(right.x).toBeCloseTo(Math.SQRT1_2);
  expect(right.y).toBeCloseTo(0);
  expect(right.z).toBeCloseTo(-Math.SQRT1_2);
});

it("keeps the same ERP point inside either SBS eye half", () => {
  expect(playableStereoErpU(0, "left")).toBe(0);
  expect(playableStereoErpU(1, "left")).toBe(0.5);
  expect(playableStereoErpU(0, "right")).toBe(0.5);
  expect(playableStereoErpU(1, "right")).toBe(1);
});

it("uses the center of an element box for its VR anchor", () => {
  expect(
    playableErpButtonCenter({ x: 0.2, y: 0.3, width: 0.4, height: 0.2 }),
  ).toEqual({ x: 0.4, y: 0.4 });
});

it("derives a controller ray from the WebXR target-ray pose", () => {
  const forward = playableVrRayFromPose({
    position: { x: 1, y: 2, z: 3 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
  });
  expect(forward.origin).toEqual({ x: 1, y: 2, z: 3 });
  expect(forward.direction.x).toBeCloseTo(0);
  expect(forward.direction.y).toBeCloseTo(0);
  expect(forward.direction.z).toBeCloseTo(-1);

  const rightTurn = Math.SQRT1_2;
  expect(
    playableVrRayFromPose({
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: rightTurn, z: 0, w: rightTurn },
    }).direction.x,
  ).toBeCloseTo(-1);
});

it("reads controller and gaze target rays from WebXR poses, skipping screen input", () => {
  const controller = {
    targetRayMode: "tracked-pointer",
    targetRaySpace: { id: "controller-ray" },
  } as unknown as XRInputSource;
  const gaze = {
    targetRayMode: "gaze",
    targetRaySpace: { id: "gaze-ray" },
  } as unknown as XRInputSource;
  const screen = {
    targetRayMode: "screen",
    targetRaySpace: { id: "screen-ray" },
  } as unknown as XRInputSource;
  const referenceSpace = {} as XRReferenceSpace;
  const position = Object.create({
    get x() { return 0.5; },
    get y() { return 1; },
    get z() { return -0.25; },
  }) as DOMPointReadOnly;
  const frame = {
    getPose: vi.fn((space: XRSpace) =>
      space === screen.targetRaySpace
        ? undefined
        : ({
            transform: {
              position,
              orientation: { x: 0, y: 0, z: 0, w: 1 },
            },
          } as XRPose),
    ),
  };

  const rays = playableVrTargetRays(frame, referenceSpace, [
    controller,
    gaze,
    screen,
  ]);
  expect(rays).toHaveLength(2);
  expect(rays.map((ray) => ray.inputSource)).toEqual([controller, gaze]);
  expect(rays[0]?.origin).toEqual({ x: 0.5, y: 1, z: -0.25 });
  expect(rays[0]?.direction.x).toBeCloseTo(0);
  expect(rays[0]?.direction.y).toBeCloseTo(0);
  expect(rays[0]?.direction.z).toBeCloseTo(-1);
  expect(frame.getPose).toHaveBeenCalledTimes(2);
  expect(frame.getPose).toHaveBeenCalledWith(
    controller.targetRaySpace,
    referenceSpace,
  );
});
