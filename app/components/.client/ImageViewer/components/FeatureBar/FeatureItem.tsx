import { FeatureItemStoreProvider, useFeatureItemStore } from "./useFeatureBar";
import { Icon, IconButton } from "~/components/Controls/IconButton";
import { Input } from "~/components/Controls/Input";

interface FeatureItemProps {
  title: string;
  header?: React.ReactNode;
  children: React.ReactNode;
  sliderValue?: number;
  onSliderChange?: (value: number) => void;
  toggleValue?: boolean;
  onToggleChange?: (value: boolean) => void;
  toggleIcon?: "Circle" | "CircleDot";
  toggleHidden?: boolean;
}

function FeatureItemInner({
  title,
  header,
  children,
  sliderValue,
  onSliderChange,
  toggleValue,
  onToggleChange,
  toggleIcon = "CircleDot",
  toggleHidden = false,
}: FeatureItemProps) {
  const isOpen = useFeatureItemStore((s) => s.isOpen);
  const setIsOpen = useFeatureItemStore((s) => s.setIsOpen);

  return (
    <div
      className={`
        flex flex-col w-full
        bg-slate-800 text-slate-300
        border-b border-slate-950
      `}
    >
      <div className="z-10 sticky top-0 left-0 bg-slate-900">
        <header
          className={`
            flex-grow flex items-center h-14
            border-b border-b-slate-950
            border-t border-t-slate-800
            bg-slate-900 hover:bg-slate-800 
            transition-colors
            pr-2
          `}
        >
          <button
            className={`
              flex flex-grow items-center
              px-2 py-2 gap-2
              h-full
              font-semibold
            `}
            onClick={() => setIsOpen(!isOpen)}
          >
            <Icon icon={isOpen ? "ChevronsUp" : "ChevronsDown"} />
            {title}
          </button>

          {onToggleChange && !toggleHidden && (
            <IconButton
              icon={toggleValue ? toggleIcon : "Circle"}
              label={toggleValue ? "Hide outlines" : "Show outlines"}
              onClick={() => onToggleChange(!toggleValue)}
              theme="transparent"
              className={`border-none ${toggleValue ? "stroke-white" : "stroke-slate-500"}`}
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
