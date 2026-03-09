import { render, screen } from "@testing-library/react";
import { useForm, FormProvider } from "react-hook-form";
import { describe, expect, test } from "vitest";

import {
  type AddConnectionFormData,
  defaultFormValues,
} from "../addConnection.schema";
import { LocationFieldset } from "../location.fieldset";

function Wrapper({
  isAWS = true,
  defaultValues = defaultFormValues,
}: {
  isAWS?: boolean;
  defaultValues?: AddConnectionFormData;
}) {
  const methods = useForm<AddConnectionFormData>({ defaultValues });

  return (
    <FormProvider {...methods}>
      <LocationFieldset
        control={methods.control}
        errors={methods.formState.errors}
        isAWS={isAWS}
        setValue={methods.setValue}
      />
    </FormProvider>
  );
}

describe("LocationFieldset", () => {
  test("renders S3 URI field with label and description", () => {
    render(<Wrapper />);

    expect(screen.getByText("S3 URI")).toBeInTheDocument();
    expect(
      screen.getByText(/Enter the bucket name and optional path prefix/),
    ).toBeInTheDocument();
  });

  test("renders s3:// prefix text", () => {
    render(<Wrapper />);

    expect(screen.getByText("s3://")).toBeInTheDocument();
  });

  test("renders alias field with label and description", () => {
    render(<Wrapper />);

    expect(screen.getByText("Connection Alias")).toBeInTheDocument();
    expect(
      screen.getByText(/A unique, URL-friendly identifier for this connection/),
    ).toBeInTheDocument();
  });

  test("renders region select when isAWS is true", () => {
    render(<Wrapper isAWS={true} />);

    expect(screen.getAllByText("Region").length).toBeGreaterThanOrEqual(1);
  });

  test("does not render region select when isAWS is false", () => {
    render(<Wrapper isAWS={false} />);

    expect(screen.queryAllByText("Region")).toHaveLength(0);
  });
});
