import { Pill, type PillColor } from "@cytario/design";

interface ProviderConfig {
  label: string;
  color: PillColor;
}

const providers: Record<string, ProviderConfig> = {
  aws: { label: "AWS S3", color: "amber" },
  minio: { label: "MinIO", color: "rose" },
};

interface ProviderPillProps {
  provider: keyof typeof providers;
}

export function ProviderPill({ provider }: ProviderPillProps) {
  const config = providers[provider.toLowerCase()];
  return <Pill color={config.color}>{config.label}</Pill>;
}
