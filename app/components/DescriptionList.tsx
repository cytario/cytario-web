import React from "react";

interface DescriptionListProps<
  T extends Record<string, string | number | boolean | Date | null | undefined>,
> {
  data: T;
  className?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DescriptionList = ({ data, className }: DescriptionListProps<any>) => {
  return (
    <div className={`mb-12 overflow-hidden pointer-events-none ${className}`}>
      <dl className="grid grid-cols-[auto_1fr] gap-4 text-sm">
        {Object.entries(data).map(([key, value]) => (
          <React.Fragment key={key}>
            <dt className="font-bold text-sm w-32 truncate">{key}</dt>
            <dd>
              <code className="text-slate-700 px-2 py-1 bg-slate-50">
                {String(value)}
              </code>
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
};

export { DescriptionList };
