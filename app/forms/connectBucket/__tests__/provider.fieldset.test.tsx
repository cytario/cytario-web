import { render, screen } from "@testing-library/react";
import { useForm, FormProvider } from "react-hook-form";
import { describe, expect, test } from "vitest";

import {
  type ConnectBucketFormData,
  defaultFormValues,
} from "../connectBucket.schema";
import { ProviderFieldset } from "../provider.fieldset";

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
      <ProviderFieldset
        control={methods.control}
        errors={methods.formState.errors}
        isAWS={isAWS}
      />
    </FormProvider>
  );
}

describe("ProviderFieldset", () => {
  test("renders provider label and description", () => {
    render(<Wrapper />);

    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(
      screen.getByText(/Choose the type of cloud storage/),
    ).toBeInTheDocument();
  });

  test("renders radio buttons for provider type", () => {
    render(<Wrapper />);

    expect(screen.getByText("AWS S3")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  test("does not render provider name field when isAWS is true", () => {
    render(<Wrapper isAWS={true} />);

    expect(screen.queryByText("Provider Name")).not.toBeInTheDocument();
  });

  test("renders provider name field when isAWS is false", () => {
    render(<Wrapper isAWS={false} />);

    expect(screen.getByText("Provider Name")).toBeInTheDocument();
  });
});
