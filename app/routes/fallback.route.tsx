import { Button, EmptyState } from "@cytario/design";
import { Ban } from "lucide-react";
import { useNavigate } from "react-router";

import { Section } from "../components/Container";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <Section>
      <EmptyState
        icon={Ban}
        title="Page Not Found"
        description="The page you're looking for doesn't exist or has been moved."
        action={
          <Button
            onPress={() => {
              navigate(-1);
            }}
          >
            Go Back
          </Button>
        }
      />
    </Section>
  );
}
