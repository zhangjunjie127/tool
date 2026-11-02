import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isPlayableStoryTree,
  type PlayableStoryTree,
} from "../shared/playable-story-tree.js";

const STORY_TREE_FILE = "editor/story-tree.json";
const MAX_STORY_TREE_BYTES = 25 * 1024 * 1024;
const storeOperations = new Map<string, Promise<void>>();

export interface PlayableStoryTreeDetail {
  tree?: PlayableStoryTree;
  revision: string;
}

export class PlayableStoryTreeError extends Error {
  override readonly name: string = "PlayableStoryTreeError";
}

export class PlayableStoryTreeConflictError extends PlayableStoryTreeError {
  override readonly name: string = "PlayableStoryTreeConflictError";
}

export async function readPlayableStoryTree(
  workspacePath: string,
): Promise<PlayableStoryTreeDetail> {
  const file = await resolveStoryTreeFile(workspacePath);
  let content: string;
  try {
    content = await readFile(file, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return { revision: revisionOf(undefined) };
    }
    throw cause;
  }
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    throw new PlayableStoryTreeError("The saved story tree is not valid JSON.");
  }
  if (!isPlayableStoryTree(value)) {
    throw new PlayableStoryTreeError("The saved story tree does not match its schema.");
  }
  return { tree: value, revision: revisionOf(content) };
}

export async function writePlayableStoryTree(
  workspacePath: string,
  tree: PlayableStoryTree,
  expectedRevision: string,
): Promise<PlayableStoryTreeDetail> {
  if (!isPlayableStoryTree(tree)) {
    throw new PlayableStoryTreeError("The story tree does not match its schema.");
  }
  return withStoreLock(workspacePath, async () => {
    const file = await resolveStoryTreeFile(workspacePath);
    const current = await readPlayableStoryTree(workspacePath);
    if (current.revision !== expectedRevision) {
      throw new PlayableStoryTreeConflictError(
        "The story tree changed. Reload it before saving.",
      );
    }
    const content = `${JSON.stringify(tree, null, 2)}\n`;
    if (Buffer.byteLength(content, "utf8") > MAX_STORY_TREE_BYTES) {
      throw new PlayableStoryTreeError("The story tree exceeds the 25 MB limit.");
    }
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await writeFile(temporary, content, "utf8");
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
    return { tree, revision: revisionOf(content) };
  });
}

async function resolveStoryTreeFile(workspacePath: string): Promise<string> {
  const root = await realpath(workspacePath);
  const directory = path.join(root, "editor");
  const file = path.join(directory, "story-tree.json");
  for (const candidate of [directory, file]) {
    try {
      const entry = await lstat(candidate);
      if (entry.isSymbolicLink()) {
        throw new PlayableStoryTreeError(
          `The story tree path "${path.relative(root, candidate)}" cannot be a symbolic link.`,
        );
      }
      if (candidate === directory && !entry.isDirectory()) {
        throw new PlayableStoryTreeError("The editor path is not a directory.");
      }
      if (candidate === file && !entry.isFile()) {
        throw new PlayableStoryTreeError("The story tree path is not a file.");
      }
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    }
  }
  return file;
}

function revisionOf(content: string | undefined): string {
  return createHash("sha256")
    .update(content ?? "missing-story-tree")
    .digest("hex");
}

async function withStoreLock<T>(
  workspacePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(workspacePath);
  const previous = storeOperations.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => {}).then(() => gate);
  storeOperations.set(key, queued);
  await previous.catch(() => {});
  try {
    return await operation();
  } finally {
    release();
    if (storeOperations.get(key) === queued) storeOperations.delete(key);
  }
}
