import { describe, expect, it } from "vitest";
import {
  language,
  resolveLanguage,
  t,
  translateText,
} from "../src/renderer/i18n.js";
import en from "../src/renderer/locales/en.js";
import zhCN from "../src/renderer/locales/zh-CN.js";

type Messages = { [key: string]: string | Messages };

function flatten(messages: Messages, prefix = ""): Map<string, string> {
  return new Map(
    Object.entries(messages).flatMap(([key, value]) =>
      typeof value === "string"
        ? [[`${prefix}${key}`, value] as const]
        : [...flatten(value, `${prefix}${key}.`)],
    ),
  );
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{\{\s*(\w+)/g)]
    .map((match) => match[1]!)
    .sort();
}

describe("UI translations", () => {
  const english = flatten(en);
  const chinese = flatten(zhCN);

  it("translates every English message into Simplified Chinese", () => {
    expect([...chinese.keys()].sort()).toEqual([...english.keys()].sort());
    expect([...chinese].filter(([, message]) => !message.trim())).toEqual([]);
  });

  it("keeps the same placeholders in both languages", () => {
    const mismatched = [...english].filter(
      ([key, message]) =>
        placeholders(message).join() !==
        placeholders(chinese.get(key) ?? "").join(),
    );
    expect(mismatched).toEqual([]);
  });
});

describe("language preference", () => {
  it("defaults to Simplified Chinese and supports an explicit English choice", () => {
    expect(language).toBe("zh-CN");
    expect(resolveLanguage("en")).toBe("en");
    expect(resolveLanguage("zh-CN")).toBe("zh-CN");
  });
});

describe("t", () => {
  it("lowercases a label reused mid-sentence in English", () => {
    expect(t("assetCanvas.addSlot", { slot: "First frame", lng: "en" })).toBe(
      "Add first frame",
    );
  });

  it("translates playable workbench labels for the selected language", () => {
    expect(translateText("Tools", "zh-CN")).toBe("工具");
    expect(translateText("Scene settings", "zh-CN")).toBe("场景设置");
    expect(translateText("Play without input", "zh-CN")).toBe("无需操作播放");
    expect(translateText("Wait for input to play", "zh-CN")).toBe("等待操作播放");
    expect(translateText("Tools", "en")).toBe("Tools");
  });

  it("translates built-in Scene card labels without translating custom labels", () => {
    expect(translateText("Start", "zh-CN")).toBe("起始");
    expect(translateText("Story map", "zh-CN")).toBe("故事地图");
    expect(translateText("Start", "en")).toBe("Start");
    expect(translateText("Custom route", "zh-CN")).toBe("Custom route");
    expect(t("sceneCard.defaultNodeTitle", { number: "1", lng: "zh-CN" })).toBe("场景1");
    expect(t("sceneCard.defaultNodeTitle", { number: "1", lng: "en" })).toBe("Scene 1");
  });
});
