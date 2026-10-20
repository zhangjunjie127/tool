// @vitest-environment happy-dom
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LibraryAsset } from "../src/renderer/library-assets.js";

const { loadLibraryAssets, listLibrarySourceFolders } = vi.hoisted(() => ({
  loadLibraryAssets: vi.fn<() => Promise<LibraryAsset[]>>(),
  listLibrarySourceFolders: vi.fn(async () => ({})),
}));

vi.doMock(path.resolve("src/renderer/library-assets.js"), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/renderer/library-assets.js")>()),
  loadLibraryAssets,
}));

vi.doMock(path.resolve("src/renderer/api.js"), () => ({
  deleteLibraryAsset: vi.fn(),
  forceDeleteLibraryAsset: vi.fn(),
  listLibraryAssetReferences: vi.fn(async () => []),
  listLibrarySourceFolders,
  renameLibraryAsset: vi.fn(),
  saveLibraryAsset: vi.fn(),
  setLibrarySourceFolder: vi.fn(async () => ({})),
}));

vi.doMock(path.resolve("src/renderer/runtime-connection.js"), () => ({
  useReadyRuntimeGeneration: () => 0,
}));

vi.doMock(path.resolve("src/renderer/app-sidebar.js"), () => ({
  AppSidebar: () => null,
}));

vi.doMock(path.resolve("src/renderer/window-drag-region.js"), () => ({
  WindowDragRegion: () => null,
}));

vi.doMock(path.resolve("src/renderer/asset-browser.js"), async () => {
  const React = await import("react");
  return {
    AssetToolbar: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    fileName: (path: string) => path,
    fileStem: (path: string) => path,
    WorkspaceAssetCard: ({ asset }: { asset: LibraryAsset }) =>
      React.createElement("div", { "data-asset": asset.id }, asset.name),
    WorkspaceAssetDialog: () => null,
  };
});

vi.doMock(path.resolve("src/renderer/icons.js"), () => {
  const Icon = () => null;
  return {
    Film: Icon,
    Image: Icon,
    Layers3: Icon,
    LoaderCircle: Icon,
    RefreshCw: Icon,
    X: Icon,
  };
});

vi.doMock(path.resolve("src/renderer/library-filters.js"), () => ({
  LibraryCollectionFilters: () => null,
}));

vi.doMock(path.resolve("src/renderer/library-source-folders-control.js"), () => ({
  LibrarySourceFoldersControl: () => null,
}));

vi.doMock(path.resolve("src/renderer/browser-library-folders.js"), () => ({
  browserLibraryFolderNames: vi.fn(async () => ({})),
  chooseBrowserLibraryFolder: vi.fn(),
  clearBrowserLibraryFolder: vi.fn(),
}));

vi.doMock(path.resolve("src/renderer/i18n.js"), () => ({
  readLanguage: () => "zh-CN",
  t: (key: string) => key,
  translateText: (text: string) => text,
}));

vi.doMock(path.resolve("src/renderer/project-rename-dialog.js"), () => ({
  ProjectRenameDialog: () => null,
}));

vi.doMock(path.resolve("src/renderer/sidebar-page.tsx"), async () => {
  const React = await import("react");
  return {
    SidebarPageHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement("header", null, children),
    SidebarPageLayout: ({ children }: { children: React.ReactNode }) =>
      React.createElement("main", null, children),
  };
});

const { LibraryPage } = await import("../src/renderer/library.js");

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.useFakeTimers();
  loadLibraryAssets.mockReset().mockResolvedValue([]);
  listLibrarySourceFolders.mockReset().mockResolvedValue({});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

it("shows files added to a selected local folder without reloading the Library page", async () => {
  const addedAsset: LibraryAsset = {
    id: "new-local-image",
    assetId: "new-local-image",
    name: "new-scene.png",
    path: "new-scene.png",
    size: 12,
    mediaType: "image",
    contentType: "image/png",
    createdAt: new Date(0).toISOString(),
    origin: "local",
    category: "image",
  };
  loadLibraryAssets
    .mockResolvedValueOnce([])
    .mockResolvedValue([addedAsset]);

  await act(async () => root.render(<LibraryPage onNavigate={vi.fn()} />));
  expect(container.querySelector('[data-asset="new-local-image"]')).toBeNull();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000);
  });

  expect(container.querySelector('[data-asset="new-local-image"]')).not.toBeNull();
});
