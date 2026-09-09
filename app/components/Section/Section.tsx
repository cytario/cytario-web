import { Icon } from "@cytario/design";

import { SectionHeaderRow } from "./SectionHeaderRow";
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
        <SectionHeaderRow
          icon={icon}
          title={title}
          badge={badge}
          actions={actions}
          onClick={() => setIsOpen(!isOpen)}
          selected={isOpen}
          ariaExpanded={isOpen}
          chevronSlot={<Icon icon={isOpen ? "ChevronDown" : "ChevronRight"} size="xs" />}
        />

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
