import { useState, type FormEvent } from "react";
import type { ProjectState } from "../shared/contracts.js";
import type { NodeGraph } from "../shared/playable-nodes.js";
import type { PlayableBackdropEffects } from "../shared/playable-backdrop-effects.js";
import {
  canvasFormatForViewport,
  canvasFormatPreset,
  canvasFormatSummary,
  type CanvasFormatPresetId,
  type Viewport,
} from "../shared/canvas-formats.js";
import { formatStateValue } from "../shared/playable-debug.js";
import { describePlayableValue } from "../shared/playable-editor.js";
import { CanvasFormatOptions } from "./canvas-format-options.js";
import { ChevronDown, Download, LoaderCircle } from "./icons.js";
import { ProjectSettingsDialogFrame } from "./project-settings-dialog.js";
import { t, translateText } from "./i18n.js";
import type { InteractiveStoryExportFormat } from "./api.js";

const variablesHelp = translateText(
  "What the game remembers between Scenes. Ask the AI to add or change these values.",
);

export function PlayableProjectSettingsDialog({
  project,
  graph,
  backdropEffects,
  exporting,
  canExport,
  onSave,
  onExport,
  onClose,
}: {
  project: ProjectState;
  graph: NodeGraph;
  backdropEffects: PlayableBackdropEffects;
  exporting: boolean;
  canExport: boolean;
  onSave: (
    viewport: Viewport,
    effects: PlayableBackdropEffects,
  ) => Promise<void>;
  onExport: (format: InteractiveStoryExportFormat) => Promise<void>;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState<CanvasFormatPresetId | undefined>(
    () => canvasFormatForViewport(graph.viewport)?.id,
  );
  const [effects, setEffects] = useState(backdropEffects);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [exportFormat, setExportFormat] =
    useState<InteractiveStoryExportFormat>("playable");
  const viewport = selection
    ? canvasFormatPreset(selection).viewport
    : graph.viewport;
  const viewportChanged =
    viewport.width !== graph.viewport.width ||
    viewport.height !== graph.viewport.height;
  const changed =
    viewportChanged ||
    effects.vignette !== backdropEffects.vignette ||
    effects.grain !== backdropEffects.grain;
  const names = Object.keys(graph.initialState);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (saving || exporting) return;
    setSaving(true);
    setError(undefined);
    try {
      if (changed) await onSave(viewport, effects);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  }

  async function exportProject(): Promise<void> {
    setError(undefined);
    try {
      await onExport(exportFormat);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <ProjectSettingsDialogFrame busy={saving || exporting} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        <section className="project-settings-project" aria-label={translateText("Project")}>
          <span>{translateText("Project")}</span>
          <strong title={project.name}>{project.name}</strong>
        </section>
        <fieldset
          className="project-settings-section"
          disabled={saving || exporting}
        >
          <legend>{translateText("Screen size")}</legend>
          <p className="project-settings-hint">
            {canvasFormatSummary(viewport)}
          </p>
          <CanvasFormatOptions
            value={selection}
            disabled={saving || exporting}
            onChange={setSelection}
          />
          {viewportChanged && graph.nodes.length > 0 ? (
            <p className="project-settings-hint">
              {translateText("Review each Scene after changing screen size.")}
            </p>
          ) : null}
        </fieldset>
        <fieldset
          className="project-settings-section playable-backdrop-effects"
          aria-label={translateText("Background appearance")}
          disabled={saving || exporting}
        >
          <legend>{translateText("Background appearance")}</legend>
          <div className="playable-backdrop-options">
            <label className="playable-backdrop-option">
              <input
                type="checkbox"
                checked={effects.vignette}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setEffects((current) => ({
                    ...current,
                    vignette: checked,
                  }));
                }}
              />
              <span>{translateText("Vignette")}</span>
            </label>
            <label className="playable-backdrop-option">
              <input
                type="checkbox"
                checked={effects.grain}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setEffects((current) => ({
                    ...current,
                    grain: checked,
                  }));
                }}
              />
              <span>{translateText("Grain texture")}</span>
            </label>
          </div>
        </fieldset>
        <details className="project-settings-fold playable-variables-fold">
          <summary>
            <span>{translateText("Variables")}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className="project-settings-section playable-variables-content">
            <p className="project-settings-hint">{variablesHelp}</p>
            {names.length ? (
              <ul className="playable-variables" aria-label={translateText("Variables")}>
                {names.map((name) => (
                  <li key={name}>
                    <div className="playable-variables-head">
                      <strong>{name}</strong>
                      <span title={formatStateValue(graph.initialState[name])}>
                        {translateText("Starts")}{" "}
                        {describePlayableValue(graph.initialState[name]!)}
                      </span>
                    </div>
                    {graph.variables?.[name] ? (
                      <p>{graph.variables[name]}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="playable-variables-empty">
                {translateText("Nothing yet. The game doesn't remember anything between Scenes.")}
              </p>
            )}
          </div>
        </details>
        <fieldset className="project-settings-section">
          <legend>{translateText("Export")}</legend>
          <div
            className="project-settings-export-formats"
            role="radiogroup"
            aria-label={t("storySettings.exportFormat")}
          >
            {([
              ["playable", "storySettings.exportPlayable", "storySettings.exportPlayableHint"],
              ["editable", "storySettings.exportEditable", "storySettings.exportEditableHint"],
              ["pico-web", "storySettings.exportPico", "storySettings.exportPicoHint"],
              ["pico-apk", "storySettings.exportPicoApk", "storySettings.exportPicoApkHint"],
            ] as const).map(([format, title, description]) => (
              <label className="project-settings-export-format" key={format}>
                <input
                  type="radio"
                  name="playable-export-format"
                  value={format}
                  checked={exportFormat === format}
                  disabled={saving || exporting}
                  onChange={() => setExportFormat(format)}
                />
                <span>
                  <strong>{t(title)}</strong>
                  <small>{t(description)}</small>
                </span>
              </label>
            ))}
          </div>
          {exportFormat === "pico-web" || exportFormat === "pico-apk" ? (
            <p className="project-settings-hint project-settings-export-notice">
              {t(exportFormat === "pico-web" ? "storySettings.exportPicoRequirement" : "storySettings.exportPicoApkRequirement")}
            </p>
          ) : null}
          {changed ? (
            <p className="project-settings-hint">
              {translateText("Save project setting changes before exporting.")}
            </p>
          ) : null}
          <button
            className="project-settings-browser"
            type="button"
            disabled={!canExport || saving || exporting || changed}
            onClick={() => void exportProject()}
          >
            {exporting ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <Download size={14} />
            )}
            {t(exporting ? "storySettings.exporting" : "storySettings.exportSelected")}
          </button>
        </fieldset>
        {error ? (
          <p className="project-settings-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer>
          <button
            type="button"
            disabled={saving || exporting}
            onClick={onClose}
          >
          {translateText("Cancel")}
          </button>
          <button
            className="project-settings-submit"
            type="submit"
            disabled={saving || exporting}
          >
            {saving ? <LoaderCircle className="spin" size={14} /> : null}
            {translateText("Save")}
          </button>
        </footer>
      </form>
    </ProjectSettingsDialogFrame>
  );
}
