import { describe, expect, it } from "vitest";
import { filterLibraryAssets } from "../src/renderer/library.js";
import type { LibraryAsset } from "../src/renderer/library-assets.js";
import { browserLibrarySyncAction } from "../src/renderer/browser-library-folders.js";
import {
  filterCustomLibraryAssets,
  filterLocalLibraryAssets,
  libraryAssetProjects,
  sortLibraryAssets,
} from "../src/renderer/library-assets.js";

const ASSETS: LibraryAsset[] = [
  { id: "hero", assetId: "hero", name: "hero.webp", path: "hero.webp", size: 10, mediaType: "image", contentType: "image/webp", createdAt: "2026-08-24T12:00:00Z", prompt: "Ancient forest shrine" },
  { id: "theme", assetId: "theme", name: "theme.mp3", path: "theme.mp3", size: 20, mediaType: "audio", contentType: "audio/mpeg", createdAt: "2026-08-24T12:00:00Z" },
  { id: "car", assetId: "car", name: "car.glb", path: "car.glb", size: 30, mediaType: "model", contentType: "model/gltf-binary", createdAt: "2026-08-23T12:00:00Z" },
];

describe("library filters", () => {
  it("skips unchanged browser-folder files and accepts arbitrarily large files", () => {
    const unchanged = { size: 24, lastModified: 100 };
    expect(browserLibrarySyncAction(unchanged, unchanged)).toBe("unchanged");
    expect(
      browserLibrarySyncAction(
        { size: Number.MAX_SAFE_INTEGER, lastModified: 200 },
      ),
    ).toBe("upload");
  });

  it("filters by media type", () => {
    expect(filterLibraryAssets(ASSETS, "image", "")).toEqual([ASSETS[0]]);
    expect(filterLibraryAssets(ASSETS, "audio", "")).toEqual([ASSETS[1]]);
  });

  it("separates UI images and sorts by file size or modification time", () => {
    const video: LibraryAsset = {
      ...ASSETS[0]!,
      id: "video",
      assetId: "video",
      name: "intro.mp4",
      path: "intro.mp4",
      mediaType: "video",
      contentType: "video/mp4",
      category: "video",
    };
    const ui = {
      ...ASSETS[0]!,
      id: "ui",
      assetId: "ui",
      category: "ui" as const,
      size: 100,
      modifiedAt: "2026-08-25T12:00:00Z",
    };
    const photo = {
      ...ASSETS[0]!,
      id: "photo",
      assetId: "photo",
      size: 50,
      modifiedAt: "2026-08-26T12:00:00Z",
    };
    const assets = [ui, photo];
    expect(filterLibraryAssets([video, ...assets], "video", "")).toEqual([video]);
    expect(filterLibraryAssets(assets, "image", "")).toEqual([photo]);
    expect(filterLibraryAssets(assets, "ui", "")).toEqual([ui]);
    expect(sortLibraryAssets(assets, "size").map((asset) => asset.id)).toEqual(["ui", "photo"]);
    expect(sortLibraryAssets(assets, "modified").map((asset) => asset.id)).toEqual(["photo", "ui"]);
  });

  it("shows only this-session imports in the custom picker category", () => {
    const ui = {
      ...ASSETS[0]!,
      id: "ui",
      assetId: "ui",
      category: "ui" as const,
      origin: "local" as const,
    };
    const imported = {
      ...ASSETS[0]!,
      id: "imported",
      assetId: "imported",
      origin: "uploaded" as const,
    };
    expect(
      filterCustomLibraryAssets(
        [ui, imported, ASSETS[0]!],
        "",
        {},
        new Set(["imported"]),
      ).map((asset) => asset.id),
    ).toEqual(["imported"]);
    expect(filterLocalLibraryAssets([imported, ui], "image", "")).toEqual([]);
  });

  it("shows only files scanned from the matching local folder in video and image tabs", () => {
    const localImage = {
      ...ASSETS[0]!,
      id: "local-image",
      assetId: "local-image",
      origin: "local" as const,
      category: "image" as const,
    };
    const localVideo: LibraryAsset = {
      ...localImage,
      id: "local-video",
      assetId: "local-video",
      name: "intro.mp4",
      path: "intro.mp4",
      mediaType: "video",
      contentType: "video/mp4",
      category: "video",
    };
    const uploaded = {
      ...localImage,
      id: "uploaded-image",
      assetId: "uploaded-image",
      origin: "uploaded" as const,
    };
    expect(
      filterLocalLibraryAssets([localImage, localVideo, uploaded], "image", ""),
    ).toEqual([localImage]);
    expect(
      filterLocalLibraryAssets([localImage, localVideo, uploaded], "video", ""),
    ).toEqual([localVideo]);
  });

  it("searches paths and project names case-insensitively", () => {
    expect(filterLibraryAssets(ASSETS, "all", "HERO")).toEqual([ASSETS[0]]);
    expect(filterLibraryAssets(ASSETS, "all", "SHRINE")).toEqual([ASSETS[0]]);
    expect(filterLibraryAssets(ASSETS, "all", "car")).toEqual([ASSETS[2]]);
  });

  it("combines source, project, media, and search filters without changing provenance", () => {
    const projects = [{ id: "forest", name: "Forest", type: "web-game" as const }, { id: "city", name: "City", type: "web-game" as const }];
    const assets: LibraryAsset[] = [
      { ...ASSETS[0]!, origin: "generated", projects },
      { ...ASSETS[1]!, origin: "uploaded", projects: [projects[0]!] },
      { ...ASSETS[2]!, origin: "generated", projects: [projects[1]!] },
    ];
    expect(filterLibraryAssets(assets, "image", "FOREST", { origin: "generated", projectId: "forest" })).toEqual([assets[0]]);
    expect(filterLibraryAssets(assets, "all", "", { origin: "generated", projectId: "city" })).toEqual([assets[0], assets[2]]);
    expect(filterLibraryAssets(assets, "all", "", { origin: "uploaded", projectId: "city" })).toEqual([]);
    expect(libraryAssetProjects(assets)).toEqual([projects[1], projects[0]]);
  });

  it("hides reference inputs by default but includes references used as assets", () => {
    const reference = { ...ASSETS[0]!, purpose: "reference" as const, referenceOnly: true };
    const usedReference = { ...ASSETS[2]!, purpose: "reference" as const, referenceOnly: false };
    expect(filterLibraryAssets([reference, usedReference], "all", "")).toEqual([usedReference]);
    expect(filterLibraryAssets([reference, usedReference], "all", "", { includeReferences: true })).toEqual([reference, usedReference]);
  });

  it("keeps unclassified assets in Library and filters unassigned assets", () => {
    expect(filterLibraryAssets(ASSETS, "all", "", { origin: "unknown", projectId: "unassigned" })).toEqual(ASSETS);
  });

  it("hides historical project copies in Library but keeps them available by source", () => {
    const projectCopy = { ...ASSETS[0]!, origin: "workspace" as const, saved: false };
    const saved = { ...ASSETS[1]!, origin: "workspace" as const, saved: true };
    const generated = { ...ASSETS[2]!, origin: "generated" as const, saved: true };
    const assets = [projectCopy, saved, generated];
    expect(filterLibraryAssets(assets, "all", "")).toEqual([saved, generated]);
    expect(filterLibraryAssets(assets, "all", "", { origin: "workspace" })).toEqual([projectCopy, saved]);
    expect(filterLibraryAssets(assets, "all", "", { origin: "all" })).toEqual(assets);
  });
});
