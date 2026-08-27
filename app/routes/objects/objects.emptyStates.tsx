import { Button, EmptyState } from "@cytario/design";
import { useNavigate } from "react-router";

import { useModal } from "~/hooks/useModal";

const ButtonGoBack = () => {
  const navigate = useNavigate();

  return (
    <Button
      onPress={() => {
        navigate(-1);
      }}
    >
      Go Back
    </Button>
  );
};

const ButtonEditConnection = ({ connectionId }: { connectionId: string }) => {
  const { openModal } = useModal();

  return (
    <Button onPress={() => openModal("edit-connection", { connectionId })} variant="secondary">
      Edit connection
    </Button>
  );
};

export const EmptyStateConnectionError = ({
  connectionError,
  connectionId,
}: {
  connectionError: string;
  connectionId: string;
}) => (
  <EmptyState
    icon="AlertTriangle"
    title="Connection unavailable"
    description={connectionError}
    action={<ButtonEditConnection connectionId={connectionId} />}
  />
);

export const EmptyStateUnsupportedFile = () => (
  <EmptyState
    title="Unsupported file format."
    description="The selected file format is not supported for viewing."
    icon="Ban"
    action={<ButtonGoBack />}
  />
);

export const EmptyStateNoObjects = () => (
  <EmptyState
    title="No objects found in this bucket."
    description="Try uploading some files or check your permissions."
    icon="Ban"
    action={<ButtonGoBack />}
  />
);
