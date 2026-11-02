import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  getDefaultFontDirectories,
  scanFontFamilies,
} from "../src/desktop/system-fonts.js";

function createTrueTypeFont(family: string): Buffer {
  const encodedName = Buffer.alloc(family.length * 2);
  for (let index = 0; index < family.length; index += 1)
    encodedName.writeUInt16BE(family.charCodeAt(index), index * 2);

  const nameTable = Buffer.alloc(18 + encodedName.length);
  nameTable.writeUInt16BE(0, 0);
  nameTable.writeUInt16BE(1, 2);
  nameTable.writeUInt16BE(18, 4);
  nameTable.writeUInt16BE(3, 6);
  nameTable.writeUInt16BE(1, 8);
  nameTable.writeUInt16BE(0x0409, 10);
  nameTable.writeUInt16BE(1, 12);
  nameTable.writeUInt16BE(encodedName.length, 14);
  nameTable.writeUInt16BE(0, 16);
  encodedName.copy(nameTable, 18);

  const font = Buffer.alloc(28 + nameTable.length);
  font.writeUInt32BE(0x00010000, 0);
  font.writeUInt16BE(1, 4);
  font.write("name", 12, "ascii");
  font.writeUInt32BE(28, 20);
  font.writeUInt32BE(nameTable.length, 24);
  nameTable.copy(font, 28);
  return font;
}

it("scans nested TrueType font files and returns unique family names", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ohmygame-fonts-"));
  try {
    const nested = path.join(directory, "nested");
    await mkdir(nested);
    await writeFile(path.join(directory, "regular.ttf"), createTrueTypeFont("Example UI"));
    await writeFile(path.join(nested, "bold.otf"), createTrueTypeFont("Example UI"));
    await writeFile(path.join(nested, "notes.txt"), "not a font");

    await expect(scanFontFamilies([directory])).resolves.toEqual(["Example UI"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("uses platform system font folders as the default scan locations", () => {
  expect(
    getDefaultFontDirectories("win32", {
      WINDIR: "C:\\Windows",
      LOCALAPPDATA: "C:\\Users\\A\\AppData\\Local",
    }),
  ).toEqual([
    "C:\\Windows\\Fonts",
    "C:\\Users\\A\\AppData\\Local\\Microsoft\\Windows\\Fonts",
  ]);
  expect(
    getDefaultFontDirectories("darwin", {
      HOME: "/Users/alex",
    }),
  ).toEqual([
    "/System/Library/Fonts",
    "/Library/Fonts",
    "/Users/alex/Library/Fonts",
  ]);
});
