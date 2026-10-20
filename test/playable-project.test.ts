import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPlayableProject, validatePlayableProject } from "../src/daemon/playable-project.js";
import { writePlayableBackdropEffects } from "../src/daemon/playable-backdrop-effects.js";
import { isCompiledNodeGraph } from "../src/shared/playable-compiled.js";
import {
  createNodeGraphFixture,
  writePlayableFixtureWorkspace,
} from "./playable-fixture.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Playable project build", () => {
  it("builds one deterministic definition for Player and Playtest", async () => {
    const workspace = await temporaryWorkspace();
    await writePlayableFixtureWorkspace(workspace);

    const first = await buildPlayableProject(workspace);
    const second = await buildPlayableProject(workspace);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      version: 1,
      graph: { title: "Ash Club", entryNodeId: "menu" },
      compiled: { version: 1 },
    });
    expect(first?.compiled.nodes.menu?.javascript).toContain(
      "sourceMappingURL",
    );
    expect(first?.graphSignature).toHaveLength(64);
  });

  it("keeps the signature when only authored source changes", async () => {
    const workspace = await temporaryWorkspace();
    await writePlayableFixtureWorkspace(workspace);
    const first = await buildPlayableProject(workspace);

    await writeFile(
      path.join(workspace, "nodes", "menu", "node.js"),
      "export function mount(context) { context.root.host.dataset.changed = 'true'; }\n",
    );
    const second = await buildPlayableProject(workspace);

    expect(second?.compiled).not.toEqual(first?.compiled);
    expect(second?.graphSignature).toBe(first?.graphSignature);
  });

  it("validates compiled surfaces against the authored graph", async () => {
    const workspace = await temporaryWorkspace();
    await writePlayableFixtureWorkspace(workspace);
    const definition = (await buildPlayableProject(workspace))!;

    expect(isCompiledNodeGraph(definition.compiled, definition.graph)).toBe(true);

    const missingNode = structuredClone(definition.compiled);
    delete missingNode.nodes.menu;
    expect(isCompiledNodeGraph(missingNode, definition.graph)).toBe(false);

    const withShell = { ...structuredClone(definition.compiled), shell: definition.compiled.nodes.menu };
    expect(isCompiledNodeGraph(withShell, definition.graph)).toBe(false);

    const extraField = { ...structuredClone(definition.compiled), debug: true };
    expect(isCompiledNodeGraph(extraField, definition.graph)).toBe(false);
  });

  it("uses publish validation for the static Player", async () => {
    const workspace = await temporaryWorkspace();
    const graph = createNodeGraphFixture();
    graph.edges = graph.edges.filter(
      (edge) => edge.source.signal !== "inspect",
    );
    await writePlayableFixtureWorkspace(workspace, graph);

    await expect(buildPlayableProject(workspace, "publish")).rejects.toThrow(
      'Signal "menu.inspect" must be connected before publishing.',
    );
    await expect(
      buildPlayableProject(workspace, "draft"),
    ).resolves.toBeDefined();
  });

  it("annotates source locations for drafts but not for publishing", async () => {
    const workspace = await temporaryWorkspace();
    await writePlayableFixtureWorkspace(workspace);

    const draft = await buildPlayableProject(workspace, "draft");
    const published = await buildPlayableProject(workspace, "publish");

    expect(draft?.compiled.nodes.menu?.html).toContain("data-putenggame-source");
    expect(published?.compiled.nodes.menu?.html).not.toContain(
      "data-putenggame-source",
    );
  });

  it("applies one saved backdrop setting to every Scene and the published build", async () => {
    const workspace = await temporaryWorkspace();
    await writePlayableFixtureWorkspace(workspace);
    await mkdir(path.join(workspace, "shared", "style"), { recursive: true });
    await writeFile(
      path.join(workspace, "shared", "style", "components.css"),
      `.backdrop::after{content:"";background:radial-gradient(circle,transparent,#000),url("data:image/svg+xml;utf8,<svg><feTurbulence/></svg>"),linear-gradient(#111,#222)}`,
    );
    for (const node of createNodeGraphFixture().nodes) {
      await writeFile(
        path.join(workspace, node.source.css),
        `@import "../../shared/style/components.css";\nmain { display: grid; }\n`,
      );
    }
    await writePlayableBackdropEffects(workspace, {
      vignette: false,
      grain: true,
    });

    const draft = await buildPlayableProject(workspace, "draft");
    const published = await buildPlayableProject(workspace, "publish");

    for (const scene of Object.values(draft!.compiled.nodes)) {
      expect(scene.css).toContain("--putenggame-backdrop-vignette: none");
      expect(scene.css).toContain("--putenggame-backdrop-grain: var(--putenggame-backdrop-grain-source)");
      expect(scene.css).toMatch(/linear-gradient\(#111,\s*#222\)/);
    }
    expect(published!.compiled.nodes.menu!.css).toContain(
      "--putenggame-backdrop-vignette: none",
    );
  });

  it("reports that the new Runtime is unavailable without graph.json", async () => {
    const workspace = await temporaryWorkspace();
    await writeFile(path.join(workspace, "README.md"), "legacy project\n");

    await expect(buildPlayableProject(workspace)).resolves.toBeUndefined();
    await expect(
      readFile(path.join(workspace, "README.md"), "utf8"),
    ).resolves.toContain("legacy");
  });

  it("returns structured graph and compiler diagnostics for agents and editors", async () => {
    const workspace = await temporaryWorkspace();
    const graph = createNodeGraphFixture();
    graph.entryNodeId = "missing";
    await writePlayableFixtureWorkspace(workspace, graph);

    const graphResult = await validatePlayableProject(workspace);
    expect(graphResult).toMatchObject({
      ok: false,
      issues: [{ phase: "graph", code: "missing-node", path: "/entryNodeId" }],
    });

    graph.entryNodeId = "menu";
    await writeFile(path.join(workspace, "graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
    await writeFile(path.join(workspace, "nodes", "menu", "node.js"), "export const invalid = true;\n");
    const compilerResult = await validatePlayableProject(workspace);
    expect(compilerResult).toMatchObject({
      ok: false,
      issues: [{ phase: "compiler", code: "build-failed", surfaceId: "menu" }],
    });
  });
});

async function temporaryWorkspace(): Promise<string> {
  const workspace = await mkdtemp(
    path.join(tmpdir(), "putenggame-playable-project-"),
  );
  temporaryRoots.push(workspace);
  return workspace;
}
