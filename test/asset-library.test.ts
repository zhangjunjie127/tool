import { mkdir, mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AssetLibrary } from "../src/daemon/asset-library.js";

describe("AssetLibrary", () => {
  it("stores one global asset for a stable source and restores it", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "putenggame-library-"));
    const library = new AssetLibrary(dataDirectory);
    await library.load();

    const [first, repeated] = await Promise.all([
      library.add("opening.mp4", Buffer.from("video"), { prompt: "Opening shot", sourceKey: "tool:run:file", duration: 6.5 }),
      library.add("opening.mp4", Buffer.from("different"), { sourceKey: "tool:run:file" }),
    ]);

    expect(repeated).toEqual(first);
    expect(library.list()).toEqual([first]);
    expect(await readFile((await library.content(first.id)).absolutePath, "utf8")).toBe("video");

    const restored = new AssetLibrary(dataDirectory);
    await restored.load();
    expect(restored.list()).toEqual([first]);
  });

  it("renames metadata without moving content and deletes the asset", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "putenggame-library-"));
    const library = new AssetLibrary(dataDirectory);
    await library.load();
    const asset = await library.add("model.glb", Buffer.from("model"));
    const contentPath = (await library.content(asset.id)).absolutePath;

    await expect(library.rename(asset.id, "Character")).resolves.toMatchObject({ name: "Character.glb" });
    expect((await library.content(asset.id)).absolutePath).toBe(contentPath);
    await library.delete(asset.id);
    expect(library.list()).toEqual([]);
    await expect(library.content(asset.id)).rejects.toThrow("not found");
  });

  it("rejects unsupported files and invalid names", async () => {
    const library = new AssetLibrary(await mkdtemp(path.join(tmpdir(), "putenggame-library-")));
    await library.load();
    await expect(library.add("notes.txt", Buffer.from("notes"))).rejects.toThrow("supported media");
    const asset = await library.add("image.webp", Buffer.from("image"));
    await expect(library.rename(asset.id, "../outside")).rejects.toThrow("Invalid asset name");
  });

  it("rejects invalid stored metadata instead of hiding it as an empty Library", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "putenggame-library-"));
    await mkdir(path.join(dataDirectory, "library"), { recursive: true });
    await writeFile(path.join(dataDirectory, "library", "assets.json"), JSON.stringify({ version: 1, assets: "invalid", sources: {} }));

    await expect(new AssetLibrary(dataDirectory).load()).rejects.toThrow("Invalid Library metadata");
  });

  it("migrates legacy sources without guessing from prompts or changing asset IDs", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "putenggame-library-legacy-"));
    const directory = path.join(dataDirectory, "library");
    await mkdir(directory, { recursive: true });
    const base = { size: 3, mediaType: "image", contentType: "image/png", createdAt: "2026-08-24T12:00:00Z" };
    await writeFile(path.join(directory, "assets.json"), JSON.stringify({
      version: 1,
      assets: [
        { ...base, id: "model", name: "model.glb", mediaType: "model", contentType: "model/gltf-binary" },
        { ...base, id: "chat", name: "screenshot.png" },
        { ...base, id: "project", name: "sprite.png", prompt: "A generated-looking prompt" },
        { ...base, id: "unknown", name: "other.png", prompt: "Another prompt" },
        { ...base, id: "recovered", name: "recovered.png", origin: "unknown" },
        { ...base, id: "unclassified", name: "unclassified.png", origin: "unknown" },
        { ...base, id: "old-generation", name: "old-generation.png" },
        { ...base, id: "builtin", name: "builtin.png" },
      ],
      sources: { "tool:run:model.glb": "model", "conversation-image:image/png:hash": "chat", "project:project:sprite.png": "project", "tool:old:recovered.png": "recovered", "project:project:assets/generated/old-generation.png": "old-generation", "builtin:example": "builtin" },
    }));
    const library = new AssetLibrary(dataDirectory);
    await library.load();
    expect(library.get("model")).toMatchObject({ origin: "generated", purpose: "asset" });
    expect(library.get("chat")).toMatchObject({ origin: "uploaded", purpose: "reference" });
    expect(library.get("project")).toMatchObject({ origin: "workspace", purpose: "asset", saved: false });
    expect(library.get("unknown")).toMatchObject({ origin: "uploaded", purpose: "asset", saved: true });
    expect(library.get("recovered")).toMatchObject({ origin: "generated", saved: true });
    expect(library.get("unclassified")).toMatchObject({ origin: "unknown", saved: true });
    expect(library.get("old-generation")).toMatchObject({ origin: "workspace", saved: false });
    expect(library.get("builtin")).toMatchObject({ origin: "builtin", saved: true });
    await library.save("project");
    expect(library.get("project")).toMatchObject({ origin: "workspace", saved: true });
    const restored = new AssetLibrary(dataDirectory);
    await restored.load();
    expect(restored.list()).toEqual(library.list());
    expect(JSON.parse(await readFile(path.join(directory, "assets.json"), "utf8")).assets).toEqual(expect.arrayContaining([expect.objectContaining({ id: "chat", purpose: "reference" })]));
  });

  it("keeps a reference promoted to an asset when the same input is submitted again", async () => {
    const library = new AssetLibrary(await mkdtemp(path.join(tmpdir(), "putenggame-library-promote-")));
    await library.load();
    const reference = await library.add("reference.png", Buffer.from("image"), { origin: "uploaded", purpose: "reference", sourceKey: "conversation-image:image/png:hash" });
    await library.save(reference.id);
    const reused = await library.add("reference.png", Buffer.from("image"), { origin: "uploaded", purpose: "reference", sourceKey: "conversation-image:image/png:hash" });
    expect(reused).toMatchObject({ id: reference.id, origin: "uploaded", purpose: "asset" });
    expect(library.list()).toHaveLength(1);
  });

  it("scans separate local folders and updates changed files without changing asset IDs", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "putenggame-library-folders-"));
    const folders = {
      video: path.join(dataDirectory, "videos"),
      image: path.join(dataDirectory, "images"),
    };
    await Promise.all(Object.values(folders).map((folder) => mkdir(folder)));
    const videoPath = path.join(folders.video, "intro.mp4");
    const imagePath = path.join(folders.image, "scene.png");
    await Promise.all([
      writeFile(videoPath, "video"),
      writeFile(imagePath, "image"),
    ]);

    const library = new AssetLibrary(dataDirectory);
    await library.load();
    await Promise.all([
      library.setSourceFolder("video", folders.video),
      library.setSourceFolder("image", folders.image),
    ]);
    expect(library.sourceFolders()).toEqual(folders);

    await library.syncSourceFolders();
    const assets = library.list();
    const video = assets.find((asset) => asset.name === "intro.mp4");
    const image = assets.find((asset) => asset.name === "scene.png");
    expect(video).toMatchObject({ name: "intro.mp4", mediaType: "video", category: "video", origin: "local" });
    expect(image).toMatchObject({ name: "scene.png", mediaType: "image", category: "image", origin: "local" });
    expect(video?.modifiedAt).toBeTruthy();

    await writeFile(imagePath, "updated image bytes");
    const updatedTime = new Date(Date.now() + 2_000);
    await utimes(imagePath, updatedTime, updatedTime);
    await library.syncSourceFolders();
    expect(library.get(image!.id)).toMatchObject({
      id: image!.id,
      size: Buffer.byteLength("updated image bytes"),
      modifiedAt: updatedTime.toISOString(),
    });
    expect(await readFile((await library.content(image!.id)).absolutePath, "utf8")).toBe("updated image bytes");

  });

  it("ignores legacy UI source folders instead of scanning them", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "putenggame-library-legacy-ui-folder-"));
    const uiDirectory = path.join(dataDirectory, "old-ui-assets");
    await mkdir(path.join(dataDirectory, "library"), { recursive: true });
    await mkdir(uiDirectory);
    await writeFile(path.join(uiDirectory, "button.webp"), "legacy UI asset");
    await writeFile(
      path.join(dataDirectory, "library", "assets.json"),
      JSON.stringify({
        version: 1,
        assets: [],
        sources: {},
        sourceFolders: { ui: uiDirectory },
      }),
    );

    const library = new AssetLibrary(dataDirectory);
    await library.load();
    await library.syncSourceFolders();

    expect(library.sourceFolders()).toEqual({});
    expect(library.list()).toEqual([]);
  });
});
