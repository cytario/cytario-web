import { useNavigate } from "react-router";

import { Container } from "../components/Container";
import { Button } from "~/components/Controls/Button";
import { Placeholder } from "~/components/Placeholder";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <Container>
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
    </Container>
  );
}
