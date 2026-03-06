import { IconButton } from "@cytario/design";
import { ChevronDown, ChevronRight, Circle, CircleDot, type LucideIcon } from "lucide-react";

import { FeatureItemStoreProvider, useFeatureItemStore } from "./useFeatureBar";
import { Input } from "~/components/Controls";

interface FeatureItemProps {
  title: string;
  /** Displayed next to the title, e.g. "4/12" for channel counts */
  badge?: string;
  header?: React.ReactNode;
  children: React.ReactNode;
  sliderValue?: number;
  onSliderChange?: (value: number) => void;
  toggleValue?: boolean;
  onToggleChange?: (value: boolean) => void;
  toggleIcon?: LucideIcon;
  toggleHidden?: boolean;
}

function FeatureItemInner({
  title,
  badge,
  header,
  children,
  sliderValue,
  onSliderChange,
  toggleValue,
  onToggleChange,
  toggleIcon = CircleDot,
  toggleHidden = false,
}: FeatureItemProps) {
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

          {badge && (
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {badge}
            </span>
          )}

          {onToggleChange && !toggleHidden && (
            <IconButton
              icon={toggleValue ? toggleIcon : Circle}
              aria-label={toggleValue ? "Hide outlines" : "Show outlines"}
              onPress={() => onToggleChange(!toggleValue)}
              variant="ghost"
              size="sm"
              className={`border-none ${toggleValue ? "stroke-[var(--color-text-primary)]" : "stroke-[var(--color-text-tertiary)]"}`}
            />
          )}

          {onSliderChange && (
            <Input
              type="range"
              min={0}
              max={100}
              className="w-20 h-4"
              value={Math.round((sliderValue ?? 0.8) * 100)}
              onChange={(e) => onSliderChange(Number(e.target.value) / 100)}
            />
          )}
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
    <FeatureItemStoreProvider name={props.title}>
      <FeatureItemInner {...props} />
    </FeatureItemStoreProvider>
  );
}
