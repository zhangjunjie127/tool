import { useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Pointer capture keeps pane drags working over canvases and embedded previews. */
export function PanelResizeHandle({
  label,
  className = "",
  value,
  minimum,
  maximum,
  reversed = false,
  onChange,
  onReset,
}: {
  label: string;
  className?: string;
  value: number;
  minimum: number;
  maximum: number;
  reversed?: boolean;
  onChange: (width: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const clamp = (width: number) =>
    Math.round(Math.max(minimum, Math.min(maximum, width)));
  const finish = () => {
    drag.current = null;
    setResizing(false);
  };

  return (
    <>
      <div
        className={`panel-resize-handle ${className}${resizing ? " is-resizing" : ""}`}
        role="separator"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={Math.round(value)}
        tabIndex={0}
        title={label}
        onDoubleClick={onReset}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const direction =
            (event.key === "ArrowRight" ? 1 : -1) * (reversed ? -1 : 1);
          onChange(clamp(value + direction * 16));
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, width: value };
          setResizing(true);
        }}
        onPointerMove={(event) => {
          if (
            !drag.current ||
            !event.currentTarget.hasPointerCapture(event.pointerId)
          )
            return;
          onChange(
            clamp(
              drag.current.width +
                (event.clientX - drag.current.x) * (reversed ? -1 : 1),
            ),
          );
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          finish();
        }}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
      />
      {resizing
        ? createPortal(
            <div className="workspace-resize-shield" />,
            document.body,
          )
        : null}
    </>
  );
}
