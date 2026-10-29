import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { createNodeGraphFixture } from "./playable-fixture.js";

const assetApi = vi.hoisted(() => ({
  getLibraryAsset: vi.fn(),
  getWorkspaceAsset: vi.fn(),
}));

vi.doMock(path.resolve("src/renderer/api.ts"), () => ({
  getLibraryAsset: assetApi.getLibraryAsset,
  getWorkspaceAsset: assetApi.getWorkspaceAsset,
}));

const { loadPlayableAssets } = await import(
  "../src/renderer/playable-assets.js"
);

describe("Playable asset loading", () => {
  it("loads only the requested Scene Assets", async () => {
    const graph = createNodeGraphFixture();
    assetApi.getWorkspaceAsset.mockResolvedValue(new Blob(["background"]));
    assetApi.getLibraryAsset.mockResolvedValue(new Blob(["theme"]));

    const assets = await loadPlayableAssets("project", graph, undefined, [
      "background",
    ]);

    expect(Object.keys(assets)).toEqual(["background"]);
    expect(assetApi.getWorkspaceAsset).toHaveBeenCalledWith(
      "project",
      "assets/background.webp",
    );
    expect(assetApi.getLibraryAsset).not.toHaveBeenCalled();
  });

  it("loads the full graph when no asset subset is supplied", async () => {
    const graph = createNodeGraphFixture();
    assetApi.getWorkspaceAsset.mockResolvedValue(new Blob(["background"]));
    assetApi.getLibraryAsset.mockResolvedValue(new Blob(["theme"]));

    const assets = await loadPlayableAssets("project", graph);

    expect(Object.keys(assets).sort()).toEqual(["background", "theme"]);
  });
});
