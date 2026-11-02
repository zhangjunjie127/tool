import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/daemon/app.js";
import { parseScreenplayText } from "../src/shared/playable-story-tree.js";

const apps: ReturnType<typeof createApp>[] = [];
const dataDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    dataDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("playable story tree API", () => {
  it("uses the explicitly selected model for analysis when no default is configured", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "story-tree-analysis-api-"));
    dataDirectories.push(dataDirectory);
    const getModel = vi.fn((provider: string, id: string) => ({ provider, id }));
    const app = createApp({
      dataDirectory,
      createModelRuntime: async () =>
        ({
          getModel,
          hasConfiguredAuth: () => false,
        }) as never,
    });
    apps.push(app);
    const project = (
      await app.inject({
        method: "POST",
        url: "/projects",
        payload: { name: "Story Tree Analysis", type: "interactive-story" },
      })
    ).json();
    const current = await app.inject({
      method: "GET",
      url: `/projects/${project.id}/playable/story-tree`,
    });
    const tree = parseScreenplayText(
      ["第1集", "1-1 开场", "固定剧情"],
      "screenplay.txt",
    ).tree;
    const saved = await app.inject({
      method: "PUT",
      url: `/projects/${project.id}/playable/story-tree`,
      payload: { tree, revision: current.json().revision },
    });

    const analyzed = await app.inject({
      method: "POST",
      url: `/projects/${project.id}/playable/story-tree/analyze`,
      payload: {
        tree: saved.json().tree,
        revision: saved.json().revision,
        model: { provider: "test-gateway", id: "gpt-5.6-terra" },
      },
    });

    expect(analyzed.statusCode).toBe(409);
    expect(analyzed.json().error).toBe(
      "The selected language model is not available",
    );
    expect(getModel).toHaveBeenCalledWith("test-gateway", "gpt-5.6-terra");
  });

  it("saves with revision checks and syncs generated scenes through the project API", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "story-tree-api-"));
    dataDirectories.push(dataDirectory);
    const app = createApp({ dataDirectory });
    apps.push(app);
    const project = (
      await app.inject({
        method: "POST",
        url: "/projects",
        payload: { name: "Story Tree", type: "interactive-story" },
      })
    ).json();

    const empty = await app.inject({
      method: "GET",
      url: `/projects/${project.id}/playable/story-tree`,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({ revision: expect.any(String) });
    expect(empty.json().tree).toBeUndefined();

    const tree = parseScreenplayText(
      ["第1集", "1-1 开场", "固定剧情", "1-2 收束", "结束剧情"],
      "screenplay.txt",
    ).tree;
    const saved = await app.inject({
      method: "PUT",
      url: `/projects/${project.id}/playable/story-tree`,
      payload: { tree, revision: empty.json().revision },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().tree).toEqual(tree);

    const invalidVideo = await app.inject({
      method: "POST",
      url: `/projects/${project.id}/playable/story-tree/sync`,
      payload: {
        tree: saved.json().tree,
        revision: saved.json().revision,
        mode: "generate",
        nodeVideoAssignments: {
          [tree.chapters[0]!.episodes[0]!.sections[0]!.id]: "missing-video",
        },
      },
    });
    expect(invalidVideo.statusCode).toBe(400);
    expect(invalidVideo.json().error).toContain("selected background video");

    const stale = await app.inject({
      method: "PUT",
      url: `/projects/${project.id}/playable/story-tree`,
      payload: { tree, revision: empty.json().revision },
    });
    expect(stale.statusCode).toBe(409);

    const generated = await app.inject({
      method: "POST",
      url: `/projects/${project.id}/playable/story-tree/sync`,
      payload: { tree: saved.json().tree, revision: saved.json().revision },
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json()).toMatchObject({ applied: true, addedNodes: 2 });

    const invalidMode = await app.inject({
      method: "POST",
      url: `/projects/${project.id}/playable/story-tree/sync`,
      payload: {
        tree: generated.json().tree,
        revision: generated.json().revision,
        mode: "replace-everything",
      },
    });
    expect(invalidMode.statusCode).toBe(400);

    const codebase = await app.inject({
      method: "GET",
      url: `/projects/${project.id}/playable/codebase`,
    });
    expect(codebase.json().graph.nodes).toHaveLength(2);
    expect(codebase.json().graph.edges).toHaveLength(1);
  });
});
