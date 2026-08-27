import { LoaderDots } from "./LoaderDots";

interface LoaderViewProps {
  label?: string;
}

export function LoaderView({ label = "Loading…" }: LoaderViewProps) {
  const cx = `
    flex flex-col items-center justify-center
    w-full h-full gap-2 p-8
    text-muted-foreground
  `;

  return (
    <div role="status" aria-live="polite" className={cx}>
      <LoaderDots />
      <p className="font-semibold tracking-wider">{label}</p>
    </div>
  );
}
