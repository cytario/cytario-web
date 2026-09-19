import { Badge, type BadgeColor } from "@cytario/design";

interface ProviderConfig {
  label: string;
  color: BadgeColor;
}

const providers: Record<string, ProviderConfig> = {
  aws: { label: "AWS S3", color: "amber" },
  rustfs: { label: "RustFS", color: "teal" },
};

interface ProviderPillProps {
  provider: keyof typeof providers;
}

export function ProviderPill({ provider }: ProviderPillProps) {
  const config = providers[provider.toLowerCase()] ?? providers.aws;
  return <Badge color={config.color}>{config.label}</Badge>;
}
