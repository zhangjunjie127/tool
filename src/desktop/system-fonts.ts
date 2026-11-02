import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractFontFamilies } from "../shared/playable-fonts.js";

export { extractFontFamilies };

const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc"]);
const MAX_DIRECTORY_DEPTH = 8;
const MAX_FONT_FILES = 20_000;
const MAX_FONT_FILE_SIZE = 64 * 1024 * 1024;

export function getDefaultFontDirectories(
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const home =
    environment.HOME ?? environment.USERPROFILE ?? os.homedir();
  if (platform === "win32") {
    const windows = environment.WINDIR ?? "C:\\Windows";
    const directories = [path.win32.join(windows, "Fonts")];
    if (environment.LOCALAPPDATA)
      directories.push(
        path.win32.join(
          environment.LOCALAPPDATA,
          "Microsoft",
          "Windows",
          "Fonts",
        ),
      );
    return directories;
  }
  if (platform === "darwin")
    return [
      "/System/Library/Fonts",
      "/Library/Fonts",
      path.posix.join(home, "Library", "Fonts"),
    ];
  return [
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    path.posix.join(environment.XDG_DATA_HOME ?? path.posix.join(home, ".local", "share"), "fonts"),
    path.posix.join(home, ".fonts"),
  ];
}

export async function scanFontFamilies(
  directories: readonly string[],
): Promise<string[]> {
  const pending = directories.map((directory) => ({ directory, depth: 0 }));
  const files: string[] = [];
  while (pending.length && files.length < MAX_FONT_FILES) {
    const current = pending.pop()!;
    let entries;
    try {
      entries = await readdir(current.directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FONT_FILES) break;
      const fullPath = path.join(current.directory, entry.name);
      if (entry.isDirectory() && current.depth < MAX_DIRECTORY_DEPTH)
        pending.push({ directory: fullPath, depth: current.depth + 1 });
      else if (
        entry.isFile() &&
        FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      )
        files.push(fullPath);
    }
  }

  const families = new Set<string>();
  for (let offset = 0; offset < files.length; offset += 24) {
    const batch = files.slice(offset, offset + 24);
    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          if ((await stat(file)).size > MAX_FONT_FILE_SIZE) return [];
          return extractFontFamilies(await readFile(file));
        } catch {
          return [];
        }
      }),
    );
    for (const result of results)
      for (const family of result) families.add(family);
  }

  return [...families].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}
