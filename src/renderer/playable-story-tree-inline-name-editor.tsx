import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil } from "./icons.js";

export function StoryTreeInlineNameEditor({
  value,
  displayValue = value,
  displayContent,
  displayClassName,
  displayTitle,
  displaySelected,
  onDisplayClick,
  afterDisplay,
  label,
  disabled,
  onSave,
}: {
  value: string;
  displayValue?: string;
  displayContent?: ReactNode;
  displayClassName?: string;
  displayTitle?: string;
  displaySelected?: boolean;
  onDisplayClick?: () => void;
  afterDisplay?: ReactNode;
  label: string;
  disabled: boolean;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayValue);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
      return;
    }
    setDraft(displayValue);
  }, [displayValue, editing]);

  function finish(commit: boolean): void {
    if (commit) {
      const next = draft.trim();
      if (next && next !== displayValue) onSave(next);
    }
    setEditing(false);
  }

  return (
    <span
      className={`story-tree-inline-name-editor${editing ? " is-editing" : ""}`}
    >
      {editing ? (
        <input
          ref={input}
          value={draft}
          aria-label={label}
          maxLength={240}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setDraft(displayValue);
              finish(false);
            }
          }}
          onBlur={() => finish(true)}
        />
      ) : (
        <>
          {onDisplayClick ? (
            <button
              type="button"
              className={displayClassName}
              title={displayTitle}
              aria-pressed={displaySelected}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDisplayClick();
              }}
            >
              {displayContent ?? displayValue}
            </button>
          ) : (
            <span className="story-tree-inline-name-display">
              {displayContent ?? displayValue}
            </span>
          )}
        </>
      )}
      {afterDisplay}
      {editing ? (
        <span
          className="story-tree-inline-name-edit-spacer"
          aria-hidden="true"
        />
      ) : (
        <button
          type="button"
          className="story-tree-inline-name-edit"
          title={label}
          aria-label={label}
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDraft(displayValue);
            setEditing(true);
          }}
        >
          <Pencil size={13} />
        </button>
      )}
    </span>
  );
}
