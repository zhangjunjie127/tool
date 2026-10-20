// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import {
  insertPlayableButtonPreset,
  insertPlayableMediaElement,
  mountPlayableMotionElement,
  parsePlayableMotionConfig,
  playableContinueWithoutInput,
  playableNoInputMode,
  playableButtonAssetScales,
  playableElementRuntimeScale,
  playableElementTransformScale,
  removePlayableSignalAttributes,
  setPlayableElementAttributes,
  setPlayableContinueWithoutInput,
  setPlayableNoInputMode,
  updatePlayableButtonLabelScale,
} from "../src/shared/playable-motion.js";

it("removes only matching signal attributes from HTML tags", () => {
  const html =
    '<main><button data-signal="answer-correct" data-putenggame-motion-timeout=\'answer-incorrect\'>A</button><button data-signal="other">B</button><script>const html = \'<button data-signal="answer-correct">\';</script><!-- <button data-signal="answer-correct"> -->';
  expect(
    removePlayableSignalAttributes(
      html,
      new Set(["answer-correct", "answer-incorrect"]),
    ),
  ).toBe(
    '<main><button>A</button><button data-signal="other">B</button><script>const html = \'<button data-signal="answer-correct">\';</script><!-- <button data-signal="answer-correct"> -->',
  );
});

it("updates only attributes on the source element and preserves its other markup", () => {
  const source =
    '<main>\n  <button data-signal="continue" style="color: red">Next</button>\n</main>';
  const updated = setPlayableElementAttributes(
    source,
    { line: 2, column: 3 },
    "button",
    {
      "data-putenggame-motion": "progress-ring",
      "data-putenggame-motion-signal": 'success "now"',
    },
  );

  expect(updated).toContain(
    '<button data-signal="continue" style="color: red" data-putenggame-motion="progress-ring" data-putenggame-motion-signal="success &quot;now&quot;">',
  );
  expect(
    setPlayableElementAttributes(source, { line: 2, column: 3 }, "div", {
      "data-putenggame-motion": "countdown",
    }),
  ).toBeUndefined();
});

it("keeps the existing button signal handler when an interactive motion is attached", () => {
  const button = document.createElement("button");
  button.setAttribute("data-signal", "success");
  button.setAttribute("data-putenggame-motion", "countdown");
  button.setAttribute("data-putenggame-motion-mode", "interactive");
  button.setAttribute("data-putenggame-motion-duration", "5");
  button.setAttribute("data-putenggame-motion-signal", "success");
  const root = document.createElement("div").attachShadow({ mode: "open" });
  root.append(button);
  const existingClick = vi.fn();
  button.addEventListener("click", existingClick);
  const emit = vi.fn(async () => {});
  const cleanup = mountPlayableMotionElement(button, {
    root,
    assets: { url: () => "" },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit,
      fail: emit,
      back: async () => {},
      connected: () => true,
    },
  });

  button.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );

  expect(existingClick).toHaveBeenCalledOnce();
  expect(emit).not.toHaveBeenCalled();
  cleanup();
});

it("scales button feedback after its centering transform and restores authored styles", () => {
  const button = document.createElement("button");
  button.style.transform = "translate(-50%, -50%)";
  button.style.transformOrigin = "left top";
  button.setAttribute("data-putenggame-motion", "button-feedback");
  button.setAttribute("data-putenggame-motion-mode", "visual");
  button.setAttribute("data-putenggame-motion-duration", "5");
  button.setAttribute("data-putenggame-motion-feedback", "hover-press");
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: () => "" },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit: async () => {},
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });

  expect(button.style.transformOrigin).toBe("center center");
  expect(button.querySelector("[data-putenggame-motion-ui]")).toBeNull();
  button.dispatchEvent(
    new PointerEvent("pointerenter", {
      bubbles: true,
      pointerType: "mouse",
    }),
  );
  expect(button.style.transform).toBe("translate(-50%, -50%) scale(1.08)");
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  expect(button.style.transform).toBe("translate(-50%, -50%) scale(0.92)");

  cleanup();
  expect(button.style.transformOrigin).toBe("left top");
  expect(button.style.transform).toBe("translate(-50%, -50%)");
});

it("adds a circular bounce that pauses on hover and press", () => {
  const button = document.createElement("button");
  Object.assign(button.style, {
    transform: "translate(-50%,-50%)",
    width: "120px",
    height: "40px",
    padding: "4px",
    borderRadius: "8px",
  });
  button.setAttribute("data-putenggame-motion", "button-feedback");
  button.setAttribute("data-putenggame-motion-mode", "visual");
  button.setAttribute("data-putenggame-motion-duration", "0.1");
  button.setAttribute(
    "data-putenggame-motion-feedback",
    "bounce-hover-press",
  );
  const animation = {
    pause: vi.fn(),
    play: vi.fn(),
    cancel: vi.fn(),
  };
  Object.defineProperty(button, "animate", {
    configurable: true,
    value: vi.fn(() => animation),
  });
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: () => "" },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit: async () => {},
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });

  expect(button.style.width).toBe("5em");
  expect(button.style.height).toBe("5em");
  expect(button.style.borderRadius).toBe("50%");
  expect(button.style.aspectRatio).toBe("1 / 1");
  expect(button.animate).toHaveBeenCalledWith(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.08)" },
      { transform: "scale(1)" },
    ],
    expect.objectContaining({ iterations: Infinity, composite: "add" }),
  );
  expect(button.style.transformOrigin).toBe("center center");
  button.dispatchEvent(
    new PointerEvent("pointerenter", {
      bubbles: true,
      pointerType: "mouse",
    }),
  );
  expect(animation.pause).toHaveBeenCalledOnce();
  button.dispatchEvent(
    new PointerEvent("pointerleave", {
      bubbles: true,
      pointerType: "mouse",
    }),
  );
  expect(animation.play).toHaveBeenCalledOnce();
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  expect(animation.pause).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new PointerEvent("pointerup"));
  expect(animation.play).toHaveBeenCalledTimes(2);

  cleanup();
  expect(animation.cancel).toHaveBeenCalledOnce();
  expect(button.style.width).toBe("120px");
  expect(button.style.height).toBe("40px");
  expect(button.style.borderRadius).toBe("8px");
});

it("scales the replacement image and button hit area together without cropping", () => {
  const button = document.createElement("button");
  button.textContent = "Continue";
  button.style.width = "180px";
  button.style.height = "48px";
  button.style.backgroundImage = 'url("original.png")';
  button.style.backgroundColor = "rgb(255, 0, 0)";
  button.style.border = "1px solid white";
  button.style.position = "absolute";
  button.style.isolation = "auto";
  button.setAttribute("data-putenggame-button-asset", "replacement");
  button.setAttribute("data-putenggame-button-asset-scale-x", "150");
  button.setAttribute("data-putenggame-button-asset-scale-y", "80");
  button.setAttribute("data-putenggame-button-label-translate", "4cqw -2cqh");

  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: (id: string) => `/assets/${id}.png` },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit: async () => {},
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });

  const image = button.querySelector<HTMLImageElement>(
    "[data-putenggame-button-asset-image] img",
  )!;
  expect(image.src).toContain("/assets/replacement.png");
  expect(image.style.objectFit).toBe("contain");
  expect(image.style.transform).toBe("");
  expect(button.style.scale).toBe("1.5 0.8");
  expect(button.style.backgroundImage).toBe("none");
  expect(button.style.backgroundColor).toBe("transparent");
  expect(button.style.border).toBe("0px");
  expect(button.style.isolation).toBe("isolate");
  expect(button.style.width).toBe("180px");
  expect(button.style.height).toBe("48px");
  const label = button.querySelector<HTMLElement>(
    "[data-putenggame-button-label]",
  )!;
  expect(label.textContent).toBe("Continue");
  expect(label.style.scale).toBe(`${100 / 150} ${100 / 80}`);
  expect(label.style.translate).toBe("4cqw -2cqh");
  button.setAttribute("data-putenggame-button-asset-scale-x", "200");
  button.style.scale = "2 0.8";
  updatePlayableButtonLabelScale(button);
  expect(label.style.scale).toBe(`${100 / 200} ${100 / 80}`);
  expect(button.style.scale).toBe("2 0.8");
  const click = vi.fn();
  button.addEventListener("click", click);
  label.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(click).toHaveBeenCalledOnce();

  cleanup();
  expect(
    button.querySelector("[data-putenggame-button-asset-image]"),
  ).toBeNull();
  expect(button.querySelector("[data-putenggame-button-label]")).toBeNull();
  expect(button.textContent).toBe("Continue");
  expect(button.style.backgroundImage).toContain("original.png");
  expect(button.style.backgroundColor).toBe("rgb(255, 0, 0)");
  expect(button.style.border).toBe("1px solid white");
  expect(button.style.isolation).toBe("auto");
  expect(button.style.scale).toBe("");
  expect(button.style.position).toBe("absolute");
});

it("swaps the normal button image for the pressed image while held", () => {
  const button = document.createElement("button");
  button.textContent = "开始";
  button.style.transition = "transform 180ms ease";
  button.setAttribute("data-putenggame-button-asset", "normal");
  button.setAttribute("data-putenggame-button-pressed-asset", "pressed");
  const click = vi.fn();
  button.addEventListener("click", click);
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: (id: string) => `/assets/${id}.png` },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit: async () => {},
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });

  const pressed = button.querySelector<HTMLElement>(
    "[data-putenggame-button-pressed-image]",
  )!;
  const normal = button.querySelector<HTMLElement>(
    "[data-putenggame-button-asset-image]",
  )!;
  expect(pressed.style.visibility).toBe("hidden");
  expect(normal.style.visibility).toBe("visible");
  expect(button.style.scale).toBe("1 1");
  button.dispatchEvent(
    new PointerEvent("pointerenter", {
      bubbles: true,
      pointerType: "mouse",
    }),
  );
  expect(pressed.style.visibility).toBe("visible");
  expect(normal.style.visibility).toBe("hidden");
  expect(button.style.scale).toBe("1 1");
  button.dispatchEvent(
    new PointerEvent("pointerleave", {
      bubbles: true,
      pointerType: "mouse",
    }),
  );
  expect(pressed.style.visibility).toBe("hidden");
  expect(normal.style.visibility).toBe("visible");
  button.dispatchEvent(
    new PointerEvent("pointerenter", {
      bubbles: true,
      pointerType: "mouse",
    }),
  );
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  button.dispatchEvent(
    new PointerEvent("pointerleave", {
      bubbles: true,
      pointerType: "mouse",
    }),
  );
  expect(pressed.style.visibility).toBe("visible");
  expect(button.style.scale).toBe("1.08 1.08");
  window.dispatchEvent(new PointerEvent("pointerup"));
  expect(pressed.style.visibility).toBe("hidden");
  expect(normal.style.visibility).toBe("visible");
  expect(button.style.scale).toBe("1 1");
  expect(button.style.transition).toContain("transform 180ms ease");
  expect(button.style.transition).toContain("scale 120ms ease");
  button.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  expect(pressed.style.visibility).toBe("visible");
  expect(normal.style.visibility).toBe("hidden");
  expect(button.style.scale).toBe("1.08 1.08");
  button.dispatchEvent(
    new KeyboardEvent("keyup", { key: "Enter", bubbles: true }),
  );
  expect(pressed.style.visibility).toBe("hidden");
  expect(normal.style.visibility).toBe("visible");
  expect(button.style.scale).toBe("1 1");
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  expect(pressed.style.visibility).toBe("visible");
  expect(normal.style.visibility).toBe("hidden");
  window.dispatchEvent(new PointerEvent("pointerup"));
  expect(pressed.style.visibility).toBe("hidden");
  expect(normal.style.visibility).toBe("visible");
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(click).toHaveBeenCalledOnce();
  expect(button.textContent).toBe("开始");
  cleanup();
});

it("hides and restores the original background when only a pressed asset is set", () => {
  const button = document.createElement("button");
  button.style.backgroundImage = 'url("default.png")';
  button.setAttribute("data-putenggame-button-pressed-asset", "pressed");
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: (id: string) => `/assets/${id}.png` },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit: async () => {},
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });

  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  expect(button.style.backgroundImage).toBe("none");
  window.dispatchEvent(new PointerEvent("pointerup"));
  expect(button.style.backgroundImage).toContain("default.png");
  cleanup();
});

it("saves button label movement on its own attribute, not on the button", () => {
  const source =
    '<main>\n  <button style="color: red">Continue</button>\n</main>';
  const updated = setPlayableElementAttributes(
    source,
    { line: 2, column: 3 },
    "button",
    { "data-putenggame-button-label-translate": "4cqw -2cqh" },
  );

  expect(updated).toContain(
    '<button style="color: red" data-putenggame-button-label-translate="4cqw -2cqh">',
  );
  expect(updated).not.toContain("translate:");
});

it("uses the previous single scale value for scenes without axis-specific scales", () => {
  const button = document.createElement("button");
  button.setAttribute("data-putenggame-button-asset-scale", "175");
  expect(playableButtonAssetScales(button)).toEqual({ x: 175, y: 175 });

  button.setAttribute("data-putenggame-button-asset-scale-x", "240");
  expect(playableButtonAssetScales(button)).toEqual({ x: 240, y: 175 });
});

it("composes button frame scaling with the background-asset scaling", () => {
  const button = document.createElement("button");
  button.style.scale = "1.5";
  button.setAttribute("data-putenggame-button-asset", "normal");
  button.setAttribute("data-putenggame-button-asset-scale-x", "150");
  button.setAttribute("data-putenggame-button-asset-scale-y", "80");
  expect(playableElementTransformScale(button, "2.25 1.2")).toBe(1.5);
  expect(playableElementRuntimeScale(button, 1.5)).toBe("2.25 1.2");

  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: (id: string) => `/assets/${id}.png` },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit: async () => {},
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });
  expect(button.style.scale).toBe("2.25 1.2");
  cleanup();
  expect(button.style.scale).toBe("1.5");
});

it("routes a completed hold to success and an untouched charge to timeout", () => {
  const callbacks: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const createContext = (emit: ReturnType<typeof vi.fn>) =>
    ({
      root: document.createElement("div").attachShadow({ mode: "open" }),
      assets: { url: () => "" },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: { emit, fail: emit, back: async () => {}, connected: () => true },
    }) as never;
  const success = vi.fn(async () => {});
  const held = document.createElement("button");
  held.setAttribute("data-putenggame-motion", "hold-charge");
  held.setAttribute("data-putenggame-motion-mode", "interactive");
  held.setAttribute("data-putenggame-motion-duration", "1");
  held.setAttribute("data-putenggame-motion-timeout-duration", "5");
  held.setAttribute("data-putenggame-motion-signal", "success");
  const heldCleanup = mountPlayableMotionElement(held, createContext(success));
  held.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  callbacks.pop()!(window.performance.now() + 1100);
  expect(success).toHaveBeenCalledWith("success");
  heldCleanup();

  const timeout = vi.fn(async () => {});
  const untouched = document.createElement("div");
  untouched.setAttribute("data-putenggame-motion", "hold-charge");
  untouched.setAttribute("data-putenggame-motion-mode", "interactive");
  untouched.setAttribute("data-putenggame-motion-duration", "1");
  untouched.setAttribute("data-putenggame-motion-timeout-duration", "3");
  untouched.setAttribute("data-putenggame-motion-timeout", "timeout");
  const timeoutCleanup = mountPlayableMotionElement(
    untouched,
    createContext(timeout),
  );
  callbacks.pop()!(window.performance.now() + 3000);
  expect(timeout).toHaveBeenCalledWith("timeout");
  timeoutCleanup();
  vi.restoreAllMocks();
});

it("reports interactive motion timeouts through the failure navigation path", () => {
  const callbacks: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const emit = vi.fn(async () => {});
  const fail = vi.fn(async () => {});
  const root = document.createElement("div").attachShadow({ mode: "open" });
  root.innerHTML =
    '<main data-putenggame-continue-without-input="true"></main>';
  const button = document.createElement("button");
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "countdown",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "1",
    "data-putenggame-motion-timeout": "fail",
  }))
    button.setAttribute(name, value);
  const cleanup = mountPlayableMotionElement(
    button,
    {
      root,
      assets: { url: () => "" },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: { emit, fail, back: async () => {}, connected: () => true },
    } as never,
  );

  callbacks.shift()!(window.performance.now() + 1100);
  expect(emit).not.toHaveBeenCalled();
  expect(fail).toHaveBeenCalledWith("fail");
  cleanup();
  vi.restoreAllMocks();
});

it("freezes an interactive motion timeout for the full scene waiting interval", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const root = document.createElement("div").attachShadow({ mode: "open" });
  root.innerHTML =
    '<main data-putenggame-awaiting-input><button data-putenggame-motion="countdown" data-putenggame-motion-mode="interactive" data-putenggame-motion-duration="1" data-putenggame-motion-timeout="timeout"></button></main>';
  const button = root.querySelector("button")!;
  const fail = vi.fn(async () => {});
  const cleanup = mountPlayableMotionElement(button, {
    root,
    assets: { url: () => "" },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit: async () => {},
      fail,
      back: async () => {},
      connected: () => true,
    },
  });
  const startedAt = window.performance.now();
  frames.shift()!(startedAt + 5000);
  expect(fail).not.toHaveBeenCalled();

  const resumedAt = startedAt + 8000;
  root.querySelector("main")!.dispatchEvent(
    new CustomEvent("putenggame:motion-resume", {
      bubbles: true,
      detail: resumedAt,
    }),
  );
  root.querySelector("main")!.removeAttribute(
    "data-putenggame-awaiting-input",
  );
  frames.shift()!(resumedAt + 1001);
  expect(fail).toHaveBeenCalledWith("timeout");
  cleanup();
  vi.restoreAllMocks();
});

it("renders a supplied ring image with a timed circular reveal and rotation", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const button = document.createElement("button");
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "progress-ring",
    "data-putenggame-motion-mode": "visual",
    "data-putenggame-motion-duration": "4",
    "data-putenggame-motion-ring-asset": "ring-image",
    "data-putenggame-motion-ring-asset-scale": "150",
    "data-putenggame-motion-ring-fill": "reveal",
    "data-putenggame-motion-ring-rotation": "counterclockwise",
  }))
    button.setAttribute(name, value);
  const cleanup = mountPlayableMotionElement(
    button,
    {
      root: document.createElement("div").attachShadow({ mode: "open" }),
      assets: { url: (id: string) => `/assets/${id}.png` },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: {
        emit: async () => {},
        fail: async () => {},
        back: async () => {},
        connected: () => true,
      },
    },
  );
  const ring = button.querySelector<HTMLImageElement>(
    "[data-putenggame-motion-ring]",
  )!;
  expect(ring.src).toContain("/assets/ring-image.png");
  expect(ring.style.transform).toContain("scale(1.5)");
  frames.shift()!(window.performance.now() + 2000);
  expect(ring.style.maskImage).toMatch(/180(?:\.\d+)?deg/);
  expect(ring.style.transform).toMatch(/rotate\(180(?:\.\d+)?deg\)/);
  expect(ring.style.transform).toContain("scale(1.5)");
  expect(ring.style.maskImage).toMatch(/from -180(?:\.\d+)?deg/);
  cleanup();
  vi.restoreAllMocks();
});

it("does not add the built-in white ring around a custom button base image", () => {
  const button = document.createElement("button");
  for (const [name, value] of Object.entries({
    "data-putenggame-button-asset": "base-image",
    "data-putenggame-motion": "progress-ring",
    "data-putenggame-motion-mode": "visual",
    "data-putenggame-motion-duration": "4",
  }))
    button.setAttribute(name, value);
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: (id: string) => `/assets/${id}.png` },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit: async () => {},
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });

  expect(
    button.querySelector("[data-putenggame-button-asset-image] img"),
  ).not.toBeNull();
  expect(button.querySelector("[data-putenggame-motion-ring]")).toBeNull();
  expect(button.querySelector("svg")).toBeNull();
  cleanup();
});

it("makes ring-countdown button bases circular and restores their authored size", () => {
  const button = document.createElement("button");
  button.style.width = "180px";
  button.style.height = "48px";
  button.style.minWidth = "120px";
  button.style.padding = "8px";
  button.style.borderRadius = "6px";
  button.setAttribute("data-putenggame-motion", "progress-ring");
  button.setAttribute("data-putenggame-motion-mode", "visual");
  button.setAttribute("data-putenggame-motion-duration", "5");
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: () => "" },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit: async () => {},
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });

  expect(button.style.width).toBe("5em");
  expect(button.style.height).toBe("5em");
  expect(button.style.minWidth).toBe("0");
  expect(button.style.padding).toBe("0px");
  expect(button.style.borderRadius).toBe("50%");
  expect(button.style.aspectRatio).toBe("1 / 1");
  cleanup();
  expect(button.style.width).toBe("180px");
  expect(button.style.height).toBe("48px");
  expect(button.style.minWidth).toBe("120px");
  expect(button.style.padding).toBe("8px");
  expect(button.style.borderRadius).toBe("6px");
});

it("drains countdown bars left to right and fills charge bars left to right", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window.performance, "now").mockReturnValue(100);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const createContext = () =>
    ({
      root: document.createElement("div").attachShadow({ mode: "open" }),
      assets: { url: () => "" },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: {
        emit: async () => {},
        fail: async () => {},
        back: async () => {},
        connected: () => true,
      },
    }) as never;
  const countdown = document.createElement("button");
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "progress-bar",
    "data-putenggame-motion-mode": "visual",
    "data-putenggame-motion-duration": "4",
  }))
    countdown.setAttribute(name, value);
  const countdownCleanup = mountPlayableMotionElement(
    countdown,
    createContext(),
  );
  const countdownFill = countdown.querySelector<HTMLElement>(
    "[data-putenggame-motion-fill]",
  )!;
  expect(countdownFill.style.transformOrigin).toBe("right center");
  expect(countdownFill.style.transform).toBe("scaleX(1)");
  frames.shift()!(4100);
  expect(countdownFill.style.transform).toBe("scaleX(0)");
  countdownCleanup();

  const charge = document.createElement("button");
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "hold-charge",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "4",
    "data-putenggame-motion-timeout-duration": "8",
  }))
    charge.setAttribute(name, value);
  const chargeCleanup = mountPlayableMotionElement(charge, createContext());
  const chargeFill = charge.querySelector<HTMLElement>(
    "[data-putenggame-motion-fill]",
  )!;
  expect(chargeFill.style.transformOrigin).toBe("left center");
  expect(chargeFill.style.transform).toBe("scaleX(0)");
  charge.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  frames.pop()!(4100);
  expect(chargeFill.style.transform).toBe("scaleX(1)");
  chargeCleanup();
  vi.restoreAllMocks();
});

it("renders a selected progress image inside the independently animated bar fill", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window.performance, "now").mockReturnValue(100);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const button = document.createElement("button");
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "progress-bar",
    "data-putenggame-motion-mode": "visual",
    "data-putenggame-motion-duration": "4",
    "data-putenggame-motion-bar-asset": "progress-image",
    "data-putenggame-motion-bar-asset-scale": "175",
    "data-putenggame-motion-bar-asset-x": "12",
    "data-putenggame-motion-bar-asset-y": "-8",
  }))
    button.setAttribute(name, value);
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: (id: string) => `/assets/${id}.png` },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit: async () => {},
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });
  const image = button.querySelector<HTMLImageElement>(
    "[data-putenggame-motion-bar]",
  )!;
  expect(image.src).toContain("/assets/progress-image.png");
  expect(image.style.transform).toBe("translate(12%, -8%) scale(1.75)");
  const fill = image.parentElement!;
  expect(fill.style.transformOrigin).toBe("right center");
  frames.shift()!(4100);
  expect(fill.style.transform).toBe("scaleX(0)");
  cleanup();
  vi.restoreAllMocks();
});

it("recognizes repeated clicks as the configured success action", () => {
  const button = document.createElement("button");
  button.setAttribute("data-putenggame-motion", "countdown");
  button.setAttribute("data-putenggame-motion-mode", "interactive");
  button.setAttribute("data-putenggame-motion-duration", "5");
  button.setAttribute("data-putenggame-motion-interaction", "multi-click");
  button.setAttribute("data-putenggame-motion-required-count", "3");
  button.setAttribute("data-putenggame-motion-signal", "success");
  const emit = vi.fn(async () => {});
  const cleanup = mountPlayableMotionElement(
    button,
    {
      root: document.createElement("div").attachShadow({ mode: "open" }),
      assets: { url: () => "" },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: {
        emit,
        fail: async () => {},
        back: async () => {},
        connected: () => true,
      },
    },
  );
  button.click();
  button.click();
  expect(emit).not.toHaveBeenCalled();
  button.click();
  expect(emit).toHaveBeenCalledWith("success");
  cleanup();
});

it("triggers a bouncing click button after consecutive player clicks", () => {
  const button = document.createElement("button");
  button.setAttribute("data-signal", "continue");
  button.setAttribute("data-putenggame-motion", "button-feedback");
  button.setAttribute("data-putenggame-motion-mode", "interactive");
  button.setAttribute("data-putenggame-motion-duration", "0.1");
  button.setAttribute(
    "data-putenggame-motion-feedback",
    "bounce-hover-press",
  );
  button.setAttribute("data-putenggame-motion-interaction", "multi-click");
  button.setAttribute("data-putenggame-motion-required-count", "3");
  button.setAttribute("data-putenggame-motion-signal", "continue");
  const route = vi.fn();
  button.addEventListener("click", route);
  Object.defineProperty(button, "animate", {
    configurable: true,
    value: vi.fn(() => ({
      pause: vi.fn(),
      play: vi.fn(),
      cancel: vi.fn(),
    })),
  });
  let now = 0;
  const performanceNow = vi
    .spyOn(window.performance, "now")
    .mockImplementation(() => now);
  const cleanup = mountPlayableMotionElement(
    button,
    {
      root: document.createElement("div").attachShadow({ mode: "open" }),
      assets: { url: () => "" },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: {
        emit: async () => {},
        fail: async () => {},
        back: async () => {},
        connected: () => true,
      },
    },
  );

  button.click();
  button.click();
  expect(route).not.toHaveBeenCalled();
  now = 700;
  button.click();
  now = 800;
  button.click();
  expect(route).not.toHaveBeenCalled();
  now = 900;
  button.click();
  expect(route).toHaveBeenCalledOnce();

  cleanup();
  performanceNow.mockRestore();
});

it("accepts a quick click only when the pointer press is under 250 ms", () => {
  const button = document.createElement("button");
  button.setAttribute("data-putenggame-motion", "countdown");
  button.setAttribute("data-putenggame-motion-mode", "interactive");
  button.setAttribute("data-putenggame-motion-duration", "5");
  button.setAttribute("data-putenggame-motion-interaction", "quick-click");
  button.setAttribute("data-putenggame-motion-signal", "success");
  const emit = vi.fn(async () => {});
  const cleanup = mountPlayableMotionElement(
    button,
    {
      root: document.createElement("div").attachShadow({ mode: "open" }),
      assets: { url: () => "" },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: {
        emit,
        fail: async () => {},
        back: async () => {},
        connected: () => true,
      },
    },
  );
  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  button.click();
  expect(emit).toHaveBeenCalledWith("success");
  cleanup();
});

it("plays hover-grow and press-shrink without changing the authored element scale", () => {
  const button = document.createElement("button");
  button.style.scale = "1.5";
  button.style.transform = "translate(-50%, -50%)";
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "countdown",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "5",
    "data-putenggame-motion-interaction": "click",
    "data-putenggame-motion-feedback": "hover-press",
  }))
    button.setAttribute(name, value);
  const cleanup = mountPlayableMotionElement(
    button,
    {
      root: document.createElement("div").attachShadow({ mode: "open" }),
      assets: { url: () => "" },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: {
        emit: async () => {},
        fail: async () => {},
        back: async () => {},
        connected: () => true,
      },
    },
  );
  button.dispatchEvent(
    new PointerEvent("pointerenter", { pointerType: "mouse" }),
  );
  expect(button.style.transform).toBe("translate(-50%, -50%) scale(1.08)");
  expect(button.style.scale).toBe("1.5");
  button.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse" }));
  expect(button.style.transform).toBe("translate(-50%, -50%) scale(0.92)");
  expect(button.style.scale).toBe("1.5");
  window.dispatchEvent(new PointerEvent("pointerup"));
  expect(button.style.transform).toBe("translate(-50%, -50%) scale(1.08)");
  button.dispatchEvent(
    new PointerEvent("pointerleave", { pointerType: "mouse" }),
  );
  expect(button.style.transform).toBe("translate(-50%, -50%)");
  expect(button.style.scale).toBe("1.5");
  cleanup();
  expect(button.style.scale).toBe("1.5");
});

it("keeps feedback centered when the editor sets an important compensation origin", () => {
  const button = document.createElement("button");
  button.style.transform = "translate(-50%, -50%)";
  button.setAttribute("data-putenggame-motion", "button-feedback");
  button.setAttribute("data-putenggame-motion-mode", "visual");
  button.setAttribute("data-putenggame-motion-duration", "5");
  button.setAttribute("data-putenggame-motion-feedback", "hover-press");
  Object.defineProperty(button, "getBoundingClientRect", {
    value: () => {
      const transform = button.style.transform;
      const compensation =
        /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(transform);
      const x = compensation ? Number(compensation[1]) : 0;
      const y = compensation ? Number(compensation[2]) : 0;
      const origin = button.style.getPropertyValue("transform-origin");
      const isScaled = /scale\(1\.08\)|scale\(0\.92\)/.test(transform);
      const shiftX =
        origin === "center center" && isScaled ? 20 : 0;
      const shiftY =
        origin === "center center" && isScaled ? 10 : 0;
      return {
        x: 150 + shiftX + x,
        y: 130 + shiftY + y,
        width: 100,
        height: 40,
        left: 150 + shiftX + x,
        top: 130 + shiftY + y,
        right: 250 + shiftX + x,
        bottom: 170 + shiftY + y,
      };
    },
  });
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: () => "" },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit: async () => {},
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });
  button.style.setProperty("transform-origin", "80% 40%", "important");

  button.dispatchEvent(
    new PointerEvent("pointerenter", { pointerType: "mouse" }),
  );

  expect(button.style.getPropertyValue("transform-origin")).toBe("center center");
  expect(button.style.getPropertyPriority("transform-origin")).toBe("important");
  expect(button.style.transform).toContain("translate(-20px, -10px)");
  let rect = button.getBoundingClientRect();
  expect(rect.left + rect.width / 2).toBe(200);
  expect(rect.top + rect.height / 2).toBe(150);

  button.dispatchEvent(new PointerEvent("pointerdown"));
  expect(button.style.transform).toContain("translate(-20px, -10px)");
  expect(button.style.transform).toContain("scale(0.92)");
  rect = button.getBoundingClientRect();
  expect(rect.left + rect.width / 2).toBe(200);
  expect(rect.top + rect.height / 2).toBe(150);

  window.dispatchEvent(new PointerEvent("pointerup"));
  expect(button.style.transform).toContain("scale(1.08)");

  button.dispatchEvent(
    new PointerEvent("pointerleave", { pointerType: "mouse" }),
  );
  expect(button.style.getPropertyValue("transform-origin")).toBe("80% 40%");
  expect(button.style.getPropertyPriority("transform-origin")).toBe("important");
  expect(button.style.transform).toBe("translate(-50%, -50%)");

  cleanup();
});

it("routes only the configured swipe direction to its success exit", () => {
  const button = document.createElement("button");
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "progress-ring",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "5",
    "data-putenggame-motion-interaction": "swipe-left",
    "data-putenggame-motion-signal": "success",
  }))
    button.setAttribute(name, value);
  const emit = vi.fn(async () => {});
  const cleanup = mountPlayableMotionElement(
    button,
    {
      root: document.createElement("div").attachShadow({ mode: "open" }),
      assets: { url: () => "" },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: {
        emit,
        fail: async () => {},
        back: async () => {},
        connected: () => true,
      },
    },
  );
  button.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      clientX: 100,
      clientY: 20,
    }),
  );
  button.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    }),
  );
  expect(emit).toHaveBeenCalledWith("success");
  cleanup();
});

it("routes each swipe-button direction and ignores a mismatched swipe", () => {
  const directions = [
    ["swipe-left", -80, 0],
    ["swipe-right", 80, 0],
    ["swipe-up", 0, -80],
    ["swipe-down", 0, 80],
  ] as const;
  for (const [expected, dx, dy] of directions) {
    const button = document.createElement("button");
    button.setAttribute("data-putenggame-motion", "swipe-button");
    button.setAttribute("data-putenggame-motion-mode", "interactive");
    button.setAttribute("data-putenggame-motion-duration", "1");
    button.setAttribute("data-putenggame-motion-interaction", expected);
    button.setAttribute("data-putenggame-motion-signal", "success");
    const emit = vi.fn(async () => {});
    const cleanup = mountPlayableMotionElement(button, {
      root: document.createElement("div").attachShadow({ mode: "open" }),
      assets: { url: () => "" },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: {
        emit,
        fail: async () => {},
        back: async () => {},
        connected: () => true,
      },
    });
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        clientX: 100 + dx,
        clientY: 100 + dy,
      }),
    );
    expect(emit, expected).toHaveBeenCalledWith("success");
    cleanup();
  }

  const wrong = document.createElement("button");
  wrong.setAttribute("data-putenggame-motion", "swipe-button");
  wrong.setAttribute("data-putenggame-motion-mode", "interactive");
  wrong.setAttribute("data-putenggame-motion-duration", "1");
  wrong.setAttribute("data-putenggame-motion-interaction", "swipe-left");
  wrong.setAttribute("data-putenggame-motion-signal", "success");
  const emitWrong = vi.fn(async () => {});
  const cleanupWrong = mountPlayableMotionElement(wrong, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: () => "" },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit: emitWrong,
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });
  wrong.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 2,
      clientX: 20,
      clientY: 20,
    }),
  );
  wrong.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 2,
      clientX: 100,
      clientY: 20,
    }),
  );
  expect(emitWrong).not.toHaveBeenCalled();
  cleanupWrong();
});

it("only moves and completes when the rectangular swipe goes left", () => {
  const button = document.createElement("button");
  button.setAttribute("data-putenggame-motion", "swipe-button");
  button.setAttribute("data-putenggame-motion-mode", "interactive");
  button.setAttribute("data-putenggame-motion-duration", "1");
  button.setAttribute("data-putenggame-motion-interaction", "swipe-left");
  button.setAttribute("data-putenggame-motion-signal", "success");
  const emit = vi.fn(async () => {});
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: () => "" },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit,
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });
  const thumb = button.querySelector<HTMLElement>(
    "[data-putenggame-swipe-thumb]",
  )!;
  button.dispatchEvent(
    new PointerEvent("pointerdown", {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    }),
  );
  button.dispatchEvent(
    new PointerEvent("pointermove", {
      pointerId: 1,
      clientX: 140,
      clientY: 100,
    }),
  );
  expect(thumb.style.left).toBe("88%");
  button.dispatchEvent(
    new PointerEvent("pointerup", {
      pointerId: 1,
      clientX: 140,
      clientY: 100,
    }),
  );
  expect(emit).not.toHaveBeenCalled();

  button.dispatchEvent(
    new PointerEvent("pointerdown", {
      pointerId: 2,
      clientX: 100,
      clientY: 100,
    }),
  );
  button.dispatchEvent(
    new PointerEvent("pointerup", {
      pointerId: 2,
      clientX: -20,
      clientY: 100,
    }),
  );
  expect(emit).toHaveBeenCalledWith("success");
  cleanup();
});

it("keeps a rectangular swipe button where it was released and ignores clicks", () => {
  const button = document.createElement("button");
  button.setAttribute("data-putenggame-motion", "swipe-button");
  button.setAttribute("data-putenggame-motion-mode", "interactive");
  button.setAttribute("data-putenggame-motion-duration", "1");
  button.setAttribute("data-putenggame-motion-interaction", "swipe-left");
  button.setAttribute("data-putenggame-motion-signal", "success");
  const emit = vi.fn(async () => {});
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: () => "" },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit,
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });
  button.dispatchEvent(new PointerEvent("pointerdown", {
    pointerId: 1,
    clientX: 100,
    clientY: 100,
  }));
  button.dispatchEvent(new PointerEvent("pointermove", {
    pointerId: 1,
    clientX: 80,
    clientY: 100,
  }));
  button.dispatchEvent(new PointerEvent("pointerup", {
    pointerId: 1,
    clientX: 80,
    clientY: 100,
  }));
  const thumb = button.querySelector<HTMLElement>("[data-putenggame-swipe-thumb]")!;
  expect(Number.parseFloat(thumb.style.left)).toBeCloseTo(50, 3);
  button.click();
  expect(emit).not.toHaveBeenCalled();
  cleanup();
});

it("maps swipe movement to the rendered rail instead of a fixed distance", () => {
  const button = document.createElement("button");
  button.setAttribute("data-putenggame-motion", "swipe-button");
  button.setAttribute("data-putenggame-motion-mode", "interactive");
  button.setAttribute("data-putenggame-motion-duration", "1");
  button.setAttribute("data-putenggame-motion-interaction", "swipe-left");
  const emit = vi.fn(async () => {});
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: () => "" },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit,
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });
  const rail = button.querySelector<HTMLElement>(
    "[data-putenggame-swipe-rail]",
  )!;
  vi.spyOn(rail, "getBoundingClientRect").mockReturnValue({
    width: 200,
  } as DOMRect);
  const thumb = button.querySelector<HTMLElement>(
    "[data-putenggame-swipe-thumb]",
  )!;

  button.dispatchEvent(
    new PointerEvent("pointerdown", {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    }),
  );
  button.dispatchEvent(
    new PointerEvent("pointermove", {
      pointerId: 1,
      clientX: 50,
      clientY: 100,
    }),
  );

  expect(Number.parseFloat(thumb.style.left)).toBeCloseTo(63, 3);
  expect(emit).not.toHaveBeenCalled();
  cleanup();
});

it("uses the selected direction for one-way swipe buttons", () => {
  const button = document.createElement("button");
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "swipe-button",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "1",
    "data-putenggame-motion-interaction": "swipe-down",
    "data-putenggame-motion-signal": "success",
  }))
    button.setAttribute(name, value);
  const emit = vi.fn(async () => {});
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: () => "" },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit,
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });
  const rail = button.querySelector<HTMLElement>(
    "[data-putenggame-swipe-rail]",
  )!;
  const thumb = button.querySelector<HTMLElement>(
    "[data-putenggame-swipe-thumb]",
  )!;
  expect(rail.style.inset).toBe("4% 12%");
  expect(thumb.style.left).toBe("50%");
  expect(thumb.style.top).toBe("12%");

  button.dispatchEvent(
    new PointerEvent("pointerdown", {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    }),
  );
  button.dispatchEvent(
    new PointerEvent("pointermove", {
      pointerId: 1,
      clientX: 100,
      clientY: 140,
    }),
  );
  expect(thumb.style.top).toBe("88%");
  button.dispatchEvent(
    new PointerEvent("pointerup", {
      pointerId: 1,
      clientX: 100,
      clientY: 140,
    }),
  );
  expect(emit).toHaveBeenCalledWith("success");
  cleanup();
});

it("allows both directions on the selected axis for two-way swipe buttons", () => {
  const button = document.createElement("button");
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "swipe-button",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "1",
    "data-putenggame-motion-interaction": "swipe-left",
    "data-putenggame-motion-swipe-behavior": "two-way",
    "data-putenggame-motion-signal": "success",
  }))
    button.setAttribute(name, value);
  const emit = vi.fn(async () => {});
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: () => "" },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit,
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });
  const thumb = button.querySelector<HTMLElement>(
    "[data-putenggame-swipe-thumb]",
  )!;
  expect(thumb.style.left).toBe("50%");
  button.dispatchEvent(
    new PointerEvent("pointerdown", {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    }),
  );
  button.dispatchEvent(
    new PointerEvent("pointermove", {
      pointerId: 1,
      clientX: 140,
      clientY: 100,
    }),
  );
  expect(Number.parseFloat(thumb.style.left)).toBeGreaterThan(50);
  button.dispatchEvent(
    new PointerEvent("pointerup", {
      pointerId: 1,
      clientX: 160,
      clientY: 100,
    }),
  );
  expect(emit).toHaveBeenCalledWith("success");
  cleanup();
});

it("hides swipe decorations for floating buttons but keeps the base image", () => {
  const button = document.createElement("button");
  button.style.background = "red";
  button.style.border = "2px solid red";
  for (const [name, value] of Object.entries({
    "data-putenggame-button-asset": "base-image",
    "data-putenggame-motion": "swipe-button",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "1",
    "data-putenggame-motion-interaction": "swipe-up",
    "data-putenggame-motion-signal": "success",
    "data-putenggame-motion-swipe-style": "floating",
    "data-putenggame-motion-swipe-asset": "direction-image",
  }))
    button.setAttribute(name, value);
  const emit = vi.fn(async () => {});
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: (id) => `/assets/${id}.png` },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit,
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });

  expect(
    button.querySelector<HTMLElement>("[data-putenggame-button-asset-image]")
      ?.style.visibility,
  ).not.toBe("hidden");
  expect(button.querySelector("[data-putenggame-swipe-cue]")).toBeNull();
  expect(
    button.querySelector<HTMLElement>("[data-putenggame-swipe-rail]")
      ?.style.visibility,
  ).toBe("hidden");
  expect(
    button.querySelector<HTMLElement>("[data-putenggame-swipe-thumb]")
      ?.style.visibility,
  ).toBe("hidden");
  button.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 4,
      clientX: 20,
      clientY: 100,
    }),
  );
  button.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 4,
      clientX: 20,
      clientY: 20,
    }),
  );
  button.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 4,
      clientX: 20,
      clientY: 20,
    }),
  );
  expect(emit).toHaveBeenCalledWith("success");
  cleanup();
  expect(button.style.background).toBe("red");
  expect(button.style.border).toBe("2px solid red");
});

it("omits swipe hint animations while keeping the thumb draggable", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const animateDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "animate",
  );
  const animate = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  });
  const button = document.createElement("button");
  for (const [name, value] of Object.entries({
    "data-putenggame-button-asset": "base-image",
    "data-putenggame-motion": "swipe-button",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "1",
    "data-putenggame-motion-interaction": "swipe-left",
    "data-putenggame-motion-swipe-style": "base",
  }))
    button.setAttribute(name, value);
  const cleanup = mountPlayableMotionElement(button, {
    root: document.createElement("div").attachShadow({ mode: "open" }),
    assets: { url: (id) => `/assets/${id}.png` },
    state: {} as never,
    session: {} as never,
    story: {} as never,
    lifecycle: { signal: new AbortController().signal },
    navigation: {
      emit: async () => {},
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });
  const thumb = button.querySelector<HTMLElement>(
    "[data-putenggame-swipe-thumb]",
  )!;
  expect(
    button.querySelector("[data-putenggame-button-asset-image] img"),
  ).not.toBeNull();
  expect(button.querySelector("[data-putenggame-swipe-cue]")).toBeNull();
  expect(
    button.querySelector<HTMLElement>("[data-putenggame-swipe-rail]")
      ?.style.visibility,
  ).toBe("visible");
  expect(animate).not.toHaveBeenCalled();
  button.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 3,
      pointerType: "mouse",
      clientX: 20,
      clientY: 20,
    }),
  );
  button.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 3,
      pointerType: "mouse",
      clientX: 0,
      clientY: 20,
    }),
  );
  expect(Number.parseFloat(thumb.style.left)).toBeLessThan(88);
  button.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 3,
      pointerType: "mouse",
      clientX: 0,
      clientY: 20,
    }),
  );
  cleanup();
  expect(animate).not.toHaveBeenCalled();
  if (animateDescriptor)
    Object.defineProperty(
      HTMLElement.prototype,
      "animate",
      animateDescriptor,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, "animate");
  vi.restoreAllMocks();
});

it("rejects invalid required-click counts instead of treating a missing value as zero", () => {
  const button = document.createElement("button");
  button.setAttribute("data-putenggame-motion", "countdown");
  button.setAttribute("data-putenggame-motion-mode", "interactive");
  button.setAttribute("data-putenggame-motion-duration", "5");
  button.setAttribute("data-putenggame-motion-required-count", "0");
  expect(parsePlayableMotionConfig(button)).toBeUndefined();
  button.removeAttribute("data-putenggame-motion-required-count");
  expect(parsePlayableMotionConfig(button)?.requiredCount).toBeUndefined();
});

it("stores the node no-input option on the scene root and preserves other markup", () => {
  const html = '<main class="stage"><button>Go</button></main>';
  const enabled = setPlayableContinueWithoutInput(html, true)!;
  expect(playableContinueWithoutInput(enabled)).toBe(true);
  expect(enabled).toContain('<main class="stage" data-putenggame-continue-without-input="true">');
  expect(setPlayableContinueWithoutInput(enabled, false)).toBe(html);
  expect(playableContinueWithoutInput(html)).toBe(false);
});

it("keeps legacy no-input behavior and stores the explicit wait mode", () => {
  const legacy = '<main class="stage"><button>Go</button></main>';
  expect(playableNoInputMode(legacy)).toBeUndefined();
  const continued = setPlayableNoInputMode(legacy, "continue")!;
  expect(playableNoInputMode(continued)).toBe("continue");
  const waiting = setPlayableNoInputMode(legacy, "wait")!;
  expect(playableNoInputMode(waiting)).toBe("wait");
  expect(waiting).toContain('data-putenggame-no-input-mode="wait"');
  expect(setPlayableNoInputMode(waiting, undefined)).toBe(legacy);
});

it("inserts source-backed image and video assets into the Scene markup", () => {
  const image = insertPlayableMediaElement(
    '<main class="stage">\n</main>',
    "nodes/start/index.html",
    "portrait",
    "image",
    "putenggame-media-image",
  );
  const video = insertPlayableMediaElement(
    "<main>\n</main>",
    "nodes/start/index.html",
    "clip",
    "video",
    "putenggame-media-video",
  );
  const singlePlayVideo = insertPlayableMediaElement(
    "<main>\n</main>",
    "nodes/start/index.html",
    "clip-once",
    "video",
    "putenggame-media-video-once",
    false,
  );

  expect(image?.html).toContain(
    'id="putenggame-media-image" data-putenggame-asset="portrait"',
  );
  expect(image?.source).toBe("nodes/start/index.html:2:1");
  expect(video?.html).toContain(
    'data-putenggame-asset="clip" autoplay muted loop playsinline',
  );
  expect(video?.source).toBe("nodes/start/index.html:2:1");
  expect(singlePlayVideo?.html).toContain("autoplay muted playsinline");
  expect(singlePlayVideo?.html).not.toMatch(/<video[^>]*\sloop(?:\s|>)/);
});

it("inserts a source-backed button preset with an independently connectable signal", () => {
  const inserted = insertPlayableButtonPreset(
    '<main class="stage">\n</main>',
    "nodes/start/index.html",
    "putenggame-button-new",
    "button-1",
    "新按钮",
    {
      kind: "progress-ring",
      mode: "visual",
      duration: 5,
      signal: "button-1",
      ringAssetId: "ring-image",
      ringAssetScale: 135,
      barAssetId: "progress-image",
      ringFill: "deplete",
      ringRotation: "clockwise",
    },
    "base-image",
    "pressed-image",
    "继续",
    "Microsoft YaHei",
  );

  expect(inserted?.html).toContain(
    'id="putenggame-button-new" type="button" aria-label="继续" data-signal="button-1" data-putenggame-button-preset',
  );
  expect(inserted?.source).toBe("nodes/start/index.html:2:1");
  expect(inserted?.html).toContain('data-putenggame-motion="progress-ring"');
  expect(inserted?.html).toContain(
    "width:5em;height:5em;min-width:0;min-height:0;padding:0;border-radius:50%;aspect-ratio:1",
  );
  expect(inserted?.html).toContain(
    'data-putenggame-motion-signal="button-1"',
  );
  expect(inserted?.html).toContain(
    'data-putenggame-button-asset="base-image"',
  );
  expect(inserted?.html).toContain(
    'data-putenggame-motion-ring-asset-scale="135"',
  );
  expect(inserted?.html).toContain(
    'data-putenggame-button-pressed-asset="pressed-image"',
  );
  expect(inserted?.html).toContain(
    'font-family:Microsoft YaHei;cursor:pointer">继续</button>',
  );
  expect(inserted?.html).toContain(
    'data-putenggame-motion-bar-asset="progress-image"',
  );
  expect(
    insertPlayableButtonPreset(
      "<main></main>",
      "nodes/start/index.html",
      "putenggame-button-invalid",
      "not a signal",
      "Button",
    ),
  ).toBeUndefined();
});

it("inserts the circular bouncing click button as a round control", () => {
  const inserted = insertPlayableButtonPreset(
    "<main></main>",
    "nodes/start/index.html",
    "putenggame-button-bounce",
    "button-bounce",
    "点击",
    {
      kind: "button-feedback",
      mode: "interactive",
      duration: 0.1,
      feedback: "bounce-hover-press",
      interaction: "multi-click",
      requiredCount: 4,
      signal: "button-bounce",
    },
  );

  expect(inserted?.html).toContain(
    "width:5em;height:5em;min-width:0;min-height:0;padding:0;border-radius:50%;aspect-ratio:1",
  );
  expect(inserted?.html).toContain(
    'data-putenggame-motion-feedback="bounce-hover-press"',
  );
  expect(inserted?.html).toContain(
    'data-putenggame-motion-interaction="multi-click"',
  );
  expect(inserted?.html).toContain(
    'data-putenggame-motion-required-count="4"',
  );
  expect(inserted?.html).toContain(
    'data-putenggame-motion-signal="button-bounce"',
  );
});

it("adds a textless ripple-hint button that leaves its click handling alone", () => {
  const button = document.createElement("button");
  button.setAttribute("data-signal", "open-door");
  button.setAttribute("data-putenggame-motion", "button-feedback");
  button.setAttribute("data-putenggame-motion-mode", "visual");
  button.setAttribute("data-putenggame-motion-duration", "0.1");
  button.setAttribute("data-putenggame-motion-feedback", "ripple-hint");
  const existingClick = vi.fn();
  const emit = vi.fn(async () => {});
  button.addEventListener("click", existingClick);
  const root = document.createElement("div").attachShadow({ mode: "open" });
  root.append(button);
  const originalAnimate = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "animate",
  );
  const animations: Array<{ cancel: ReturnType<typeof vi.fn> }> = [];
  const animate = vi.fn(
    (_keyframes: Keyframe[], _options: KeyframeAnimationOptions) => {
      const animation = { cancel: vi.fn() };
      animations.push(animation);
      return animation as unknown as Animation;
    },
  );
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  });

  try {
    const cleanup = mountPlayableMotionElement(button, {
      root,
      assets: { url: () => "" },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: {
        emit,
        fail: emit,
        back: async () => {},
        connected: () => true,
      },
    });

    expect(button.querySelectorAll("[data-putenggame-ripple-hint]")).toHaveLength(2);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls[0]?.[1]).toMatchObject({
      duration: 1800,
      iterations: Infinity,
      delay: 0,
    });
    expect(animate.mock.calls[1]?.[1]).toMatchObject({
      duration: 1800,
      iterations: Infinity,
      delay: 900,
    });
    button.click();
    expect(existingClick).toHaveBeenCalledOnce();
    expect(emit).not.toHaveBeenCalled();

    cleanup();
    expect(button.querySelector("[data-putenggame-ripple-hint]")).toBeNull();
    expect(
      animations.every((animation) => animation.cancel.mock.calls.length === 1),
    ).toBe(true);
  } finally {
    if (originalAnimate)
      Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
    else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  }
});

it("inserts the ripple-hint preset without visible button text", () => {
  const inserted = insertPlayableButtonPreset(
    "<main></main>",
    "nodes/start/index.html",
    "putenggame-button-hint",
    "button-hint",
    "扩散提示",
    {
      kind: "button-feedback",
      mode: "visual",
      duration: 0.1,
      buttonShape: "circle",
      feedback: "ripple-hint",
    },
    undefined,
    undefined,
    "",
  );

  expect(inserted?.html).toContain('aria-label="扩散提示"');
  expect(inserted?.html).toContain('data-putenggame-motion-feedback="ripple-hint"');
  expect(inserted?.html).toContain(
    "width:2.2cqw;height:2.2cqw;min-width:0;min-height:0;padding:0;border-radius:50%",
  );
  expect(inserted?.html).toMatch(/<\/button>/);
  expect(inserted?.html).not.toContain(">扩散提示</button>");
});
