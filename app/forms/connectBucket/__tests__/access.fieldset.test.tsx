import { render, screen } from "@testing-library/react";
import { useForm, FormProvider } from "react-hook-form";
import { describe, expect, test } from "vitest";

import { AccessFieldset } from "../access.fieldset";
import {
  type ConnectBucketFormData,
  defaultFormValues,
} from "../connectBucket.schema";

function Wrapper({
  isAWS = true,
  defaultValues = defaultFormValues,
}: {
  isAWS?: boolean;
  defaultValues?: ConnectBucketFormData;
}) {
  const methods = useForm<ConnectBucketFormData>({ defaultValues });

  return (
    <FormProvider {...methods}>
      <AccessFieldset
        control={methods.control}
        errors={methods.formState.errors}
        isAWS={isAWS}
      />
    </FormProvider>
  );
}

describe("AccessFieldset", () => {
  test("renders Role ARN field when isAWS is true", () => {
    render(<Wrapper isAWS={true} />);

    expect(screen.getByText("Role ARN")).toBeInTheDocument();
    expect(
      screen.getByText(/The IAM role Cytario will assume/),
    ).toBeInTheDocument();
  });

  test("renders Endpoint field when isAWS is false", () => {
    render(<Wrapper isAWS={false} />);

    expect(screen.getByText("Endpoint")).toBeInTheDocument();
    expect(
      screen.getByText(/The endpoint URL of your S3-compatible storage/),
    ).toBeInTheDocument();
  });

  test("does not render Endpoint when isAWS is true", () => {
    render(<Wrapper isAWS={true} />);

    expect(screen.queryByText("Endpoint")).not.toBeInTheDocument();
  });

  test("does not render Role ARN when isAWS is false", () => {
    render(<Wrapper isAWS={false} />);

    expect(screen.queryByText("Role ARN")).not.toBeInTheDocument();
  });
});
