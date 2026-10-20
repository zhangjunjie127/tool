import i18next, { type ParseKeys } from "i18next";
import { createElement, Fragment, type ReactNode } from "react";
import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";

export type UiLanguage = "en" | "zh-CN";
export type LanguagePreference = UiLanguage;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}

const LANGUAGE_STORAGE_KEY = "ohmygame:language";

export function readLanguagePreference(): LanguagePreference {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === "en" ? "en" : "zh-CN";
  } catch {
    return "zh-CN";
  }
}

/** Saves the preference and reloads, so every screen renders in the new language. */
export function setLanguagePreference(preference: LanguagePreference): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
  } catch {
    return;
  }
  window.location.reload();
}

export function resolveLanguage(preference: LanguagePreference): UiLanguage {
  return preference;
}

/** Fixed for the page lifetime; module-level labels may call `t` at import time. */
export const language = resolveLanguage(readLanguagePreference());

void i18next.init({
  lng: language,
  fallbackLng: "en",
  resources: { en: { translation: en }, "zh-CN": { translation: zhCN } },
  interpolation: { escapeValue: false },
  initAsync: false,
});

// English sentences sometimes reuse a capitalized label mid-sentence, such as "Add {{slot, lowercase}}".
i18next.services.formatter?.add("lowercase", (value: unknown) =>
  String(value).toLowerCase(),
);

if (typeof document !== "undefined") document.documentElement.lang = language;

export const t = i18next.t;

const englishTextKeys = new Map<string, string>();

function indexEnglishText(value: unknown, path: string[] = []): void {
  if (typeof value === "string") {
    englishTextKeys.set(value, path.join("."));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    indexEnglishText(child, [...path, key]);
  }
}

indexEnglishText(en);
export function readLanguage(): UiLanguage {
  return language;
}

export function useLanguage(): { language: UiLanguage } {
  return { language };
}

export function translateText(
  value: string,
  selectedLanguage: UiLanguage = language,
): string {
  const key = englishTextKeys.get(value);
  return i18next.t(
    key ?? value,
    { lng: selectedLanguage, defaultValue: value },
  );
}

/** Translates a message whose `{{placeholders}}` are React nodes, such as a bold project name. */
export function tNodes(
  key: ParseKeys,
  nodes: Record<string, ReactNode>,
): ReactNode {
  const message = String(
    i18next.getResource(language, "translation", key) ??
      i18next.getResource("en", "translation", key) ??
      key,
  );
  return createElement(
    Fragment,
    null,
    ...message
      .split(/\{\{(\w+)\}\}/)
      .map((part, index) => (index % 2 ? nodes[part] : part)),
  );
}
