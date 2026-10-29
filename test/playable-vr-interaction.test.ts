import * as THREE from "three";
import { expect, it } from "vitest";
import { hitPlayableVrButtons } from "../src/renderer/playable-vr-interaction.js";
import type { PlayableVrTargetRay } from "../src/shared/playable-vr.js";

it("raycasts WebXR controller poses onto the corresponding VR button", () => {
  const buttonGroup = new THREE.Group();
  const button = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 1),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  button.position.z = -5;
  button.userData.buttonId = "continue";
  buttonGroup.add(button);
  const inputSource = {} as XRInputSource;
  const controllerRay: PlayableVrTargetRay = {
    inputSource,
    origin: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 0, z: -1 },
  };

  const hits = hitPlayableVrButtons(
    buttonGroup,
    [controllerRay],
    new THREE.Raycaster(),
  );

  expect(hits.get(inputSource)?.mesh).toBe(button);
  expect(hits.get(inputSource)?.distance).toBeCloseTo(5);
});

it("does not report a hit when the controller ray misses the button", () => {
  const buttonGroup = new THREE.Group();
  const button = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 1),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  button.position.set(3, 0, -5);
  button.userData.buttonId = "continue";
  buttonGroup.add(button);
  const inputSource = {} as XRInputSource;

  const hits = hitPlayableVrButtons(
    buttonGroup,
    [{
      inputSource,
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 0, z: -1 },
    }],
    new THREE.Raycaster(),
  );

  expect(hits.has(inputSource)).toBe(false);
});
