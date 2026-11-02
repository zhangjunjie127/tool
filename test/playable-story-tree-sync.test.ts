import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createNodeCodebase,
  createPlayableStarterCodebase,
  readNodeCodebase,
  writeNodeCodebase,
} from "../src/daemon/playable-codebase.js";
import {
  syncPlayableStoryTree,
} from "../src/daemon/playable-add-node.js";
import {
  PlayableStoryTreeConflictError,
  readPlayableStoryTree,
  writePlayableStoryTree,
} from "../src/daemon/playable-story-tree-store.js";
import {
  removePlayableStoryTreeChapter,
  parseScreenplayText,
  playableStoryTreeSections,
} from "../src/shared/playable-story-tree.js";
import { addPlayableNodeAsset } from "../src/shared/playable-editor.js";
import { setPlayableBackdrop } from "../src/shared/playable-backdrop.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) =>
    rm(workspace, { recursive: true, force: true }),
  ));
});

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(tmpdir(), "story-tree-"));
  workspaces.push(workspace);
  await createNodeCodebase(
    workspace,
    createPlayableStarterCodebase("Story tree test", { width: 1280, height: 720 }),
  );
  return workspace;
}

function simpleTree() {
  return parseScreenplayText([
    "第1集",
    "1-1 开场",
    "固定剧情",
    "1-2 选择",
    "结束剧情",
  ], "screenplay.txt").tree;
}

describe("playable story tree canvas sync", () => {
  it("creates missing scenes and only overwrites changed titles after confirmation", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());

    expect(first.applied).toBe(true);
    expect(first.addedNodes).toBe(2);
    const generated = first.tree!;
    const sections = playableStoryTreeSections(generated);
    const codebase = await readNodeCodebase(workspace);
    expect(codebase.graph.entryNodeId).toBe(sections[0]?.canvasNodeId);
    expect(codebase.graph.nodes).toHaveLength(2);
    expect(codebase.graph.edges).toHaveLength(1);

    const firstNode = codebase.graph.nodes.find((node) => node.id === sections[0]?.canvasNodeId)!;
    const originalLayout = structuredClone(codebase.editorLayout);
    const editedSource = "<main>author's existing scene source</main>";
    await writeFile(path.join(workspace, firstNode.source.html), editedSource);

    const changedTree = structuredClone(generated);
    playableStoryTreeSections(changedTree)[0]!.title = "Revised title";
    const preview = await syncPlayableStoryTree(workspace, generated, changedTree);

    expect(preview.applied).toBe(false);
    expect(preview.confirmations).toContainEqual(expect.objectContaining({
      nodeId: firstNode.id,
      changes: expect.arrayContaining(["The Scene title will be updated from the story tree."]),
    }));
    expect(await readFile(path.join(workspace, firstNode.source.html), "utf8")).toBe(editedSource);

    const applied = await syncPlayableStoryTree(workspace, generated, changedTree, true);
    const after = await readNodeCodebase(workspace);
    expect(applied.applied).toBe(true);
    expect(applied.updatedNodes).toBe(1);
    expect(after.graph.nodes.find((node) => node.id === firstNode.id)?.title).toBe("Revised title");
    expect(after.editorLayout).toEqual(originalLayout);
    expect(await readFile(path.join(workspace, firstNode.source.html), "utf8")).toBe(editedSource);
  });

  it("recreates deleted story-tree scenes without disturbing ordinary canvas nodes", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const codebase = await readNodeCodebase(workspace);
    const manualNode = {
      id: "manual-scene",
      title: "手动场景",
      source: {
        html: "nodes/manual-scene/index.html",
        css: "nodes/manual-scene/style.css",
        javascript: "nodes/manual-scene/node.js",
      },
      assets: [],
      signals: [],
    };
    const manualPosition = { x: 760, y: 240 };
    await mkdir(path.join(workspace, "nodes", manualNode.id), { recursive: true });
    await writeFile(path.join(workspace, manualNode.source.html), "<main>Manual scene</main>");
    await writeFile(path.join(workspace, manualNode.source.css), "");
    await writeFile(path.join(workspace, manualNode.source.javascript), "export function mount() {}");
    await writeNodeCodebase(workspace, {
      graph: {
        ...codebase.graph,
        entryNodeId: manualNode.id,
        nodes: [manualNode],
        edges: [],
      },
      editorLayout: {
        ...codebase.editorLayout,
        nodes: { [manualNode.id]: manualPosition },
      },
    });

    const result = await syncPlayableStoryTree(
      workspace,
      first.tree,
      first.tree!,
      false,
      "generate",
    );
    const after = await readNodeCodebase(workspace);

    expect(result.applied).toBe(true);
    expect(result.addedNodes).toBe(2);
    expect(after.graph.nodes).toHaveLength(3);
    expect(after.graph.entryNodeId).toBe(manualNode.id);
    expect(after.graph.nodes.find((node) => node.id === manualNode.id)).toEqual(manualNode);
    expect(after.editorLayout.nodes[manualNode.id]).toEqual(manualPosition);
    expect(after.graph.edges).toHaveLength(1);
    expect(playableStoryTreeSections(result.tree!).every((section) =>
      after.graph.nodes.some((node) => node.id === section.canvasNodeId),
    )).toBe(true);
  });

  it("does not recreate a screenplay-removed scene after its canvas node was deleted", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const tree = structuredClone(first.tree!);
    const sections = playableStoryTreeSections(tree);
    sections[1]!.sourceRemoved = true;

    const codebase = await readNodeCodebase(workspace);
    const removedNodeId = sections[1]!.canvasNodeId!;
    const graph = {
      ...codebase.graph,
      nodes: codebase.graph.nodes.filter((node) => node.id !== removedNodeId),
      edges: codebase.graph.edges.filter((edge) =>
        edge.source.nodeId !== removedNodeId &&
        edge.targetNodeId !== removedNodeId,
      ),
    };
    const editorLayout = structuredClone(codebase.editorLayout);
    delete editorLayout.nodes[removedNodeId];
    await writeNodeCodebase(workspace, { graph, editorLayout });

    const result = await syncPlayableStoryTree(workspace, first.tree, tree);
    const after = await readNodeCodebase(workspace);

    expect(result.applied).toBe(true);
    expect(result.addedNodes).toBe(0);
    expect(after.graph.nodes.map((node) => node.id)).not.toContain(removedNodeId);
  });

  it("detaches a removed chapter but keeps its canvas nodes, edges, and positions", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const tree = removePlayableStoryTreeChapter(first.tree!, first.tree!.chapters[0]!.id);
    const before = await readNodeCodebase(workspace);
    const detachedSections = playableStoryTreeSections(tree);
    const detachedNodeIds = detachedSections.map((section) => section.canvasNodeId!);
    const detachedPositions = Object.fromEntries(
      detachedNodeIds.map((nodeId) => [nodeId, before.editorLayout.nodes[nodeId]]),
    );
    const detachedNode = before.graph.nodes.find((node) => node.id === detachedNodeIds[0])!;
    const retainedSource = "<main>kept as an ordinary canvas scene</main>";
    await writeFile(path.join(workspace, detachedNode.source.html), retainedSource);
    const result = await syncPlayableStoryTree(workspace, first.tree, tree, true);
    const after = await readNodeCodebase(workspace);

    expect(result.applied).toBe(true);
    expect(result.tree).toBeDefined();
    expect(playableStoryTreeSections(result.tree!)).toHaveLength(0);
    expect(after.graph.nodes).toHaveLength(2);
    expect(after.graph.nodes.every((node) => node.storyTreeDetached)).toBe(true);
    expect(after.graph.edges).toHaveLength(1);
    expect(after.editorLayout.nodes).toMatchObject(detachedPositions);
    expect(await readFile(path.join(workspace, detachedNode.source.html), "utf8"))
      .toBe(retainedSource);
  });

  it("creates newly synced scenes and connects confirmed routes without moving existing scenes", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const nextTree = parseScreenplayText([
      "第1集",
      "1-1 开场",
      "固定剧情",
      "1-2 选择",
      "结束剧情",
      "1-3 新增场景",
      "新增内容",
    ], "screenplay.txt").tree;
    const newSection = playableStoryTreeSections(nextTree)[2]!;
    const reconciled = structuredClone(first.tree!);
    reconciled.chapters[0]!.episodes[0]!.sections.push(newSection);
    reconciled.links.push({
      id: "link-confirmed-new-scene",
      fromSectionId: playableStoryTreeSections(reconciled)[1]!.id,
      toSectionId: newSection.id,
      label: "继续",
      status: "confirmed",
    });
    const existingPositions = structuredClone((await readNodeCodebase(workspace)).editorLayout.nodes);

    const preview = await syncPlayableStoryTree(workspace, first.tree, reconciled);
    const result = await syncPlayableStoryTree(workspace, first.tree, reconciled, true);
    const after = await readNodeCodebase(workspace);
    const generatedSection = playableStoryTreeSections(result.tree!)[2]!;
    const generatedNode = after.graph.nodes.find(
      (node) => node.id === generatedSection.canvasNodeId,
    )!;

    expect(preview.applied).toBe(false);
    expect(preview.confirmations.some((item) =>
      item.changes.includes("The Scene's tree connections will be updated."),
    )).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.addedNodes).toBe(1);
    expect(after.graph.nodes).toHaveLength(3);
    expect(after.graph.edges).toHaveLength(2);
    expect(after.graph.edges.some((edge) =>
      edge.source.nodeId === playableStoryTreeSections(result.tree!)[1]!.canvasNodeId &&
      edge.targetNodeId === generatedNode.id,
    )).toBe(true);
    for (const [nodeId, position] of Object.entries(existingPositions)) {
      expect(after.editorLayout.nodes[nodeId]).toEqual(position);
    }
    expect(after.editorLayout.nodes[generatedNode.id]).toBeDefined();
  });

  it("moves the managed game entry only when the story tree adds an earlier scene", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const original = first.tree!;
    const originalSections = playableStoryTreeSections(original);
    const before = await readNodeCodebase(workspace);
    const originalEntryId = before.graph.entryNodeId;
    const originalPositions = structuredClone(before.editorLayout.nodes);
    const updatedTree = structuredClone(original);
    const earlierScene = structuredClone(originalSections[0]!);
    earlierScene.id = "ep-01-scene-00-prologue";
    earlierScene.sceneNumber = 0;
    earlierScene.title = "新增序幕";
    earlierScene.scriptText = "新增开场内容";
    earlierScene.beats = [{
      id: `${earlierScene.id}-beat-1`,
      kind: "plot",
      text: "新增开场内容",
    }];
    earlierScene.sourceSnapshot = {
      heading: "1-0 新增序幕",
      body: "新增开场内容",
      title: "新增序幕",
      beats: structuredClone(earlierScene.beats),
    };
    delete earlierScene.canvasNodeId;
    delete earlierScene.canvasSnapshot;
    updatedTree.chapters[0]!.episodes[0]!.sections.unshift(earlierScene);
    updatedTree.links.push({
      id: "prologue-to-opening",
      fromSectionId: earlierScene.id,
      toSectionId: originalSections[0]!.id,
      label: "进入故事",
      status: "confirmed",
    });

    const preview = await syncPlayableStoryTree(workspace, original, updatedTree);
    expect(preview.applied).toBe(false);
    expect(preview.confirmations).toContainEqual(expect.objectContaining({
      changes: expect.arrayContaining(["The story entry Scene will be updated."]),
    }));

    const applied = await syncPlayableStoryTree(
      workspace,
      original,
      updatedTree,
      true,
    );
    const after = await readNodeCodebase(workspace);
    const generatedEntry = playableStoryTreeSections(applied.tree!)
      .find((section) => section.id === earlierScene.id)!;
    expect(after.graph.entryNodeId).toBe(generatedEntry.canvasNodeId);
    for (const [nodeId, position] of Object.entries(originalPositions)) {
      expect(after.editorLayout.nodes[nodeId]).toEqual(position);
    }
    expect(after.graph.nodes.find((node) => node.id === originalEntryId)?.title)
      .toBe(originalSections[0]!.title);
  });

  it("updates only changed story beats and preserves unrelated source and scenes", async () => {
    const workspace = await createWorkspace();
    const tree = parseScreenplayText([
      "第1集",
      "1-1 门外",
      "雨夜，主角来到门前。",
      "长按门把手进入",
      "1-2 门内",
      "屋内空无一人。",
      "1-3 走廊",
      "脚步声从走廊深处传来。",
    ], "screenplay.txt").tree;
    const first = await syncPlayableStoryTree(workspace, undefined, tree);
    const initialTree = first.tree!;
    const initialSections = playableStoryTreeSections(initialTree);
    const codebase = await readNodeCodebase(workspace);
    const firstNode = codebase.graph.nodes.find(
      (node) => node.id === initialSections[0]!.canvasNodeId,
    )!;
    const untouchedNode = codebase.graph.nodes.find(
      (node) => node.id === initialSections[1]!.canvasNodeId,
    )!;
    const firstPath = path.join(workspace, firstNode.source.html);
    const untouchedPath = path.join(workspace, untouchedNode.source.html);
    const firstHtml = await readFile(firstPath, "utf8");
    const untouchedHtml = await readFile(untouchedPath, "utf8");
    const authorMarkup = '<aside data-author-content>作者手动添加，必须保留</aside>';
    await writeFile(
      firstPath,
      firstHtml.replace("</main>", `${authorMarkup}</main>`),
    );

    const updatedTree = structuredClone(initialTree);
    const updatedBeats = playableStoryTreeSections(updatedTree)[0]!.beats;
    updatedBeats[0]!.text = "雨夜，主角带着钥匙来到门前。";
    const preview = await syncPlayableStoryTree(
      workspace,
      initialTree,
      updatedTree,
    );
    expect(preview.applied).toBe(false);
    expect(preview.confirmations).toContainEqual(expect.objectContaining({
      nodeId: firstNode.id,
      changes: expect.arrayContaining([
        "Story-tree scene content will be updated.",
      ]),
    }));
    expect(await readFile(firstPath, "utf8")).toBe(
      firstHtml.replace("</main>", `${authorMarkup}</main>`),
    );
    const applied = await syncPlayableStoryTree(
      workspace,
      initialTree,
      updatedTree,
      true,
    );
    const after = await readNodeCodebase(workspace);
    const updatedHtml = await readFile(firstPath, "utf8");

    expect(applied.applied).toBe(true);
    expect(applied.updatedNodes).toBe(1);
    expect(updatedHtml).toContain("雨夜，主角带着钥匙来到门前。");
    expect(updatedHtml).toContain("长按门把手进入");
    expect(updatedHtml).toContain(authorMarkup);
    expect(await readFile(untouchedPath, "utf8")).toBe(untouchedHtml);
    expect(after.editorLayout).toEqual(codebase.editorLayout);
    expect(after.graph.nodes.find((node) => node.id === untouchedNode.id))
      .toEqual(untouchedNode);
  });

  it("requires confirmation before replacing a story beat edited on the canvas", async () => {
    const workspace = await createWorkspace();
    const sourceTree = parseScreenplayText([
      "第1集",
      "1-1 线索",
      "找到一封信。",
      "主角决定继续调查。",
      "1-2 调查",
      "前往档案室。",
    ], "screenplay.txt").tree;
    const first = await syncPlayableStoryTree(workspace, undefined, sourceTree);
    const initialTree = first.tree!;
    const firstSection = playableStoryTreeSections(initialTree)[0]!;
    const codebase = await readNodeCodebase(workspace);
    const node = codebase.graph.nodes.find(
      (candidate) => candidate.id === firstSection.canvasNodeId,
    )!;
    const htmlPath = path.join(workspace, node.source.html);
    const originalHtml = await readFile(htmlPath, "utf8");
    const editedHtml = originalHtml.replace(
      "找到一封信。",
      "我手动重写了这段。",
    );
    await writeFile(htmlPath, editedHtml);

    const updatedTree = structuredClone(initialTree);
    playableStoryTreeSections(updatedTree)[0]!.beats[0]!.text =
      "发现一封写着日期的信。";
    const preview = await syncPlayableStoryTree(
      workspace,
      initialTree,
      updatedTree,
    );

    expect(preview.applied).toBe(false);
    expect(preview.confirmations).toContainEqual(expect.objectContaining({
      nodeId: node.id,
      changes: expect.arrayContaining([
        "A story-tree beat was edited on the canvas and will be replaced.",
      ]),
    }));
    expect(await readFile(htmlPath, "utf8")).toBe(editedHtml);

    const applied = await syncPlayableStoryTree(
      workspace,
      initialTree,
      updatedTree,
      true,
    );
    const finalHtml = await readFile(htmlPath, "utf8");
    expect(applied.applied).toBe(true);
    expect(finalHtml).toContain("发现一封写着日期的信。");
    expect(finalHtml).toContain("主角决定继续调查。");
    expect(finalHtml).not.toContain("我手动重写了这段。");
  });

  it("lays generated branches left to right on separate rows with fixed clearance", async () => {
    const workspace = await createWorkspace();
    const tree = parseScreenplayText([
      "第1集",
      "1-1 开始",
      "开始剧情",
      "1-2 分支A",
      "A路线",
      "1-3 分支B",
      "B路线",
      "1-4 A后续",
      "A后续",
      "1-5 B后续",
      "B后续",
      "1-6 汇合",
      "汇合剧情",
    ], "screenplay.txt").tree;
    const sections = playableStoryTreeSections(tree);
    const [start, branchA, branchB, afterA, afterB, merge] = sections;
    tree.links = [
      [start!, branchA!],
      [start!, branchB!],
      [branchA!, afterA!],
      [branchB!, afterB!],
      [afterA!, merge!],
      [afterB!, merge!],
    ].map(([from, to], index) => ({
      id: `route-${index}`,
      fromSectionId: from.id,
      toSectionId: to.id,
      label: "继续",
      status: "confirmed" as const,
    }));

    const result = await syncPlayableStoryTree(workspace, undefined, tree);
    const codebase = await readNodeCodebase(workspace);
    const positions = new Map(
      playableStoryTreeSections(result.tree!).map((section) => [
        section.id,
        codebase.editorLayout.nodes[section.canvasNodeId!]!,
      ]),
    );
    const gap = 140;
    const aspect = codebase.graph.viewport.width / codebase.graph.viewport.height;
    const stageWidth = 440 * Math.min(1, aspect);
    const stageHeight = 440 / Math.max(1, aspect);
    const columnStep = stageWidth + gap;
    const rowStep = stageHeight + 28 + gap;

    expect(positions.get(branchA!.id)!.x - positions.get(start!.id)!.x)
      .toBeGreaterThanOrEqual(columnStep);
    expect(positions.get(branchA!.id)!.x).toBe(positions.get(branchB!.id)!.x);
    expect(Math.abs(positions.get(branchA!.id)!.y - positions.get(branchB!.id)!.y))
      .toBeGreaterThanOrEqual(rowStep);
    expect(positions.get(branchA!.id)!.y).toBeGreaterThan(positions.get(start!.id)!.y);
    expect(positions.get(branchA!.id)!.y).toBe(positions.get(afterA!.id)!.y);
    expect(positions.get(branchB!.id)!.y).toBe(positions.get(afterB!.id)!.y);
    expect(positions.get(afterA!.id)!.x - positions.get(branchA!.id)!.x)
      .toBeGreaterThanOrEqual(columnStep);
    expect(positions.get(merge!.id)!.x - positions.get(afterA!.id)!.x)
      .toBeGreaterThanOrEqual(columnStep);
    expect(codebase.graph.edges).toHaveLength(6);
  });

  it("generates missing nodes without overwriting existing canvas scenes", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const existingTree = first.tree!;
    const existingSections = playableStoryTreeSections(existingTree);
    const before = await readNodeCodebase(workspace);
    const existingNode = before.graph.nodes.find(
      (node) => node.id === existingSections[0]!.canvasNodeId,
    )!;
    const graph = structuredClone(before.graph);
    graph.nodes.find((node) => node.id === existingNode.id)!.title = "画布手动修改";
    await writeNodeCodebase(workspace, {
      graph,
      editorLayout: before.editorLayout,
    });

    const nextTree = structuredClone(existingTree);
    const newSection = parseScreenplayText([
      "第1集",
      "1-3 新场景",
      "新内容",
    ], "screenplay.txt").tree.chapters[0]!.episodes[0]!.sections[0]!;
    nextTree.chapters[0]!.episodes[0]!.sections.push(newSection);
    nextTree.links.push({
      id: "new-scene-route",
      fromSectionId: newSection.id,
      toSectionId: existingSections[0]!.id,
      label: "回到开场",
      status: "confirmed",
    });

    const result = await syncPlayableStoryTree(
      workspace,
      existingTree,
      nextTree,
      false,
      "generate",
    );
    const after = await readNodeCodebase(workspace);
    const generated = playableStoryTreeSections(result.tree!).find(
      (section) => section.id === newSection.id,
    )!;

    expect(result.applied).toBe(true);
    expect(result.confirmations).toHaveLength(0);
    expect(result.addedNodes).toBe(1);
    expect(result.updatedNodes).toBe(0);
    expect(after.graph.nodes.find((node) => node.id === existingNode.id)?.title)
      .toBe("画布手动修改");
    expect(after.graph.edges.some((edge) =>
      edge.source.nodeId === generated.canvasNodeId &&
      edge.targetNodeId === existingNode.id,
    )).toBe(true);
  });

  it("adds a selected Library video as the background of a generated scene", async () => {
    const workspace = await createWorkspace();
    const tree = simpleTree();
    const scene = playableStoryTreeSections(tree)[0]!;
    const result = await syncPlayableStoryTree(
      workspace,
      undefined,
      tree,
      false,
      "generate",
      {},
      {
        [scene.id]: {
          assetId: "library-opening-video",
          name: "第1集_开场.mp4",
        },
      },
    );
    const codebase = await readNodeCodebase(workspace);
    const linkedScene = playableStoryTreeSections(result.tree!).find(
      (candidate) => candidate.id === scene.id,
    )!;
    const node = codebase.graph.nodes.find(
      (candidate) => candidate.id === linkedScene.canvasNodeId,
    )!;
    const assetId = Object.entries(codebase.graph.assets).find(
      ([, asset]) =>
        asset.source.kind === "library" &&
        asset.source.assetId === "library-opening-video",
    )?.[0];
    const html = await readFile(path.join(workspace, node.source.html), "utf8");

    expect(result.addedVideos).toBe(1);
    expect(result.skippedVideoAssignments).toBe(0);
    expect(node.assets).toContain(assetId);
    expect(html).toContain(`data-asset="${assetId}" data-type="video"`);
  });

  it("preserves an existing scene background instead of replacing it with a matched video", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const section = playableStoryTreeSections(first.tree!)[0]!;
    const before = await readNodeCodebase(workspace);
    const node = before.graph.nodes.find(
      (candidate) => candidate.id === section.canvasNodeId,
    )!;
    const existing = addPlayableNodeAsset(before.graph, node.id, {
      name: "manual-background.mp4",
      type: "video",
      source: {
        kind: "library",
        assetId: "library-manual-background",
      },
    });
    const originalHtml = await readFile(path.join(workspace, node.source.html), "utf8");
    const htmlWithBackground = setPlayableBackdrop(
      originalHtml,
      existing.assetId,
      "video",
    )!;
    await writeNodeCodebase(workspace, {
      graph: existing.graph,
      editorLayout: before.editorLayout,
      sources: { [node.source.html]: htmlWithBackground },
    });

    const result = await syncPlayableStoryTree(
      workspace,
      first.tree,
      first.tree!,
      false,
      "generate",
      {},
      {
        [section.id]: {
          assetId: "library-matched-background",
          name: "第1集_开场.mp4",
        },
      },
    );
    const after = await readNodeCodebase(workspace);
    const updatedNode = after.graph.nodes.find(
      (candidate) => candidate.id === node.id,
    )!;
    const updatedHtml = await readFile(
      path.join(workspace, updatedNode.source.html),
      "utf8",
    );

    expect(result.addedVideos).toBe(0);
    expect(updatedNode.assets).toContain(existing.assetId);
    expect(updatedHtml).toContain(`data-asset="${existing.assetId}"`);
    expect(updatedHtml).not.toContain("library-matched-background");
    expect(
      Object.values(after.graph.assets).some(
        (asset) =>
          asset.source.kind === "library" &&
          asset.source.assetId === "library-matched-background",
      ),
    ).toBe(false);
  });

  it("adds confirmed routes from existing scenes to newly generated scenes", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const existingTree = first.tree!;
    const existingSections = playableStoryTreeSections(existingTree);
    const before = await readNodeCodebase(workspace);
    const graphWithManualExit = structuredClone(before.graph);
    const existingSource = graphWithManualExit.nodes.find(
      (node) => node.id === existingSections[1]!.canvasNodeId,
    )!;
    graphWithManualExit.nodes
      .find((node) => node.id === existingSource.id)!
      .signals.push({ id: "manual-return", label: "手动返回" });
    graphWithManualExit.edges.push({
      id: "manual-return-edge",
      source: { nodeId: existingSource.id, signal: "manual-return" },
      targetNodeId: existingSections[0]!.canvasNodeId!,
      mode: "replace",
    });
    await writeNodeCodebase(workspace, {
      graph: graphWithManualExit,
      editorLayout: before.editorLayout,
    });
    const existingCodebase = await readNodeCodebase(workspace);
    const existingEdges = structuredClone(existingCodebase.graph.edges);
    const existingPositions = structuredClone(existingCodebase.editorLayout.nodes);
    const nextTree = structuredClone(existingTree);
    const newSection = parseScreenplayText([
      "第1集",
      "1-3 新场景",
      "新内容",
    ], "screenplay.txt").tree.chapters[0]!.episodes[0]!.sections[0]!;
    nextTree.chapters[0]!.episodes[0]!.sections.push(newSection);
    nextTree.links.push({
      id: "existing-to-new-scene",
      fromSectionId: existingSections[1]!.id,
      toSectionId: newSection.id,
      label: "继续",
      status: "confirmed",
    });

    const result = await syncPlayableStoryTree(
      workspace,
      existingTree,
      nextTree,
      false,
      "generate",
    );
    const after = await readNodeCodebase(workspace);
    const generated = playableStoryTreeSections(result.tree!).find(
      (section) => section.id === newSection.id,
    )!;

    expect(result.applied).toBe(true);
    expect(result.addedNodes).toBe(1);
    expect(after.graph.edges).toEqual(expect.arrayContaining(existingEdges));
    expect(after.graph.edges).toContainEqual(
      expect.objectContaining({ id: "manual-return-edge" }),
    );
    expect(after.graph.edges.some((edge) =>
      edge.source.nodeId === existingSource.id &&
      edge.targetNodeId === generated.canvasNodeId,
    )).toBe(true);
    expect(after.editorLayout.nodes).toMatchObject(existingPositions);
  });

  it("adds positioned button presets for confirmed routes from an existing scene", async () => {
    const workspace = await createWorkspace();
    const first = await syncPlayableStoryTree(workspace, undefined, simpleTree());
    const tree = structuredClone(first.tree!);
    const sections = playableStoryTreeSections(tree);
    const addedScenes = parseScreenplayText([
      "第1集",
      "1-3 左侧出口",
      "左侧剧情",
      "1-4 右侧出口",
      "右侧剧情",
    ], "screenplay.txt").tree.chapters[0]!.episodes[0]!.sections;
    sections[1]!.kind = "scene";
    tree.chapters[0]!.episodes[0]!.sections.push(...addedScenes);
    tree.links.push(
      {
        id: "confirmed-left-exit",
        fromSectionId: sections[1]!.id,
        toSectionId: addedScenes[0]!.id,
        label: "前往左侧",
        status: "confirmed",
      },
      {
        id: "confirmed-right-exit",
        fromSectionId: sections[1]!.id,
        toSectionId: addedScenes[1]!.id,
        label: "前往右侧",
        status: "confirmed",
      },
    );

    const result = await syncPlayableStoryTree(
      workspace,
      first.tree,
      tree,
      false,
      "generate",
    );
    const after = await readNodeCodebase(workspace);
    const sourceNode = after.graph.nodes.find(
      (node) => node.id === sections[1]!.canvasNodeId,
    )!;
    const sourceHtml = await readFile(
      path.join(workspace, sourceNode.source.html),
      "utf8",
    );
    const addedButtons = [...sourceHtml.matchAll(
      /<button\b(?=[^>]*data-putenggame-button-preset)(?=[^>]*data-signal="([^"]+)")[^>]*style="([^"]+)"/g,
    )];
    const addedNodeIds = new Set(
      playableStoryTreeSections(result.tree!)
        .filter((section) => addedScenes.some((added) => added.id === section.id))
        .map((section) => section.canvasNodeId),
    );
    const targetNodes = after.graph.nodes.filter((node) => addedNodeIds.has(node.id));
    const targetHtml = await Promise.all(targetNodes.map((node) =>
      readFile(path.join(workspace, node.source.html), "utf8"),
    ));

    expect(result.applied).toBe(true);
    expect(addedButtons).toHaveLength(2);
    expect(sourceHtml).toContain(">前往左侧</button>");
    expect(sourceHtml).toContain(">前往右侧</button>");
    expect(addedButtons[0]![2]).not.toBe(addedButtons[1]![2]);
    expect(after.graph.edges.filter((edge) =>
      edge.source.nodeId === sourceNode.id,
    )).toHaveLength(2);
    expect(targetHtml.every((content) =>
      !content.includes("data-putenggame-button-preset"),
    )).toBe(true);
  });

  it("connects a generated Choice preset's own button Signal to its confirmed route", async () => {
    const workspace = await createWorkspace();
    const tree = parseScreenplayText([
      "第1集",
      "1-1 选择",
      "选择1：前往左侧",
      "1-2 左侧",
      "到达左侧",
    ], "screenplay.txt").tree;

    const result = await syncPlayableStoryTree(workspace, undefined, tree);
    const after = await readNodeCodebase(workspace);
    const sourceSection = playableStoryTreeSections(result.tree!)[0]!;
    const sourceNode = after.graph.nodes.find(
      (node) => node.id === sourceSection.canvasNodeId,
    )!;
    const html = await readFile(path.join(workspace, sourceNode.source.html), "utf8");

    expect(sourceNode.signals.map((signal) => signal.id)).toContain("option-a");
    expect(after.graph.edges).toContainEqual(
      expect.objectContaining({
        source: { nodeId: sourceNode.id, signal: "option-a" },
      }),
    );
    expect(html).toContain('data-signal="option-a"');
    expect(html).toContain("<kbd>1</kbd>前往左侧</button>");
    expect(html).not.toContain("I had no choice.");
    expect(html).not.toContain("data-putenggame-button-preset");
  });

  it("updates only a changed generated operation button and preserves its custom attributes", async () => {
    const workspace = await createWorkspace();
    const tree = parseScreenplayText([
      "第1集",
      "1-1 门外",
      "雨夜，主角来到门前。",
      "长按门把手2秒打开门",
      "1-2 门内",
      "屋内空无一人。",
    ], "screenplay.txt").tree;
    const first = await syncPlayableStoryTree(workspace, undefined, tree);
    const generatedTree = first.tree!;
    const firstSection = playableStoryTreeSections(generatedTree)[0]!;
    const node = (await readNodeCodebase(workspace)).graph.nodes.find(
      (candidate) => candidate.id === firstSection.canvasNodeId,
    )!;
    const nextSection = playableStoryTreeSections(generatedTree)[1]!;
    const nextNode = (await readNodeCodebase(workspace)).graph.nodes.find(
      (candidate) => candidate.id === nextSection.canvasNodeId,
    )!;
    const htmlPath = path.join(workspace, node.source.html);
    const untouchedHtmlPath = path.join(workspace, nextNode.source.html);
    const initialHtml = await readFile(htmlPath, "utf8");
    const untouchedHtml = await readFile(untouchedHtmlPath, "utf8");
    expect(initialHtml).toContain('data-putenggame-motion="hold-charge"');
    expect(initialHtml).toContain('data-putenggame-motion-interaction="hold"');
    const customizedHtml = initialHtml.replace(
      'data-putenggame-story-tree-generated="true"',
      'data-putenggame-story-tree-generated="true" data-author-note="keep-this" data-putenggame-motion-press-effect="green-particle-burst" data-putenggame-motion-effect-color="#3478f6"',
    );
    await writeFile(htmlPath, customizedHtml);

    const updatedTree = structuredClone(generatedTree);
    playableStoryTreeSections(updatedTree)[0]!.beats[1]!.text =
      "向左滑动门把手后进入";
    const preview = await syncPlayableStoryTree(
      workspace,
      generatedTree,
      updatedTree,
    );
    expect(preview.applied).toBe(false);
    expect(preview.confirmations).toContainEqual(expect.objectContaining({
      nodeId: node.id,
      changes: expect.arrayContaining([
        "A generated story button will be updated.",
        "A generated story button was edited on the canvas.",
      ]),
    }));
    expect(await readFile(htmlPath, "utf8")).toBe(customizedHtml);

    const applied = await syncPlayableStoryTree(
      workspace,
      generatedTree,
      updatedTree,
      true,
    );
    const updatedHtml = await readFile(htmlPath, "utf8");
    expect(applied.applied).toBe(true);
    expect(applied.updatedNodes).toBe(1);
    expect(updatedHtml).toContain('data-putenggame-motion="swipe-button"');
    expect(updatedHtml).toContain('data-putenggame-motion-interaction="swipe-left"');
    expect(updatedHtml).not.toContain('data-putenggame-motion="hold-charge"');
    expect(updatedHtml).toContain('data-author-note="keep-this"');
    expect(updatedHtml).toContain('data-putenggame-motion-press-effect="green-particle-burst"');
    expect(updatedHtml).toContain('data-putenggame-motion-effect-color="#3478f6"');
    expect(updatedHtml).toContain("雨夜，主角来到门前。");
    expect(updatedHtml).toContain("向左滑动门把手后进入");
    expect(await readFile(untouchedHtmlPath, "utf8")).toBe(untouchedHtml);
  });

  it("recommends presets for explicit choices and endings and applies overrides only to new nodes", async () => {
    const workspace = await createWorkspace();
    const tree = parseScreenplayText([
      "第1集",
      "1-1 分岔点",
      "选择A1：走左边",
      "1-2 普通场景",
      "固定剧情",
      "1-3 结局展示",
      "主角离开",
    ], "screenplay.txt").tree;
    const sections = playableStoryTreeSections(tree);
    const result = await syncPlayableStoryTree(
      workspace,
      undefined,
      tree,
      false,
      "generate",
      { [sections[1]!.id]: "qte" },
    );
    const codebase = await readNodeCodebase(workspace);
    const generatedSections = playableStoryTreeSections(result.tree!);
    const signalsFor = (sectionIndex: number) =>
      codebase.graph.nodes.find(
        (node) => node.id === generatedSections[sectionIndex]!.canvasNodeId,
      )!.signals.map((signal) => signal.id);

    expect(result.addedNodes).toBe(3);
    expect(signalsFor(0)).toEqual(expect.arrayContaining(["option-a", "option-b"]));
    expect(signalsFor(1)).toEqual(expect.arrayContaining(["success", "fail"]));
    expect(signalsFor(2)).toEqual([]);
  });
});

describe("playable story tree storage", () => {
  it("persists valid trees and rejects stale revisions", async () => {
    const workspace = await createWorkspace();
    const original = await readPlayableStoryTree(workspace);
    const tree = simpleTree();
    const saved = await writePlayableStoryTree(workspace, tree, original.revision);

    expect((await readPlayableStoryTree(workspace)).tree).toEqual(tree);
    await expect(
      writePlayableStoryTree(workspace, tree, original.revision),
    ).rejects.toBeInstanceOf(PlayableStoryTreeConflictError);
    expect(saved.revision).not.toBe(original.revision);
  });
});
