import { Badge, Icon } from "@cytario/design";

import { FeatureItemStoreProvider, useFeatureItemStore } from "./useFeatureItem";

interface FeatureItemProps {
  title: string;
  badge?: string;
  actions?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
}

function FeatureItemInner({ title, badge, actions, header, children }: FeatureItemProps) {
  const isOpen = useFeatureItemStore((s) => s.isOpen);
  const setIsOpen = useFeatureItemStore((s) => s.setIsOpen);

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
          `}
        >
          <button
            data-expander
            className={`
              cursor-pointer
              flex items-center grow
              h-12 gap-1 px-2
              hover:text-foreground
              transition-colors
            `}
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? (
              <Icon icon="ChevronDown" size="xs" />
            ) : (
              <Icon icon="ChevronRight" size="xs" />
            )}

            {title}
          </button>

          {/* Header Actions */}
          <div className="flex items-center gap-2 px-2">
            {badge && <Badge size="sm">{badge}</Badge>}
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

export function FeatureItem(props: FeatureItemProps) {
  return (
    <FeatureItemStoreProvider name={props.title}>
      <FeatureItemInner {...props} />
    </FeatureItemStoreProvider>
  );
}
