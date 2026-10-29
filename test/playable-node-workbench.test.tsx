// @vitest-environment happy-dom
import path from "node:path";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { t, translateText } from "../src/renderer/i18n.js";
import { interactionTimingEditsAreUnchanged } from "../src/shared/playable-move.js";
import type {
  NodePlayerDefinition,
  PlayableInteractionSelection,
} from "../src/shared/playable-player-protocol.js";
import type { LibraryAsset } from "../src/renderer/library-assets.js";

function LanguageProvider({ children }: { children: ReactNode }) {
  return children;
}

const getNodeRuntime = vi.fn();
const loadLibraryAssets = vi.fn<() => Promise<LibraryAsset[]>>();
const uploadLibraryAsset = vi.fn(async (file: File) => ({
  id: file.name,
  name: file.name,
  size: file.size,
  mediaType: "image" as const,
  contentType: "image/png",
  createdAt: new Date(0).toISOString(),
  origin: "uploaded" as const,
  saved: true,
}));

vi.doMock(path.resolve("src/renderer/api.ts"), async (original) => ({
  ...(await original<typeof import("../src/renderer/api.js")>()),
  getNodeRuntime,
  listLibrarySourceFolders: vi.fn(async () => ({})),
  uploadLibraryAsset,
}));

vi.doMock(path.resolve("src/renderer/library-assets.ts"), async (original) => ({
  ...(await original<typeof import("../src/renderer/library-assets.js")>()),
  loadLibraryAssets,
}));

vi.doMock(path.resolve("src/renderer/browser-library-folders.ts"), async (original) => ({
  ...(await original<typeof import("../src/renderer/browser-library-folders.js")>()),
  browserLibraryFolderNames: vi.fn(async () => ({})),
}));

const {
  AlignmentGuides,
  MediaMenu,
  PreviewToolbar,
  defaultPickerCategory,
  useMediaChooser,
  usePlayablePreviewRuntime,
  withPlayablePreviewRefreshSkip,
} = await import("../src/renderer/playable-node-workbench.js");
const { LibraryAssetPicker, WorkbenchPreview, uploadLibraryFiles } =
  await import("../src/renderer/node-workbench.js");
const { LibrarySourceFoldersControl } =
  await import("../src/renderer/library-source-folders-control.js");

it("localizes motion controls in Chinese while keeping English source labels", () => {
  expect(
    translateText(
      "Animation applies only to the primary selected item.",
      "zh-CN",
    ),
  ).toBe("动效仅作用于当前主选项。");
  expect(translateText("Button text", "zh-CN")).toBe("按键文字");
  expect(translateText("Exit name", "zh-CN")).toBe("出口名称");
  expect(translateText("Could not save button text", "zh-CN")).toBe(
    "无法保存按键文字",
  );
  expect(translateText("Empty to full", "zh-CN")).toBe("从无到有逐渐显现");
  expect(translateText("Long press", "zh-CN")).toBe("长按");
  expect(translateText("Button presets", "zh-CN")).toBe("按键预设");
  expect(
    translateText("Swipe button (no background image)", "zh-CN"),
  ).toBe("无底图滑动");
  expect(
    translateText("Swipe button (no background image)", "en"),
  ).toBe("Swipe button (no background image)");
  expect(translateText("Start game button (rectangle)", "zh-CN")).toBe(
    "开始游戏按钮（长方形）",
  );
  expect(translateText("Start game button (circle)", "zh-CN")).toBe(
    "开始游戏按钮（圆形）",
  );
  expect(translateText("Change button style and animation", "zh-CN")).toBe(
    "更换按键样式与动效",
  );
  expect(translateText("Button assets", "zh-CN")).toBe("按键素材");
  expect(translateText("Not selected", "zh-CN")).toBe("未选择");
  expect(translateText("After playback", "zh-CN")).toBe("播放结束后");
  expect(
    translateText(
      "No connected exit. The button plays but cannot navigate.",
      "zh-CN",
    ),
  ).toBe("未连接剧情出口，按键可播放但不会跳转。");
  expect(translateText("Scene settings", "zh-CN")).toBe("场景设置");
  expect(translateText("Scene playback settings", "zh-CN")).toBe("场景播放设置");
  expect(translateText("Interaction mode", "zh-CN")).toBe("互动方式");
  expect(translateText("Play without input", "zh-CN")).toBe("无需操作播放");
  expect(translateText("Wait for input to play", "zh-CN")).toBe("等待操作播放");
  expect(translateText("Button settings", "zh-CN")).toBe("按键设置");
  expect(translateText("Add video/image", "zh-CN")).toBe("添加视频/图片");
  expect(translateText("Add video/image (background video)", "zh-CN")).toBe(
    "添加视频/图片（背景视频）",
  );
  expect(
    translateText("Add video/image (picture-in-picture)", "zh-CN"),
  ).toBe("添加视频/图片（画中画）");
  expect(translateText("Add reference video/image", "zh-CN")).toBe(
    "添加参考视频/图片",
  );
  expect(translateText("Picture-in-picture", "zh-CN")).toBe("画中画");
  expect(
    translateText("Picture-in-picture video playback", "zh-CN"),
  ).toBe("画中画视频播放方式");
  expect(translateText("Loop", "zh-CN")).toBe("循环播放");
  expect(translateText("Tools", "zh-CN")).toBe("工具");
  expect(translateText("Adjustments", "zh-CN")).toBe("调整");
  expect(translateText("Tools", "en")).toBe("Tools");
  expect(translateText("Scene settings", "en")).toBe("Scene settings");
  expect(translateText("Add video/image", "en")).toBe("Add video/image");
  expect(translateText("Add reference video/image", "en")).toBe(
    "Add reference video/image",
  );
  expect(translateText("Picture-in-picture", "en")).toBe(
    "Picture-in-picture",
  );
  expect(translateText("Adjustments", "en")).toBe("Adjustments");
  expect(translateText("Asset categories", "zh-CN")).toBe("素材分类");
  expect(translateText("Videos", "zh-CN")).toBe("视频");
  expect(translateText("Images", "zh-CN")).toBe("图片");
  expect(translateText("Custom", "zh-CN")).toBe("自定义");
  expect(translateText("Import", "zh-CN")).toBe("导入");
  expect(translateText("Import", "en")).toBe("Import");
  expect(translateText("Local folder selection unavailable", "zh-CN")).toBe(
    "本地文件夹选择不可用，请在桌面版中打开或重启应用后重试。",
  );
  expect(translateText("Local folder selection unavailable", "en")).toBe(
    "Local folder selection unavailable",
  );
  expect(translateText("Some files could not be imported", "zh-CN")).toBe(
    "部分文件导入失败",
  );
  expect(translateText("Built-in button presets", "zh-CN")).toBe("内置按键预设");
  expect(translateText("Click button", "zh-CN")).toBe("点击按键");
  expect(translateText("Circular bouncing click button", "zh-CN")).toBe(
    "圆形跳动按键",
  );
  expect(translateText("Circular bouncing click button", "en")).toBe(
    "Circular bouncing click button",
  );
  expect(translateText("Swipe button", "zh-CN")).toBe("滑动按钮");
  expect(translateText("Swipe direction", "zh-CN")).toBe("滑动方向");
  expect(translateText("Button appearance", "zh-CN")).toBe("按钮外观");
  expect(translateText("With base image; scaling hint", "zh-CN")).toBe(
    "有底图，提示缩放",
  );
  expect(translateText("No base; scaling hint", "zh-CN")).toBe(
    "无底图，提示缩放",
  );
  expect(translateText("Choose a button base image", "zh-CN")).toBe(
    "选择按钮底图",
  );
  expect(translateText("Button state images", "zh-CN")).toBe("按钮状态图片");
  expect(translateText("Choose normal-state image", "zh-CN")).toBe(
    "选择普通态图片",
  );
  expect(translateText("Choose pressed-state image", "zh-CN")).toBe(
    "选择按下态图片",
  );
  expect(translateText("Choose a pressed-state image", "zh-CN")).toBe(
    "选择按下态图片",
  );
  expect(translateText("Shared answer exits", "zh-CN")).toBe("共用答题出口");
  expect(translateText("Button result exit", "zh-CN")).toBe("按钮结果出口");
  expect(
    translateText("Shared exits (shared by multiple options/clicks)", "zh-CN"),
  ).toBe("共用出口（多选项/多点击时公用一个出口）");
  expect(translateText("Correct", "zh-CN")).toBe("正确");
  expect(translateText("Incorrect", "zh-CN")).toBe("错误");
  expect(translateText("Choose a progress bar image", "zh-CN")).toBe(
    "选择进度条素材",
  );
  expect(translateText("No rotation", "zh-CN")).toBe("不旋转");
  expect(translateText("Action timeout (seconds)", "zh-CN")).toBe(
    "操作超时（秒）",
  );
  expect(translateText("Empty to full", "en")).toBe("Empty to full");
});

it("opens button appearance assets in Custom and chooses useful default categories", () => {
  expect(defaultPickerCategory("motion-base")).toBe("custom");
  expect(defaultPickerCategory("button-pressed")).toBe("custom");
  expect(defaultPickerCategory("motion-ring")).toBe("custom");
  expect(defaultPickerCategory("backdrop")).toBe("video");
  expect(defaultPickerCategory("chat")).toBe("image");
});

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

function Probe({
  revision,
  skip,
}: {
  revision: number;
  skip: { current: number };
}) {
  const runtime = usePlayablePreviewRuntime(
    "project",
    definition.graph.entryNodeId,
    revision,
    skip,
  );
  return <output>{runtime.definition?.graph.title ?? "loading"}</output>;
}

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useRealTimers();
  loadLibraryAssets.mockReset().mockResolvedValue([]);
  getNodeRuntime.mockReset().mockResolvedValue({
    available: true,
    definition,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("drags alignment guides in viewport coordinates and supports keyboard nudging", async () => {
  const onChange = vi.fn();
  const onSelectGuide = vi.fn();
  const guide = { id: "guide-1", axis: "horizontal" as const, position: 0.5 };
  await act(async () =>
    root.render(
      <AlignmentGuides
        viewport={{ width: 1280, height: 720 }}
        guides={[guide]}
        onChange={onChange}
        onSelectGuide={onSelectGuide}
      />,
    ),
  );
  const svg = container.querySelector("svg")!;
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    left: 10,
    top: 20,
    right: 210,
    bottom: 120,
    width: 200,
    height: 100,
  } as DOMRect);
  const handle = container.querySelector('[role="slider"]')!;
  await act(async () => {
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        button: 0,
        clientX: 100,
        clientY: 70,
      }),
    );
  });
  await act(async () => {
    svg.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        clientX: 100,
        clientY: 45,
      }),
    );
  });
  expect(container.querySelector(".playable-alignment-guide-line")?.getAttribute("y1")).toBe("180");
  await act(async () =>
    svg.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        clientX: 100,
        clientY: 45,
      }),
    ),
  );
  expect(onChange).toHaveBeenLastCalledWith([
    { ...guide, position: 0.25 },
  ]);
  expect(onSelectGuide).toHaveBeenCalledWith("guide-1");

  await act(async () =>
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  expect(onChange).toHaveBeenLastCalledWith([
    { ...guide, position: 0.51 },
  ]);
});

it("refreshes local assets while the scene asset picker remains open", async () => {
  const firstAsset: LibraryAsset = {
    id: "first-video",
    assetId: "first-video",
    name: "first.mp4",
    path: "first.mp4",
    size: 10,
    mediaType: "video",
    contentType: "video/mp4",
    createdAt: new Date(0).toISOString(),
    origin: "local",
    category: "video",
  };
  const addedAsset: LibraryAsset = {
    ...firstAsset,
    id: "new-video",
    assetId: "new-video",
    name: "new.mp4",
    path: "new.mp4",
  };
  loadLibraryAssets
    .mockResolvedValueOnce([firstAsset])
    .mockResolvedValue([firstAsset, addedAsset]);

  function Probe() {
    const chooser = useMediaChooser(vi.fn(), vi.fn());
    return (
      <>
        <button type="button" onClick={() => chooser.choose("backdrop")}>Open picker</button>
        {chooser.navigation}
        {chooser.elements}
      </>
    );
  }

  vi.useFakeTimers();
  await act(async () => root.render(<Probe />));
  await act(async () => container.querySelector("button")?.click());
  expect(container.textContent).toContain("first.mp4");
  expect(container.textContent).not.toContain("new.mp4");

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });

  expect(container.textContent).toContain("new.mp4");
  expect(loadLibraryAssets).toHaveBeenCalledTimes(2);
});

it("uploads each selected file and reports individual failures", async () => {
  uploadLibraryAsset
    .mockResolvedValueOnce({
      id: "first.png",
      name: "first.png",
      size: 1,
      mediaType: "image",
      contentType: "image/png",
      createdAt: new Date(0).toISOString(),
      origin: "uploaded",
      saved: true,
    })
    .mockRejectedValueOnce(new Error("Upload failed"));
  const files = [
    new File(["a"], "first.png", { type: "image/png" }),
    new File(["b"], "second.png", { type: "image/png" }),
  ];

  const results = await uploadLibraryFiles(files);

  expect(uploadLibraryAsset).toHaveBeenCalledTimes(2);
  expect(results.map((result) => result.status)).toEqual([
    "fulfilled",
    "rejected",
  ]);
});

it("uploads large Library files without an application-level size limit", async () => {
  const file = new File(["x"], "large.png", { type: "image/png" });
  Object.defineProperty(file, "size", { value: 250 * 1024 * 1024 });

  const [result] = await uploadLibraryFiles([file]);

  expect(result?.status).toBe("fulfilled");
  expect(uploadLibraryAsset).toHaveBeenCalledWith(file, "image/png", undefined);
});

it("shows only video and image local-folder settings in the scene picker", async () => {
  const onChoose = vi.fn();
  await act(async () =>
    root.render(
      <LibrarySourceFoldersControl
        folders={{ video: "C:/videos", image: "C:/images" }}
        categories={["video", "image"]}
        onChoose={onChoose}
        onClear={vi.fn()}
      />,
    ),
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(".library-folder-trigger")
      ?.click(),
  );
  expect(
    [...container.querySelectorAll(".library-folder-row strong")].map(
      (element) => element.textContent,
    ),
  ).toEqual(["视频文件夹", "图片文件夹"]);
  expect(
    [...container.querySelectorAll(".library-folder-status")].map(
      (element) => element.textContent,
    ),
  ).toEqual(["已设置", "已设置"]);
  expect(
    [...container.querySelectorAll(".library-folder-path > span")].map(
      (element) => element.textContent,
    ),
  ).toEqual(["C:/videos", "C:/images"]);
  expect(container.querySelectorAll(".library-folder-clear")).toHaveLength(0);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(".library-folder-action")
      ?.click(),
  );
  expect(onChoose).toHaveBeenCalledExactlyOnceWith("video");
});

it("refreshes selected local folders from the compact picker control", async () => {
  const onRefresh = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <LibrarySourceFoldersControl
        compact
        folders={{ video: "C:/videos" }}
        onChoose={vi.fn()}
        onClear={vi.fn()}
        onRefresh={onRefresh}
      />,
    ),
  );
  const refresh = container.querySelector<HTMLButtonElement>(".library-folder-refresh");
  expect(refresh).not.toBeNull();
  expect(refresh?.disabled).toBe(false);
  await act(async () => refresh?.click());
  expect(onRefresh).toHaveBeenCalledExactlyOnceWith();
  expect(container.querySelector(".library-folder-trigger")).not.toBeNull();
});

it("hides the redundant filter in the inline scene picker and keeps it in Library dialogs", async () => {
  await act(async () =>
    root.render(
      <LanguageProvider>
        <LibraryAssetPicker
          title="Choose a background"
          assets={[]}
          inline
          categoryFilter="image"
          sourceFolders={{ video: "C:/videos", image: "C:/images" }}
          onChooseSourceFolder={vi.fn()}
          onClearSourceFolder={vi.fn()}
          onClose={vi.fn()}
          onSelect={vi.fn()}
        />
      </LanguageProvider>,
    ),
  );
  expect(container.querySelector(".library-filter-trigger")).toBeNull();
  expect(container.querySelector(".library-folder-trigger")).not.toBeNull();

  await act(async () =>
    root.render(
      <LanguageProvider>
        <LibraryAssetPicker
          title="Choose an asset"
          assets={[]}
          inline
          categoryFilter="custom"
          sourceFolders={{ video: "C:/videos", image: "C:/images" }}
          onChooseSourceFolder={vi.fn()}
          onClearSourceFolder={vi.fn()}
          onClose={vi.fn()}
          onSelect={vi.fn()}
        />
      </LanguageProvider>,
    ),
  );
  expect(container.querySelector(".library-filter-trigger")).toBeNull();
  expect(document.body.querySelector(".library-folder-trigger")).toBeNull();

  await act(async () =>
    root.render(
      <LanguageProvider>
        <LibraryAssetPicker
          title="Choose an asset"
          assets={[]}
          onClose={vi.fn()}
          onSelect={vi.fn()}
        />
      </LanguageProvider>,
    ),
  );
  expect(document.body.querySelector(".library-filter-trigger")).not.toBeNull();
});

it("offers session-only removal from the Custom picker context menu", async () => {
  const asset = {
    id: "session-asset",
    assetId: "session-asset",
    name: "icon.png",
    path: "icon.png",
    size: 12,
    mediaType: "image" as const,
    contentType: "image/png",
    createdAt: new Date(0).toISOString(),
    origin: "uploaded" as const,
    saved: true,
  };
  const onRemoveFromSession = vi.fn();
  await act(async () =>
    root.render(
      <LanguageProvider>
        <LibraryAssetPicker
          title="Choose an asset"
          assets={[asset]}
          sessionImportedAssetIds={new Set([asset.id])}
          categoryFilter="custom"
          inline
          onRemoveFromSession={onRemoveFromSession}
          onClose={vi.fn()}
          onSelect={vi.fn()}
        />
      </LanguageProvider>,
    ),
  );

  const item = container.querySelector<HTMLButtonElement>(
    ".story-video-picker-list > button",
  )!;
  await act(async () => {
    item.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, clientX: 24, clientY: 30 }),
    );
  });
  expect(container.querySelector('[role="menuitem"]')?.textContent).toBe(
    "从当前列表移除",
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click(),
  );
  expect(onRemoveFromSession).toHaveBeenCalledExactlyOnceWith(asset);

  await act(async () =>
    root.render(
      <LanguageProvider>
        <LibraryAssetPicker
          title="Choose an asset"
          assets={[asset]}
          sessionImportedAssetIds={new Set([asset.id])}
          categoryFilter="custom"
          inline
          onClose={vi.fn()}
          onSelect={vi.fn()}
        />
      </LanguageProvider>,
    ),
  );
  const itemWithoutRemoveHandler = container.querySelector<HTMLButtonElement>(
    ".story-video-picker-list > button",
  )!;
  await act(async () => {
    itemWithoutRemoveHandler.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, clientX: 24, clientY: 30 }),
    );
  });
  expect(container.querySelector('[role="menuitem"]')).toBeNull();
});

it("skips each consecutive source-save revision without reloading the preview", async () => {
  const skip = { current: 0 };
  await act(async () => root.render(<Probe revision={0} skip={skip} />));
  expect(getNodeRuntime).toHaveBeenCalledTimes(1);

  skip.current = 2;
  await act(async () => root.render(<Probe revision={1} skip={skip} />));
  await act(async () => root.render(<Probe revision={2} skip={skip} />));

  expect(getNodeRuntime).toHaveBeenCalledTimes(1);
  expect(skip.current).toBe(0);

  await act(async () => root.render(<Probe revision={3} skip={skip} />));
  expect(getNodeRuntime).toHaveBeenCalledTimes(2);
});

it("consumes batched source-save skips without hiding the next external refresh", async () => {
  const skip = { current: 0 };
  await act(async () => root.render(<Probe revision={0} skip={skip} />));
  expect(getNodeRuntime).toHaveBeenCalledTimes(1);

  // Deleting multiple selected items saves each source edit, but React may
  // render the accumulated revision changes only once.
  skip.current = 2;
  await act(async () => root.render(<Probe revision={2} skip={skip} />));
  expect(getNodeRuntime).toHaveBeenCalledTimes(1);
  expect(skip.current).toBe(0);

  await act(async () => root.render(<Probe revision={3} skip={skip} />));
  expect(getNodeRuntime).toHaveBeenCalledTimes(2);
});

it("keeps the preview running across every save in one composite button edit", async () => {
  const skip = { current: 0 };
  await act(async () => root.render(<Probe revision={0} skip={skip} />));
  expect(getNodeRuntime).toHaveBeenCalledTimes(1);

  const writes = [
    vi.fn(async () => true),
    vi.fn(async () => true),
    vi.fn(async () => true),
  ];
  for (const write of writes)
    await withPlayablePreviewRefreshSkip(skip, write, Boolean);
  expect(writes.map((write) => write.mock.calls.length)).toEqual([1, 1, 1]);

  expect(skip.current).toBe(3);
  await act(async () => root.render(<Probe revision={3} skip={skip} />));
  expect(getNodeRuntime).toHaveBeenCalledTimes(1);
  expect(skip.current).toBe(0);
});

it("releases a preview-refresh skip when an element save fails", async () => {
  const skip = { current: 0 };
  await expect(
    withPlayablePreviewRefreshSkip(skip, async () => false, Boolean),
  ).resolves.toBe(false);
  expect(skip.current).toBe(0);

  await expect(
    withPlayablePreviewRefreshSkip(
      skip,
      async () => {
        throw new Error("save failed");
      },
      Boolean,
    ),
  ).rejects.toThrow("save failed");
  expect(skip.current).toBe(0);
});

it("places the open asset picker beside the inspector instead of inside it", async () => {
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={0}
        motionSignals={[]}
        mediaState={{ currentTime: 0, duration: 0, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
        pickerOpen
        picker={<section data-testid="asset-picker" />}
      />,
    ),
  );

  const picker = container.querySelector('[data-testid="asset-picker"]');
  const libraryColumn = container.querySelector(".playable-preview-library");
  const inspector = container.querySelector(".playable-preview-inspector");
  expect(libraryColumn?.contains(picker)).toBe(true);
  expect(inspector?.contains(picker)).toBe(false);
});

it("keeps the scene tools in a visible vertical list with accessible controls", async () => {
  const reference = {
    nodeId: "start",
    source: "nodes/start/index.html:1:1",
    cssPath: "button#reference",
    tag: "button",
    text: "Reference",
    box: { x: 10, y: 20, width: 100, height: 40 },
  };
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        selectedPicks={[reference]}
        motionSelection={reference}
        referencePicks={[reference]}
        referencePickKey="reference"
        motionSignals={[]}
        mediaState={{ currentTime: 0, duration: 0, paused: true }}
        onMediaCommand={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );

  const toolButtons = container.querySelectorAll(
    ".playable-preview-tool-buttons button",
  );
  expect(toolButtons).toHaveLength(4);
  expect(
    [...toolButtons].every(
      (button) => button.getAttribute("aria-label") && !button.textContent?.trim(),
    ),
  ).toBe(true);
  const groups = container.querySelectorAll<HTMLElement>(
    ".playable-preview-tool-group",
  );
  expect(groups).toHaveLength(2);
  expect(container.querySelectorAll(".playable-preview-tool-group details")).toHaveLength(0);
  expect(
    container.querySelectorAll(".playable-preview-guide-tools button"),
  ).toHaveLength(4);
  const horizontalGuideIcon = container.querySelector(
    '.playable-preview-guide-tools button[aria-label="添加横向辅助线"] svg',
  );
  const verticalGuideIcon = container.querySelector(
    '.playable-preview-guide-tools button[aria-label="添加纵向辅助线"] svg',
  );
  expect(horizontalGuideIcon?.querySelectorAll("line")).toHaveLength(3);
  expect(verticalGuideIcon?.querySelectorAll("line")).toHaveLength(3);
  expect(horizontalGuideIcon?.querySelector("line")?.getAttribute("y1")).toBe(
    horizontalGuideIcon?.querySelector("line")?.getAttribute("y2"),
  );
  expect(verticalGuideIcon?.querySelector("line")?.getAttribute("x1")).toBe(
    verticalGuideIcon?.querySelector("line")?.getAttribute("x2"),
  );
  expect(
    container.querySelector(
      '.playable-preview-alignment-tools select[aria-label="参考按钮"]',
    ),
  ).not.toBeNull();
  expect(
    container.querySelector(
      '.playable-preview-alignment-tools button[aria-label="选中按钮中心对齐"]',
    ),
  ).not.toBeNull();
  expect(
    container.querySelector(
      '.playable-preview-alignment-tools button[aria-label="取消参考锁定"]',
    ),
  ).not.toBeNull();
});

it("switches preview tools and toggles video playback before the preview is ready", async () => {
  const onTool = vi.fn();
  const onMediaCommand = vi.fn();
  const renderToolbar = async (paused: boolean) =>
    act(async () =>
      root.render(
        <PreviewToolbar
          tool="select"
          disabled
          strokes={0}
          picks={0}
          motionSignals={[]}
          mediaState={{ currentTime: 0, duration: 30, paused }}
          onMediaCommand={onMediaCommand}
          fonts={[]}
          onTextStyle={vi.fn()}
          onInteractionTiming={vi.fn()}
          onApplyMotion={vi.fn(async () => {})}
          onTool={onTool}
          onUndoStroke={vi.fn()}
          onClearStrokes={vi.fn()}
        />,
      ),
    );
  await renderToolbar(true);

  expect(container.querySelector(".playable-preview-tool-buttons kbd")).toBeNull();
  expect(container.querySelector(".playable-preview-shortcut-hint")).toBeNull();

  const focusedButton = document.createElement("button");
  document.body.append(focusedButton);
  focusedButton.focus();
  const focusedSpaceEvent = new KeyboardEvent("keydown", {
    key: " ",
    bubbles: true,
    cancelable: true,
  });
  await act(async () => focusedButton.dispatchEvent(focusedSpaceEvent));
  expect(onMediaCommand).toHaveBeenLastCalledWith({ command: "play" });
  expect(focusedSpaceEvent.defaultPrevented).toBe(true);
  await renderToolbar(false);
  const focusedPauseEvent = new KeyboardEvent("keydown", {
    key: " ",
    bubbles: true,
    cancelable: true,
  });
  await act(async () => focusedButton.dispatchEvent(focusedPauseEvent));
  expect(onMediaCommand).toHaveBeenLastCalledWith({ command: "pause" });
  expect(focusedPauseEvent.defaultPrevented).toBe(true);
  focusedButton.remove();

  for (const [key, tool] of [
    ["s", "select"],
    ["t", "text"],
    ["m", "move"],
    ["d", "draw"],
  ] as const) {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => window.dispatchEvent(event));
    expect(onTool).toHaveBeenLastCalledWith(tool);
    expect(event.defaultPrevented).toBe(true);
  }

  const input = document.createElement("input");
  document.body.append(input);
  const typingEvent = new KeyboardEvent("keydown", {
    key: "t",
    bubbles: true,
    cancelable: true,
  });
  await act(async () => input.dispatchEvent(typingEvent));
  expect(onTool).toHaveBeenCalledTimes(6);
  expect(typingEvent.defaultPrevented).toBe(false);
  input.remove();

  const playEvent = new KeyboardEvent("keydown", {
    key: " ",
    bubbles: true,
    cancelable: true,
  });
  await act(async () => window.dispatchEvent(playEvent));
  expect(onTool).toHaveBeenLastCalledWith("play");
  expect(onMediaCommand).toHaveBeenLastCalledWith({ command: "pause" });
  expect(playEvent.defaultPrevented).toBe(true);
});

it("routes undo and redo to brush strokes before scene history", async () => {
  const onUndoStroke = vi.fn();
  const onRedoStroke = vi.fn();
  const onHistoryCommand = vi.fn();
  const renderToolbar = (strokes: number, redoStrokes: number) =>
    act(async () =>
      root.render(
        <PreviewToolbar
          tool="draw"
          disabled={false}
          strokes={strokes}
          redoStrokes={redoStrokes}
          picks={0}
          motionSignals={[]}
          mediaState={{ currentTime: 0, duration: 0, paused: true }}
          onMediaCommand={vi.fn()}
          fonts={[]}
          onTextStyle={vi.fn()}
          onInteractionTiming={vi.fn()}
          onApplyMotion={vi.fn(async () => {})}
          onTool={vi.fn()}
          onUndoStroke={onUndoStroke}
          onRedoStroke={onRedoStroke}
          onClearStrokes={vi.fn()}
          onHistoryCommand={onHistoryCommand}
        />,
      ),
    );
  await renderToolbar(1, 0);

  const undoStroke = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => window.dispatchEvent(undoStroke));
  expect(undoStroke.defaultPrevented).toBe(true);
  expect(onUndoStroke).toHaveBeenCalledOnce();
  expect(onHistoryCommand).not.toHaveBeenCalled();

  await renderToolbar(0, 1);
  const redoStroke = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => window.dispatchEvent(redoStroke));
  expect(redoStroke.defaultPrevented).toBe(true);
  expect(onRedoStroke).toHaveBeenCalledOnce();

  await renderToolbar(0, 0);
  const undoScene = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => window.dispatchEvent(undoScene));
  expect(onHistoryCommand).toHaveBeenCalledWith("undo");
});

it("offers library replacement for a selected game settings button", async () => {
  const onChooseSettingsButtonIcon = vi.fn();
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        redoStrokes={0}
        picks={0}
        motionSignals={[]}
        settingsButtonSelected
        onChooseSettingsButtonIcon={onChooseSettingsButtonIcon}
        mediaState={{ currentTime: 0, duration: 0, paused: true }}
        onMediaCommand={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onRedoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );

  const chooseIcon = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${t("playableWorkbench.chooseSettingsButtonIcon")}"]`,
  );
  expect(chooseIcon).not.toBeNull();
  await act(async () => chooseIcon?.click());
  expect(onChooseSettingsButtonIcon).toHaveBeenCalledOnce();
});

it("groups selected text style controls in a separate settings panel", async () => {
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="text"
        disabled={false}
        strokes={0}
        picks={1}
        textSelection={{
          pick: {
            nodeId: "start",
            cssPath: "p",
            tag: "p",
            text: "Sample",
            box: { x: 0, y: 0, width: 100, height: 30 },
          },
          fontFamily: "Arial",
          fontSize: "24px",
          inPlace: true,
        }}
        motionSignals={[]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        fonts={["Arial"]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );

  const textSettings = container.querySelector(
    '[aria-label="文字设置"].playable-preview-text-settings',
  );
  expect(textSettings?.querySelector('[aria-label="字体"]')).not.toBeNull();
  expect(textSettings?.querySelector('[aria-label="字号"]')).not.toBeNull();
  expect(
    textSettings?.querySelectorAll(".playable-preview-text-control"),
  ).toHaveLength(2);
});

it("places category tabs in the dedicated edge column beside the inline picker", async () => {
  vi.stubGlobal("getComputedStyle", () => ({
    paddingLeft: "0px",
    paddingRight: "0px",
    paddingTop: "0px",
    paddingBottom: "0px",
  }));
  await act(async () =>
    root.render(
      <WorkbenchPreview
        ariaLabel="Scene preview"
        viewport={{ width: 1280, height: 720 }}
        layout="side-panels"
        pickerOpen
        pickerNavigation={<nav role="tablist"><button role="tab">UI</button></nav>}
      >
        <div>Preview</div>
      </WorkbenchPreview>,
    ),
  );

  const navigation = container.querySelector(".playable-preview-library-navigation");
  expect(navigation?.querySelector('[role="tab"]')?.textContent).toBe("UI");
  expect(navigation?.previousElementSibling?.classList.contains("story-workbench-preview-frame")).toBe(true);
});

it("keeps a disappearance-time draft editable until the full value is committed", async () => {
  const onInteractionTiming = vi.fn();
  const selection: PlayableInteractionSelection = {
    pick: {
      nodeId: "start",
      source: "nodes/start/index.html:1:1",
      cssPath: "button",
      tag: "button",
      text: "Choice",
      box: { x: 0, y: 0, width: 100, height: 40 },
    },
    delaySeconds: 10,
    inPlace: true,
  };
  const motionSelection = { ...selection.pick };

  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        interactionSelection={selection}
        motionSelection={motionSelection}
        motionSignals={[]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={onInteractionTiming}
        onApplyMotion={vi.fn(async () => {})}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );

  const settings = container.querySelector(".playable-preview-motion-library")!;
  expect(
    settings.querySelector('[aria-label="出现时间（分钟）"]'),
  ).not.toBeNull();
  expect(
    settings.querySelector('[aria-label="消失时间（秒）"]'),
  ).not.toBeNull();
  expect(
    container
      .querySelector(".playable-preview-toolbar")
      ?.querySelector('[aria-label="出现时间（分钟）"]'),
  ).toBeNull();

  const appearSeconds = container.querySelector<HTMLInputElement>(
    '[aria-label="出现时间（秒）"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(appearSeconds, "12.5");
    appearSeconds.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    appearSeconds.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
  expect(onInteractionTiming).not.toHaveBeenCalled();

  const endSeconds = container.querySelector<HTMLInputElement>(
    '[aria-label="消失时间（秒）"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(endSeconds, "2");
    endSeconds.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(endSeconds.value).toBe("2");
  expect(onInteractionTiming).not.toHaveBeenCalled();

  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(endSeconds, "20");
    endSeconds.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(endSeconds.value).toBe("20");
  expect(onInteractionTiming).not.toHaveBeenCalled();

  await act(async () =>
    endSeconds.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
  expect(onInteractionTiming).not.toHaveBeenCalled();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        ".playable-preview-motion-apply-button",
      )
      ?.click(),
  );
  expect(onInteractionTiming).toHaveBeenCalledWith("both", 12.5, 20);
});

it("does not submit unchanged timing fields when they lose focus", async () => {
  const onInteractionTiming = vi.fn();
  const selection: PlayableInteractionSelection = {
    pick: {
      nodeId: "start",
      source: "nodes/start/index.html:1:1",
      cssPath: "div",
      tag: "div",
      text: "Choice",
      box: { x: 0, y: 0, width: 100, height: 40 },
    },
    delaySeconds: 10,
    inPlace: true,
  };

  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        interactionSelection={selection}
        motionSelection={selection.pick}
        motionSignals={[]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={onInteractionTiming}
        onApplyMotion={vi.fn(async () => {})}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );

  for (const input of container.querySelectorAll<HTMLInputElement>(
    ".playable-preview-motion-timing input",
  ))
    await act(async () =>
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
    );

  expect(onInteractionTiming).not.toHaveBeenCalled();
});

it("treats unchanged appearance times as a successful no-op", () => {
  const current = [
    { delaySeconds: 0 },
    { delaySeconds: 10, endSeconds: 12 },
  ];

  expect(
    interactionTimingEditsAreUnchanged(current, [
      { delaySeconds: 0 },
      { delaySeconds: 10, endSeconds: 12 },
    ]),
  ).toBe(true);
  expect(
    interactionTimingEditsAreUnchanged(current, [
      { delaySeconds: 0 },
      { delaySeconds: 10, endSeconds: 13 },
    ]),
  ).toBe(false);
});

it("offers motion presets and applies the chosen interaction mode", async () => {
  const onApplyMotion = vi.fn(async () => {});
  const selection = {
    nodeId: "start",
    source: "nodes/start/index.html:1:1",
    cssPath: "button",
    signal: "success",
    tag: "button",
    text: "Continue",
    box: { x: 0, y: 0, width: 100, height: 40 },
  };

  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="move"
        disabled={false}
        strokes={0}
        picks={1}
        motionSelection={selection}
        motionSignals={[
          { id: "success", label: "成功" },
          { id: "timeout", label: "超时" },
        ]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={onApplyMotion}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );

  expect(container.querySelector(".playable-preview-motion-library")).not.toBeNull();
  expect(container.textContent).toContain("倒计时按键");
  expect(container.textContent).not.toContain("圆环倒计时按键");
  expect(container.textContent).not.toContain("进度条按键");
  expect(container.textContent).toContain("长按蓄力按键");
  expect(container.textContent).toContain("点击按键");
  expect(container.textContent).not.toContain("Hover and press feedback");
  expect(
    container.querySelector(
      'select[aria-label="按键预设"] option[value="builtin:button-feedback"]',
    ),
  ).not.toBeNull();
  expect(
    container.querySelector(
      'select[aria-label="按键预设"] option[value="builtin:button-feedback-prompt:rectangle"]',
    )?.textContent,
  ).toBe("提示点击按键（长方形）");
  expect(
    container.querySelector(
      'select[aria-label="按键预设"] option[value="builtin:button-feedback-prompt:circle"]',
    )?.textContent,
  ).toBe("提示点击按键（圆形）");
  expect(container.querySelector('[aria-label="Animation type"]')).toBeNull();
  expect(container.querySelector('[aria-label="Button feedback"]')).toBeNull();
  expect(
    container.querySelector(
      'select[aria-label="按键预设"] option[value="builtin:swipe-button:circle:disappear"]',
    )?.textContent,
  ).toBe("滑动消失");

  const choose = async (selector: string, value: string) => {
    const control = container.querySelector<HTMLSelectElement | HTMLInputElement>(
      selector,
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        control instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype,
        "value",
      )!.set!.call(control, value);
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  await choose('select[aria-label="按键预设"]', "builtin:hold-charge");
  expect(onApplyMotion).not.toHaveBeenCalled();
  await choose('[aria-label="播放方式"]', "interactive");
  await choose('[aria-label="持续时间（秒）"]', "4");
  await choose('[aria-label="超时出口"]', "timeout");
  const apply = container.querySelector<HTMLButtonElement>(
    ".playable-preview-motion-apply-button",
  )!;
  await act(async () => apply.click());
  expect(onApplyMotion).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "hold-charge",
      mode: "interactive",
      duration: 4,
      feedback: "bounce-hover-press",
      signal: "success",
      timeoutSignal: "timeout",
    }),
    true,
  );

  await choose(
    'select[aria-label="按键预设"]',
    "builtin:swipe-button:circle:disappear",
  );
  await act(async () => apply.click());
  expect(onApplyMotion).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: "swipe-button",
      buttonShape: "circle",
      swipeStyle: "floating",
      disappearAfterSwipe: true,
      interaction: "swipe-left",
      signal: "success",
    }),
    true,
  );
});

it("keeps scene settings and button presets visible outside the Select tool", async () => {
  const onChoose = vi.fn();
  const onChooseSettingsButtonIcon = vi.fn();
  const onBackdropLoopChange = vi.fn();
  const onPictureInPictureVideoLoopChange = vi.fn();
  const onNoInputModeChange = vi.fn();
  const onVideoEndAutoAdvanceChange = vi.fn();
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="move"
        disabled={false}
        strokes={0}
        picks={0}
        motionSignals={[]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
        media={
          <MediaMenu
            disabled={false}
            uploading={false}
            canSetBackdrop
            canRemoveBackdrop
            canSetBackdropLoop
            backdropLoop={false}
            pictureInPictureVideoLoop
            noInputMode={undefined}
            canEnableVideoEndAutoAdvance={false}
            videoEndAutoAdvance={false}
            onChoose={onChoose}
            onChooseSettingsButtonIcon={onChooseSettingsButtonIcon}
            onRemoveBackdrop={vi.fn()}
            onBackdropLoopChange={onBackdropLoopChange}
            onPictureInPictureVideoLoopChange={
              onPictureInPictureVideoLoopChange
            }
            onNoInputModeChange={onNoInputModeChange}
            onVideoEndAutoAdvanceChange={onVideoEndAutoAdvanceChange}
          />
        }
      />,
    ),
  );

  expect(container.querySelector(".playable-preview-motion-library")).not.toBeNull();
  expect(container.querySelector(".playable-preview-motion-library")?.getAttribute("open")).not.toBeNull();
  expect(container.querySelector(".playable-preview-inspector > .playable-preview-panel-title")).toBeNull();
  expect(container.querySelector(".playable-preview-media")?.getAttribute("aria-label")).toBe("场景设置");
  expect(container.querySelector(".playable-preview-media")?.textContent).toContain("场景设置");
  const chooseSettingsButtonIcon = [
    ...container.querySelectorAll<HTMLButtonElement>(".playable-preview-media button"),
  ].find((button) => button.textContent?.includes("从素材库选择设置按钮图标"));
  expect(chooseSettingsButtonIcon).toBeDefined();
  await act(async () => chooseSettingsButtonIcon?.click());
  expect(onChooseSettingsButtonIcon).toHaveBeenCalledOnce();
  expect(
    [...container.querySelectorAll(".playable-preview-secondary-text")].map(
      (item) => item.textContent,
    ),
  ).toEqual(["（背景视频）", "（画中画）", "（秒）"]);
  expect(container.querySelector('[aria-label="互动方式"]')?.textContent).toContain("无需操作播放");
  expect(container.querySelector('[aria-label="互动方式"]')?.textContent).toContain("等待操作播放");
  const videoEndAutoAdvance = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  expect(
    videoEndAutoAdvance?.parentElement?.classList.contains(
      "playable-video-end-auto-advance",
    ),
  ).toBe(true);
  expect(videoEndAutoAdvance?.disabled).toBe(false);
  expect(videoEndAutoAdvance?.parentElement?.textContent).toContain(
    "视频播完后自动跳转",
  );
  await act(async () =>
    container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  expect(onVideoEndAutoAdvanceChange).toHaveBeenCalledWith(true);
  expect(container.querySelector(".playable-preview-motion-library")?.getAttribute("aria-label")).toBe(translateText("Button settings", "zh-CN"));
  expect(container.querySelector(".playable-preview-motion-library")?.textContent).toContain("按键设置");
  expect(container.querySelector(".playable-preview-tool-buttons")).not.toBeNull();
  expect(container.querySelector(".playable-preview-tool-buttons kbd")).toBeNull();
  expect(container.querySelector(".playable-preview-shortcut-hint")).toBeNull();
  expect(container.textContent).not.toContain("添加参考视频/图片");
  const clickLabel = async (label: string) => {
    const button = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(
        (item) =>
          item.textContent?.includes(label) ||
          item.textContent?.includes(translateText(label, "zh-CN")),
      )!;
    await act(async () => button.click());
  };
  await clickLabel("Add video/image (picture-in-picture)");
  expect(onChoose).toHaveBeenCalledWith("canvas");
  const playbackGroups = [
    ...container.querySelectorAll<HTMLElement>(
      ".playable-preview-media-playback",
    ),
  ];
  expect(playbackGroups).toHaveLength(2);
  expect(
    playbackGroups[0].querySelectorAll('input[type="radio"]'),
  ).toHaveLength(2);
  expect(
    playbackGroups[0].querySelector<HTMLInputElement>(
      'input[type="radio"]:checked',
    )?.parentElement?.textContent,
  ).toContain("单次播放");
  expect(
    playbackGroups[1].querySelector<HTMLInputElement>(
      'input[type="radio"]:checked',
    )?.parentElement?.textContent,
  ).toContain("循环播放");
  await act(async () =>
    playbackGroups[0]
      .querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]
      .click(),
  );
  expect(onBackdropLoopChange).toHaveBeenCalledWith(true);
  await act(async () => {
    const playOnce = playbackGroups[1].querySelector<HTMLInputElement>(
      'input[type="radio"]',
    )!;
    playOnce.click();
  });
  expect(onPictureInPictureVideoLoopChange).toHaveBeenCalledWith(false);
  const noInputOptions = [
    ...container.querySelectorAll<HTMLInputElement>(
      ".playable-no-input-options input[type=radio]",
    ),
  ];
  expect(noInputOptions).toHaveLength(2);
  expect(noInputOptions.some((input) => input.checked)).toBe(false);
  await act(async () => noInputOptions[1].click());
  expect(onNoInputModeChange).toHaveBeenCalledWith("wait");
});

it("configures a source-backed ring countdown and offers the shared asset picker", async () => {
  const onApplyMotion = vi.fn(async () => {});
  const onChooseMotionRing = vi.fn();
  const selection = {
    nodeId: "start",
    source: "nodes/start/index.html:1:1",
    cssPath: "button",
    tag: "button",
    text: "Continue",
    box: { x: 0, y: 0, width: 100, height: 40 },
  };
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        motionSelection={selection}
        motionSignals={[{ id: "success", label: "Success" }]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={onApplyMotion}
        onChooseMotionRing={onChooseMotionRing}
        motionRingAssetId="ring-asset"
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );
  expect(container.querySelector(".playable-preview-motion-library")).not.toBeNull();
  const choose = async (selector: string, value: string) => {
    const control = container.querySelector<HTMLSelectElement>(selector)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
        .set!.call(control, value);
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  await choose(
    'select[aria-label="按键预设"]',
    "builtin:progress-ring",
  );
  expect(onApplyMotion).not.toHaveBeenCalled();
  await choose('[aria-label="圆环进度"]', "reveal");
  expect(
    container.querySelector('[aria-label="圆环旋转"]'),
  ).toBeNull();
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(
        (button) =>
          button.getAttribute("aria-label") === translateText("Replace ring asset", "zh-CN"),
      )
      ?.click(),
  );
  expect(onChooseMotionRing).toHaveBeenCalledOnce();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        ".playable-preview-motion-apply-button",
      )
      ?.click(),
  );
  expect(onApplyMotion).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "progress-ring",
      ringAssetId: "ring-asset",
      ringFill: "reveal",
      ringRotation: "clockwise",
    }),
    true,
  );
});

it("configures consecutive clicks and an exit for the bouncing click preset", async () => {
  const onApplyMotion = vi.fn(async () => {});
  const selection = {
    nodeId: "start",
    source: "nodes/start/index.html:1:1",
    cssPath: "button",
    tag: "button",
    text: "Continue",
    signal: "continue",
    box: { x: 0, y: 0, width: 100, height: 40 },
  };
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        motionSelection={selection}
        motionSignals={[
          { id: "continue", label: "Continue" },
          { id: "story-map", label: "Story map" },
        ]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={onApplyMotion}
        onWriteButtonSignal={vi.fn(async () => true)}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );
  const choose = async (selector: string, value: string) => {
    const control = container.querySelector<HTMLSelectElement>(selector)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
        .set!.call(control, value);
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  await choose(
    'select[aria-label="按键预设"]',
    "builtin:button-feedback-bounce:rectangle",
  );
  const count = container.querySelector<HTMLInputElement>(
    '[aria-label="所需点击次数"]',
  )!;
  expect(count.value).toBe("3");
  expect(container.querySelector('[aria-label="按钮结果出口"]')).not.toBeNull();

  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
      .set!.call(count, "5");
    count.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(".playable-preview-motion-apply-button")
      ?.click(),
  );
  expect(onApplyMotion).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "button-feedback",
      mode: "interactive",
      interaction: "multi-click",
      requiredCount: 5,
      signal: "continue",
      feedback: "bounce-hover-press",
    }),
    true,
  );
});

it("stages a button feedback preset until it is applied to the selection", async () => {
  const onApplyMotion = vi.fn(async () => {});
  const selection = {
    nodeId: "start",
    source: "nodes/start/index.html:1:1",
    cssPath: "button",
    tag: "button",
    text: "Continue",
    box: { x: 0, y: 0, width: 100, height: 40 },
  };
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        motionSelection={selection}
        motionSignals={[]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={onApplyMotion}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );
  expect(container.querySelector(".playable-preview-motion-library")).not.toBeNull();
  expect(container.querySelector('[aria-label="按键形状"]')).toBeNull();
  const preset = container.querySelector<HTMLSelectElement>(
    'select[aria-label="按键预设"]',
  )!;
  expect(preset.value).toBe("");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(preset, "builtin:button-feedback");
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onApplyMotion).not.toHaveBeenCalled();
  const apply = container.querySelector<HTMLButtonElement>(
    ".playable-preview-motion-apply-button",
  )!;
  await act(async () => apply.click());
  expect(onApplyMotion).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "button-feedback",
      mode: "visual",
      duration: 0.1,
      feedback: "hover-press",
    }),
    true,
  );
  expect(
    container.querySelector('[aria-label="持续时间（秒）"]'),
  ).toBeNull();
  expect(
    container.querySelector('[aria-label="成功或自动继续出口"]'),
  ).toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(preset, "builtin:button-feedback-prompt:circle");
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        ".playable-preview-motion-apply-button",
      )
      ?.click(),
  );
  expect(onApplyMotion).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: "button-feedback",
      mode: "visual",
      buttonShape: "circle",
      feedback: "idle-pulse-hover-press",
    }),
    true,
  );
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(preset, "builtin:button-feedback-bounce");
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onApplyMotion).toHaveBeenCalledTimes(2);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        ".playable-preview-motion-apply-button",
      )
      ?.click(),
  );
  expect(onApplyMotion).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: "button-feedback",
      mode: "interactive",
      duration: 0.1,
      feedback: "bounce-hover-press",
      interaction: "multi-click",
      requiredCount: 3,
    }),
    true,
  );
});

it("lets button base and progress bar images be selected independently", async () => {
  const onApplyMotion = vi.fn(async () => {});
  const onAddButtonPreset = vi.fn(async () => {});
  const onChooseMotionBar = vi.fn();
  const onChooseMotionBase = vi.fn();
  const onChooseButtonPressed = vi.fn();
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={0}
        motionSignals={[{ id: "success", label: "Continue" }]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={onApplyMotion}
        onAddButtonPreset={onAddButtonPreset}
        onChooseMotionBase={onChooseMotionBase}
        onChooseButtonPressed={onChooseButtonPressed}
        onChooseMotionBar={onChooseMotionBar}
        motionBaseAssetId="base-image"
        motionPressedAssetId="pressed-image"
        motionBarAssetId="bar-image"
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );
  expect(container.querySelector(".playable-preview-motion-library")).not.toBeNull();
  expect(container.textContent).toContain("按键素材");
  expect(container.textContent).toContain("按键图片");
  expect(container.textContent).toContain(translateText("Selected", "zh-CN"));
  expect(container.textContent).not.toContain("未选择");
  await act(async () => {
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(
        (button) =>
          button.getAttribute("aria-label") === translateText("Replace normal-state image", "zh-CN"),
      )
      ?.click();
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(
        (button) =>
          button.getAttribute("aria-label") ===
            translateText("Replace progress bar image", "zh-CN"),
      )
      ?.click();
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(
        (button) =>
          button.getAttribute("aria-label") === translateText("Replace pressed-state image", "zh-CN"),
      )
      ?.click();
  });
  expect(onChooseMotionBase).toHaveBeenCalledOnce();
  expect(onChooseMotionBar).toHaveBeenCalledOnce();
  expect(onChooseButtonPressed).toHaveBeenCalledOnce();
  expect(
    container.querySelector(
      'select[aria-label="按键预设"] option[value="builtin:progress-bar"]',
    ),
  ).toBeNull();
  expect(onAddButtonPreset).not.toHaveBeenCalled();
});

it("passes the edited progress image placement to its replacement picker", async () => {
  const onChooseMotionBar = vi.fn();
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        motionSelection={{
          nodeId: "start",
          source: "nodes/start/index.html:1:1",
          cssPath: "button.choice",
          tag: "button",
          text: "",
          box: { x: 0, y: 0, width: 120, height: 48 },
          motion: {
            kind: "hold-charge",
            mode: "interactive",
            duration: 4,
            buttonShape: "circle",
            barAssetId: "bar-image",
            barAssetScale: 163,
            barAssetOffsetX: 14,
            barAssetOffsetY: -9,
          },
        }}
        motionSignals={[]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onChooseMotionBar={onChooseMotionBar}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );

  await act(async () => {
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(
        (button) =>
          button.getAttribute("aria-label") ===
          translateText("Replace progress bar image", "zh-CN"),
      )
      ?.click();
  });
  expect(onChooseMotionBar).toHaveBeenCalledWith(163, 14, -9, true, "top");
});

it("edits a selected button's label without overriding its preset shape", async () => {
  const onApplyMotion = vi.fn(async () => {});
  const onEditButtonLabel = vi.fn(async () => true);
  const onEditButtonFont = vi.fn(async () => true);
  const onWriteButtonSignal = vi.fn(async () => true);
  const selection = {
    nodeId: "start",
    source: "nodes/start/index.html:1:1",
    cssPath: "button.choice",
    signal: "next",
    tag: "button",
    text: "Continue",
    fontFamily: "Arial",
    motion: {
      kind: "button-feedback" as const,
      mode: "visual" as const,
      duration: 0.1,
      buttonShape: "circle" as const,
      feedback: "hover-press" as const,
    },
    box: { x: 0, y: 0, width: 120, height: 48 },
  };
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        motionSelection={selection}
        motionSignals={[]}
        buttonSignals={[
          { id: "next", label: "Continue" },
          { id: "retry", label: "Retry" },
        ]}
        mediaState={{ currentTime: 0, duration: 0, paused: true }}
        onMediaCommand={vi.fn()}
        fonts={["Arial", "Microsoft YaHei"]}
        onTextStyle={vi.fn()}
        onEditButtonLabel={onEditButtonLabel}
        onEditButtonFont={onEditButtonFont}
        onWriteButtonSignal={onWriteButtonSignal}
        onInteractionTiming={vi.fn()}
        onApplyMotion={onApplyMotion}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );

  expect(container.querySelector('[aria-label="按键形状"]')).toBeNull();
  expect(container.textContent).toContain("更换按键样式与动效");
  expect(container.textContent).not.toContain("移除动效");
  expect(container.textContent).not.toContain("删除按键");
  expect(
    container.querySelector<HTMLSelectElement>(
      'select[aria-label="按键预设"]',
    )?.value,
  ).toBe("builtin:button-feedback:circle");
  const buttonPresetLabel = container
    .querySelector<HTMLSelectElement>('select[aria-label="按键预设"]')!
    .closest("label")!;
  const buttonMaterials = container.querySelector(
    ".playable-preview-motion-material-section",
  )!;
  const stateImages = buttonMaterials.querySelector(
    ".playable-preview-motion-assets",
  )!;
  expect(
    Boolean(
      buttonPresetLabel.compareDocumentPosition(buttonMaterials) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  ).toBe(true);
  expect(buttonMaterials.contains(stateImages)).toBe(true);
  const label = container.querySelector<HTMLInputElement>(
    '[aria-label="按键文字"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
      .set!.call(label, "Start");
    label.dispatchEvent(new Event("input", { bubbles: true }));
    label.dispatchEvent(new Event("change", { bubbles: true }));
    label.dispatchEvent(new Event("focusout", { bubbles: true }));
  });
  expect(onApplyMotion).not.toHaveBeenCalled();
  expect(onEditButtonLabel).not.toHaveBeenCalled();
  const font = container.querySelector<HTMLSelectElement>(
    '[aria-label="按键字体"]',
  )!;
  expect(font.value).toBe("Arial");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(font, "Microsoft YaHei");
    font.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onEditButtonFont).not.toHaveBeenCalled();
  const route = container.querySelector<HTMLSelectElement>(
    '[aria-label="按钮结果出口"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(route, "retry");
    route.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onWriteButtonSignal).not.toHaveBeenCalled();
  const pressEffect = container.querySelector<HTMLSelectElement>(
    'select[aria-label="按下特效"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(pressEffect, "green-particle-burst");
    pressEffect.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const effectColor = container.querySelector<HTMLInputElement>(
    'input[type="color"][aria-label="特效颜色"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
      .set!.call(effectColor, "#fe4120");
    effectColor.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const applyButton = container.querySelector<HTMLButtonElement>(
    ".playable-preview-motion-apply-button",
  )!;
  expect(applyButton.textContent).toContain("应用到当前选项");
  await act(async () => applyButton.click());
  expect(onEditButtonLabel).toHaveBeenCalledWith(selection, "Start");
  expect(onEditButtonFont).toHaveBeenCalledWith(selection, "Microsoft YaHei");
  expect(onWriteButtonSignal).toHaveBeenCalledWith(selection, "retry");
  expect(onApplyMotion).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "button-feedback",
      pressEffect: "green-particle-burst",
      effectColor: "#fe4120",
    }),
    true,
    "Start",
  );

  onEditButtonLabel.mockClear();
  onApplyMotion.mockClear();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
      .set!.call(label, "");
    label.dispatchEvent(new Event("input", { bubbles: true }));
    label.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => applyButton.click());
  expect(onEditButtonLabel).toHaveBeenCalledWith(selection, "");
  expect(onApplyMotion).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "button-feedback" }),
    true,
    "",
  );

  onEditButtonLabel.mockClear();
  onApplyMotion.mockClear();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
      .set!.call(label, "Again");
    label.dispatchEvent(new Event("input", { bubbles: true }));
    label.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => applyButton.click());
  expect(onEditButtonLabel).toHaveBeenCalledWith(selection, "Again");
  expect(onApplyMotion).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "button-feedback" }),
    true,
    "Again",
  );
});

it("edits a button exit name without editing the button text", async () => {
  const onEditButtonLabel = vi.fn(async () => true);
  const onWriteButtonSignalLabel = vi.fn(async () => true);
  const selection = {
    nodeId: "start",
    source: "nodes/start/index.html:1:1",
    cssPath: "button.choice",
    signal: "next",
    tag: "button",
    text: "",
    box: { x: 0, y: 0, width: 120, height: 48 },
  };

  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        motionSelection={selection}
        motionSignals={[]}
        buttonSignals={[{ id: "next", label: "Continue" }]}
        mediaState={{ currentTime: 0, duration: 0, paused: true }}
        onMediaCommand={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onEditButtonLabel={onEditButtonLabel}
        onWriteButtonSignalLabel={onWriteButtonSignalLabel}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );

  const exitName = container.querySelector<HTMLInputElement>(
    '[aria-label="出口名称"]',
  )!;
  expect(exitName.value).toBe("Continue");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
      .set!.call(exitName, "Proceed");
    exitName.dispatchEvent(new Event("input", { bubbles: true }));
    exitName.dispatchEvent(new Event("change", { bubbles: true }));
    exitName.dispatchEvent(new Event("focusout", { bubbles: true }));
  });

  expect(onWriteButtonSignalLabel).toHaveBeenCalledWith(
    selection,
    "next",
    "Proceed",
  );
  expect(onEditButtonLabel).not.toHaveBeenCalled();
  expect(exitName.value).toBe("Proceed");
});

it("resizes or removes the selected progress image without removing its motion", async () => {
  const onApplyMotion = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        motionSelection={{
          nodeId: "start",
          source: "nodes/start/index.html:1:1",
          cssPath: "button.choice",
          tag: "button",
          text: "Continue",
          motion: {
            kind: "progress-bar",
            mode: "visual",
            duration: 5,
            barAssetId: "progress-image",
            barAssetScale: 150,
          },
          box: { x: 0, y: 0, width: 100, height: 40 },
        }}
        motionSignals={[{ id: "success", label: "Continue" }]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={onApplyMotion}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="进度条移至底层"]',
      )
      ?.click(),
  );
  const size = container.querySelector<HTMLInputElement>(
    '[aria-label="进度图片大小"]',
  )!;
  expect(size.value).toBe("150");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
      .set!.call(size, "180");
    size.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        ".playable-preview-motion-apply-button",
      )
      ?.click(),
  );
  expect(onApplyMotion).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: "progress-bar",
      barAssetId: "progress-image",
      barAssetScale: 180,
      barLayer: "bottom",
    }),
    true,
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="移除进度条图片"]',
      )
      ?.click(),
  );
  expect(onApplyMotion).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: "progress-bar",
      barAssetId: undefined,
      barAssetScale: undefined,
    }),
    true,
  );
});

it("moves normal and pressed button image replacement into button presets", async () => {
  const onChooseButtonNormal = vi.fn();
  const onChooseButtonPressed = vi.fn();
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        motionSelection={{
          nodeId: "start",
          source: "nodes/start/index.html:1:1",
          cssPath: "button.choice",
          tag: "button",
          text: "Choice",
          buttonAssetId: "normal-asset",
          buttonPressedAssetId: "pressed-asset",
          box: { x: 0, y: 0, width: 100, height: 40 },
        }}
        motionSignals={[]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onChooseButtonNormal={onChooseButtonNormal}
        onChooseButtonPressed={onChooseButtonPressed}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );
  expect(container.querySelector(".playable-preview-motion-library")).not.toBeNull();
  expect(container.textContent).toContain(translateText("Replace normal-state image", "zh-CN"));
  expect(container.textContent).toContain(translateText("Replace pressed-state image", "zh-CN"));
  await act(async () => {
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes(translateText("Replace normal-state image", "zh-CN")))
      ?.click();
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes(translateText("Replace pressed-state image", "zh-CN")))
      ?.click();
  });
  expect(onChooseButtonNormal).toHaveBeenCalledOnce();
  expect(onChooseButtonPressed).toHaveBeenCalledOnce();
});

it("maps a selected option button to a shared result exit", async () => {
  const onWriteButtonSignal = vi.fn(async () => true);
  const selection = {
    nodeId: "start",
    source: "nodes/start/index.html:1:1",
    cssPath: "button.choice-a",
    signal: "option-a",
    tag: "button",
    text: "Choice A",
    box: { x: 0, y: 0, width: 100, height: 40 },
  };
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        motionSelection={selection}
        buttonSignals={[
          { id: "option-a", label: "Choice A" },
          { id: "answer-correct", label: "Correct" },
          { id: "answer-incorrect", label: "Incorrect" },
        ]}
        motionSignals={[]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onWriteButtonSignal={onWriteButtonSignal}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );
  expect(container.querySelector(".playable-preview-motion-library")).not.toBeNull();
  const route = container.querySelector<HTMLSelectElement>(
    '[aria-label="按钮结果出口"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(route, "answer-correct");
    route.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onWriteButtonSignal).not.toHaveBeenCalled();
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        ".playable-preview-motion-apply-button",
      )
      ?.click(),
  );
  expect(onWriteButtonSignal).toHaveBeenCalledWith(
    selection,
    "answer-correct",
  );
});

it("creates shared outcomes and uses them for a new QTE preset when selected", async () => {
  const onAddButtonPreset = vi.fn(async () => {});
  const onCreateSharedAnswerSignals = vi.fn(async () => true);
  const onDeleteSharedAnswerSignals = vi.fn(async () => true);
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={0}
        buttonSignals={[
          { id: "answer-correct", label: "Correct" },
          { id: "answer-incorrect", label: "Incorrect" },
        ]}
        motionSignals={[
          { id: "answer-correct", label: "Correct" },
          { id: "answer-incorrect", label: "Incorrect" },
        ]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onAddButtonPreset={onAddButtonPreset}
        onCreateSharedAnswerSignals={onCreateSharedAnswerSignals}
        onDeleteSharedAnswerSignals={onDeleteSharedAnswerSignals}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );
  expect(container.querySelector(".playable-preview-motion-library")).not.toBeNull();
  expect(
    container.querySelector(".playable-preview-secondary-text")?.textContent,
  ).toBe("（多选项/多点击时公用一个出口）");
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) =>
        button.textContent?.includes("创建正确/错误出口"),
      )
      ?.click(),
  );
  expect(onCreateSharedAnswerSignals).toHaveBeenCalledOnce();
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) =>
        button.textContent?.includes("删除正确/错误出口"),
      )
      ?.click(),
  );
  expect(onDeleteSharedAnswerSignals).toHaveBeenCalledOnce();
  const mode = container.querySelector<HTMLSelectElement>(
    '[aria-label="按键出口设置"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(mode, "shared");
    mode.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const route = container.querySelector<HTMLSelectElement>(
    '[aria-label="按键出口"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(route, "answer-correct");
    route.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const preset = container.querySelector<HTMLSelectElement>(
    'select[aria-label="按键预设"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(preset, "builtin:hold-charge");
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onAddButtonPreset).not.toHaveBeenCalled();
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("确定添加"))
      ?.click(),
  );
  expect(onAddButtonPreset).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "hold-charge",
      feedback: "bounce-hover-press",
      signal: "answer-correct",
      timeoutSignal: "answer-incorrect",
    }),
    undefined,
    true,
    "answer-correct",
    undefined,
    "长按蓄力",
    undefined,
    undefined,
  );
});

it.each([
  ["rectangle", "开始游戏按钮（长方形）"],
  ["circle", "开始游戏按钮（圆形）"],
] as const)(
  "adds a %s start-game button preset with reset behavior",
  async (shape, label) => {
    const onAddButtonPreset = vi.fn(async () => {});
    await act(async () =>
      root.render(
        <PreviewToolbar
          tool="select"
          disabled={false}
          strokes={0}
          picks={0}
          motionSignals={[{ id: "start", label: "Start" }]}
          mediaState={{ currentTime: 0, duration: 0, paused: true }}
          onMediaCommand={vi.fn()}
          onDeleteSelected={vi.fn()}
          fonts={[]}
          onTextStyle={vi.fn()}
          onInteractionTiming={vi.fn()}
          onApplyMotion={vi.fn(async () => {})}
          onAddButtonPreset={onAddButtonPreset}
          onTool={vi.fn()}
          onUndoStroke={vi.fn()}
          onClearStrokes={vi.fn()}
        />,
      ),
    );
    const preset = container.querySelector<HTMLSelectElement>(
      'select[aria-label="按键预设"]',
    )!;
    const option = preset.querySelector<HTMLOptionElement>(
      `option[value="builtin:button-new-game:${shape}"]`,
    );
    expect(option?.textContent).toBe(label);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
        .set!.call(preset, `builtin:button-new-game:${shape}`);
      preset.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="按键文字"]')
        ?.value,
    ).toBe("开始游戏");
    await act(async () =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("确定添加"))
        ?.click(),
    );
    expect(onAddButtonPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "button-feedback",
        buttonShape: shape,
      }),
      undefined,
      false,
      undefined,
      undefined,
      "开始游戏",
      undefined,
      "new-game",
    );
  },
);

it("keeps button presets available with no selection and creates a full button", async () => {
  const onApplyMotion = vi.fn(async () => {});
  const onAddButtonPreset = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={0}
        motionSignals={[
          { id: "success", label: "Continue" },
          { id: "failure", label: "Failed" },
        ]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={onApplyMotion}
        onAddButtonPreset={onAddButtonPreset}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );
  expect(container.querySelector(".playable-preview-motion-library")).not.toBeNull();
  expect(container.querySelector('[aria-label="按键形状"]')).toBeNull();
  expect(container.textContent).not.toContain("保存为预设");
  expect(container.querySelector('option[value^="saved:"]')).toBeNull();
  expect(
    container.querySelector(".playable-preview-motion-material-section"),
  ).not.toBeNull();
  expect(
    container.querySelector(".playable-preview-motion-exit"),
  ).not.toBeNull();
  expect(
    container.querySelector(".playable-preview-motion-command-actions"),
  ).not.toBeNull();
  const preset = container.querySelector<HTMLSelectElement>(
    'select[aria-label="按键预设"]',
  )!;
  const builtInOptions = [
    ...preset.querySelectorAll<HTMLOptionElement>(
      'optgroup[label="内置按键预设"] option',
    ),
  ];
  expect(
    builtInOptions.some(
      (option) => option.value === "builtin:button-new-game:rectangle",
    ),
  ).toBe(true);
  expect(
    builtInOptions.some(
      (option) => option.value === "builtin:button-new-game:circle",
    ),
  ).toBe(true);
  expect(
    builtInOptions.some((option) =>
      option.textContent?.includes("倒计时按键（长方形）"),
    ),
  ).toBe(true);
  expect(
    builtInOptions.some((option) =>
      option.textContent?.includes("倒计时按键（圆形）"),
    ),
  ).toBe(true);
  expect(
    builtInOptions.some((option) =>
      option.value.startsWith("builtin:progress-ring"),
    ),
  ).toBe(false);
  expect(
    builtInOptions.some((option) =>
      option.value.startsWith("builtin:progress-bar"),
    ),
  ).toBe(false);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(preset, "builtin:countdown:circle");
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onAddButtonPreset).not.toHaveBeenCalled();
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("确定添加"))
      ?.click(),
  );
  expect(onAddButtonPreset).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "countdown",
      buttonShape: "circle",
      signal: "success",
    }),
    undefined,
    false,
    undefined,
    undefined,
    "倒计时",
    undefined,
    undefined,
  );
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(preset, "builtin:button-feedback-prompt:circle");
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("确定添加"))
      ?.click(),
  );
  expect(onAddButtonPreset).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: "button-feedback",
      buttonShape: "circle",
      mode: "visual",
      feedback: "idle-pulse-hover-press",
    }),
    undefined,
    false,
    undefined,
    undefined,
    "新按钮",
    undefined,
    undefined,
  );
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(preset, "builtin:button-feedback-bounce");
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onAddButtonPreset).toHaveBeenCalledTimes(2);
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("确定添加"))
      ?.click(),
  );
  expect(onAddButtonPreset).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: "button-feedback",
      buttonShape: "circle",
      mode: "interactive",
      feedback: "bounce-hover-press",
      interaction: "multi-click",
      requiredCount: 3,
      duration: 0.1,
    }),
    undefined,
    false,
    undefined,
    undefined,
    "新按钮",
    undefined,
    undefined,
  );
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(preset, "builtin:button-feedback-ripple");
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelector('[aria-label="按键文字"]')).toBeNull();
  expect(container.querySelector('[aria-label="选择普通态图片"]')).toBeNull();
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("确定添加"))
      ?.click(),
  );
  expect(onAddButtonPreset).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: "button-feedback",
      buttonShape: "circle",
      mode: "visual",
      feedback: "ripple-hint",
    }),
    undefined,
    false,
    undefined,
    undefined,
    "",
    undefined,
    undefined,
  );
  expect(onApplyMotion).not.toHaveBeenCalled();
});

it.each([
  ["rectangle", "builtin:countdown"],
  ["circle", "builtin:countdown:circle"],
] as const)("adds a %s countdown button with press feedback", async (shape, value) => {
  const onAddButtonPreset = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={0}
        motionSignals={[{ id: "success", label: "Continue" }]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onAddButtonPreset={onAddButtonPreset}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );
  const preset = container.querySelector<HTMLSelectElement>(
    'select[aria-label="按键预设"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(preset, value);
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("确定添加"))
      ?.click(),
  );
  expect(onAddButtonPreset).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "countdown",
      buttonShape: shape,
      feedback: "hover-press",
    }),
    undefined,
    false,
    undefined,
    undefined,
    "倒计时",
    undefined,
    undefined,
  );
});

it("sets the text and font on a new button preset", async () => {
  const onAddButtonPreset = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={0}
        motionSignals={[{ id: "next", label: "Continue" }]}
        mediaState={{ currentTime: 0, duration: 0, paused: true }}
        onMediaCommand={vi.fn()}
        fonts={["Arial", "Microsoft YaHei"]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onAddButtonPreset={onAddButtonPreset}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );
  const preset = container.querySelector<HTMLSelectElement>(
    'select[aria-label="按键预设"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(preset, "builtin:countdown");
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const text = container.querySelector<HTMLInputElement>(
    '[aria-label="按键文字"]',
  )!;
  expect(text.value).toBe("倒计时");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
      .set!.call(text, "开始");
    text.dispatchEvent(new Event("input", { bubbles: true }));
    text.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const font = container.querySelector<HTMLSelectElement>(
    '[aria-label="按键字体"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(font, "Microsoft YaHei");
    font.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("确定添加"))
      ?.click(),
  );
  expect(onAddButtonPreset).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "countdown" }),
    undefined,
    false,
    undefined,
    undefined,
    "开始",
    "Microsoft YaHei",
    undefined,
  );
});

it("allows clearing and editing the default text before adding a button", async () => {
  const onAddButtonPreset = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={0}
        motionSignals={[{ id: "next", label: "Continue" }]}
        mediaState={{ currentTime: 0, duration: 0, paused: true }}
        onMediaCommand={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onAddButtonPreset={onAddButtonPreset}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );
  const preset = container.querySelector<HTMLSelectElement>(
    'select[aria-label="按键预设"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(preset, "builtin:countdown");
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const text = container.querySelector<HTMLInputElement>('[aria-label="按键文字"]')!;
  const setText = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
        .set!.call(text, value);
      text.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  await setText("自定义按钮");
  expect(text.value).toBe("自定义按钮");
  await setText("");
  expect(text.value).toBe("");
  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("确定添加"))
      ?.click(),
  );
  expect(onAddButtonPreset).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "countdown" }),
    undefined,
    false,
    undefined,
    undefined,
    "",
    undefined,
    undefined,
  );
});

it("configures all parts of the swipe button before adding it", async () => {
  const onAddButtonPreset = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={0}
        motionSignals={[
          { id: "success", label: "Success" },
          { id: "failure", label: "Failure" },
        ]}
        mediaState={{ currentTime: 0, duration: 0, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onAddButtonPreset={onAddButtonPreset}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );
  expect(container.querySelector(".playable-preview-motion-library")).not.toBeNull();
  const choose = async (selector: string, value: string) => {
    const select = container.querySelector<HTMLSelectElement>(selector)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
        .set!.call(select, value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  await choose('select[aria-label="按键预设"]', "builtin:swipe-button");
  expect(onAddButtonPreset).not.toHaveBeenCalled();
  await choose('[aria-label="滑动方向"]', "swipe-down");
  expect(container.querySelector('[aria-label="滑动按键外观"]')).toBeNull();
  expect(container.textContent).not.toContain("方向图片");
  const addButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) =>
      button.textContent?.includes("确定添加"),
    )!;
  await act(async () => addButton.click());
  expect(onAddButtonPreset).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "swipe-button",
      mode: "interactive",
      interaction: "swipe-down",
      swipeBehavior: "one-way",
      signal: "success",
      timeoutSignal: "failure",
    }),
    undefined,
    false,
    undefined,
    undefined,
    "滑动按钮",
    undefined,
    undefined,
  );
});

it("removes button background-image sizing controls and keeps element scaling", async () => {
  const pick = {
    nodeId: "start",
    source: "nodes/start/index.html:1:1",
    cssPath: "button",
    tag: "button",
    text: "Continue",
    buttonAssetId: "button-image",
    buttonAssetScaleX: 345,
    buttonAssetScaleY: 100,
    box: { x: 0, y: 0, width: 180, height: 48 },
  };
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        motionSelection={pick}
        motionSignals={[]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );

  expect(
    container.querySelector('[aria-label="调整按钮背景图大小"]'),
  ).toBeNull();
  expect(
    container.querySelector('[aria-label="按钮背景图大小"]'),
  ).toBeNull();
  expect(container.querySelector(".playable-preview-element-scale")).not.toBeNull();
});

it("keeps the selected element's proportional scale visible and commits it", async () => {
  const pick = {
    nodeId: "start",
    source: "nodes/start/index.html:1:1",
    cssPath: "button",
    tag: "button",
    text: "Continue",
    transformScale: 1.25,
    transformRotation: 12,
    transformOriginX: 50,
    transformOriginY: 50,
    box: { x: 0, y: 0, width: 180, height: 48 },
  };
  const onPreviewElementScale = vi.fn();
  const onCommitElementScale = vi.fn(async () => true);
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={1}
        motionSelection={pick}
        motionSignals={[]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        onDeleteSelected={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onPreviewElementScale={onPreviewElementScale}
        onCommitElementScale={onCommitElementScale}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );

  const slider = container.querySelector<HTMLInputElement>(
    'input[aria-label="元素整体缩放"]',
  )!;
  expect(slider.value).toBe("125");
  expect(container.querySelector(".playable-preview-element-scale")).not.toBeNull();
  await act(async () => {
    Object.defineProperty(slider, "value", {
      configurable: true,
      get: () => "175",
    });
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(onPreviewElementScale).toHaveBeenCalledWith(pick, 1.75);

  await act(async () =>
    slider.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })),
  );
  expect(onCommitElementScale).toHaveBeenCalledWith(pick, 1.75);

  const scaleInput = container.querySelector<HTMLInputElement>(
    'input[type="number"][aria-label="元素整体缩放"]',
  )!;
  expect(scaleInput.value).toBe("175");
  onPreviewElementScale.mockClear();
  onCommitElementScale.mockClear();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(scaleInput, "220");
    scaleInput.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onPreviewElementScale).toHaveBeenCalledWith(pick, 2.2);
  expect(
    container.querySelector<HTMLInputElement>(
      'input[type="range"][aria-label="元素整体缩放"]',
    )?.getAttribute("aria-valuetext"),
  ).toBe("220%");
  await act(async () => {
    scaleInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(onCommitElementScale).toHaveBeenCalledWith(pick, 2.2);
});

it("adds a button with a library press effect at the configured attachment point", async () => {
  const onAddButtonPreset = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <PreviewToolbar
        tool="select"
        disabled={false}
        strokes={0}
        picks={0}
        motionSignals={[{ id: "next", label: "Continue" }]}
        mediaState={{ currentTime: 0, duration: 30, paused: true }}
        onMediaCommand={vi.fn()}
        fonts={[]}
        onTextStyle={vi.fn()}
        onInteractionTiming={vi.fn()}
        onApplyMotion={vi.fn(async () => {})}
        onAddButtonPreset={onAddButtonPreset}
        onTool={vi.fn()}
        onUndoStroke={vi.fn()}
        onClearStrokes={vi.fn()}
      />,
    ),
  );

  const preset = container.querySelector<HTMLSelectElement>(
    'select[aria-label="按键预设"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(preset, "builtin:button-feedback:circle");
    preset.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const effect = container.querySelector<HTMLSelectElement>(
    'select[aria-label="按下特效"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!
      .set!.call(effect, "green-particle-burst");
    effect.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const setAnchor = async (label: string, value: string) => {
    const input = container.querySelector<HTMLInputElement>(
      `input[type="range"][aria-label="${label}"]`,
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
        .set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  await setAnchor("挂点 X (%)", "24");
  await setAnchor("挂点 Y (%)", "73");
  const color = container.querySelector<HTMLInputElement>(
    'input[type="color"][aria-label="特效颜色"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
      .set!.call(color, "#3478f6");
    color.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(color.value).toBe("#3478f6");
  expect(
    container.querySelector<HTMLInputElement>(
      'input[aria-label="挂点 X (%)"]',
    )?.value,
  ).toBe("24");
  const setOffset = async (label: string, value: string) => {
    const input = container.querySelector<HTMLInputElement>(
      `input[type="number"][aria-label="${label}"]`,
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
        .set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  await setOffset("偏移 X (px)", "12");
  await setOffset("偏移 Y (px)", "-8");

  await act(async () =>
    [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("确定添加"))
      ?.click(),
  );
  expect(onAddButtonPreset).toHaveBeenCalledWith(
    expect.objectContaining({
      pressEffect: "green-particle-burst",
      effectColor: "#3478f6",
      effectAnchorX: 24,
      effectAnchorY: 73,
      effectOffsetX: 12,
      effectOffsetY: -8,
    }),
    undefined,
    false,
    undefined,
    undefined,
    "新按钮",
    undefined,
    undefined,
  );
});
