import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPicoStoryApk,
  picoSiteVersion,
} from "../src/daemon/publish/pico-apk.js";

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("PICO APK builder", () => {
  it("changes the installed-site version when player files change without a manifest change", async () => {
    const site = await temporary("puteng-pico-site-version-");
    await mkdir(path.join(site, "assets"), { recursive: true });
    await writeFile(path.join(site, "manifest.json"), '{"version":1}\n');
    await writeFile(path.join(site, "index.html"), "<script src='./player.js'></script>");
    await writeFile(path.join(site, "player.js"), "const build = 1;");

    const first = await picoSiteVersion(site);
    await writeFile(path.join(site, "player.js"), "const build = 2;");
    const second = await picoSiteVersion(site);

    expect(second).not.toBe(first);
  });

  it("creates a package project, includes the playable site, and returns the APK artifact", async () => {
    const root = await temporary("puteng-pico-apk-test-");
    const sdk = path.join(root, "sdk");
    const site = path.join(root, "site");
    const gradleRoot = path.join(root, "gradle");
    await Promise.all([
      mkdir(path.join(sdk, "platforms", "android-34"), { recursive: true }),
      mkdir(path.join(sdk, "build-tools", "36.0.0"), { recursive: true }),
      mkdir(site, { recursive: true }),
      mkdir(path.join(gradleRoot, "bin"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(sdk, "platforms", "android-34", "android.jar"), "sdk"),
      writeFile(path.join(sdk, "build-tools", "36.0.0", process.platform === "win32" ? "aapt2.exe" : "aapt2"), "sdk"),
      writeFile(path.join(site, "index.html"), "story player"),
      writeFile(path.join(site, "manifest.json"), "{\"version\":1}\n"),
    ]);
    const gradle = path.join(gradleRoot, "bin", process.platform === "win32" ? "gradle.bat" : "gradle");
    const apkOutput = path.join("app", "build", "outputs", "apk", "debug", "app-debug.apk");
    if (process.platform === "win32") {
      await writeFile(gradle, `@echo off\r\nif not exist "app\\build\\outputs\\apk\\debug" mkdir "app\\build\\outputs\\apk\\debug"\r\n> "${apkOutput}" echo test-apk\r\n`);
    } else {
      await writeFile(gradle, `#!/bin/sh\nmkdir -p app/build/outputs/apk/debug\nprintf test-apk > app/build/outputs/apk/debug/app-debug.apk\n`);
      await chmod(gradle, 0o755);
    }
    vi.stubEnv("ANDROID_HOME", sdk);
    vi.stubEnv("ANDROID_SDK_ROOT", "");
    vi.stubEnv("LOCALAPPDATA", root);
    await mkdir(path.join(root, "puteng-game", "gradle-8.2.1", "bin"), { recursive: true });
    await rm(path.join(root, "puteng-game", "gradle-8.2.1"), { recursive: true, force: true });
    const bundledGradle = path.join(root, "puteng-game", "gradle-8.2.1", "bin", process.platform === "win32" ? "gradle.bat" : "gradle");
    await mkdir(path.dirname(bundledGradle), { recursive: true });
    await writeFile(bundledGradle, await readFile(gradle));
    if (process.platform !== "win32") await chmod(bundledGradle, 0o755);

    const apk = await buildPicoStoryApk(site, "A Story", "project-123");

    expect(apk.toString()).toContain("test-apk");
  });
});

async function temporary(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
