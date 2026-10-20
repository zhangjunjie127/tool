// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  NodePlayerDefinition,
  PlayableAppearanceTimingCommand,
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
  expect(
    messages.filter(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        Reflect.get(message, "kind") === "putenggame:playable:media-command",
    ),
  ).toHaveLength(2);
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
