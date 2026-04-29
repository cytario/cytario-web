import { Button, H2, Switch } from "@cytario/design";
import { LoaderFunction, useLoaderData } from "react-router";

import { Section } from "~/components/Container";
import { DescriptionList } from "~/components/DescriptionList";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";

export const handle = {
  breadcrumb: () => ({ label: "Config", to: "/config" }),
};

export const loader: LoaderFunction = async () => {
  const version = process.env.VERSION ?? "unknown";
  const commitSha = process.env.COMMIT_SHA ?? "unknown";

  return { version, commitSha };
};

function PreferencesSection() {
  const showHiddenFiles = useLayoutStore((s) => s.showHiddenFiles);
  const toggleShowHiddenFiles = useLayoutStore((s) => s.toggleShowHiddenFiles);

  return (
    <div className="flex flex-col gap-3">
      <H2>Preferences</H2>
      <Switch
        isSelected={showHiddenFiles}
        onChange={toggleShowHiddenFiles}
        className="text-sm"
      >
        Show hidden files
      </Switch>
      <p className="text-xs text-(--color-text-secondary)">
        Reveal dot-prefixed files and directories in browse views.
      </p>
    </div>
  );
}

export default function ConfigRoute() {
  const data = useLoaderData<typeof loader>();

  return (
    <Section>
      <PreferencesSection />
      <DescriptionList data={data} />
      <Button
        onPress={() => {
          if (confirm("Are you sure you want to clear local storage?")) {
            window.localStorage.clear();
            window.location.reload();
          }
        }}
        variant="destructive"
      >
        Clear Local Storage
      </Button>
      <div>
        {typeof window !== "undefined" && (
          <code className="block bg-slate-100 p-4 overflow-auto">
            {JSON.stringify(localStorage, null, 2)}
          </code>
        )}
      </div>
    </Section>
  );
}
