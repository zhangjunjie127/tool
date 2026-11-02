import { expect, it } from "vitest";
import {
  cssFontFamilyName,
  extractFontFamilies,
} from "../src/shared/playable-fonts.js";

function createTrueTypeFont(family: string): Uint8Array {
  const encodedName = new Uint8Array(family.length * 2);
  const encodedView = new DataView(encodedName.buffer);
  for (let index = 0; index < family.length; index += 1)
    encodedView.setUint16(index * 2, family.charCodeAt(index));

  const nameTable = new Uint8Array(18 + encodedName.length);
  const nameView = new DataView(nameTable.buffer);
  nameView.setUint16(2, 1);
  nameView.setUint16(4, 18);
  nameView.setUint16(6, 3);
  nameView.setUint16(8, 1);
  nameView.setUint16(10, 0x0409);
  nameView.setUint16(12, 1);
  nameView.setUint16(14, encodedName.length);
  nameTable.set(encodedName, 18);

  const font = new Uint8Array(28 + nameTable.length);
  const fontView = new DataView(font.buffer);
  fontView.setUint32(0, 0x00010000);
  fontView.setUint16(4, 1);
  font.set(new TextEncoder().encode("name"), 12);
  fontView.setUint32(20, 28);
  fontView.setUint32(24, nameTable.length);
  font.set(nameTable, 28);
  return font;
}

it("reads TrueType family names from browser-compatible byte arrays", () => {
  expect(extractFontFamilies(createTrueTypeFont("Example UI"))).toEqual([
    "Example UI",
  ]);
  expect(extractFontFamilies(new Uint8Array([0, 1, 2]))).toEqual([]);
});

it("quotes font-family names for CSS without allowing declaration injection", () => {
  expect(cssFontFamilyName('Font "Name"; color: red')).toBe(
    '"Font \\"Name\\"; color: red"',
  );
  expect(cssFontFamilyName("Font\nName")).toBe('"FontName"');
});
