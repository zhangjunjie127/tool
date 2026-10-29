import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { ZipFile } from "yazl";
import type { ProjectState } from "../../shared/contracts.js";
import { isWebRuntimeProjectType } from "../../shared/project-runtime.js";
import { PLUGIN_ARCHIVE_ALLOWED_HIDDEN_DIRECTORIES } from "../../shared/plugins.js";
import { PUBLISH_ARTIFACT_MAX_BYTES, PUBLISH_GAME_COVER_PATH } from "../../shared/publish-v1.js";
import type { AssetLibrary } from "../asset-library.js";
import { packageManagerCommand, packageManagerRunArguments, resolvePackageManager } from "../package-manager.js";
import { ensureProjectDependencies } from "../project-dependencies.js";
import { projectProcessEnvironment } from "../project-process.js";
import { resolveStartupDirectory } from "../projects.js";
import { buildPlayableProject, nodeGraphSignature } from "../playable-project.js";
import { isCompiledNodeGraph } from "../../shared/playable-compiled.js";
import type { NodePlayerDefinition } from "../../shared/playable-player-protocol.js";
import { isPublishedNodeManifest, PLAYTEST_SCOPE_PREFIX, type PublishedNodeAsset, type PublishedNodeManifest } from "../../shared/playable-publish.js";
import { isNodeGraph } from "../../shared/playable-graph-validation.js";
import { getWorkspaceMedia } from "../workspace.js";
import { buildPicoStoryApk } from "./pico-apk.js";

interface PackageJson {
  scripts?: { build?: unknown };
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

export class PublishError extends Error {
  constructor(message: string, readonly statusCode = 409) {
    super(message);
  }
}

export class ArtifactBuilder {
  readonly #running = new Map<string, ChildProcess>();

  constructor(private readonly library?: AssetLibrary, private readonly playerDirectory?: string) {}

  async create(project: ProjectState, cover?: Buffer): Promise<Buffer> {
    return this.#create(project, cover, PUBLISH_ARTIFACT_MAX_BYTES);
  }

  async buildInteractiveStory(project: ProjectState): Promise<Buffer> {
    if (project.type !== "interactive-story") throw new PublishError("Build requires an Interactive Story project");
    let temporary: string | undefined;
    try {
      temporary = await prepareInteractiveStory(project, this.library, this.playerDirectory);
      await addPlayableWindowsLauncher(temporary);
      return await createZip(temporary);
    } finally {
      if (temporary) await rm(temporary, { recursive: true, force: true });
    }
  }

  async buildInteractiveStoryProject(project: ProjectState): Promise<Buffer> {
    if (project.type !== "interactive-story") throw new PublishError("Build requires an Interactive Story project");
    if (!this.library) throw new PublishError("The Asset Library is not available.");
    const output = await mkdtemp(path.join(tmpdir(), "puteng-game-project-export-"));
    try {
      for (const file of await filesIn(project.workspacePath)) {
        const destination = path.join(output, ...file.split("/"));
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(path.join(project.workspacePath, ...file.split("/")), destination);
      }
      const graphPath = path.join(output, "graph.json");
      const graph = JSON.parse(await readFile(graphPath, "utf8")) as {
        assets?: Record<string, { source?: { kind?: string; assetId?: string; path?: string } }>;
      };
      for (const [assetId, definition] of Object.entries(graph.assets ?? {})) {
        if (definition.source?.kind !== "library" || !definition.source.assetId) continue;
        const { asset, absolutePath } = await this.library.content(definition.source.assetId);
        const extension = path.extname(asset.name).toLowerCase();
        const relative = `assets/library/${sha256Hex(Buffer.from(assetId)).slice(0, 24)}${extension}`;
        const destination = path.join(output, ...relative.split("/"));
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(absolutePath, destination);
        definition.source = { kind: "workspace", path: relative };
      }
      await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);
      await writeFile(
        path.join(output, "EXPORT_README.md"),
        "# Editable Interactive Story Project\n\n" +
          "Extract this archive, then choose the extracted folder when creating a new Interactive Story project in puteng game.\n" +
          "Library media used by the project has been copied into `assets/library/`.\n",
      );
      return await createZip(output);
    } catch (cause) {
      if (cause instanceof PublishError) throw cause;
      throw new PublishError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  }

  async buildInteractiveStoryPicoWebApp(project: ProjectState): Promise<Buffer> {
    if (project.type !== "interactive-story") throw new PublishError("Build requires an Interactive Story project");
    let temporary: string | undefined;
    try {
      temporary = await prepareInteractiveStory(project, this.library, this.playerDirectory);
      await addPicoWebAppFiles(temporary, project.name);
      return await createZip(temporary);
    } finally {
      if (temporary) await rm(temporary, { recursive: true, force: true });
    }
  }

  async buildInteractiveStoryPicoApk(project: ProjectState): Promise<Buffer> {
    if (project.type !== "interactive-story") throw new PublishError("Build requires an Interactive Story project");
    let temporary: string | undefined;
    try {
      temporary = await prepareInteractiveStory(project, this.library, this.playerDirectory);
      await addPicoWebAppFiles(temporary, project.name);
      return await buildPicoStoryApk(temporary, project.name, project.id);
    } catch (cause) {
      if (cause instanceof PublishError) throw cause;
      throw new PublishError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (temporary) await rm(temporary, { recursive: true, force: true });
    }
  }

  async #create(project: ProjectState, cover?: Buffer, maxBytes?: number): Promise<Buffer> {
    let temporary: string | undefined;
    try {
      let source: string;
      if (project.type === "interactive-story") {
        temporary = await prepareInteractiveStory(project, this.library, this.playerDirectory);
        source = temporary;
      } else {
        const workspacePath = isWebRuntimeProjectType(project.type)
          ? await publishStartupDirectory(project)
          : project.workspacePath;
        source = await prepareSource(workspacePath, (child) => this.#running.set(project.id, child), project);
      }
      return await createZip(source, false, cover, maxBytes);
    } finally {
      this.#running.delete(project.id);
      if (temporary) await rm(temporary, { recursive: true, force: true });
    }
  }

  /**
   * A Published Player directory that runs the project's current draft, for
   * agent playtests. The draft need not pass publish validation, and its save
   * is kept apart from the published game's. The caller removes the directory.
   */
  async preparePlayableDraft(project: ProjectState): Promise<string> {
    if (project.type !== "interactive-story") throw new PublishError("Playable drafts require an Interactive Story project");
    if (!this.library || !this.playerDirectory) throw new PublishError("Published Player is not built. Run bun run build:player first.");
    await assertNodePlayerBuilt(this.playerDirectory);
    let definition: NodePlayerDefinition | undefined;
    try {
      definition = await buildPlayableProject(project.workspacePath, "draft");
    } catch (cause) {
      throw new PublishError(`The project does not build: ${cause instanceof Error ? cause.message : String(cause)}. Run playable_check for every issue.`);
    }
    if (!definition) throw new PublishError("This project has no graph.json.");
    return preparePlayableProject(project, definition, this.library, this.playerDirectory, `${PLAYTEST_SCOPE_PREFIX}${project.id}`);
  }

  /**
   * Builds a Published Player for an example workspace that is not a project.
   * Draft rules, like agent playtests: packaging already checked the example
   * against the publish rules.
   */
  async preparePlayableExample(workspacePath: string, exampleId: string): Promise<string> {
    if (!this.library || !this.playerDirectory) throw new PublishError("Published Player is not built. Run bun run build:player first.");
    await assertNodePlayerBuilt(this.playerDirectory);
    const definition = await buildPlayableProject(workspacePath, "draft");
    if (!definition) throw new PublishError("This example has no graph.json.");
    return preparePlayableProject({ id: exampleId, workspacePath }, definition, this.library, this.playerDirectory, `example:${exampleId}`);
  }

  async close(): Promise<void> {
    await Promise.all([...this.#running.values()].map(terminate));
    this.#running.clear();
  }
}

async function addPicoWebAppFiles(directory: string, name: string): Promise<void> {
  const manifest = {
    id: "./",
    name,
    short_name: name.slice(0, 24),
    description: `${name} - immersive interactive story`,
    start_url: "./",
    scope: "./",
    display: "standalone",
    orientation: "landscape",
    background_color: "#090b10",
    theme_color: "#090b10",
    icons: [{
      src: "./pico-app-icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any maskable",
    }],
  };
  const iconTitle = escapeXml(name.slice(0, 1).toUpperCase() || "P");
  const indexPath = path.join(directory, "index.html");
  const index = await readFile(indexPath, "utf8");
  const manifestLink = '    <link rel="manifest" href="./manifest.webmanifest" />\n';
  const workerRegistration =
    '    <script>if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));</script>\n';
  const withManifest = index.replace("</head>", `${manifestLink}  </head>`);
  if (withManifest === index) throw new PublishError("Published Player index.html has no closing head tag.");
  const withWorker = withManifest.replace("</body>", `${workerRegistration}  </body>`);
  if (withWorker === withManifest) throw new PublishError("Published Player index.html has no closing body tag.");
  await writeFile(indexPath, withWorker);
  await writeFile(path.join(directory, "manifest.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    path.join(directory, "pico-app-icon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#121923"/><path d="M128 118h112c91 0 144 47 144 126S331 370 240 370h-32v54h-80V118zm80 72v108h34c39 0 61-18 61-54s-22-54-61-54h-34z" fill="#f2f5f8"/><text x="256" y="475" fill="#71d3c1" font-family="Arial,sans-serif" font-size="30" font-weight="700" text-anchor="middle">${iconTitle}</text></svg>\n`,
  );
  await writeFile(
    path.join(directory, "service-worker.js"),
    'const CACHE = "puteng-pico-shell-v1";\n' +
      'self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["./", "./index.html", "./manifest.webmanifest", "./pico-app-icon.svg"]))));\n' +
      'self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))));\n' +
      'self.addEventListener("fetch", (event) => { const url = new URL(event.request.url); if (event.request.method !== "GET" || url.origin !== self.location.origin || event.request.destination === "video" || url.pathname.includes("/assets/media/")) return; event.respondWith(fetch(event.request).then((response) => { if (response.ok && !event.request.headers.has("range")) { const copy = response.clone(); void caches.open(CACHE).then((cache) => cache.put(event.request, copy)); } return response; }).catch(async () => (await caches.match(event.request)) ?? Response.error())); });\n',
  );
  await writeFile(
    path.join(directory, "PICO-INSTALL.md"),
    `# ${name}\n\n` +
      "1. Upload the entire extracted folder to an HTTPS website. Do not open index.html as a local file.\n" +
      "2. On PICO 4 Ultra, open the HTTPS address in PICO Browser. Use Install or Add to Home Screen if offered; otherwise launch it directly in the browser.\n" +
      "3. Launch it and choose Enter VR in the game when ready.\n\n" +
      "This is a WebXR/PWA website bundle, not an Android APK. Standalone installation depends on the PICO OS and browser version. WebXR also requires a secure HTTPS origin. Video files are loaded on demand and are not pre-cached for offline use.\n",
  );
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[character]!);
}

async function publishStartupDirectory(project: ProjectState): Promise<string> {
  try {
    return (await resolveStartupDirectory(project.workspacePath, project.startupDirectory ?? ".")).absolutePath;
  } catch (cause) {
    throw new PublishError(cause instanceof Error ? cause.message : String(cause));
  }
}

async function prepareInteractiveStory(project: ProjectState, library?: AssetLibrary, playerDirectory?: string): Promise<string> {
  if (!library || !playerDirectory) throw new PublishError("The Published Player is not available.");
  await assertNodePlayerBuilt(playerDirectory);
  let playable: NodePlayerDefinition | undefined;
  try {
    playable = await buildPlayableProject(project.workspacePath, "publish");
  } catch (cause) {
    throw new PublishError(cause instanceof Error ? cause.message : String(cause));
  }
  if (!playable) throw new PublishError("This project has no graph.json.");
  return preparePlayableProject(project, playable, library, playerDirectory);
}

async function addPlayableWindowsLauncher(directory: string): Promise<void> {
  await Promise.all([
    writeFile(
      path.join(directory, "start-game.bat"),
      "@echo off\r\n" +
        "setlocal\r\n" +
        "set \"PORT=8000\"\r\n" +
        "start \"\" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%~dp0start-game-server.ps1\" -Port %PORT%\r\n",
    ),
    writeFile(
      path.join(directory, "start-game-server.ps1"),
      String.raw`param(
  [string]$Root = $PSScriptRoot,
  [int]$Port = 8000
)

trap {
  $details = $_.Exception.ToString()
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
      ("The game could not start." + [System.Environment]::NewLine + [System.Environment]::NewLine + $details),
      "puteng game startup error"
    ) | Out-Null
  } catch {
    Write-Error $details
    Read-Host "Press Enter to close"
  }
  exit 1
}

$ErrorActionPreference = "Stop"
$rootPath = [System.IO.Path]::GetFullPath($Root)
$rootPrefix = $rootPath.TrimEnd([char[]]@("\", "/")) + [System.IO.Path]::DirectorySeparatorChar
$listener = $null

for ($candidate = $Port; $candidate -lt ($Port + 100); $candidate++) {
  $tryListener = New-Object System.Net.HttpListener
  $tryListener.Prefixes.Add("http://127.0.0.1:$candidate/")
  try {
    $tryListener.Start()
    $listener = $tryListener
    $Port = $candidate
    break
  } catch {
    $tryListener.Close()
  }
}

if ($null -eq $listener) {
  throw "Could not open a local web server on ports $Port through $($Port + 99)."
}

$url = "http://127.0.0.1:$Port/"
Start-Process $url
$contentTypes = @{
  ".css" = "text/css; charset=utf-8"
  ".html" = "text/html; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".m4a" = "audio/mp4"
  ".mp3" = "audio/mpeg"
  ".mp4" = "video/mp4"
  ".mov" = "video/quicktime"
  ".ogg" = "audio/ogg"
  ".png" = "image/png"
  ".svg" = "image/svg+xml"
  ".webm" = "video/webm"
  ".webp" = "image/webp"
  ".woff" = "font/woff"
  ".woff2" = "font/woff2"
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $response = $context.Response
  try {
    $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/")).Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    if ([string]::IsNullOrEmpty($relative)) { $relative = "index.html" }
    $filePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootPath, $relative))
    if (-not $filePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      $response.StatusCode = 403
    } elseif (Test-Path -LiteralPath $filePath -PathType Container) {
      $filePath = Join-Path $filePath "index.html"
    }

    if ($response.StatusCode -ne 403 -and (Test-Path -LiteralPath $filePath -PathType Leaf)) {
      $response.StatusCode = 200
      $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
      $response.ContentType = $contentTypes[$extension]
      if (-not $response.ContentType) { $response.ContentType = "application/octet-stream" }
      $response.Headers["Cache-Control"] = "no-cache"
      $stream = [System.IO.File]::OpenRead($filePath)
      $response.ContentLength64 = $stream.Length
      if ($context.Request.HttpMethod -ne "HEAD") {
        $stream.CopyTo($response.OutputStream)
      }
      $stream.Dispose()
    } elseif ($response.StatusCode -ne 403) {
      $response.StatusCode = 404
    }
  } catch {
    $response.StatusCode = 500
  } finally {
    $response.Close()
  }
}
`,
    ),
  ]);
}

async function preparePlayableProject(
  project: Pick<ProjectState, "id" | "workspacePath">,
  definition: NodePlayerDefinition,
  library: AssetLibrary,
  playerDirectory: string,
  scope = `published:${project.id}`,
): Promise<string> {
  const output = await mkdtemp(path.join(tmpdir(), "ohmygame-playable-build-"));
  try {
    await cp(playerDirectory, output, { recursive: true });
    await mkdir(path.join(output, "assets", "media"), { recursive: true });
    const assets: Record<string, PublishedNodeAsset> = {};
    const writtenAssets = new Set<string>();
    for (const [id, assetDefinition] of Object.entries(definition.graph.assets).sort(([left], [right]) => left.localeCompare(right))) {
      let absolutePath: string;
      let mediaType: string;
      let contentType: string;
      let extension: string;
      if (assetDefinition.source.kind === "library") {
        const result = await library.content(assetDefinition.source.assetId);
        absolutePath = result.absolutePath;
        mediaType = result.asset.mediaType;
        contentType = result.asset.contentType;
        extension = path.extname(result.asset.name).toLowerCase();
      } else {
        const result = await getWorkspaceMedia(project.workspacePath, assetDefinition.source.path);
        absolutePath = result.absolutePath;
        mediaType = result.mediaType;
        contentType = result.contentType;
        extension = path.extname(result.relativePath).toLowerCase();
      }
      if (mediaType !== assetDefinition.type) {
        throw new PublishError(`Asset "${id}" is not a compatible ${assetDefinition.type} asset.`);
      }
      const bytes = await readFile(absolutePath);
      const digest = sha256Hex(bytes);
      const relative = `assets/media/${digest}${extension}`;
      if (!writtenAssets.has(relative)) {
        await writeFile(path.join(output, ...relative.split("/")), bytes);
        writtenAssets.add(relative);
      }
      assets[id] = {
        path: `./${relative}`,
        type: assetDefinition.type,
        contentType,
        size: bytes.length,
        integrity: sha256Integrity(bytes),
      };
    }
    const definitionBytes = Buffer.from(`${JSON.stringify(definition)}\n`);
    await writeFile(path.join(output, "playable.json"), definitionBytes);
    const manifest: PublishedNodeManifest = {
      version: 1,
      runtime: "playable-nodes",
      scope,
      graphSignature: definition.graphSignature,
      definition: {
        path: "./playable.json",
        integrity: sha256Integrity(definitionBytes),
      },
      assets,
    };
    await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await validatePlayablePublishDirectory(output);
    return output;
  } catch (cause) {
    await rm(output, { recursive: true, force: true });
    if (cause instanceof PublishError) throw cause;
    throw new PublishError(cause instanceof Error ? cause.message : String(cause));
  }
}

export async function validatePlayablePublishDirectory(directory: string): Promise<void> {
  const manifestValue = await readJsonFile(path.join(directory, "manifest.json"), "Published manifest");
  if (!isPublishedNodeManifest(manifestValue)) {
    throw new PublishError("Published Player manifest is invalid.");
  }
  const manifest = manifestValue;
  const definitionBytes = await readPublishedFile(directory, manifest.definition.path, "Published Node definition");
  assertIntegrity("Published Node definition", definitionBytes, manifest.definition.integrity);
  let definition: NodePlayerDefinition;
  try {
    definition = JSON.parse(definitionBytes.toString("utf8")) as NodePlayerDefinition;
  } catch {
    throw new PublishError("Published Node definition is not valid JSON.");
  }
  if (definition.version !== 1 || !isNodeGraph(definition.graph) ||
    !isCompiledNodeGraph(definition.compiled, definition.graph) ||
    definition.graphSignature !== nodeGraphSignature(definition.graph) || definition.graphSignature !== manifest.graphSignature) {
    throw new PublishError("Published Node definition does not match its manifest.");
  }
  const graphAssets = Object.entries(definition.graph?.assets ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const manifestAssets = Object.entries(manifest.assets).sort(([left], [right]) => left.localeCompare(right));
  if (graphAssets.length !== manifestAssets.length || graphAssets.some(([id], index) => id !== manifestAssets[index]?.[0])) {
    throw new PublishError("Published asset manifest does not match the Node Graph.");
  }
  for (const [id, asset] of manifestAssets) {
    const declared = definition.graph.assets[id]!;
    if (asset.type !== declared.type) {
      throw new PublishError(`Published Asset "${id}" does not match its declared type.`);
    }
    const bytes = await readPublishedFile(directory, asset.path, `Published Asset "${id}"`);
    if (bytes.length !== asset.size) {
      throw new PublishError(`Published Asset "${id}" does not match its declared size.`);
    }
    assertIntegrity(`Published Asset "${id}"`, bytes, asset.integrity);
    if (path.basename(asset.path, path.extname(asset.path)) !== sha256Hex(bytes)) {
      throw new PublishError(`Published Asset "${id}" does not use its content-addressed path.`);
    }
  }
}

async function readJsonFile(file: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch (cause) {
    if (cause instanceof SyntaxError) throw new PublishError(`${label} is not valid JSON.`);
    throw new PublishError(`${label} is missing.`);
  }
}

async function readPublishedFile(directory: string, publishedPath: string, label: string): Promise<Buffer> {
  const relative = publishedPath.replace(/^\.\//, "");
  const absolute = path.resolve(directory, ...relative.split("/"));
  const relation = path.relative(path.resolve(directory), absolute);
  if (!relative || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new PublishError(`${label} has an unsafe path.`);
  }
  try {
    return await readFile(absolute);
  } catch {
    throw new PublishError(`${label} is missing.`);
  }
}

function assertIntegrity(label: string, bytes: Buffer, expected: string): void {
  if (sha256Integrity(bytes) !== expected) throw new PublishError(`${label} failed integrity validation.`);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Integrity(bytes: Uint8Array): string {
  return `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
}

async function assertNodePlayerBuilt(playerDirectory: string): Promise<void> {
  const required = [
    "index.html",
    "playable-sandbox.html",
    "assets/playable-sandbox.js",
  ];
  const missing = (
    await Promise.all(required.map(async (file) =>
      await exists(path.join(playerDirectory, ...file.split("/"))) ? undefined : file,
    ))
  ).filter((file): file is string => file !== undefined);
  if (missing.length) {
    throw new PublishError(
      `Published Player build is incomplete. Missing: ${missing.join(", ")}. Run bun run build:player first.`,
    );
  }
}

export async function createPluginArchive(source: string, maxBytes = PUBLISH_ARTIFACT_MAX_BYTES, preserveExecutable = false): Promise<Buffer> {
  return createZip(source, true, undefined, maxBytes, preserveExecutable);
}

async function prepareSource(workspacePath: string, track: (child: ChildProcess) => void, project?: ProjectState): Promise<string> {
  const packageJson = await readPackageJson(workspacePath);
  if (packageJson) {
    const build = packageJson.scripts?.build;
    if (typeof build !== "string" || !build.trim()) {
      throw new PublishError("Projects with package.json need a non-empty scripts.build command before publishing");
    }
    const { manager: packageManager } = await resolvePackageManager(workspacePath, project?.packageManager);
    if (hasDependencies(packageJson)) {
      await ensureProjectDependencies(workspacePath, packageManager,
        (command, args) => run(command, args, workspacePath, track));
    }
    await run(packageManagerCommand(packageManager), packageManagerRunArguments("build"), workspacePath, track);
    const output = await findBuildOutput(workspacePath);
    if (!output) throw new PublishError("Build completed but did not produce a static index.html in dist, build, or out");
    return output;
  }
  if (await exists(path.join(workspacePath, "index.html"))) return workspacePath;
  throw new PublishError("Project has no build script or static index.html yet");
}

async function createZip(source: string, plugin = false, cover?: Buffer, maxBytes?: number, preserveExecutable = false): Promise<Buffer> {
  const zip = new ZipFile();
  const files = await filesIn(source, "", plugin);
  const zipOptions = {
    mtime: new Date(1980, 0, 2),
    forceDosTimestamp: true,
    // Deflate output differs between zlib builds, so Plugin entries are stored
    // to keep the archive's checksum the same on every runtime.
    ...(plugin ? { mode: 0o100644, compress: false } : {}),
  } as const;
  if (cover !== undefined && files.includes(PUBLISH_GAME_COVER_PATH)) {
    throw new PublishError(`Publish output uses reserved path: ${PUBLISH_GAME_COVER_PATH}`);
  }
  for (const file of files) {
    const filename = path.join(source, ...file.split("/"));
    const executable = preserveExecutable && ((await stat(filename)).mode & 0o111) !== 0;
    zip.addFile(filename, file, executable ? { ...zipOptions, mode: 0o100755 } : zipOptions);
  }
  if (cover !== undefined) zip.addBuffer(cover, PUBLISH_GAME_COVER_PATH, zipOptions);
  const chunks: Buffer[] = [];
  const output = zip.outputStream as Readable;
  const completed = new Promise<Buffer>((resolve, reject) => {
    let bytes = 0;
    output.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (maxBytes !== undefined && bytes > maxBytes) {
        output.destroy(new PublishError(`Publish artifact exceeds ${maxBytes / (1024 * 1024)} MB`, 413));
        return;
      }
      chunks.push(chunk);
    });
    output.once("error", reject);
    // yazl reports a file it cannot stat or read on the ZipFile, possibly once per file, and then never ends the output.
    zip.on("error", reject);
    output.once("end", () => resolve(Buffer.concat(chunks)));
  });
  zip.end();
  return completed;
}

async function filesIn(root: string, relative = "", plugin = false): Promise<string[]> {
  const files: string[] = [];
  const directory = path.join(root, relative);
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (ignored(entry.name, relative, plugin) || entry.isSymbolicLink()) continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await filesIn(root, child, plugin));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function readPackageJson(workspacePath: string): Promise<PackageJson | undefined> {
  try {
    return JSON.parse(await readFile(path.join(workspacePath, "package.json"), "utf8")) as PackageJson;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new PublishError("package.json is not valid JSON");
  }
}

function hasDependencies(packageJson: PackageJson): boolean {
  return Object.keys(packageJson.dependencies ?? {}).length > 0 || Object.keys(packageJson.devDependencies ?? {}).length > 0;
}

async function findBuildOutput(workspacePath: string): Promise<string | undefined> {
  for (const directory of ["dist", "build", "out"]) {
    const candidate = path.join(workspacePath, directory);
    if (await exists(path.join(candidate, "index.html"))) return candidate;
  }
  return undefined;
}

async function run(command: string, args: string[], cwd: string, track: (child: ChildProcess) => void): Promise<void> {
  const child = spawn(command, args, {
    cwd,
    env: { ...projectProcessEnvironment(), BROWSER: "none" },
    stdio: ["ignore", "ignore", "pipe"],
    detached: process.platform !== "win32",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  track(child);
  let stderr = "";
  child.stderr?.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-4_000); });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve()
      : reject(new PublishError(stderr.trim() || `${command} exited with ${code}`)));
  });
}

function ignored(name: string, relative: string, plugin: boolean): boolean {
  if (name === "node_modules" || name === ".git" || name === ".data" || (!plugin && name === "AGENTS.md")) return true;
  if (!name.startsWith(".")) return false;
  return !(plugin && !relative && PLUGIN_ARCHIVE_ALLOWED_HIDDEN_DIRECTORIES.includes(name));
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function terminate(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await new Promise<void>((resolve, reject) => {
      killer.once("error", reject);
      killer.once("exit", () => resolve());
    });
    return;
  }
  try {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}
