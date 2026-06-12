import { ChevronDown, ChevronRight } from "lucide-react";

import { FeatureItemStoreProvider, useFeatureItemStore } from "./useFeatureItem";

interface FeatureItemProps {
  title: string;
  /** Initial open state before any user interaction is persisted. */
  defaultOpen?: boolean;
  /** Displayed next to the title, e.g. "4/12" for channel counts */
  badge?: string;
  /** Controls rendered on the right side of the header row (sliders, toggles, …). */
  actions?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
}

function FeatureItemInner({ title, badge, actions, header, children }: FeatureItemProps) {
  const isOpen = useFeatureItemStore((s) => s.isOpen);
  const setIsOpen = useFeatureItemStore((s) => s.setIsOpen);

  return (
    <div className="flex flex-col w-full text-[var(--color-text-secondary)]">
      <div className="z-10 sticky top-0 left-0 bg-[var(--color-surface-default)]">
        {/* Section divider */}
        <div className="mx-3 h-px bg-[var(--color-border-default)]" />

        <header className="flex items-center gap-2 px-3 pt-3 pb-2">
          <button
            className="flex items-center gap-2 flex-grow text-left"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? (
              <ChevronDown size={14} className="text-[var(--color-text-secondary)] shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-[var(--color-text-secondary)] shrink-0" />
            )}
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              {title}
            </span>
          </button>

          {badge && <span className="text-xs text-[var(--color-text-tertiary)]">{badge}</span>}

          {actions}
        </header>

        {/* Sticky content via props, e.g. Histogram */}
        {isOpen && header}
      </div>
      {isOpen && children}
    </div>
  );
}

export function FeatureItem(props: FeatureItemProps) {
  return (
    <FeatureItemStoreProvider name={props.title} defaultOpen={props.defaultOpen}>
      <FeatureItemInner {...props} />
    </FeatureItemStoreProvider>
  );
}
