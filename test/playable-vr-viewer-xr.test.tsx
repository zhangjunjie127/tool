// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const xrHarness = vi.hoisted(() => ({
  frame: undefined as ((time: number, frame?: XRFrame) => void) | undefined,
  referenceSpace: undefined as XRReferenceSpace | undefined,
  scene: undefined as
    { traverse: (callback: (object: unknown) => void) => void } | undefined,
  session: undefined as XRSession | undefined,
  requestSession: vi.fn(),
  setReferenceSpaceType: vi.fn(),
  setSession: vi.fn(async () => {}),
}));

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class MockWebGLRenderer {
    domElement = document.createElement("canvas");
    outputColorSpace: unknown;
    xr = {
      enabled: false,
      setReferenceSpaceType: xrHarness.setReferenceSpaceType,
      getReferenceSpace: () => xrHarness.referenceSpace ?? null,
      getSession: () => xrHarness.session ?? null,
      setSession: xrHarness.setSession,
    };

    constructor() {}

    setPixelRatio() {}
    setSize() {}
    setAnimationLoop(callback: typeof xrHarness.frame) {
      xrHarness.frame = callback ?? undefined;
    }
    render(scene: typeof xrHarness.scene) {
      xrHarness.scene = scene;
    }
    dispose() {}
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer };
});

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let xrDescriptor: PropertyDescriptor | undefined;
let createObjectUrlDescriptor: PropertyDescriptor | undefined;
let revokeObjectUrlDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  xrHarness.frame = undefined;
  xrHarness.referenceSpace = {} as XRReferenceSpace;
  xrHarness.scene = undefined;
  xrHarness.session = undefined;
  xrDescriptor = Object.getOwnPropertyDescriptor(navigator, "xr");
  Object.defineProperty(navigator, "xr", {
    configurable: true,
    value: {
      isSessionSupported: vi.fn().mockResolvedValue(true),
      requestSession: xrHarness.requestSession,
    },
  });

  createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
    URL,
    "createObjectURL",
  );
  revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
    URL,
    "revokeObjectURL",
  );
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: vi.fn(() => "blob:vr-test") },
    revokeObjectURL: { configurable: true, value: vi.fn() },
  });

  const inputSource = {
    targetRayMode: "tracked-pointer",
    targetRaySpace: {} as XRSpace,
  } as XRInputSource;
  const session = new EventTarget() as XRSession;
  Object.defineProperties(session, {
    inputSources: { value: [inputSource] },
    end: { value: vi.fn(async () => {}) },
  });
  xrHarness.session = session;
  xrHarness.requestSession.mockResolvedValue(session);
  (
    globalThis as typeof globalThis & { __vrInputSource?: XRInputSource }
  ).__vrInputSource = inputSource;

  vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
    const element = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      tagName,
    );
    if (tagName.toLowerCase() === "video") {
      Object.defineProperties(element, {
        load: {
          configurable: true,
          value: () =>
            queueMicrotask(() =>
              element.dispatchEvent(new Event("loadedmetadata")),
            ),
        },
        play: { configurable: true, value: vi.fn(async () => {}) },
        pause: { configurable: true, value: vi.fn() },
      });
    }
    return element;
  }) as typeof document.createElement);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        strokeRect: vi.fn(),
        fillText: vi.fn(),
      }) as unknown as CanvasRenderingContext2D as never,
  );

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  if (xrDescriptor) Object.defineProperty(navigator, "xr", xrDescriptor);
  else Reflect.deleteProperty(navigator, "xr");
  if (createObjectUrlDescriptor)
    Object.defineProperty(URL, "createObjectURL", createObjectUrlDescriptor);
  else Reflect.deleteProperty(URL, "createObjectURL");
  if (revokeObjectUrlDescriptor)
    Object.defineProperty(URL, "revokeObjectURL", revokeObjectUrlDescriptor);
  else Reflect.deleteProperty(URL, "revokeObjectURL");
  delete (globalThis as typeof globalThis & { __vrInputSource?: XRInputSource })
    .__vrInputSource;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("renders a button in the XR scene and shows a distinct hover state before select", async () => {
  const { PlayableVrViewer } =
    await import("../src/renderer/playable-vr-viewer.js");
  const onActivate = vi.fn();
  const onPress = vi.fn();
  await act(async () => {
    root.render(
      <PlayableVrViewer
        video={new Blob(["video"], { type: "video/mp4" })}
        currentTime={0}
        buttons={[
          {
            id: "continue",
            label: "继续",
            x: 0.45,
            y: 0.45,
            width: 0.1,
            height: 0.1,
            color: "#fff",
            backgroundColor: "#222",
          },
        ]}
        viewport={{ width: 1920, height: 1080 }}
        onActivate={onActivate}
        onPress={onPress}
      />,
    );
  });
  await act(async () => Promise.resolve());
  await act(async () => {
    container.querySelector("button")!.click();
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
  const inputSource = (
    globalThis as typeof globalThis & { __vrInputSource?: XRInputSource }
  ).__vrInputSource!;
  const frame = {
    getPose: vi.fn(() => ({
      transform: {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    })),
  } as unknown as XRFrame;
  await act(async () => xrHarness.frame?.(0, frame));

  const buttonMesh = {
    current: undefined as
      | {
          scale: { x: number };
          material: unknown;
          userData: Record<string, unknown>;
        }
      | undefined,
  };
  xrHarness.scene?.traverse((object) => {
    const mesh = object as typeof buttonMesh.current;
    if (mesh?.userData?.buttonId === "continue") buttonMesh.current = mesh;
  });
  expect(buttonMesh.current).toBeDefined();
  expect(container.querySelector(".playable-vr-enter")?.textContent).toContain(
    "VR",
  );

  expect(buttonMesh.current?.scale.x).toBeCloseTo(1.12);
  expect(buttonMesh.current?.userData.hoverOutline).toMatchObject({
    visible: true,
  });
  expect(buttonMesh.current?.material).not.toBe(
    buttonMesh.current?.userData.baseMaterial,
  );
  expect(xrHarness.setReferenceSpaceType).toHaveBeenCalledWith("local");
  expect(xrHarness.setSession).toHaveBeenCalledOnce();
  expect(xrHarness.setReferenceSpaceType.mock.invocationCallOrder[0]).toBeLessThan(
    xrHarness.setSession.mock.invocationCallOrder[0]!,
  );

  const select = new Event("select");
  Object.defineProperty(select, "inputSource", { value: inputSource });
  Object.defineProperty(select, "frame", { value: frame });
  const selectStart = new Event("selectstart");
  Object.defineProperty(selectStart, "inputSource", { value: inputSource });
  Object.defineProperty(selectStart, "frame", { value: frame });
  xrHarness.session?.dispatchEvent(selectStart);
  await act(async () => xrHarness.frame?.(0, frame));
  expect(buttonMesh.current?.scale.x).toBeCloseTo(1.06);

  xrHarness.session?.dispatchEvent(select);
  expect(onActivate).toHaveBeenCalledWith("continue");
  expect(onPress).not.toHaveBeenCalled();
});

it("forwards XR hold-charge start and end without converting the hold to a click", async () => {
  const { PlayableVrViewer } =
    await import("../src/renderer/playable-vr-viewer.js");
  const onActivate = vi.fn();
  const onPress = vi.fn();
  await act(async () => {
    root.render(
      <PlayableVrViewer
        video={new Blob(["video"], { type: "video/mp4" })}
        currentTime={0}
        buttons={[
          {
            id: "charge",
            label: "蓄力",
            x: 0.45,
            y: 0.45,
            width: 0.1,
            height: 0.1,
            color: "#fff",
            backgroundColor: "#222",
            holdToCharge: true,
          },
        ]}
        viewport={{ width: 1920, height: 1080 }}
        onActivate={onActivate}
        onPress={onPress}
      />,
    );
  });
  await act(async () => Promise.resolve());
  await act(async () => {
    container.querySelector("button")!.click();
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });

  const inputSource = (
    globalThis as typeof globalThis & { __vrInputSource?: XRInputSource }
  ).__vrInputSource!;
  const frame = {
    getPose: vi.fn(() => ({
      transform: {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    })),
  } as unknown as XRFrame;
  await act(async () => xrHarness.frame?.(0, frame));

  for (const type of ["selectstart", "select", "selectend"]) {
    const event = new Event(type);
    Object.defineProperties(event, {
      inputSource: { value: inputSource },
      frame: { value: frame },
    });
    xrHarness.session?.dispatchEvent(event);
  }

  expect(onPress.mock.calls).toEqual([
    ["charge", "start"],
    ["charge", "end"],
  ]);
  expect(onActivate).not.toHaveBeenCalled();
});

it("locks the VR entry control while a session request is pending", async () => {
  const logError = vi.spyOn(console, "error").mockImplementation(() => {});
  let rejectRequest: (error: Error) => void = () => {};
  xrHarness.requestSession.mockImplementation(
    () =>
      new Promise<XRSession>((_resolve, reject) => {
        rejectRequest = reject;
      }),
  );
  const { PlayableVrViewer } =
    await import("../src/renderer/playable-vr-viewer.js");

  await act(async () => {
    root.render(
      <PlayableVrViewer
        video={new Blob(["video"], { type: "video/mp4" })}
        currentTime={0}
        buttons={[]}
        viewport={{ width: 1920, height: 1080 }}
        onActivate={vi.fn()}
        onPress={vi.fn()}
      />,
    );
  });
  await act(async () => Promise.resolve());

  const button = container.querySelector("button")!;
  await act(async () => button.click());
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(button.textContent).toMatch(/Starting VR|正在启动 VR/);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(xrHarness.requestSession).toHaveBeenCalledOnce();

  await act(async () => {
    rejectRequest(new Error("test session failure"));
    await Promise.resolve();
  });
  expect(logError).toHaveBeenCalledOnce();
});
