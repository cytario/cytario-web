import { useNavigate } from "react-router";

import { Section } from "../components/Container";
import { Button } from "~/components/Controls";
import { Placeholder } from "~/components/Placeholder";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <Section>
      <Placeholder
        icon="Ban"
        title="Page Not Found"
        description="The page you're looking for doesn't exist or has been moved."
        cta={
          <Button
            onClick={() => {
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
