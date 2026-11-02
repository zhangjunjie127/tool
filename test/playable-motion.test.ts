// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import {
  PLAYABLE_MOTION_ATTRIBUTES,
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

  expect(button.style.transformOrigin).toBe("left top");
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

it("centers idle click feedback without changing authored button geometry", () => {
  const button = document.createElement("button");
  button.style.transform = "translate(-50%, -50%)";
  button.style.left = "37%";
  button.style.top = "62%";
  button.style.width = "84px";
  button.style.height = "52px";
  button.style.setProperty(
    "transform-origin",
    "126.94% 126.95%",
    "important",
  );
  button.setAttribute("data-putenggame-motion", "button-feedback");
  button.setAttribute("data-putenggame-motion-mode", "visual");
  button.setAttribute("data-putenggame-motion-duration", "0.1");
  button.setAttribute(
    "data-putenggame-motion-feedback",
    "idle-pulse-hover-press",
  );
  Object.defineProperty(button, "animate", {
    configurable: true,
    value: vi.fn(() => ({
      playState: "running",
      cancel: vi.fn(),
      finished: Promise.resolve(),
    })),
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

  expect(button.style.getPropertyValue("transform-origin")).toBe(
    "126.94% 126.95%",
  );
  expect(button.style.getPropertyPriority("transform-origin")).toBe(
    "important",
  );
  expect(button.style.left).toBe("37%");
  expect(button.style.top).toBe("62%");
  expect(button.style.width).toBe("84px");
  expect(button.style.height).toBe("52px");

  cleanup();
  expect(button.style.getPropertyValue("transform-origin")).toBe(
    "126.94% 126.95%",
  );
  expect(button.style.getPropertyPriority("transform-origin")).toBe(
    "important",
  );
});

it.each(["rectangle", "circle"] as const)(
  "keeps the %s click-button preset free of idle animation",
  (buttonShape) => {
    const button = document.createElement("button");
    button.style.transform = "translate(-50%, -50%)";
    button.setAttribute("data-putenggame-motion", "button-feedback");
    button.setAttribute("data-putenggame-motion-mode", "visual");
    button.setAttribute("data-putenggame-motion-duration", "0.1");
    button.setAttribute("data-putenggame-motion-feedback", "hover-press");
    button.setAttribute("data-putenggame-button-shape", buttonShape);
    const animate = vi.fn();
    Object.defineProperty(button, "animate", {
      configurable: true,
      value: animate,
    });
    const route = vi.fn();
    button.addEventListener("click", route);
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

    expect(animate).not.toHaveBeenCalled();
    expect(button.style.transformOrigin).toBe("");

    button.dispatchEvent(
      new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" }),
    );
    expect(button.style.transform).toBe("translate(-50%, -50%) scale(1.08)");
    button.click();
    expect(route).toHaveBeenCalledOnce();

    cleanup();
    expect(button.style.transformOrigin).toBe("");
  },
);

it.each(["rectangle", "circle"] as const)(
  "keeps the %s hint click-button press feedback after its first click",
  async (buttonShape) => {
    const button = document.createElement("button");
    button.style.transform = "translate(-50%, -50%)";
    button.setAttribute("data-putenggame-motion", "button-feedback");
    button.setAttribute("data-putenggame-motion-mode", "visual");
    button.setAttribute("data-putenggame-motion-duration", "0.1");
    button.setAttribute(
      "data-putenggame-motion-feedback",
      "idle-pulse-hover-press",
    );
    button.setAttribute("data-putenggame-button-shape", buttonShape);
    button.style.boxShadow = "0 0 2px rgb(0 0 0 / 20%)";
    let playState: Animation["playState"] = "running";
    const animation = {
      get playState() {
        return playState;
      },
      cancel: vi.fn(() => {
        playState = "idle";
      }),
      pause: vi.fn(() => {
        if (playState === "idle")
          throw new Error("Cannot pause a cancelled animation");
      }),
      play: vi.fn(() => {
        playState = "running";
      }),
      finished: Promise.resolve(),
    } as unknown as Animation;
    const animate = vi.fn(
      (_frames: Keyframe[], _options: KeyframeAnimationOptions) => animation,
    );
    Object.defineProperty(button, "animate", {
      configurable: true,
      value: animate,
    });
    const route = vi.fn();
    button.addEventListener("click", route);
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

    expect(parsePlayableMotionConfig(button)?.feedback).toBe(
      "idle-pulse-hover-press",
    );
    expect(animate).toHaveBeenCalledOnce();
    expect(animate.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transform: "translate(-50%, -50%) scale(1.06)",
        }),
      ]),
    );
    expect(
      animate.mock.calls[0]?.[0].some((frame) => "boxShadow" in frame),
    ).toBe(false);
    expect(button.style.boxShadow).toBe("0 0 2px rgb(0 0 0 / 20%)");
    button.click();
    expect(animation.cancel).toHaveBeenCalledOnce();
    expect(route).toHaveBeenCalledOnce();
    button.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
    );
    expect(button.style.transform).toBe(
      "translate(-50%, -50%) scale(0.92)",
    );
    window.dispatchEvent(
      new PointerEvent("pointerup", { pointerType: "mouse" }),
    );
    await Promise.resolve();
    expect(button.style.transform).toBe("translate(-50%, -50%)");

    cleanup();
  },
);

it("keeps countdown progress without numeric text and gives the button press feedback", () => {
  const button = document.createElement("button");
  button.textContent = "倒计时";
  button.style.transform = "translate(-50%, -50%)";
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "countdown",
    "data-putenggame-motion-mode": "visual",
    "data-putenggame-motion-duration": "5",
    "data-putenggame-motion-feedback": "hover-press",
  }))
    button.setAttribute(name, value);
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

  expect(button.textContent).toBe("倒计时");
  expect(button.querySelector("[data-putenggame-motion-label]")).toBeNull();
  expect(button.querySelector("[data-putenggame-motion-fill]")).not.toBeNull();
  expect(
    button.querySelector("[data-putenggame-motion-fill]")?.parentElement
      ?.style.height,
  ).toBe("8%");

  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  expect(button.style.transform).toBe("translate(-50%, -50%) scale(0.92)");
  window.dispatchEvent(new PointerEvent("pointerup"));
  expect(button.style.transform).toBe("translate(-50%, -50%)");

  cleanup();
});

it("renders a circular countdown as a shrinking ring instead of a horizontal bar", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window.performance, "now").mockReturnValue(100);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const button = document.createElement("button");
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "countdown",
    "data-putenggame-motion-mode": "visual",
    "data-putenggame-motion-duration": "4",
    "data-putenggame-button-shape": "circle",
  }))
    button.setAttribute(name, value);
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

  const ring = button.querySelector("svg circle:last-child")!;
  expect(ring).not.toBeNull();
  expect(button.querySelector("[data-putenggame-motion-fill]")).toBeNull();
  expect(ring.getAttribute("stroke-dashoffset")).toBe("0");

  frames.shift()!(2100);
  expect(ring.getAttribute("stroke-dashoffset")).toBe(
    String((2 * Math.PI * 44) / 2),
  );

  cleanup();
  vi.restoreAllMocks();
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
  expect(button.style.transformOrigin).toBe("");
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

it("plays the hold-charge scale hint without an idle outer glow", async () => {
  const button = document.createElement("button");
  button.style.transform = "translate(-50%, -50%)";
  button.style.boxShadow = "none";
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "hold-charge",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "3",
    "data-putenggame-motion-interaction": "hold",
  }))
    button.setAttribute(name, value);
  document.body.append(button);

  const animations: Array<{ cancel: ReturnType<typeof vi.fn>; playState: string }> = [];
  const animate = vi.fn((_keyframes: Keyframe[], _options: KeyframeAnimationOptions) => {
    const animation = {
      playState: "running",
      finished: Promise.resolve(),
      cancel: vi.fn(() => {
        animation.playState = "idle";
      }),
    };
    animations.push(animation);
    return animation as unknown as Animation;
  });
  Object.defineProperty(button, "animate", { configurable: true, value: animate });
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

  const keyframes = animate.mock.calls[0]![0] as Keyframe[];
  expect(keyframes[1]).toMatchObject({
    transform: "translate(-50%, -50%) scale(1.06)",
  });
  expect(keyframes.some((frame) => "boxShadow" in frame)).toBe(false);
  expect(animate.mock.calls[0]![1]).toEqual(
    expect.objectContaining({ iterations: Infinity }),
  );

  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  expect(animations[0]!.cancel).toHaveBeenCalledOnce();
  expect(button.style.transform).toBe("translate(-50%, -50%)");
  expect(button.style.boxShadow).toBe("none");
  button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  await Promise.resolve();
  expect(animate).toHaveBeenCalledTimes(2);
  expect(button.style.transform).toBe("translate(-50%, -50%)");

  cleanup();
  button.remove();
});

it("fits replacement images without changing the button frame's border geometry", () => {
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
  expect(button.style.border).toBe("1px solid transparent");
  expect(button.style.borderWidth).toBe("1px");
  expect(button.style.borderStyle).toBe("solid");
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
  button.style.left = "42%";
  button.style.top = "35%";
  button.style.width = "180px";
  button.style.height = "48px";
  button.style.border = "1px solid white";
  button.setAttribute("data-putenggame-button-asset", "normal");
  button.setAttribute("data-putenggame-button-pressed-asset", "pressed");
  button.setAttribute("data-putenggame-button-asset-scale-x", "150");
  button.setAttribute("data-putenggame-button-asset-scale-y", "150");
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
  const normalImage = normal.querySelector<HTMLImageElement>("img")!;
  const pressedImage = pressed.querySelector<HTMLImageElement>("img")!;
  expect(pressed.style.visibility).toBe("hidden");
  expect(normal.style.visibility).toBe("visible");
  expect(normalImage.style.objectFit).toBe("contain");
  expect(pressedImage.style.objectFit).toBe("contain");
  expect(button.style.scale).toBe("1.5 1.5");
  expect(button.style).toMatchObject({
    left: "42%",
    top: "35%",
    width: "180px",
    height: "48px",
    borderWidth: "1px",
    borderStyle: "solid",
  });
  button.dispatchEvent(
    new PointerEvent("pointerenter", {
      bubbles: true,
      pointerType: "mouse",
    }),
  );
  expect(pressed.style.visibility).toBe("visible");
  expect(normal.style.visibility).toBe("hidden");
  expect(button.style.scale).toBe("1.5 1.5");
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
  expect(button.style.scale).toBe("1.62 1.62");
  window.dispatchEvent(new PointerEvent("pointerup"));
  expect(pressed.style.visibility).toBe("hidden");
  expect(normal.style.visibility).toBe("visible");
  expect(button.style.scale).toBe("1.5 1.5");
  expect(button.style.transition).toContain("transform 180ms ease");
  expect(button.style.transition).toContain("scale 120ms ease");
  button.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  expect(pressed.style.visibility).toBe("visible");
  expect(normal.style.visibility).toBe("hidden");
  expect(button.style.scale).toBe("1.62 1.62");
  button.dispatchEvent(
    new KeyboardEvent("keyup", { key: "Enter", bubbles: true }),
  );
  expect(pressed.style.visibility).toBe("hidden");
  expect(normal.style.visibility).toBe("visible");
  expect(button.style.scale).toBe("1.5 1.5");
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

  button.setAttribute("data-putenggame-button-asset", "replacement");
  button.setAttribute("data-putenggame-button-pressed-asset", "pressed-replacement");
  const replacementCleanup = mountPlayableMotionElement(button, {
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
    button.querySelector<HTMLImageElement>(
      "[data-putenggame-button-asset-image] img",
    )?.src,
  ).toContain("/assets/replacement.png");
  expect(
    button.querySelector<HTMLImageElement>(
      "[data-putenggame-button-pressed-image] img",
    )?.src,
  ).toContain("/assets/pressed-replacement.png");
  expect(button.style).toMatchObject({
    left: "42%",
    top: "35%",
    width: "180px",
    height: "48px",
    scale: "1.5 1.5",
    borderWidth: "1px",
    borderStyle: "solid",
  });
  replacementCleanup();
});

it("shows hover feedback from XR pointer movement without treating touch as hover", () => {
  const button = document.createElement("button");
  button.setAttribute("data-putenggame-button-asset", "normal");
  button.setAttribute("data-putenggame-button-pressed-asset", "pressed");
  button.setAttribute("data-putenggame-motion", "button-feedback");
  button.setAttribute("data-putenggame-motion-mode", "visual");
  button.setAttribute("data-putenggame-motion-duration", "5");
  button.setAttribute("data-putenggame-motion-feedback", "hover-press");
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

  const xrMove = new PointerEvent("pointermove", {
    bubbles: true,
    pointerType: "xr",
    clientX: 20,
    clientY: 20,
  });
  expect(xrMove.pointerType).toBe("xr");
  expect(xrMove.bubbles).toBe(true);
  button.dispatchEvent(xrMove);

  expect(pressed.style.visibility).toBe("visible");
  expect(button.style.transform).toContain("scale(1.08)");

  button.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "xr" }));
  button.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      pointerType: "touch",
      clientX: 20,
      clientY: 20,
    }),
  );

  expect(pressed.style.visibility).toBe("hidden");
  expect(button.style.transform).toBe("");

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
    "data-putenggame-motion-feedback": "bounce-hover-press",
  }))
    charge.setAttribute(name, value);
  const chargeCleanup = mountPlayableMotionElement(charge, createContext());
  const chargeFill = charge.querySelector<HTMLElement>(
    "[data-putenggame-motion-fill]",
  )!;
  expect(chargeFill.style.transformOrigin).toBe("left center");
  expect(chargeFill.style.transform).toBe("scaleX(0)");
  charge.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  frames.pop()!(2100);
  expect(chargeFill.style.transform).toBe("scaleX(0.5)");
  frames.pop()!(4100);
  expect(chargeFill.style.transform).toBe("scaleX(1)");
  chargeCleanup();
  vi.restoreAllMocks();
});

it("renders a circular hold-charge button with a growing ring and no bar", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window.performance, "now").mockReturnValue(100);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const button = document.createElement("button");
  button.style.transform = "translate(-50%, -50%)";
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "hold-charge",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "4",
    "data-putenggame-motion-timeout-duration": "8",
    "data-putenggame-motion-interaction": "hold",
    "data-putenggame-button-shape": "circle",
    "data-putenggame-button-asset": "base",
    "data-putenggame-motion-feedback": "bounce-hover-press",
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

  const ring = button.querySelector<SVGCircleElement>("svg circle:last-child")!;
  expect(ring).not.toBeNull();
  expect(ring.style.visibility).toBe("hidden");
  expect(button.querySelector("[data-putenggame-motion-fill]")).toBeNull();
  expect(button.style.width).toBe("5em");
  expect(button.style.height).toBe("5em");

  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  frames.pop()!(2100);
  expect(
    Number(ring.getAttribute("stroke-dasharray")?.split(" ")[0]),
  ).toBeCloseTo((2 * Math.PI * 44) / 2);
  expect(ring.style.visibility).toBe("visible");
  expect(button.style.transform).toBe("translate(-50%, -50%)");
  expect(button.style.width).toBe("5em");
  expect(button.style.height).toBe("5em");

  button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  expect(ring.style.visibility).toBe("hidden");
  cleanup();
  vi.restoreAllMocks();
});

it("replaces the circular hold-charge track with its selected progress image", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window.performance, "now").mockReturnValue(100);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const button = document.createElement("button");
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "hold-charge",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "4",
    "data-putenggame-motion-interaction": "hold",
    "data-putenggame-button-shape": "circle",
    "data-putenggame-motion-bar-asset": "progress-image",
    "data-putenggame-motion-bar-asset-scale": "125",
    "data-putenggame-motion-bar-asset-x": "4",
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

  const image = button.querySelector<SVGImageElement>(
    "svg image[data-putenggame-motion-bar]",
  )!;
  expect(image).not.toBeNull();
  expect(image.getAttribute("href")).toContain("/assets/progress-image.png");
  expect(image.ownerSVGElement?.style.transform).toBe("");
  const progress = button.querySelector<SVGPathElement>(
    "svg mask path[data-putenggame-motion-progress-mask]",
  )!;
  expect(progress).not.toBeNull();
  expect(progress.getAttribute("d")).toBe("");
  expect(progress.style.visibility).toBe("hidden");

  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  frames.pop()!(1100);
  expect(progress.getAttribute("d")).toContain(
    "M 50 50 L 50 -50 A 100 100 0 0 1 150 50 Z",
  );
  frames.pop()!(2100);
  expect(progress.style.visibility).toBe("visible");
  expect(progress.getAttribute("d")).toContain("A 100 100 0 0 1 50 150");
  expect(progress.getAttribute("d")).not.toContain("A 40 40");
  expect(image.getAttribute("width")).toBe("125");
  expect(image.getAttribute("x")).toBe("-9.14");
  expect(image.getAttribute("y")).toBe("-12.5");
  expect(image.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");

  button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  expect(progress.style.visibility).toBe("hidden");
  expect(progress.getAttribute("d")).toBe("");

  button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  frames.pop()!(4100);
  expect(progress.style.visibility).toBe("visible");
  expect(progress.getAttribute("d")).toContain(
    "A 100 100 0 0 1 50 150 A 100 100 0 0 1 50 -50",
  );
  cleanup();
  vi.restoreAllMocks();
});

it.each([-82, -77])(
  "keeps a circular hold-charge progress image visible with legacy rail offset %i",
  (offsetY) => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window.performance, "now").mockReturnValue(100);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const button = document.createElement("button");
    for (const [name, value] of Object.entries({
      "data-putenggame-motion": "hold-charge",
      "data-putenggame-motion-mode": "interactive",
      "data-putenggame-motion-duration": "5",
      "data-putenggame-button-shape": "circle",
      "data-putenggame-motion-bar-asset": "4",
      "data-putenggame-motion-bar-asset-scale": "103",
      "data-putenggame-motion-bar-asset-x": "-1",
      "data-putenggame-motion-bar-asset-y": String(offsetY),
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

    const image = button.querySelector<SVGImageElement>(
      "svg image[data-putenggame-motion-bar]",
    )!;
    const progress = button.querySelector<SVGPathElement>(
      "svg mask path[data-putenggame-motion-progress-mask]",
    )!;
    expect(image.getAttribute("x")).toBe("-2.34");
    expect(image.getAttribute("y")).toBe(
      String(Number((-1.5 + offsetY * 0.036).toFixed(3))),
    );

    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    frames.pop()!(1350);
    expect(progress.style.visibility).toBe("visible");
    expect(progress.getAttribute("d")).toContain(
      "M 50 50 L 50 -50 A 100 100 0 0 1 150 50",
    );
    cleanup();
    vi.restoreAllMocks();
  },
);

it("keeps a delayed circular charge button usable and repeatable after it appears", () => {
  const frames: FrameRequestCallback[] = [];
  let now = 100;
  vi.spyOn(window.performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const button = document.createElement("button");
  button.style.scale = "1.8";
  button.setAttribute("data-playable-timing-hidden", "");
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "hold-charge",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "4",
    "data-putenggame-motion-timeout-duration": "8",
    "data-putenggame-button-shape": "circle",
    "data-putenggame-motion-bar-asset": "4",
    "data-putenggame-motion-bar-asset-scale": "103",
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
  const progress = button.querySelector<SVGPathElement>(
    "svg mask path[data-putenggame-motion-progress-mask]",
  )!;
  const image = button.querySelector<SVGImageElement>(
    "svg image[data-putenggame-motion-bar]",
  )!;
  const svg = image.ownerSVGElement!;
  expect(button.style.scale).toBe("1.8");
  expect(svg.style.width).toBe("100%");
  expect(svg.style.height).toBe("100%");

  frames.pop()!(116);
  now = 10_116;
  frames.pop()!(now);
  button.removeAttribute("data-playable-timing-hidden");

  const chargeOnce = () => {
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    now += 2_000;
    frames.pop()!(now);
    expect(progress.style.visibility).toBe("visible");
    expect(progress.getAttribute("d")).toContain("A 100 100 0 0 1");
    button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    expect(progress.style.visibility).toBe("hidden");
  };
  chargeOnce();
  chargeOnce();

  cleanup();
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
  expect(fill.parentElement?.style.background).toBe("transparent");
  frames.shift()!(4100);
  expect(fill.style.transform).toBe("scaleX(0)");
  cleanup();
  vi.restoreAllMocks();
});

it("keeps the progress rail inside the button and orders it above or below its label", () => {
  const mount = (barLayer: "bottom" | "top") => {
    const button = document.createElement("button");
    button.textContent = "Charge";
    for (const [name, value] of Object.entries({
      "data-putenggame-motion": "hold-charge",
      "data-putenggame-motion-mode": "interactive",
      "data-putenggame-motion-duration": "3",
      "data-putenggame-motion-interaction": "hold",
      "data-putenggame-motion-bar-layer": barLayer,
      "data-putenggame-button-asset": "button-image",
    }))
      button.setAttribute(name, value);
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
    }, "/assets/button-image.png");
    return { button, cleanup };
  };

  const bottom = mount("bottom");
  const bottomOverlay = bottom.button.querySelector<HTMLElement>(
    "[data-putenggame-motion-ui]",
  )!;
  const label = bottom.button.querySelector<HTMLElement>(
    "[data-putenggame-button-label]",
  )!;
  expect(bottomOverlay.style.zIndex).toBe("-2");
  expect(
    bottom.button.querySelector<HTMLElement>(
      "[data-putenggame-button-asset-image]",
    )?.style.zIndex,
  ).toBe("-1");
  expect(label.style.zIndex).toBe("1");
  expect(parsePlayableMotionConfig(bottom.button)?.barLayer).toBe("bottom");
  bottom.cleanup();
  expect(bottom.button.textContent).toBe("Charge");
  expect(
    bottom.button.querySelector("[data-putenggame-button-label]"),
  ).toBeNull();

  const top = mount("top");
  expect(
    top.button.querySelector<HTMLElement>("[data-putenggame-motion-ui]")
      ?.style.zIndex,
  ).toBe("2");
  top.cleanup();
});

it("uses the same circular progress asset frame for editor previews and playback", async () => {
  const { circularHoldChargeAssetFrame } = await import(
    "../src/shared/playable-motion.js"
  );
  expect(
    circularHoldChargeAssetFrame({
      scale: 125,
      offsetX: 4,
      offsetY: -12,
    }),
  ).toEqual({
    x: -9.14,
    y: -12.932,
    width: 125,
    height: 125,
  });
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

it("keeps feedback centered without changing the editor's transform origin", () => {
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
      const shiftX = origin === "80% 40%" && isScaled ? 20 : 0;
      const shiftY = origin === "80% 40%" && isScaled ? 10 : 0;
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

  expect(button.style.getPropertyValue("transform-origin")).toBe("80% 40%");
  expect(button.style.getPropertyPriority("transform-origin")).toBe("important");
  expect(button.style.transform).toMatch(
    /^translate\(-20px,\s*-10px\) translate\(-50%, -50%\) scale\(1\.08\)$/,
  );
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
  expect(button.style.getPropertyValue("transform-origin")).toBe("80% 40%");

  button.dispatchEvent(
    new PointerEvent("pointerleave", { pointerType: "mouse" }),
  );
  expect(button.style.getPropertyValue("transform-origin")).toBe("80% 40%");
  expect(button.style.getPropertyPriority("transform-origin")).toBe("important");
  expect(button.style.transform).toBe("translate(-50%, -50%)");

  cleanup();
});

it("compensates idle pulse position while retaining an authored transform origin", () => {
  const button = document.createElement("button");
  button.style.transform = "translate(-50%, -50%)";
  button.style.setProperty("transform-origin", "80% 40%", "important");
  button.setAttribute("data-putenggame-motion", "button-feedback");
  button.setAttribute("data-putenggame-motion-mode", "visual");
  button.setAttribute("data-putenggame-motion-duration", "0.1");
  button.setAttribute(
    "data-putenggame-motion-feedback",
    "idle-pulse-hover-press",
  );
  Object.defineProperty(button, "getBoundingClientRect", {
    value: () => {
      const transform = button.style.transform;
      const compensation =
        /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(transform);
      const x = compensation ? Number(compensation[1]) : 0;
      const y = compensation ? Number(compensation[2]) : 0;
      const scaled = transform.includes("scale(1.06)");
      const shiftX = scaled ? 20 : 0;
      const shiftY = scaled ? 10 : 0;
      return {
        left: 150 + shiftX + x,
        top: 130 + shiftY + y,
        right: 250 + shiftX + x,
        bottom: 170 + shiftY + y,
        width: 100,
        height: 40,
      } as DOMRect;
    },
  });
  const animate = vi.fn(
    (_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({
      playState: "running",
      cancel: vi.fn(),
      finished: Promise.resolve(),
    }),
  );
  Object.defineProperty(button, "animate", {
    configurable: true,
    value: animate,
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

  expect(button.style.getPropertyValue("transform-origin")).toBe("80% 40%");
  expect(button.style.getPropertyPriority("transform-origin")).toBe("important");
  expect(animate.mock.calls[0]?.[0]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        transform:
          "translate(-20px, -10px) translate(-50%, -50%) scale(1.06)",
      }),
    ]),
  );
  cleanup();
  expect(button.style.getPropertyValue("transform-origin")).toBe("80% 40%");
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

it("moves a floating swipe button along its hidden directional track", () => {
  const button = document.createElement("button");
  button.style.left = "50%";
  button.style.top = "50%";
  button.style.transform = "translate(-50%, -50%)";
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "swipe-button",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "1",
    "data-putenggame-motion-interaction": "swipe-up",
    "data-putenggame-motion-swipe-style": "floating",
    "data-putenggame-motion-swipe-behavior": "one-way",
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
  expect(button.style.left).toBe("50%");
  expect(button.style.top).toBe("50%");
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
    new PointerEvent("pointermove", {
      pointerId: 2,
      clientX: 100,
      clientY: 60,
    }),
  );
  expect(button.style.top).toBe("calc(50% - 40px)");
  expect(button.style.left).toBe("50%");

  button.dispatchEvent(
    new PointerEvent("pointerup", {
      pointerId: 2,
      clientX: 100,
      clientY: 60,
    }),
  );
  expect(emit).toHaveBeenCalledWith("success");
  cleanup();
  expect(button.style.top).toBe("50%");
  expect(button.style.left).toBe("50%");
});

it("moves a floating two-way swipe button on its selected axis", () => {
  const button = document.createElement("button");
  button.style.left = "50%";
  button.style.top = "50%";
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "swipe-button",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "1",
    "data-putenggame-motion-interaction": "swipe-left",
    "data-putenggame-motion-swipe-style": "floating",
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
      clientY: 60,
    }),
  );
  expect(button.style.left).toBe("50%");
  expect(button.style.top).toBe("50%");
  button.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 }));

  button.dispatchEvent(
    new PointerEvent("pointerdown", {
      pointerId: 2,
      clientX: 100,
      clientY: 100,
    }),
  );
  button.dispatchEvent(
    new PointerEvent("pointermove", {
      pointerId: 2,
      clientX: 140,
      clientY: 100,
    }),
  );
  expect(button.style.left).toBe("calc(50% + 40px)");
  expect(button.style.top).toBe("50%");
  button.dispatchEvent(
    new PointerEvent("pointerup", {
      pointerId: 2,
      clientX: 140,
      clientY: 100,
    }),
  );
  expect(emit).toHaveBeenCalledWith("success");
  cleanup();
});

it("limits a floating swipe to the displayed arrow length", () => {
  const surface = document.createElement("div");
  const root = surface.attachShadow({ mode: "open" });
  const button = document.createElement("button");
  root.append(button);
  button.style.left = "50%";
  button.style.top = "50%";
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "swipe-button",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "1",
    "data-putenggame-motion-interaction": "swipe-up",
    "data-putenggame-motion-swipe-style": "floating",
    "data-putenggame-motion-signal": "success",
  }))
    button.setAttribute(name, value);
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
      fail: async () => {},
      back: async () => {},
      connected: () => true,
    },
  });
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 300,
    bottom: 200,
    width: 300,
    height: 200,
  } as DOMRect);
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
    left: 110,
    top: 60,
    right: 190,
    bottom: 140,
    width: 80,
    height: 80,
  } as DOMRect);
  Object.defineProperty(button, "offsetWidth", { configurable: true, value: 80 });
  Object.defineProperty(button, "offsetHeight", { configurable: true, value: 80 });

  button.dispatchEvent(
    new PointerEvent("pointerdown", {
      pointerId: 1,
      clientX: 150,
      clientY: 100,
    }),
  );
  button.dispatchEvent(
    new PointerEvent("pointermove", {
      pointerId: 1,
      clientX: 150,
      clientY: 5,
    }),
  );
  expect(button.style.top).toBe("calc(50% - 95px)");
  expect(emit).not.toHaveBeenCalled();
  button.dispatchEvent(
    new PointerEvent("pointermove", {
      pointerId: 1,
      clientX: 150,
      clientY: -20,
    }),
  );
  expect(button.style.top).toBe("calc(50% - 96px)");
  button.dispatchEvent(
    new PointerEvent("pointerup", {
      pointerId: 1,
      clientX: 150,
      clientY: 0,
    }),
  );
  expect(emit).toHaveBeenCalledWith("success");
  cleanup();
});

it("disables a floating swipe button after its first successful swipe", () => {
  const button = document.createElement("button");
  button.style.left = "50%";
  button.style.top = "50%";
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "swipe-button",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "10",
    "data-putenggame-motion-interaction": "swipe-up",
    "data-putenggame-motion-swipe-style": "floating",
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
  const swipe = (pointerId: number) => {
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId,
        clientX: 100,
        clientY: 100,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId,
        clientX: 100,
        clientY: 60,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId,
        clientX: 100,
        clientY: 60,
      }),
    );
  };

  swipe(1);
  expect(emit).toHaveBeenCalledTimes(1);
  expect(button.style.top).toBe("calc(50% - 40px)");
  swipe(2);
  expect(emit).toHaveBeenCalledTimes(1);
  expect(button.style.top).toBe("calc(50% - 40px)");
  cleanup();
});

it("pulses floating swipe buttons while idle and stops the hint after success", async () => {
  const button = document.createElement("button");
  button.style.left = "50%";
  button.style.top = "50%";
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "swipe-button",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "10",
    "data-putenggame-motion-interaction": "swipe-up",
    "data-putenggame-motion-swipe-style": "floating",
    "data-putenggame-motion-signal": "success",
  }))
    button.setAttribute(name, value);
  document.body.append(button);
  const animations: Array<{ cancel: ReturnType<typeof vi.fn>; playState: string }> = [];
  const animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => {
    const animation = {
      playState: "running",
      finished: Promise.resolve(),
      cancel: vi.fn(() => {
        animation.playState = "idle";
      }),
    };
    animations.push(animation);
    return animation as unknown as Animation;
  });
  Object.defineProperty(button, "animate", { configurable: true, value: animate });
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

  expect(animate).toHaveBeenCalledOnce();
  expect(animate.mock.calls[0]![0][1]).toEqual(
    expect.objectContaining({
      transform: "scale(1.06)",
      boxShadow: "0 0 0.45em 0.16em currentColor",
    }),
  );

  const swipe = (pointerId: number, distance: number) => {
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId,
        clientX: 100,
        clientY: 100,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId,
        clientX: 100,
        clientY: 100 - distance,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId,
        clientX: 100,
        clientY: 100 - distance,
      }),
    );
    button.dispatchEvent(
      new PointerEvent("pointerleave", {
        pointerId,
        pointerType: "mouse",
      }),
    );
  };

  swipe(1, 20);
  await Promise.resolve();
  expect(animations[0]!.cancel).toHaveBeenCalledOnce();
  expect(animate).toHaveBeenCalledTimes(2);
  swipe(2, 40);
  await Promise.resolve();
  expect(emit).toHaveBeenCalledOnce();
  expect(animate).toHaveBeenCalledTimes(2);

  cleanup();
  button.remove();
  vi.restoreAllMocks();
});

it("hides a floating swipe button after success when the preset requests it", () => {
  const button = document.createElement("button");
  button.style.left = "50%";
  button.style.top = "50%";
  button.style.visibility = "visible";
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "swipe-button",
    "data-putenggame-motion-mode": "interactive",
    "data-putenggame-motion-duration": "10",
    "data-putenggame-motion-interaction": "swipe-up",
    "data-putenggame-motion-swipe-style": "floating",
    "data-putenggame-motion-disappear-after-swipe": "true",
    "data-putenggame-motion-signal": "success",
  }))
    button.setAttribute(name, value);
  expect(parsePlayableMotionConfig(button)?.disappearAfterSwipe).toBe(true);
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
      clientY: 60,
    }),
  );
  button.dispatchEvent(
    new PointerEvent("pointerup", {
      pointerId: 1,
      clientX: 100,
      clientY: 60,
    }),
  );

  expect(button.style.visibility).toBe("hidden");
  cleanup();
  expect(button.style.visibility).toBe("visible");
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
      barLayer: "bottom",
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
  expect(inserted?.html).toContain(
    'data-putenggame-motion-bar-layer="bottom"',
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

it("inserts a video-end return button with both image states and its label", () => {
  const inserted = insertPlayableButtonPreset(
    "<main></main>",
    "nodes/ending/index.html",
    "putenggame-button-back",
    undefined,
    "返回",
    {
      kind: "button-feedback",
      mode: "visual",
      duration: 0.1,
      feedback: "hover-press",
    },
    "back-normal",
    "back-pressed",
    "重新选择",
    undefined,
    "back",
  );

  expect(inserted?.html).toContain(
    'data-putenggame-button-action="back" data-putenggame-show-after-video-end',
  );
  expect(inserted?.html).toContain(
    'data-putenggame-button-asset="back-normal"',
  );
  expect(inserted?.html).toContain(
    'data-putenggame-button-pressed-asset="back-pressed"',
  );
  expect(inserted?.html).toContain('aria-label="重新选择"');
  expect(inserted?.html).toContain(">重新选择</button>");
  expect(inserted?.html).toContain(
    "width:14cqw;height:auto;min-width:0;min-height:0;padding:0;border-radius:0;aspect-ratio:auto",
  );
});

it("matches the return-button frame to its normal-state image ratio", () => {
  const button = document.createElement("button");
  button.style.width = "14cqw";
  button.style.height = "auto";
  button.setAttribute(PLAYABLE_MOTION_ATTRIBUTES.buttonAction, "back");
  button.setAttribute(PLAYABLE_MOTION_ATTRIBUTES.asset, "return-normal");
  button.setAttribute(PLAYABLE_MOTION_ATTRIBUTES.kind, "button-feedback");
  button.setAttribute(PLAYABLE_MOTION_ATTRIBUTES.mode, "visual");
  button.setAttribute(PLAYABLE_MOTION_ATTRIBUTES.duration, "0.1");
  button.setAttribute(PLAYABLE_MOTION_ATTRIBUTES.feedback, "hover-press");
  const cleanup = mountPlayableMotionElement(
    button,
    {
      root: document.createElement("div").attachShadow({ mode: "open" }),
      assets: { url: () => "/return.png" },
      state: {} as never,
      session: {} as never,
      story: {} as never,
      lifecycle: { signal: new AbortController().signal },
      navigation: {
        emit: async () => {},
        fail: async () => {},
        back: async () => {},
        connected: () => false,
      },
    },
    "/return.png",
  );
  const image = button.querySelector<HTMLImageElement>(
    "[data-putenggame-button-asset-image] img",
  )!;
  Object.defineProperty(image, "naturalWidth", {
    configurable: true,
    value: 240,
  });
  Object.defineProperty(image, "naturalHeight", {
    configurable: true,
    value: 80,
  });
  image.dispatchEvent(new Event("load"));

  expect(button.style.aspectRatio).toBe("240 / 80");
  cleanup();
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

it("stores a press effect and its attachment point on the button preset", () => {
  const inserted = insertPlayableButtonPreset(
    "<main></main>",
    "nodes/start/index.html",
    "putenggame-button-burst",
    "next",
    "继续",
    {
      kind: "button-feedback",
      mode: "visual",
      duration: 0.1,
      feedback: "hover-press",
      pressEffect: "green-particle-burst",
      effectColor: "#3478f6",
      effectAnchorX: 24,
      effectAnchorY: 73,
      effectOffsetX: 8,
      effectOffsetY: -4,
    },
  );
  const host = document.createElement("div");
  host.innerHTML = inserted!.html;
  const button = host.querySelector("button")!;

  expect(button.getAttribute("data-putenggame-motion-press-effect")).toBe(
    "green-particle-burst",
  );
  expect(parsePlayableMotionConfig(button)).toEqual(
    expect.objectContaining({
      pressEffect: "green-particle-burst",
      effectColor: "#3478f6",
      effectAnchorX: 24,
      effectAnchorY: 73,
      effectOffsetX: 8,
      effectOffsetY: -4,
    }),
  );
  button.setAttribute("data-putenggame-motion-effect-anchor-x", "101");
  expect(parsePlayableMotionConfig(button)).toBeUndefined();
  button.setAttribute("data-putenggame-motion-effect-anchor-x", "24");
  button.setAttribute("data-putenggame-motion-effect-color", "blue");
  expect(parsePlayableMotionConfig(button)).toBeUndefined();
  button.setAttribute("data-putenggame-motion-effect-color", "#3478f6");
  button.setAttribute("data-putenggame-motion-effect-offset-x", "501");
  expect(parsePlayableMotionConfig(button)).toBeUndefined();
});

it("plays the particle burst from the button anchor, supports repeat presses, and cleans up", () => {
  const originalAnimate = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "animate",
  );
  const animations: { cancel: ReturnType<typeof vi.fn> }[] = [];
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: vi.fn(() => {
      const animation = { cancel: vi.fn() };
      animations.push(animation);
      return animation as unknown as Animation;
    }),
  });

  const button = document.createElement("button");
  button.style.position = "absolute";
  button.style.overflow = "hidden";
  const originalBox = {
    x: 40,
    y: 20,
    left: 40,
    top: 20,
    right: 160,
    bottom: 68,
    width: 120,
    height: 48,
    toJSON: () => ({}),
  };
  Object.assign(button, {
    getBoundingClientRect: () => originalBox as DOMRect,
  });
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "countdown",
    "data-putenggame-motion-mode": "visual",
    "data-putenggame-motion-duration": "5",
    "data-putenggame-motion-press-effect": "green-particle-burst",
    "data-putenggame-motion-effect-color": "#3478f6",
    "data-putenggame-motion-effect-anchor-x": "24",
    "data-putenggame-motion-effect-anchor-y": "73",
    "data-putenggame-motion-effect-offset-x": "8",
    "data-putenggame-motion-effect-offset-y": "-4",
  }))
    button.setAttribute(name, value);
  const clickHandler = vi.fn();
  button.addEventListener("click", clickHandler);
  const context = {
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
  };

  let cleanup = () => {};
  try {
    cleanup = mountPlayableMotionElement(button, context);
    const mountedStyle = button.style.cssText;
    const mountedChildren = button.childNodes.length;
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        isPrimary: true,
      }),
    );
    const burst = document.body.querySelector<HTMLElement>(
      "[data-putenggame-particle-burst]",
    )!;
    expect(burst.style.position).toBe("fixed");
    expect(burst.style.left).toBe("76.8px");
    expect(burst.style.top).toBe("51.04px");
    expect(burst.style.pointerEvents).toBe("none");
    expect(
      [...burst.querySelectorAll<HTMLElement>("*")].some((part) =>
        part.style.background.replaceAll(" ", "").includes("52,120,246"),
      ),
    ).toBe(true);
    expect(
      [...burst.querySelectorAll<HTMLElement>("*")].some((part) =>
        part.style.borderColor.replaceAll(" ", "").includes("52,120,246"),
      ),
    ).toBe(true);
    expect(
      [...burst.querySelectorAll<HTMLElement>("*")].every(
        (part) => part.style.pointerEvents === "none",
      ),
    ).toBe(true);
    expect(burst.querySelectorAll("span").length).toBeGreaterThanOrEqual(19);
    expect(button.childNodes.length).toBe(mountedChildren);
    expect(button.style.cssText).toBe(mountedStyle);
    expect(button.getBoundingClientRect()).toEqual(originalBox);

    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    expect(clickHandler).toHaveBeenCalledOnce();
    expect(
      document.body.querySelectorAll("[data-putenggame-particle-burst]").length,
    ).toBe(1);
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        isPrimary: true,
      }),
    );
    expect(
      document.body.querySelectorAll("[data-putenggame-particle-burst]").length,
    ).toBe(2);

    button.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Enter",
      }),
    );
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 0 }),
    );
    expect(clickHandler).toHaveBeenCalledTimes(2);
    expect(
      document.body.querySelectorAll("[data-putenggame-particle-burst]").length,
    ).toBe(3);

    button.disabled = true;
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        isPrimary: true,
      }),
    );
    expect(
      document.body.querySelectorAll("[data-putenggame-particle-burst]").length,
    ).toBe(3);

    button.style.setProperty("--unrelated-style", "kept");
    const styleBeforeCleanup = button.style.cssText;
    cleanup();
    expect(
      document.body.querySelector("[data-putenggame-particle-burst]"),
    ).toBeNull();
    expect(button.style.cssText).toBe(styleBeforeCleanup);
    expect(button.style.position).toBe("absolute");
    expect(button.style.overflow).toBe("hidden");
    expect(animations.length).toBeGreaterThanOrEqual(60);
    expect(animations.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
  } finally {
    cleanup();
    if (originalAnimate)
      Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
    else Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
});

it("keeps burst sprites a fixed size while larger buttons add particles and spread", () => {
  const originalAnimate = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "animate",
  );
  const animations: {
    target: HTMLElement;
    frames: Keyframe[];
    cancel: ReturnType<typeof vi.fn>;
  }[] = [];
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: function (this: HTMLElement, frames: Keyframe[]) {
      const animation = { cancel: vi.fn() };
      animations.push({ target: this, frames, cancel: animation.cancel });
      return animation as unknown as Animation;
    },
  });

  let size = 48;
  const button = document.createElement("button");
  Object.assign(button, {
    getBoundingClientRect: () =>
      ({
        left: 20,
        top: 20,
        width: size,
        height: size,
        right: 20 + size,
        bottom: 20 + size,
      }) as DOMRect,
  });
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "countdown",
    "data-putenggame-motion-mode": "visual",
    "data-putenggame-motion-duration": "5",
    "data-putenggame-motion-press-effect": "green-particle-burst",
  }))
    button.setAttribute(name, value);
  const context = {
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
  };

  let cleanup = () => {};
  try {
    cleanup = mountPlayableMotionElement(button, context);
    const press = () =>
      button.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          isPrimary: true,
        }),
      );
    const readBurst = () => {
      const burst = document.body.querySelector<HTMLElement>(
        "[data-putenggame-particle-burst]",
      )!;
      const parts = [...burst.querySelectorAll<HTMLElement>("span")];
      const core = parts.find((part) => part.style.clipPath)!;
      const haze = parts.find((part) =>
        part.style.background.includes("radial-gradient"),
      )!;
      const rings = parts.filter((part) => part.style.border);
      const particles = parts.filter(
        (part) =>
          part.style.background &&
          !part.style.background.includes("gradient") &&
          !part.style.border,
      );
      const maxTravel = Math.max(
        ...animations
          .filter((entry) => particles.includes(entry.target))
          .map((entry) => {
            const finalTransform = String(entry.frames.at(-1)?.transform);
            const [x, y] = finalTransform
              .match(/-?\d+(?:\.\d+)?/g)
              ?.map(Number) ?? [];
            return Math.hypot(x!, y!);
          }),
      );
      return {
        coreWidth: core.style.width,
        hazeWidth: haze.style.width,
        ringWidths: rings.map((ring) => ring.style.width),
        particleCount: particles.length,
        maxTravel,
      };
    };

    press();
    const small = readBurst();
    document.body
      .querySelectorAll("[data-putenggame-particle-burst]")
      .forEach((burst) => burst.remove());

    size = 120;
    press();
    const large = readBurst();

    expect(large.particleCount).toBeGreaterThan(small.particleCount);
    expect(large.maxTravel).toBeGreaterThan(small.maxTravel);
    expect(large.coreWidth).toBe(small.coreWidth);
    expect(large.hazeWidth).toBe(small.hazeWidth);
    expect(large.ringWidths).toEqual(small.ringWidths);
  } finally {
    cleanup();
    if (originalAnimate)
      Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
    else Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
});

it("does not mount button press effects on non-button elements", () => {
  const element = document.createElement("div");
  for (const [name, value] of Object.entries({
    "data-putenggame-motion": "countdown",
    "data-putenggame-motion-mode": "visual",
    "data-putenggame-motion-duration": "5",
    "data-putenggame-motion-press-effect": "green-particle-burst",
  }))
    element.setAttribute(name, value);
  const context = {
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
  };

  const cleanup = mountPlayableMotionElement(element, context);
  element.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      isPrimary: true,
    }),
  );
  expect(
    document.body.querySelector("[data-putenggame-particle-burst]"),
  ).toBeNull();
  cleanup();
});
