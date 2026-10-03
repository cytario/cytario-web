import { Badge, type BadgeColor } from "@cytario/design";

interface ProviderConfig {
  label: string;
  color: BadgeColor;
}

const providers: Record<string, ProviderConfig> = {
  aws: { label: "AWS S3", color: "warning" },
  minio: { label: "MinIO", color: "destructive" },
};

interface ProviderPillProps {
  provider: keyof typeof providers;
}

export function ProviderPill({ provider }: ProviderPillProps) {
  const config = providers[provider.toLowerCase()];
  return <Badge color={config.color}>{config.label}</Badge>;
}
