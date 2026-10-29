// @vitest-environment happy-dom
import path from "node:path";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStarterCodebaseWithScene } from "./playable-fixture.js";
import type { ProjectState } from "../src/shared/contracts.js";
import type { NodeCodebaseUpdate } from "../src/shared/playable-codebase.js";
import type { ReactFlowInstance } from "@xyflow/react";
import { desktopSave } from "../src/renderer/desktop-save.js";
import { parsePlayableMotionConfig } from "../src/shared/playable-motion.js";

const codebase = createStarterCodebaseWithScene("Close save", { width: 1280, height: 720 });
const update = vi.fn(async (_projectId: string, _next: NodeCodebaseUpdate) => ({ revision: "saved" }));
let move!: (event: unknown, viewport: { x: number; y: number; zoom: number }) => void;
let viewport = { x: 32, y: 64, zoom: 1.2 };
let workbenchProps: Record<string, any> | undefined;
let editorCanvasProps: Record<string, any> | undefined;
let htmlSource = "<main>Original</main>";
let persistedCodebase: NodeCodebaseUpdate | undefined;
vi.doMock(path.resolve("src/renderer/editor-canvas.tsx"), async original => ({
  ...(await original<typeof import("../src/renderer/editor-canvas.js")>()),
  EditorCanvas: (props: Record<string, any>) => {
    editorCanvasProps = props;
    move = props.onMoveEnd;
    useEffect(() => { props.onInit({ getViewport: () => viewport } as ReactFlowInstance); }, []);
    return <button type="button" data-open-scene onClick={() => props.onNodeDoubleClick?.({}, props.nodes[0]!)}>Open scene</button>;
  },
}));
vi.doMock(path.resolve("src/renderer/playable-node-workbench.js"), () => ({
  PlayableNodeWorkbench: (props: Record<string, any>) => {
    workbenchProps = props;
    return <div>
      <button type="button" data-save-button-assets onClick={() => {
        const pick = {
          nodeId: "start",
          source: "nodes/start/index.html:1:1",
          cssPath: "button",
          tag: "button",
          text: "Start",
          box: { x: 0, y: 0, width: 10, height: 10 },
        };
        void (async () => {
          const normal = await props.onReplaceButtonAsset(pick, {
            name: "Normal.png",
            type: "image",
            source: { kind: "library", assetId: "normal-asset" },
          });
          await props.onSetButtonPressedAsset(pick, {
            name: "Pressed.png",
            type: "image",
            source: { kind: "library", assetId: "pressed-asset" },
          });
          await props.onWriteMotion(pick, undefined, normal, false);
        })();
      }}>Save button assets</button>
      <button type="button" data-paste-scene-element onClick={() => void props.onWriteElementCopies([{
        pick: { nodeId: "start", source: "nodes/start/index.html:1:1", cssPath: "main", tag: "main", text: "Original", box: { x: 0, y: 0, width: 10, height: 10 } },
        html: '<main id="putenggame-copy-1">Copied</main>',
        previewHtml: '<main id="putenggame-copy-1">Copied</main>',
        ids: ["putenggame-copy-1"],
      }])}>Paste scene element</button>
      <output>{props.history.map((item: { label: string }) => item.label).join("|")}</output>
    </div>;
  },
}));
vi.doMock(path.resolve("src/renderer/api.ts"), async original => ({
  ...(await original<typeof import("../src/renderer/api.js")>()),
  getNodeCodebase: async () => ({
    ...structuredClone(persistedCodebase ?? codebase),
    revision: "disk",
  }),
  getWorkspaceFile: async (_projectId: string, file: string) => ({
    path: file,
    content: htmlSource,
    truncated: false,
  }),
  listPlayablePresets: async () => ({ presets: [] }),
  listPlayableThumbnails: async () => ({}),
  getPlayableValidation: async () => ({ issues: [] }),
  getPlayableBackdropEffects: async () => ({ vignette: false, grain: false }),
  updateNodeCodebase: update,
}));
const { PlayableEditorWorkspace } = await import("../src/renderer/playable-editor-workspace.js");
const { getNodeCodebase } = await import("../src/renderer/api.js");
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  update.mockReset().mockImplementation(async (_projectId, next) => {
    persistedCodebase = structuredClone(next);
    htmlSource = next.sources?.["nodes/start/index.html"] ?? htmlSource;
    return { revision: "saved" };
  });
  htmlSource = "<main>Original</main>";
  persistedCodebase = undefined;
  workbenchProps = undefined;
  editorCanvasProps = undefined;
  viewport = { x: 32, y: 64, zoom: 1.2 };
  desktopSave.cancel();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<PlayableEditorWorkspace
    project={{ id: "p", type: "interactive-story" } as ProjectState} agentBusy={false} publishing={false}
    onPublish={async () => false} onOpenPublish={() => {}} onClosePublish={() => {}}
  />));
  await act(async () => move(null, { x: 32, y: 64, zoom: 1.2 }));
  expect(update).not.toHaveBeenCalled();
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); desktopSave.cancel();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

it("flushes pending playable layout and waits for persistence before allowing close", async () => {
  let finish!: (result: { revision: string }) => void;
  update.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let closing!: Promise<void>;
  let closed = false;
  await act(async () => {
    closing = desktopSave.prepare().then(() => { closed = true; });
  });
  expect(update).toHaveBeenCalledExactlyOnceWith("p", expect.objectContaining({
    revision: "disk", editorLayout: expect.objectContaining({ viewport: { x: 32, y: 64, zoom: 1.2 } }),
  }));
  expect(closed).toBe(false);
  await act(async () => { finish({ revision: "saved" }); await closing; });
  expect(closed).toBe(true);
});

it("rejects close on a playable save failure and retries the pending edit", async () => {
  update.mockRejectedValueOnce(new Error("Disk unavailable"));
  await act(async () => { await expect(desktopSave.prepare()).rejects.toThrow("Disk unavailable"); });
  desktopSave.cancel();
  await act(async () => desktopSave.prepare());
  expect(update).toHaveBeenCalledTimes(2);
  expect(update).toHaveBeenLastCalledWith("p", expect.objectContaining({
    editorLayout: expect.objectContaining({ viewport: { x: 32, y: 64, zoom: 1.2 } }),
  }));
});

it("saves the displayed viewport when close precedes the delayed move-end event", async () => {
  viewport = { x: 12, y: 24, zoom: 1.44 };
  await act(async () => desktopSave.prepare());
  expect(update).toHaveBeenCalledExactlyOnceWith("p", expect.objectContaining({
    editorLayout: expect.objectContaining({ viewport }),
  }));
});

it("flushes a pending scene edit when the page is refreshed before autosave", async () => {
  await act(async () => container.querySelector<HTMLButtonElement>("[data-open-scene]")!.click());
  await act(async () => workbenchProps!.onRename("Saved before refresh"));

  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
    await vi.waitFor(() =>
      expect(update).toHaveBeenCalledExactlyOnceWith(
        "p",
        expect.objectContaining({
          graph: expect.objectContaining({
            nodes: [expect.objectContaining({ id: "start", title: "Saved before refresh" })],
          }),
        }),
      ),
    );
  });
});

it("records a pasted scene element and undo restores only the source before that paste", async () => {
  await act(async () => container.querySelector<HTMLButtonElement>("[data-open-scene]")!.click());
  expect(workbenchProps).toBeDefined();

  await act(async () => container.querySelector<HTMLButtonElement>("[data-paste-scene-element]")!.click());

  expect(htmlSource).toContain('id="putenggame-copy-1"');
  expect(container.querySelector("output")?.textContent).toContain("粘贴素材之前");

  await act(async () => workbenchProps!.onHistoryCommand("undo"));

  expect(htmlSource).toBe("<main>Original</main>");
  expect(htmlSource).not.toContain("putenggame-copy-1");
});

it("persists both button image states when motion is saved immediately after them", async () => {
  htmlSource = "<button>Start</button>";
  await act(async () => container.querySelector<HTMLButtonElement>("[data-open-scene]")!.click());

  await act(async () => {
    container.querySelector<HTMLButtonElement>("[data-save-button-assets]")!.click();
    await vi.waitFor(() => expect(persistedCodebase?.sources).toBeDefined());
  });

  const saved = await getNodeCodebase("p");
  const node = saved.graph.nodes.find(({ id }) => id === "start")!;
  const html = persistedCodebase?.sources?.["nodes/start/index.html"] ?? "";
  const normal = Object.entries(saved.graph.assets).find(([, asset]) =>
    asset.source.kind === "library" && asset.source.assetId === "normal-asset",
  )?.[0];
  const pressed = Object.entries(saved.graph.assets).find(([, asset]) =>
    asset.source.kind === "library" && asset.source.assetId === "pressed-asset",
  )?.[0];

  expect(normal).toBeDefined();
  expect(pressed).toBeDefined();
  expect(node.assets).toEqual(expect.arrayContaining([normal, pressed]));
  expect(html).toContain(`data-putenggame-button-asset="${normal}"`);
  expect(html).toContain(`data-putenggame-button-pressed-asset="${pressed}"`);
});

it("persists a changed press-effect color on the selected button", async () => {
  htmlSource = [
    '<button data-putenggame-motion="button-feedback"',
    ' data-putenggame-motion-mode="visual"',
    ' data-putenggame-motion-duration="0.1"',
    ' data-putenggame-motion-feedback="hover-press"',
    ' data-putenggame-motion-press-effect="green-particle-burst"',
    ' data-putenggame-motion-effect-color="#00ff00">Start</button>',
  ].join("");
  await act(async () => container.querySelector<HTMLButtonElement>("[data-open-scene]")!.click());

  await act(async () => {
    await workbenchProps!.onWriteMotion(
      {
        nodeId: "start",
        source: "nodes/start/index.html:1:1",
        cssPath: "button",
        tag: "button",
        text: "Start",
        box: { x: 0, y: 0, width: 10, height: 10 },
      },
      {
        kind: "button-feedback",
        mode: "visual",
        duration: 0.1,
        feedback: "hover-press",
        pressEffect: "green-particle-burst",
        effectColor: "#fe4120",
        effectAnchorX: 50,
        effectAnchorY: 50,
      },
      undefined,
      false,
    );
  });

  const parsedButton = document.createElement("div");
  parsedButton.innerHTML = htmlSource;
  expect(
    parsePlayableMotionConfig(parsedButton.querySelector("button")!),
  ).toEqual(
    expect.objectContaining({
      pressEffect: "green-particle-burst",
      effectColor: "#fe4120",
    }),
  );
});

it("undoes and redoes a scene connection one step at a time without moving the canvas", async () => {
  await act(async () => container.querySelector<HTMLButtonElement>("[data-open-scene]")!.click());
  const currentViewport = { x: 91, y: 37, zoom: 1.6 };
  await act(async () => move(null, currentViewport));
  await act(async () => workbenchProps!.onRename("Renamed"));
  await act(async () => editorCanvasProps!.onConnect({
    source: "start",
    sourceHandle: "next",
    target: "start",
  }));
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(editorCanvasProps!.edges).toHaveLength(1);
  expect(workbenchProps!.history.map((item: { label: string }) => item.label)).toContain("连接出口之前");
  expect(workbenchProps!.history.map((item: { label: string }) => item.label)).toContain("编辑场景之前");

  await act(async () => workbenchProps!.onHistoryCommand("undo"));
  expect(editorCanvasProps!.edges).toHaveLength(0);
  expect(editorCanvasProps!.defaultViewport).toEqual(currentViewport);
  expect(editorCanvasProps!.nodes[0].data.node.title).toBe("Renamed");

  await act(async () => workbenchProps!.onHistoryCommand("undo"));
  expect(editorCanvasProps!.nodes[0].data.node.title).toBe("Node 1");

  await act(async () => workbenchProps!.onHistoryCommand("redo"));
  expect(editorCanvasProps!.nodes[0].data.node.title).toBe("Renamed");

  await act(async () => workbenchProps!.onHistoryCommand("redo"));
  expect(editorCanvasProps!.edges).toHaveLength(1);
  expect(editorCanvasProps!.defaultViewport).toEqual(currentViewport);
});

it("does not add canvas panning to scene edit history", async () => {
  await act(async () => container.querySelector<HTMLButtonElement>("[data-open-scene]")!.click());
  await act(async () => move(null, { x: 180, y: -42, zoom: 0.8 }));
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(workbenchProps!.history.map((item: { label: string }) => item.label)).toEqual([
    "当前版本",
  ]);
});
