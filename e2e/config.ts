export const environments = [
  {
    name: "dev",
    appBaseUrl: "https://app.cytar.io",
  },
  {
    name: "production",
    appBaseUrl: "https://app.cytario.com",
  },
] as const;

export const DEFAULT_APP_URL = environments[0].appBaseUrl;
