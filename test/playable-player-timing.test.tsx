// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  NodePlayerDefinition,
  PlayableAppearanceTimingCommand,
  PlayableMediaCommand,
} from "../src/shared/playable-player-protocol.js";
import {
  createMemoryStorage,
  NodePlayer,
} from "../src/renderer/playable-player.js";

const definition: NodePlayerDefinition = {
  version: 1,
  graph: {
    version: 1,
    title: "Preview",
    viewport: { width: 1280, height: 720 },
    entryNodeId: "start",
    initialState: {},
    assets: {},
    nodes: [
      {
        id: "start",
        title: "Start",
        source: {
          html: "nodes/start/index.html",
          css: "nodes/start/style.css",
          javascript: "nodes/start/node.js",
        },
        assets: [],
        signals: [],
      },
    ],
    edges: [],
  },
  graphSignature: "preview",
  compiled: {
    version: 1,
    nodes: {
      start: {
        id: "start",
        inputs: [],
        html: "<main>Start</main>",
        css: "",
        javascript: "",
      },
    },
  },
};

const storage = createMemoryStorage();
const preview = { policy: "report" as const, startNodeId: "start" };
const command: PlayableAppearanceTimingCommand = {
  sequence: 1,
  updates: [
    {
      pick: {
        nodeId: "start",
        source: "nodes/start/index.html:1:1",
        cssPath: "button",
        tag: "button",
        text: "Choice",
        box: { x: 0, y: 0, width: 100, height: 40 },
      },
      delaySeconds: 80,
      endSeconds: 120,
    },
  ],
};

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("sends timing updates to the active frame without initializing it again", async () => {
  const onApplied = vi.fn();
  const playerProps = {
    definition,
    assets: {},
    saveKey: "preview",
    frameUrl: "about:blank",
    storage,
    preview,
  };

  await act(async () => root.render(<NodePlayer {...playerProps} />));
  const iframe = container.querySelector("iframe")!;
  const messages: unknown[] = [];
  Object.defineProperty(iframe.contentWindow!, "postMessage", {
    configurable: true,
    value: (message: unknown) => messages.push(message),
  });
  await act(async () => {
    iframe.dispatchEvent(new Event("load"));
    await Promise.resolve();
  });
  const init = messages.find(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      Reflect.get(message, "kind") === "putenggame:playable:init",
  )!;
  const instanceId = Reflect.get(init, "instanceId");

  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:snapshot",
          instanceId,
          snapshot: {},
        },
      }),
    );
  });
  await act(async () =>
    root.render(
      <NodePlayer
        {...playerProps}
        appearanceTimingCommand={command}
        onAppearanceTimingCommandApplied={onApplied}
      />,
    ),
  );

  expect(container.querySelector("iframe")).toBe(iframe);
  expect(
    messages.filter(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        Reflect.get(message, "kind") === "putenggame:playable:init",
    ),
  ).toHaveLength(1);
  expect(messages).toContainEqual({
    kind: "putenggame:playable:appearance-timing",
    instanceId,
    command,
  });
  expect(onApplied).toHaveBeenCalledWith(command.sequence);

  await act(async () =>
    root.render(
      <NodePlayer
        {...playerProps}
        mediaCommand={{ command: "seek", time: 12 }}
        mediaCommandSequence={1}
      />,
    ),
  );
  await act(async () =>
    root.render(
      <NodePlayer
        {...playerProps}
        mediaCommand={{ command: "seek", time: 12 }}
        mediaCommandSequence={2}
      />,
    ),
  );
  await act(async () =>
    root.render(
      <NodePlayer
        {...playerProps}
        mediaCommand={{ command: "play" }}
        mediaCommandSequence={3}
      />,
    ),
  );
  await act(async () =>
    root.render(
      <NodePlayer
        {...playerProps}
        mediaCommand={{ command: "pause" }}
        mediaCommandSequence={4}
      />,
    ),
  );
  expect(
    messages.filter(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        Reflect.get(message, "kind") === "putenggame:playable:media-command",
    ),
  ).toHaveLength(4);
  expect(messages).toContainEqual({
    kind: "putenggame:playable:media-command",
    instanceId,
    command: { command: "play" },
  });
  expect(messages).toContainEqual({
    kind: "putenggame:playable:media-command",
    instanceId,
    command: { command: "pause" },
  });
});

it("does not replay a one-shot progress-image placement preview after runtime reinitialization", async () => {
  const playerProps = {
    definition,
    assets: {},
    saveKey: "preview",
    frameUrl: "about:blank",
    storage,
    preview,
  };
  const previewCommand: PlayableMediaCommand = {
    command: "motion-progress-preview",
    nodeId: "start",
    cssPath: "#charge",
    source: "nodes/start/index.html:1:1",
    scale: 100,
    circular: true,
    asset: { contentType: "image/png", bytes: new ArrayBuffer(1) },
  };

  await act(async () => root.render(<NodePlayer {...playerProps} />));
  const iframe = container.querySelector("iframe")!;
  const messages: unknown[] = [];
  Object.defineProperty(iframe.contentWindow!, "postMessage", {
    configurable: true,
    value: (message: unknown) => messages.push(message),
  });
  await act(async () => {
    iframe.dispatchEvent(new Event("load"));
    await Promise.resolve();
  });

  const initialInit = messages.find(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      Reflect.get(message, "kind") === "putenggame:playable:init",
  )!;
  const initialInstanceId = Reflect.get(initialInit, "instanceId");
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:snapshot",
          instanceId: initialInstanceId,
          snapshot: {},
        },
      }),
    ),
  );
  await act(async () =>
    root.render(
      <NodePlayer
        {...playerProps}
        mediaCommand={previewCommand}
        mediaCommandSequence={1}
      />,
    ),
  );
  expect(
    messages.filter(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        Reflect.get(message, "kind") ===
          "putenggame:playable:media-command",
    ),
  ).toHaveLength(1);

  const updatedDefinition: NodePlayerDefinition = {
    ...definition,
    compiled: {
      ...definition.compiled,
      nodes: {
        ...definition.compiled.nodes,
        start: {
          ...definition.compiled.nodes.start!,
          html: "<main>Updated preview</main>",
        },
      },
    },
  };
  await act(async () =>
    root.render(
      <NodePlayer
        {...playerProps}
        definition={updatedDefinition}
        mediaCommand={previewCommand}
        mediaCommandSequence={1}
      />,
    ),
  );
  const updatedInit = messages.findLast(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      Reflect.get(message, "kind") === "putenggame:playable:init",
  )!;
  const updatedInstanceId = Reflect.get(updatedInit, "instanceId");
  expect(updatedInstanceId).not.toBe(initialInstanceId);

  await act(async () =>
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:snapshot",
          instanceId: updatedInstanceId,
          snapshot: {},
        },
      }),
    ),
  );
  expect(
    messages.filter(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        Reflect.get(message, "kind") ===
          "putenggame:playable:media-command",
    ),
  ).toHaveLength(1);
});

it("shows playback controls in the exported player and sends play and seek commands", async () => {
  await act(async () =>
    root.render(
      <NodePlayer
        definition={definition}
        assets={{}}
        saveKey="published"
        frameUrl="about:blank"
        storage={storage}
        showPlaybackControls
      />,
    ),
  );
  const iframe = container.querySelector("iframe")!;
  const messages: unknown[] = [];
  Object.defineProperty(iframe.contentWindow!, "postMessage", {
    configurable: true,
    value: (message: unknown) => messages.push(message),
  });
  await act(async () => {
    iframe.dispatchEvent(new Event("load"));
    await Promise.resolve();
  });
  const init = messages.find(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      Reflect.get(message, "kind") === "putenggame:playable:init",
  )!;
  const instanceId = Reflect.get(init, "instanceId");

  await act(async () =>
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:media-state",
          instanceId,
          state: { currentTime: 9, duration: 65, paused: true },
        },
      }),
    ),
  );

  expect(container.querySelector(".published-player-controls")?.textContent).toContain("00:09");
  expect(container.querySelector(".published-player-controls")?.textContent).toContain("01:05");

  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(".published-player-controls button")!
      .click(),
  );
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:media-state",
          instanceId,
          state: { currentTime: 9, duration: 65, paused: false },
        },
      }),
    ),
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(".published-player-controls button")!
      .click(),
  );
  const progress = container.querySelector<HTMLInputElement>(
    '.published-player-controls input[type="range"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
      .set!.call(progress, "21.5");
    progress.dispatchEvent(new Event("input", { bubbles: true }));
  });

  expect(messages).toContainEqual({
    kind: "putenggame:playable:media-command",
    instanceId,
    command: { command: "play" },
  });
  expect(messages).toContainEqual({
    kind: "putenggame:playable:media-command",
    instanceId,
    command: { command: "pause" },
  });
  expect(messages).toContainEqual({
    kind: "putenggame:playable:media-command",
    instanceId,
    command: { command: "seek", time: 21.5 },
  });
});

it("updates the backdrop in place without initializing the preview again", async () => {
  const playerProps = {
    definition,
    assets: {},
    saveKey: "preview",
    frameUrl: "about:blank",
    storage,
    preview,
  };
  await act(async () => root.render(<NodePlayer {...playerProps} />));
  const iframe = container.querySelector("iframe")!;
  const messages: unknown[] = [];
  Object.defineProperty(iframe.contentWindow!, "postMessage", {
    configurable: true,
    value: (message: unknown) => messages.push(message),
  });
  await act(async () => {
    iframe.dispatchEvent(new Event("load"));
    await Promise.resolve();
  });
  const init = messages.find(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      Reflect.get(message, "kind") === "putenggame:playable:init",
  )!;
  const instanceId = Reflect.get(init, "instanceId");
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:snapshot",
          instanceId,
          snapshot: {},
        },
      }),
    ),
  );
  const backdrop = {
    command: "set-backdrop" as const,
    nodeId: "start",
    sequence: 1,
    asset: {
      assetId: "opening",
      type: "video" as const,
      transfer: {
        contentType: "video/mp4",
        bytes: new Uint8Array([1, 2, 3]).buffer,
      },
      loop: true,
    },
  };

  await act(async () =>
    root.render(<NodePlayer {...playerProps} mediaCommand={backdrop} />),
  );

  expect(
    messages.filter(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        Reflect.get(message, "kind") === "putenggame:playable:init",
    ),
  ).toHaveLength(1);
  expect(messages).toContainEqual({
    kind: "putenggame:playable:media-command",
    instanceId,
    command: {
      ...backdrop,
      asset: {
        ...backdrop.asset,
        transfer: {
          ...backdrop.asset.transfer,
          bytes: new Uint8Array([1, 2, 3]).buffer,
        },
      },
    },
  });
});

it("shares video Blobs with the sandbox without waiting to read their bytes", async () => {
  const video = new Blob(["large video"], { type: "video/mp4" });
  const readBytes = vi
    .spyOn(video, "arrayBuffer")
    .mockImplementation(() => new Promise<ArrayBuffer>(() => {}));
  const playerProps = {
    definition,
    assets: { opening: video },
    saveKey: "preview",
    frameUrl: "about:blank",
    storage,
    preview,
  };

  await act(async () => root.render(<NodePlayer {...playerProps} />));
  const iframe = container.querySelector("iframe")!;
  const messages: unknown[] = [];
  Object.defineProperty(iframe.contentWindow!, "postMessage", {
    configurable: true,
    value: (message: unknown) => messages.push(message),
  });
  await act(async () => {
    iframe.dispatchEvent(new Event("load"));
    await Promise.resolve();
  });

  const init = messages.find(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      Reflect.get(message, "kind") === "putenggame:playable:init",
  )!;
  expect(Reflect.get(init, "assets")).toEqual({
    opening: { contentType: "video/mp4", blob: video },
  });
  expect(readBytes).not.toHaveBeenCalled();
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:snapshot",
          instanceId: Reflect.get(init, "instanceId"),
          snapshot: {},
        },
      }),
    ),
  );
  expect(container.querySelector(".playable-player-status")).toBeNull();
});

it("forwards history shortcuts from the preview frame to the editor", async () => {
  const onHistoryCommand = vi.fn();
  const onActivity = vi.fn();
  await act(async () =>
    root.render(
      <NodePlayer
        definition={definition}
        assets={{}}
        saveKey="preview"
        frameUrl="about:blank"
        storage={storage}
        preview={preview}
        tool="select"
        onHistoryCommand={onHistoryCommand}
        onActivity={onActivity}
      />,
    ),
  );
  const iframe = container.querySelector("iframe")!;
  const messages: unknown[] = [];
  Object.defineProperty(iframe.contentWindow!, "postMessage", {
    configurable: true,
    value: (message: unknown) => messages.push(message),
  });
  await act(async () => {
    iframe.dispatchEvent(new Event("load"));
    await Promise.resolve();
  });
  const init = messages.find(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      Reflect.get(message, "kind") === "putenggame:playable:init",
  )!;
  const instanceId = Reflect.get(init, "instanceId");

  await act(async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:history-command",
          instanceId,
          command: "undo",
        },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          kind: "putenggame:playable:activity",
          instanceId,
        },
      }),
    );
  });

  expect(onHistoryCommand).toHaveBeenCalledExactlyOnceWith("undo");
  expect(onActivity).toHaveBeenCalledOnce();
});
