import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  DEFAULT_PLAYABLE_BACKDROP_EFFECTS,
  type PlayableBackdropEffects,
} from "../shared/playable-backdrop-effects.js";

const SETTINGS_PATH = ".putenggame/backdrop-effects.json";

export async function readPlayableBackdropEffects(
  workspacePath: string,
): Promise<PlayableBackdropEffects> {
  try {
    const file = await resolveSettingsFile(workspacePath);
    const value: unknown = JSON.parse(
      await readFile(file, "utf8"),
    );
    if (
      typeof value === "object" &&
      value !== null &&
      "vignette" in value &&
      typeof value.vignette === "boolean" &&
      "grain" in value &&
      typeof value.grain === "boolean"
    ) {
      return { vignette: value.vignette, grain: value.grain };
    }
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
  }
  return DEFAULT_PLAYABLE_BACKDROP_EFFECTS;
}

export async function writePlayableBackdropEffects(
  workspacePath: string,
  effects: PlayableBackdropEffects,
): Promise<void> {
  const destination = await resolveSettingsFile(workspacePath, true);
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(effects, null, 2)}\n`, "utf8");
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function resolveSettingsFile(
  workspacePath: string,
  createDirectory = false,
): Promise<string> {
  const root = await realpath(workspacePath);
  const directory = path.join(root, ".putenggame");
  if (createDirectory) await mkdir(directory, { recursive: true });
  try {
    const directoryInfo = await lstat(directory);
    if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory())
      throw new Error("The Playable project settings directory is unsafe.");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    if (createDirectory) throw cause;
    return path.join(directory, "backdrop-effects.json");
  }
  const file = path.join(root, SETTINGS_PATH);
  try {
    const fileInfo = await lstat(file);
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile())
      throw new Error("The Playable backdrop settings file is unsafe.");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
  }
  return file;
}
