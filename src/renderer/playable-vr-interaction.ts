import * as THREE from "three";
import type { PlayableVrTargetRay } from "../shared/playable-vr.js";

export function hitPlayableVrButtons(
  buttonGroup: THREE.Group,
  targetRays: readonly PlayableVrTargetRay[],
  raycaster: THREE.Raycaster,
): Map<XRInputSource, { mesh: THREE.Mesh; distance: number }> {
  buttonGroup.updateMatrixWorld(true);
  const hits = new Map<XRInputSource, { mesh: THREE.Mesh; distance: number }>();
  for (const targetRay of targetRays) {
    raycaster.ray.origin.set(
      targetRay.origin.x,
      targetRay.origin.y,
      targetRay.origin.z,
    );
    raycaster.ray.direction.set(
      targetRay.direction.x,
      targetRay.direction.y,
      targetRay.direction.z,
    ).normalize();
    const intersection = raycaster.intersectObjects(buttonGroup.children, false)[0];
    if (intersection?.object instanceof THREE.Mesh && intersection.object.userData.buttonId) {
      hits.set(targetRay.inputSource, {
        mesh: intersection.object,
        distance: intersection.distance,
      });
    }
  }
  return hits;
}
