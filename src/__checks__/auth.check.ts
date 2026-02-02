import { BrowserCheck, CheckGroupV2, Frequency } from "checkly/constructs";
import * as path from "path";

import { environments } from "../../e2e/config";

// Create a group and check for each environment
environments.forEach((env) => {
  const group = new CheckGroupV2(`auth-${env.name}`, {
    name: `Auth Checks [${env.name}]`,
    locations: ["eu-west-1"],
    tags: [env.name, "auth"],
    environmentVariables: [{ key: "AUTH_BASE_URL", value: env.appBaseUrl }],
  });

  new BrowserCheck(`auth-page-${env.name}`, {
    name: `Auth Page [${env.name}]`,
    frequency: Frequency.EVERY_1H,
    group,
    code: {
      entrypoint: path.join(__dirname, "../../e2e/auth.spec.ts"),
    },
  });
});
