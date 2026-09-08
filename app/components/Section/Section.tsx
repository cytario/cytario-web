import { Badge, Icon } from "@cytario/design";
import { twMerge } from "tailwind-merge";

import { SectionStoreProvider, useSectionStore } from "./useSection";
import { PILLARS, type PillarId } from "~/utils/pillars";

interface SectionProps {
  pillar: PillarId;
  badge?: string;
  actions?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
}

function SectionInner({ pillar, badge, actions, header, children }: SectionProps) {
  const { title, icon } = PILLARS[pillar];
  const isOpen = useSectionStore((s) => s.isOpen);
  const setIsOpen = useSectionStore((s) => s.setIsOpen);

  return (
    <div className="flex flex-col w-full bg-card text-muted-foreground">
      <header className="z-10 sticky top-0 left-0">
        {/* Header Bar */}
        <div
          className={`
            border-t border-t-accent
            flex grow
            transition-colors
            bg-background
            hover:text-foreground
             overflow-hidden
          `}
        >
          <button
            data-expander
            className={twMerge(
              `
              cursor-pointer
              flex items-center grow
              h-12 gap-1 px-2
              hover:text-foreground
              transition-colors
            `,
              isOpen && "text-foreground",
            )}
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? (
              <Icon icon="ChevronDown" size="xs" />
            ) : (
              <Icon icon="ChevronRight" size="xs" />
            )}

            <Icon icon={icon} size="xs" />

            {title}
          </button>

          {/* Header Actions */}
          <div className="flex items-center gap-2 px-2">
            {badge && <Badge>{badge}</Badge>}
            {actions}
          </div>
        </div>

        {/* Sticky content via props, e.g. Histogram */}
        {isOpen && <div className="bg-background">{header}</div>}
      </header>

      {isOpen && <div className="bg-card">{children}</div>}
    </div>
  );
}

export function Section(props: SectionProps) {
  return (
    <SectionStoreProvider pillarId={props.pillar}>
      <SectionInner {...props} />
    </SectionStoreProvider>
  );
}
