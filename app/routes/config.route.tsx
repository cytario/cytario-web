import { H2 } from "@cytario/design";
import { useLoaderData } from "react-router";

import { getComponentVersions } from "~/.server/componentVersions";
import { Section } from "~/components/Container";
import { DescriptionList } from "~/components/DescriptionList";
import { buildVirtualNode } from "~/utils/treeNodeFactories";

export const handle = {
  node: () => buildVirtualNode("Config", []),
};

export const loader = async () => {
  const commitSha = process.env.COMMIT_SHA ?? "unknown";
  const { assembly, components } = await getComponentVersions();

  return { assembly, commitSha, components };
};

export default function ConfigRoute() {
  const { assembly, commitSha, components } = useLoaderData<typeof loader>();

  return (
    <Section>
      <div className="flex flex-col gap-3">
        <H2>Versions</H2>
      </div>
      <DescriptionList
        data={{
          [assembly.package]: assembly.version,
          "commit sha": commitSha,
          ...Object.fromEntries(components.map((c) => [c.package, c.version])),
        }}
      />
    </Section>
  );
}
