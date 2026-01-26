import { useParams } from "react-router";

import { ButtonLink } from "~/components/Controls/Button";
import { Icon } from "~/components/Controls/IconButton";
import { H3 } from "~/components/Fonts";
import { Link } from "~/components/Link";
import { RouteModal } from "~/components/RouteModal";

/**
 * CyberduckModal component provides information and a download link for a Cyberduck connection profile.
 */
export function CyberduckModal() {
  const { provider, bucketName } = useParams();

  return (
    <RouteModal title="Access with Cyberduck">
      <p className="text-slate-700">
        Cyberduck is a free desktop application that allows you to browse and
        manage your cloud storage files with a familiar file manager interface.
      </p>

      <p className="text-slate-700">
        Download a pre-configured connection profile for{" "}
        <strong>{bucketName}</strong> that will automatically set up your
        authentication and bucket access in Cyberduck.
      </p>

      {/* Quick Start */}
      <div className="bg-slate-50 border border-slate-200 rounded-sm px-4 py-2 flex flex-col gap-2">
        <H3>Quick Start</H3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-slate-700">
          <li>
            Download and install{" "}
            <Link
              to="https://cyberduck.io/download/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Cyberduck
            </Link>{" "}
            (version 8.7.0 or later)
          </li>
          <li>Download the connection profile below</li>
          <li>Double-click the downloaded profile to add it to Cyberduck</li>
          <li>Connect and authenticate when prompted</li>
        </ol>
      </div>

      <ButtonLink
        to={`/api/cyberduck-profile/${provider}/${bucketName}`}
        theme="primary"
        scale="large"
        download
      >
        <Icon icon="Download" />
        Download Cyberduck Profile
      </ButtonLink>
    </RouteModal>
  );
}
