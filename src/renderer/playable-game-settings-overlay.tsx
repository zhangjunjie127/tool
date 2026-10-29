import { useEffect, useId, useRef, useState } from "react";
import type { PlayableGameSettings } from "../shared/playable-settings.js";
import { t } from "./i18n.js";
import { ArrowLeft, Diskette, RotateCcw, X } from "./icons.js";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function PlayableGameSettingsOverlay({
  settings,
  hasUnsavedChanges,
  saveStatus,
  onChange,
  onSave,
  onReset,
  onDiscard,
  onClose,
}: {
  settings: Readonly<PlayableGameSettings>;
  hasUnsavedChanges: boolean;
  saveStatus: SaveStatus;
  onChange: (patch: Partial<PlayableGameSettings>) => void;
  onSave: (closeAfterSave?: boolean) => void;
  onReset: () => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const requestCloseRef = useRef<() => void>(() => {});
  const requestClose = () => {
    if (hasUnsavedChanges) setConfirmExit(true);
    else onClose();
  };
  requestCloseRef.current = requestClose;

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = closeRef.current?.closest<HTMLElement>(
        "[data-playable-settings-dialog]",
      );
      const focusable = [
        ...(dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
        ) ?? []),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="playable-game-settings-backdrop"
      onClick={(event) => event.stopPropagation()}
    >
      <section
        className="playable-game-settings-dialog"
        data-playable-settings-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="playable-game-settings-header">
          <div>
            <h2 id={titleId}>{t("gameSettingsOverlay.title")}</h2>
            <p>{t("gameSettingsOverlay.description")}</p>
          </div>
          <button
            ref={closeRef}
            className="playable-game-settings-icon-button"
            type="button"
            aria-label={t("gameSettingsOverlay.close")}
            title={t("gameSettingsOverlay.close")}
            onClick={requestClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="playable-game-settings-content">
          <section>
            <h3>{t("gameSettingsOverlay.sound")}</h3>
            <RangeSetting
              label={t("gameSettingsOverlay.videoVolume")}
              value={settings.videoVolume}
              min={0}
              max={1}
              step={0.01}
              onChange={(videoVolume) => onChange({ videoVolume })}
            />
            <ToggleSetting
              label={t("gameSettingsOverlay.musicEnabled")}
              checked={settings.musicEnabled}
              onChange={(musicEnabled) => onChange({ musicEnabled })}
            />
            <RangeSetting
              label={t("gameSettingsOverlay.musicVolume")}
              value={settings.musicVolume}
              min={0}
              max={1}
              step={0.01}
              disabled={!settings.musicEnabled}
              onChange={(musicVolume) => onChange({ musicVolume })}
            />
            <ToggleSetting
              label={t("gameSettingsOverlay.uiSoundEnabled")}
              checked={settings.uiSoundEnabled}
              onChange={(uiSoundEnabled) => onChange({ uiSoundEnabled })}
            />
            <RangeSetting
              label={t("gameSettingsOverlay.uiSoundVolume")}
              value={settings.uiSoundVolume}
              min={0}
              max={1}
              step={0.01}
              disabled={!settings.uiSoundEnabled}
              onChange={(uiSoundVolume) => onChange({ uiSoundVolume })}
            />
          </section>

          <section>
            <h3>{t("gameSettingsOverlay.display")}</h3>
            <RangeSetting
              label={t("gameSettingsOverlay.brightness")}
              value={settings.brightness}
              min={50}
              max={150}
              step={1}
              valueText={`${Math.round(settings.brightness)}%`}
              onChange={(brightness) => onChange({ brightness })}
            />
            <SelectSetting
              label={t("gameSettingsOverlay.displayMode")}
              value={settings.displayMode}
              onChange={(displayMode) =>
                onChange({
                  displayMode: displayMode as PlayableGameSettings["displayMode"],
                })
              }
              options={[
                ["fullscreen", t("gameSettingsOverlay.fullscreen")],
                ["windowed", t("gameSettingsOverlay.windowed")],
              ]}
            />
            <SelectSetting
              label={t("gameSettingsOverlay.resolution")}
              value={settings.resolution}
              onChange={(resolution) =>
                onChange({
                  resolution: resolution as PlayableGameSettings["resolution"],
                })
              }
              options={[
                ["auto", t("gameSettingsOverlay.auto")],
                ["1280x720", "1280 × 720"],
                ["1920x1080", "1920 × 1080"],
                ["2560x1440", "2560 × 1440"],
              ]}
            />
          </section>

          <section>
            <h3>{t("gameSettingsOverlay.accessibility")}</h3>
            <ToggleSetting
              label={t("gameSettingsOverlay.subtitles")}
              checked={settings.subtitlesEnabled}
              onChange={(subtitlesEnabled) => onChange({ subtitlesEnabled })}
            />
            <RangeSetting
              label={t("gameSettingsOverlay.subtitleSize")}
              value={settings.subtitleFontSize}
              min={75}
              max={200}
              step={1}
              valueText={`${Math.round(settings.subtitleFontSize)}%`}
              disabled={!settings.subtitlesEnabled}
              onChange={(subtitleFontSize) => onChange({ subtitleFontSize })}
            />
            <ToggleSetting
              label={t("gameSettingsOverlay.messageHints")}
              checked={settings.messageHints}
              onChange={(messageHints) => onChange({ messageHints })}
            />
            <SelectSetting
              label={t("gameSettingsOverlay.language")}
              value={settings.language}
              onChange={(language) =>
                onChange({
                  language: language as PlayableGameSettings["language"],
                })
              }
              options={[
                ["zh-CN", t("gameSettingsOverlay.chinese")],
                ["en-US", t("gameSettingsOverlay.english")],
              ]}
            />
          </section>
        </div>

        {confirmExit ? (
          <section className="playable-game-settings-confirm" aria-live="polite">
            <strong>{t("gameSettingsOverlay.unsaved")}</strong>
            <p>{t("gameSettingsOverlay.saveBeforeReturn")}</p>
            <div>
              <button
                type="button"
                onClick={() => onSave(true)}
                disabled={saveStatus === "saving"}
              >
                {t("gameSettingsOverlay.saveAndReturn")}
              </button>
              <button type="button" onClick={onDiscard}>
                {t("gameSettingsOverlay.discardAndReturn")}
              </button>
              <button type="button" onClick={() => setConfirmExit(false)}>
                {t("gameSettingsOverlay.keepEditing")}
              </button>
            </div>
          </section>
        ) : null}

        <footer className="playable-game-settings-actions">
          <button
            className="playable-game-settings-secondary"
            type="button"
            onClick={requestClose}
          >
            <ArrowLeft size={16} />
            {t("gameSettingsOverlay.return")}
          </button>
          <button
            className="playable-game-settings-secondary"
            type="button"
            onClick={onReset}
          >
            <RotateCcw size={16} />
            {t("gameSettingsOverlay.reset")}
          </button>
          <span className="playable-game-settings-status" role="status">
            {saveStatus === "saving"
              ? t("gameSettingsOverlay.saving")
              : saveStatus === "saved"
                ? t("gameSettingsOverlay.saved")
                : saveStatus === "error"
                  ? t("gameSettingsOverlay.saveFailed")
                  : ""}
          </span>
          <button
            className="playable-game-settings-save"
            type="button"
            onClick={() => onSave()}
            disabled={saveStatus === "saving"}
          >
            <Diskette size={16} />
            {t("gameSettingsOverlay.save")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function RangeSetting({
  label,
  value,
  min,
  max,
  step,
  valueText = `${Math.round(value * 100)}%`,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueText?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <label className="playable-game-settings-range" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output>{valueText}</output>
    </label>
  );
}

function ToggleSetting({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label className="playable-game-settings-toggle" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

function SelectSetting({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <label className="playable-game-settings-select" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
