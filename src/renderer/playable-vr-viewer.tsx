import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  playableErpButtonCenter,
  playableErpDirection,
  playableVrTargetRays,
} from "../shared/playable-vr.js";
import { hitPlayableVrButtons } from "./playable-vr-interaction.js";
import type { PlayableVrButton } from "../shared/playable-player-protocol.js";
import { t } from "./i18n.js";

export function PlayableVrViewer({
  video,
  currentTime,
  buttons,
  viewport,
  onActivate,
  onPress,
}: {
  video?: Blob;
  currentTime: number;
  buttons: readonly PlayableVrButton[];
  viewport: { width: number; height: number };
  onActivate: (buttonId: string) => void;
  onPress: (buttonId: string, phase: "start" | "end") => void;
}) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const world = useRef<VrWorld | undefined>(undefined);
  const startingRef = useRef(false);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const buttonsRef = useRef(buttons);
  buttonsRef.current = buttons;

  useEffect(() => {
    let disposed = false;
    void navigator.xr
      ?.isSessionSupported("immersive-vr")
      .then((available) => {
        if (!disposed) setSupported(available);
      })
      .catch(() => {
        if (!disposed) setSupported(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const current = world.current;
    if (!current) return;
    replaceVrButtons(current, buttons, viewport);
  }, [buttons, viewport.height, viewport.width]);

  useEffect(
    () => () => {
      void endVrWorld(world.current);
      world.current = undefined;
    },
    [],
  );

  if (!video) return null;

  async function enterVr(): Promise<void> {
    if (!video || startingRef.current || world.current) return;
    if (!navigator.xr || !supported) {
      setError(t("playableWorkbench.vrUnavailable"));
      return;
    }
    startingRef.current = true;
    setStarting(true);
    setError("");
    let session: XRSession | undefined;
    try {
      session = await navigator.xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor"],
      });
      const next = await createVrWorld(
        video,
        currentTime,
        buttonsRef.current,
        viewport,
        (source) => onActivateRef.current(source),
        (source, phase) => onPressRef.current(source, phase),
      );
      world.current = next;
      document.body.append(next.renderer.domElement);
      next.renderer.domElement.className = "playable-vr-renderer";
      next.renderer.xr.enabled = true;
      session.addEventListener("select", next.onSelect);
      session.addEventListener("selectstart", next.onSelectStart);
      session.addEventListener("selectend", next.onSelectEnd);
      await next.renderer.xr.setSession(session);
      session.addEventListener(
        "end",
        () => {
          if (world.current === next) world.current = undefined;
          void endVrWorld(next);
          startingRef.current = false;
          setStarting(false);
          setActive(false);
        },
        { once: true },
      );
      startingRef.current = false;
      setStarting(false);
      setActive(true);
    } catch (cause) {
      if (session) await session.end().catch(() => {});
      await endVrWorld(world.current);
      world.current = undefined;
      startingRef.current = false;
      setStarting(false);
      setActive(false);
      console.error("[Playable VR] Could not start VR playback.", cause);
      setError(t("playableWorkbench.vrStartFailed"));
    }
  }

  return (
    <div className="playable-vr-control">
      <button
        type="button"
        className="playable-vr-enter"
        title={
          active
            ? t("playableWorkbench.vrActive")
            : starting
              ? t("playableWorkbench.vrStarting")
            : supported
              ? t("playableWorkbench.enterVr")
              : t("playableWorkbench.vrUnavailable")
        }
        aria-label={
          starting
            ? t("playableWorkbench.vrStarting")
            : t("playableWorkbench.enterVr")
        }
        aria-busy={starting}
        onClick={() => void enterVr()}
        disabled={active || starting}
      >
        {active
          ? t("playableWorkbench.vrActive")
          : starting
            ? t("playableWorkbench.vrStarting")
          : t("playableWorkbench.enterVr")}
      </button>
      {error ? <span role="status">{error}</span> : null}
    </div>
  );
}

interface VrWorld {
  renderer: THREE.WebGLRenderer;
  video: HTMLVideoElement;
  objectUrl: string;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  buttons: THREE.Group;
  hoveredButtons: Map<XRInputSource, THREE.Mesh>;
  pointers: Map<XRInputSource, THREE.Line>;
  onSelect: (event: XRInputSourceEvent) => void;
  onSelectStart: (event: XRInputSourceEvent) => void;
  onSelectEnd: (event: XRInputSourceEvent) => void;
  updateHover: (frame?: XRFrame) => void;
  disposeButtons: () => void;
}

async function createVrWorld(
  blob: Blob,
  currentTime: number,
  buttons: readonly PlayableVrButton[],
  viewport: { width: number; height: number },
  onActivate: (buttonId: string) => void,
  onPress: (buttonId: string, phase: "start" | "end") => void,
): Promise<VrWorld> {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(blob);
  video.src = objectUrl;
  video.crossOrigin = "anonymous";
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.currentTime = Math.max(0, currentTime);
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () =>
      reject(new Error(t("playableWorkbench.vrVideoLoadFailed")));
    video.load();
  });
  await video.play();

  const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  // Keep the panorama and its buttons centered at the viewer's starting pose.
  renderer.xr.setReferenceSpaceType("local");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#000");
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    80,
  );
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      map: { value: texture },
      eyeOffset: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float eyeOffset;
      varying vec2 vUv;
      void main() {
        vec2 eyeUv = vec2(vUv.x * 0.5 + eyeOffset * 0.5, vUv.y);
        gl_FragColor = texture2D(map, eyeUv);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const panorama = new THREE.Mesh(
    new THREE.SphereGeometry(24, 96, 64, Math.PI, Math.PI, 0, Math.PI),
    material,
  );
  panorama.frustumCulled = false;
  panorama.onBeforeRender = (_renderer, _scene, activeCamera) => {
    const xrCamera = activeCamera as THREE.PerspectiveCamera & {
      viewport?: THREE.Vector4;
    };
    const isRightEye = xrCamera.viewport
      ? xrCamera.viewport.x > 0
      : activeCamera.position.x > 0;
    material.uniforms.eyeOffset.value = isRightEye ? 1 : 0;
  };
  scene.add(panorama);

  const buttonGroup = new THREE.Group();
  scene.add(buttonGroup);
  const raycaster = new THREE.Raycaster();
  const hoveredButtons = new Map<XRInputSource, THREE.Mesh>();
  const pressedButtons = new Map<XRInputSource, THREE.Mesh>();
  const pointers = new Map<XRInputSource, THREE.Line>();
  const hitForInput = (event: XRInputSourceEvent) => {
    const referenceSpace = renderer.xr.getReferenceSpace();
    if (referenceSpace) {
      const [targetRay] = playableVrTargetRays(
        event.frame,
        referenceSpace,
        [event.inputSource],
      );
      const hit = targetRay
        ? hitPlayableVrButtons(buttonGroup, [targetRay], raycaster).get(
            event.inputSource,
          )
        : undefined;
      if (hit) return hit.mesh;
    }
    return hoveredButtons.get(event.inputSource);
  };
  const onSelect = (event: XRInputSourceEvent) => {
    const target = hitForInput(event);
    const buttonId = target?.userData.buttonId as string | undefined;
    if (buttonId && !target?.userData.holdToCharge) onActivate(buttonId);
  };
  const onSelectStart = (event: XRInputSourceEvent) => {
    const target = hitForInput(event);
    if (!target) return;
    pressedButtons.set(event.inputSource, target);
    const buttonId = target.userData.buttonId as string | undefined;
    if (buttonId && target.userData.holdToCharge) onPress(buttonId, "start");
  };
  const onSelectEnd = (event: XRInputSourceEvent) => {
    const target = pressedButtons.get(event.inputSource);
    pressedButtons.delete(event.inputSource);
    const buttonId = target?.userData.buttonId as string | undefined;
    if (buttonId && target?.userData.holdToCharge) onPress(buttonId, "end");
  };
  const updateHover = (frame?: XRFrame) => {
    const referenceSpace = frame ? renderer.xr.getReferenceSpace() : null;
    const sources =
      frame && referenceSpace
        ? [...(renderer.xr.getSession()?.inputSources ?? [])].filter(
            (source) => source.targetRayMode !== "screen",
          )
        : [];
    for (const source of pressedButtons.keys()) {
      if (!sources.includes(source)) pressedButtons.delete(source);
    }
    scene.updateMatrixWorld(true);
    hoveredButtons.clear();
    for (const [source, line] of pointers) {
      if (!sources.includes(source)) line.visible = false;
    }
    const targetRays =
      frame && referenceSpace
        ? playableVrTargetRays(frame, referenceSpace, sources)
        : [];
    const hits = hitPlayableVrButtons(buttonGroup, targetRays, raycaster);
    for (const { inputSource, origin, direction } of targetRays) {
      const hitResult = hits.get(inputSource);
      const hit = hitResult?.mesh;
      if (hit) hoveredButtons.set(inputSource, hit);

      let pointer = pointers.get(inputSource);
      if (!pointer) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(6), 3),
        );
        const material = new THREE.LineBasicMaterial({
          color: "#77e8d0",
          depthTest: false,
          transparent: true,
          opacity: 0.9,
          toneMapped: false,
        });
        pointer = new THREE.Line(geometry, material);
        pointer.frustumCulled = false;
        pointer.renderOrder = 20;
        scene.add(pointer);
        pointers.set(inputSource, pointer);
      }
      const positions = pointer.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
      const isHovered = Boolean(hit);
      const endDistance = hitResult?.distance ?? 24;
      positions.array.set([
        origin.x,
        origin.y,
        origin.z,
        origin.x + direction.x * endDistance,
        origin.y + direction.y * endDistance,
        origin.z + direction.z * endDistance,
      ]);
      positions.needsUpdate = true;
      pointer.visible = true;
      (pointer.material as THREE.LineBasicMaterial).color.set(
        isHovered ? "#ffe36e" : "#77e8d0",
      );
    }
    const hovered = new Set(hoveredButtons.values());
    for (const object of buttonGroup.children) {
      if (!(object instanceof THREE.Mesh)) continue;
      const isHovered = hovered.has(object);
      const isPressed = [...pressedButtons.values()].includes(object);
      const hoverMaterial = object.userData.hoverMaterial as
        THREE.Material | undefined;
      const baseMaterial = object.userData.baseMaterial as THREE.Material;
      if (hoverMaterial)
        object.material =
          isHovered || isPressed ? hoverMaterial : baseMaterial;
      object.scale.setScalar(isPressed ? 1.06 : isHovered ? 1.12 : 1);
      const outline = object.userData.hoverOutline as
        THREE.LineSegments | undefined;
      if (outline) outline.visible = isHovered;
    }
  };

  const next: VrWorld = {
    renderer,
    video,
    objectUrl,
    scene,
    camera,
    buttons: buttonGroup,
    hoveredButtons,
    pointers,
    onSelect,
    onSelectStart,
    onSelectEnd,
    updateHover,
    disposeButtons: () => {},
  };
  replaceVrButtons(next, buttons, viewport);
  renderer.setAnimationLoop((_time, frame) => {
    next.updateHover(frame);
    renderer.render(scene, camera);
  });
  return next;
}

function replaceVrButtons(
  world: VrWorld,
  buttons: readonly PlayableVrButton[],
  viewport: { width: number; height: number },
): void {
  world.disposeButtons();
  world.buttons.clear();
  const disposables: Array<() => void> = [];
  for (const button of buttons) {
    if (!button.id || !button.width || !button.height) continue;
    const createTexture = (pressed: boolean) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = Math.max(
        128,
        Math.min(512, Math.round((512 * button.height) / button.width)),
      );
      const context = canvas.getContext("2d");
      if (!context) return undefined;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      paintButton(
        context,
        canvas,
        button,
        () => {
          texture.needsUpdate = true;
        },
        pressed,
      );
      return texture;
    };
    const texture = createTexture(false);
    if (!texture) continue;
    const pressedTexture = button.pressedImageDataUrl
      ? createTexture(true)
      : undefined;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const hoverMaterial = new THREE.MeshBasicMaterial({
      map: pressedTexture ?? texture,
      color: pressedTexture ? "#fff" : "#ffe36e",
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const center = playableErpButtonCenter(button);
    const radius = 21;
    const direction = playableErpDirection(center);
    const normal = new THREE.Vector3(direction.x, direction.y, direction.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(normal.y, -1, 1));
    const width = Math.max(
      0.05,
      (radius * Math.max(0.01, Math.cos(pitch)) * Math.PI * button.width) /
        viewport.width,
    );
    const height = Math.max(
      0.05,
      (radius * Math.PI * button.height) / viewport.height,
    );
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      material,
    );
    mesh.position.copy(normal).multiplyScalar(radius);
    mesh.lookAt(0, 0, 0);
    mesh.userData.buttonId = button.id;
    mesh.userData.holdToCharge = button.holdToCharge === true;
    mesh.userData.baseMaterial = material;
    if (hoverMaterial) mesh.userData.hoverMaterial = hoverMaterial;
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({
        color: "#ffe36e",
        depthTest: false,
        toneMapped: false,
      }),
    );
    outline.visible = false;
    outline.renderOrder = 10;
    mesh.add(outline);
    mesh.userData.hoverOutline = outline;
    world.buttons.add(mesh);
    disposables.push(() => {
      texture.dispose();
      pressedTexture?.dispose();
      material.dispose();
      hoverMaterial.dispose();
      mesh.geometry.dispose();
      outline.geometry.dispose();
      (outline.material as THREE.Material).dispose();
    });
  }
  world.disposeButtons = () => disposables.forEach((dispose) => dispose());
}

function paintButton(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  button: PlayableVrButton,
  onImageLoaded: () => void,
  pressed = false,
): void {
  const imageDataUrl =
    (pressed ? button.pressedImageDataUrl : button.imageDataUrl) ??
    button.imageDataUrl;
  const paintOverlay = (hasImage: boolean) => {
    if (!hasImage) {
      context.fillStyle = validCssColor(
        button.backgroundColor,
        "rgba(18, 22, 30, 0.86)",
      );
      context.beginPath();
      context.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 22);
      context.fill();
    }
    context.strokeStyle = "rgba(255,255,255,0.75)";
    context.lineWidth = 3;
    context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    context.fillStyle = validCssColor(button.color, "#fff");
    context.font = `600 ${Math.max(20, Math.min(42, canvas.height * 0.2))}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      button.label.slice(0, 48),
      canvas.width / 2,
      canvas.height / 2,
      canvas.width - 36,
    );
  };

  context.clearRect(0, 0, canvas.width, canvas.height);
  if (imageDataUrl) {
    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      paintOverlay(true);
      onImageLoaded();
    };
    image.src = imageDataUrl;
    return;
  }
  paintOverlay(false);
}

function validCssColor(value: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = value;
  return probe.style.color ? value : fallback;
}

async function endVrWorld(world: VrWorld | undefined): Promise<void> {
  if (!world) return;
  world.renderer.setAnimationLoop(null);
  world.renderer.xr.getSession()?.removeEventListener("select", world.onSelect);
  world.renderer.xr
    .getSession()
    ?.removeEventListener("selectstart", world.onSelectStart);
  world.renderer.xr
    .getSession()
    ?.removeEventListener("selectend", world.onSelectEnd);
  world.hoveredButtons.clear();
  world.disposeButtons();
  world.buttons.clear();
  for (const pointer of world.pointers.values()) {
    pointer.geometry.dispose();
    (pointer.material as THREE.Material).dispose();
    pointer.removeFromParent();
  }
  world.pointers.clear();
  world.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.ShaderMaterial)
        material.uniforms.map.value?.dispose?.();
      material.dispose();
    }
  });
  world.renderer.dispose();
  world.renderer.domElement.remove();
  world.video.pause();
  world.video.removeAttribute("src");
  world.video.load();
  URL.revokeObjectURL(world.objectUrl);
}
