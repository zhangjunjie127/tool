import { useState, type FormEvent } from "react";
import type { PlayableAffectionConfig } from "../shared/playable-affection.js";
import { Plus, Trash2 } from "./icons.js";
import { ProjectSettingsDialogFrame } from "./project-settings-dialog.js";
import { translateText } from "./i18n.js";

export function PlayableAffectionDialog({
  config,
  busy,
  onSave,
  onClose,
}: {
  config: PlayableAffectionConfig;
  busy: boolean;
  onSave: (config: PlayableAffectionConfig) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(config));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const updateCharacter = (index: number, patch: Partial<PlayableAffectionConfig["characters"][number]>) =>
    setDraft((current) => ({
      ...current,
      characters: current.characters.map((character, position) =>
        position === index ? { ...character, ...patch } : character,
      ),
    }));
  const updateChoice = (index: number, patch: Partial<PlayableAffectionConfig["choices"][number]>) =>
    setDraft((current) => ({
      ...current,
      choices: current.choices.map((choice, position) =>
        position === index ? { ...choice, ...patch } : choice,
      ),
    }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || busy) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSave(draft);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  }

  return (
    <ProjectSettingsDialogFrame title={translateText("Affection settings")} busy={saving || busy} onClose={onClose}>
      <form className="playable-affection-form" onSubmit={(event) => void submit(event)}>
        <p className="project-settings-hint">{translateText("These settings are for authors. Players only see the affection display and story choices.")}</p>
        <section className="project-settings-section">
          <div className="project-settings-section-heading">
            <strong>{translateText("Characters and starting affection")}</strong>
            <button
              className="icon-button"
              type="button"
              title={translateText("Add character")}
              aria-label={translateText("Add character")}
              onClick={() => {
                let index = draft.characters.length + 1;
                while (draft.characters.some((character) => character.id === `affection_${index}`)) index += 1;
                const id = `affection_${index}`;
                setDraft((current) => ({
                  ...current,
                  characters: [...current.characters, { id, name: `Character ${index}`, initial: 0 }],
                }));
              }}
            ><Plus size={14} /></button>
          </div>
          {draft.characters.map((character, index) => (
            <div className="playable-affection-row" key={character.id}>
              <label>
                <span>{translateText("Character name")}</span>
                <input value={character.name} maxLength={40} onChange={(event) => updateCharacter(index, { name: event.target.value })} />
              </label>
              <label>
                <span>{translateText("Starting value")}</span>
                <input type="number" min="0" max="10" step="1" value={character.initial} onChange={(event) => updateCharacter(index, { initial: Number(event.target.value) })} />
              </label>
              <button
                className="icon-button is-danger"
                type="button"
                title={translateText("Remove character")}
                aria-label={translateText("Remove character")}
                disabled={draft.characters.length < 2 || draft.choices.every((choice) => choice.characterId === character.id)}
                onClick={() => setDraft((current) => ({
                  ...current,
                  characters: current.characters.filter((item) => item.id !== character.id),
                  choices: current.choices.filter((choice) => choice.characterId !== character.id),
                }))}
              ><Trash2 size={14} /></button>
            </div>
          ))}
        </section>
        <section className="project-settings-section">
          <div className="project-settings-section-heading">
            <strong>{translateText("Choice changes and branch thresholds")}</strong>
            <button
              className="icon-button"
              type="button"
              title={translateText("Add choice")}
              aria-label={translateText("Add choice")}
              disabled={!draft.characters.length}
              onClick={() => {
                let index = draft.choices.length + 1;
                while (draft.choices.some((choice) => choice.id === `choice_${index}`)) index += 1;
                const id = `choice_${index}`;
                setDraft((current) => ({
                  ...current,
                  choices: [...current.choices, {
                    id,
                    label: `Choice ${index}`,
                    characterId: current.characters[0]!.id,
                    delta: 1,
                    threshold: 2,
                    successSignal: `${id}_met`,
                    fallbackSignal: `${id}_below`,
                  }],
                }));
              }}
            ><Plus size={14} /></button>
          </div>
          {draft.choices.map((choice, index) => (
            <div className="playable-affection-choice" key={choice.id}>
              <label>
                  <span>{translateText("Choice text")}</span>
                <input value={choice.label} maxLength={100} onChange={(event) => updateChoice(index, { label: event.target.value })} />
              </label>
              <label>
                  <span>{translateText("Character")}</span>
                <select value={choice.characterId} onChange={(event) => updateChoice(index, { characterId: event.target.value })}>
                  {draft.characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
                </select>
              </label>
              <div className="playable-affection-numbers">
                <label>
                  <span>{translateText("Change")}</span>
                  <input type="number" min="-10" max="10" step="1" value={choice.delta} onChange={(event) => updateChoice(index, { delta: Number(event.target.value) })} />
                </label>
                <label>
                  <span>{translateText("Threshold")}</span>
                  <input type="number" min="0" max="10" step="1" value={choice.threshold} onChange={(event) => updateChoice(index, { threshold: Number(event.target.value) })} />
                </label>
                <button
                  className="icon-button is-danger"
                  type="button"
                  title={translateText("Remove choice")}
                  aria-label={translateText("Remove choice")}
                  disabled={draft.choices.length < 2}
                  onClick={() => setDraft((current) => ({ ...current, choices: current.choices.filter((item) => item.id !== choice.id) }))}
                ><Trash2 size={14} /></button>
              </div>
              <div className="playable-affection-numbers">
                <label>
                  <span>{translateText("Met threshold exit")}</span>
                  <input value={choice.successSignal} maxLength={50} onChange={(event) => updateChoice(index, { successSignal: event.target.value })} />
                </label>
                <label>
                  <span>{translateText("Below threshold exit")}</span>
                  <input value={choice.fallbackSignal} maxLength={50} onChange={(event) => updateChoice(index, { fallbackSignal: event.target.value })} />
                </label>
              </div>
            </div>
          ))}
        </section>
        {error ? <p className="project-settings-error" role="alert">{error}</p> : null}
        <footer>
          <button type="button" disabled={saving || busy} onClick={onClose}>{translateText("Cancel")}</button>
          <button className="project-settings-submit" type="submit" disabled={saving || busy}>{translateText("Save")}</button>
        </footer>
      </form>
    </ProjectSettingsDialogFrame>
  );
}
