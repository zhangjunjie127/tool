import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/daemon/app.js";
import {
  parseScreenplayText,
  playableStoryTreeSections,
  reconcilePlayableStoryTree,
} from "../src/shared/playable-story-tree.js";

const apps: ReturnType<typeof createApp>[] = [];
const dataDirectories: string[] = [];
const storageFailure = vi.hoisted(() => ({
  enabled: false,
  beforeRename: undefined as (() => Promise<void>) | undefined,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (String(args[1]).endsWith("story-tree.json")) await storageFailure.beforeRename?.();
      if (storageFailure.enabled && String(args[1]).endsWith("story-tree.json")) {
        throw new Error("Simulated story tree write failure");
      }
      return actual.rename(...args);
    },
  };
});

afterEach(async () => {
  storageFailure.enabled = false;
  storageFailure.beforeRename = undefined;
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    dataDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function snapshotWorkspaceFiles(workspace: string) {
  const files: Record<string, string> = {};
  for (const entry of await readdir(workspace, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    files[path.relative(workspace, file)] = (await readFile(file)).toString("base64");
  }
  return files;
}

describe("playable story tree API", () => {
  it("restores canvas and sources when the final story tree save fails, then allows a clean retry", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "story-tree-rollback-api-"));
    dataDirectories.push(dataDirectory);
    const app = createApp({ dataDirectory });
    apps.push(app);
    const project = (await app.inject({
      method: "POST", url: "/projects",
      payload: { name: "Rollback", type: "interactive-story" },
    })).json();
    const url = `/projects/${project.id}/playable/story-tree`;
    const current = (await app.inject({ method: "GET", url })).json();
    const tree = parseScreenplayText(["第1集", "1-1 开场", "剧情"], "screenplay.txt").tree;
    const before = (await app.inject({
      method: "GET", url: `/projects/${project.id}/playable/codebase`,
    })).json();
    const filesBefore = await snapshotWorkspaceFiles(project.workspacePath);
    storageFailure.enabled = true;
    const failed = await app.inject({
      method: "POST", url: `${url}/sync`,
      payload: { tree, revision: current.revision },
    });
    expect(failed.statusCode).toBe(400);
    expect(failed.json().error).toContain("Simulated story tree write failure");
    const after = (await app.inject({
      method: "GET", url: `/projects/${project.id}/playable/codebase`,
    })).json();
    expect(after).toEqual(before);
    expect(await snapshotWorkspaceFiles(project.workspacePath)).toEqual(filesBefore);
    expect((await app.inject({ method: "GET", url })).json()).toEqual(current);

    storageFailure.enabled = false;
    const retry = await app.inject({
      method: "POST", url: `${url}/sync`,
      payload: { tree, revision: current.revision },
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({ applied: true, addedNodes: 1 });
  });

  it("rolls back an update to existing scenes and all newly created source files", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "story-tree-update-rollback-"));
    dataDirectories.push(dataDirectory);
    const app = createApp({ dataDirectory });
    apps.push(app);
    const project = (await app.inject({
      method: "POST", url: "/projects",
      payload: { name: "Update rollback", type: "interactive-story" },
    })).json();
    const url = `/projects/${project.id}/playable/story-tree`;
    const empty = (await app.inject({ method: "GET", url })).json();
    const tree = parseScreenplayText(["第1集", "1-1 开场", "固定剧情"], "old.txt").tree;
    const generated = (await app.inject({
      method: "POST", url: `${url}/sync`,
      payload: { tree, revision: empty.revision },
    })).json();
    const codebase = (await app.inject({
      method: "GET", url: `/projects/${project.id}/playable/codebase`,
    })).json();
    const node = codebase.graph.nodes[0];
    const sourcePath = path.join(project.workspacePath, node.source.html);
    const html = await readFile(sourcePath, "utf8");
    await writeFile(sourcePath, `${html}\n<button style="left:123px;top:234px;width:87px">Custom</button>`);
    const updated = reconcilePlayableStoryTree(generated.tree, parseScreenplayText([
      "第1集", "1-1 开场", "修改剧情", "1-2 新场景", "新增剧情",
    ], "new.txt").tree).tree;
    const before = await snapshotWorkspaceFiles(project.workspacePath);
    storageFailure.enabled = true;
    const failed = await app.inject({
      method: "POST", url: `${url}/sync`,
      payload: { tree: updated, revision: generated.revision, confirmOverwrite: true },
    });

    expect(failed.statusCode).toBe(400);
    expect(failed.json().error).toContain("Simulated story tree write failure");
    expect(await snapshotWorkspaceFiles(project.workspacePath)).toEqual(before);
    const saved = (await app.inject({ method: "GET", url })).json();
    expect(saved).toEqual({ tree: generated.tree, revision: generated.revision });
  });

  it("serializes a sync with concurrent tree saves and rejects their stale revisions", async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "story-tree-concurrent-api-"));
    dataDirectories.push(dataDirectory);
    const app = createApp({ dataDirectory });
    apps.push(app);
    const project = (await app.inject({
      method: "POST", url: "/projects",
      payload: { name: "Concurrent sync", type: "interactive-story" },
    })).json();
    const url = `/projects/${project.id}/playable/story-tree`;
    const current = (await app.inject({ method: "GET", url })).json();
    const tree = parseScreenplayText(["第1集", "1-1 开场", "固定剧情"], "screenplay.txt").tree;
    let release!: () => void;
    let entered!: () => void;
    const enteredRename = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    storageFailure.beforeRename = async () => {
      entered();
      await gate;
    };
    const first = app.inject({
      method: "POST", url: `${url}/sync`,
      payload: { tree, revision: current.revision },
    }).then((response) => response);
    await enteredRename;
    let saveFinished = false;
    let syncFinished = false;
    const competingTree = structuredClone(tree);
    playableStoryTreeSections(competingTree)[0]!.title = "Concurrent edit";
    const save = app.inject({
      method: "PUT", url,
      payload: { tree: competingTree, revision: current.revision },
    }).then((response) => { saveFinished = true; return response; });
    const sync = app.inject({
      method: "POST", url: `${url}/sync`,
      payload: { tree: competingTree, revision: current.revision },
    }).then((response) => { syncFinished = true; return response; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(saveFinished).toBe(false);
      expect(syncFinished).toBe(false);
    } finally {
      release();
    }
    const [firstResponse, saveResponse, syncResponse] = await Promise.all([first, save, sync]);
    expect(firstResponse.statusCode).toBe(200);
    expect(saveResponse.statusCode).toBe(409);
    expect(syncResponse.statusCode).toBe(409);
    expect((await app.inject({ method: "GET", url })).json()).toEqual({
      tree: firstResponse.json().tree, revision: firstResponse.json().revision,
    });
    const codebase = (await app.inject({
      method: "GET", url: `/projects/${project.id}/playable/codebase`,
    })).json();
    expect(codebase.graph.nodes).toHaveLength(1);
    expect(codebase.graph.nodes[0].title).toBe("开场");
  });

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
