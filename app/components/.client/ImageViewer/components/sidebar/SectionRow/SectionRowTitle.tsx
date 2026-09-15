import { Input, TruncatedText } from "@cytario/design";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";

export interface SectionRowTitleHandle {
  startRename: () => void;
}

interface SectionRowTitleProps {
  title: string;
  /** Rename commit; only fired when the new name is non-empty and different. */
  onRename?: (next: string) => void;
}

/** Title cell: truncated name at rest, inline input on double-click or the ref's `startRename`. */
export const SectionRowTitle = forwardRef<SectionRowTitleHandle, SectionRowTitleProps>(
  function SectionRowTitle({ title, onRename }, ref) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(title);
    const settled = useRef(false);

    const startEdit = () => {
      if (!onRename) return;
      settled.current = false;
      setDraft(title);
      setEditing(true);
    };

    useImperativeHandle(ref, () => ({ startRename: startEdit }));

    const settle = (fn: () => void) => {
      if (settled.current) return;
      settled.current = true;
      fn();
    };

    const commit = () =>
      settle(() => {
        setEditing(false);
        const next = draft.trim();
        if (next && next !== title) onRename?.(next);
      });
    const cancel = () => settle(() => setEditing(false));

    return (
      <span
        className="min-w-0 flex-1"
        onDoubleClick={
          onRename
            ? (e) => {
                e.stopPropagation();
                startEdit();
              }
            : undefined
        }
      >
        {editing ? (
          <Input
            size="xs"
            aria-label={`Rename ${title}`}
            value={draft}
            onChange={setDraft}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") cancel();
            }}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        ) : (
          <TruncatedText>{title}</TruncatedText>
        )}
      </span>
    );
  },
);
