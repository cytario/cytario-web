import { zodResolver } from "@hookform/resolvers/zod";
import { KeyboardEvent, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigation, useSubmit } from "react-router";

import { AccessFieldset } from "./access.fieldset";
import { LocationFieldset } from "./location.fieldset";
import { ProviderFieldset } from "./provider.fieldset";
import { FormWizard } from "~/components/FormWizard/FormWizard";
import { FormWizardNav } from "~/components/FormWizard/FormWizardNav";
import { FormWizardProgress } from "~/components/FormWizard/FormWizardProgress";
import {
  type ConnectBucketFormData,
  connectBucketSchema,
  defaultFormValues,
} from "~/forms/connectBucket/connectBucket.schema";

const STEP_LABELS = ["Storage Provider", "Data Location", "Access"];

interface ConnectBucketFormProps {
  adminScopes: string[];
  userId: string;
}

export const ConnectBucketForm = ({
  adminScopes,
  userId,
}: ConnectBucketFormProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const {
    control,
    register,
    trigger,
    handleSubmit,
    formState: { errors },
  } = useForm<ConnectBucketFormData>({
    resolver: zodResolver(connectBucketSchema),
    defaultValues: {
      ...defaultFormValues,
      ownerScope: userId,
    },
    mode: "onBlur",
  });

  const providerType = useWatch({ control, name: "providerType" });
  const isAWS = providerType === "aws";

  const validateCurrentStep = async (): Promise<boolean> => {
    let fieldsToValidate: (keyof ConnectBucketFormData)[] = [];

    if (currentStep === 0) {
      fieldsToValidate = isAWS
        ? ["ownerScope", "providerType"]
        : ["ownerScope", "providerType", "provider"];
    } else if (currentStep === 1) {
      fieldsToValidate = ["s3Uri"];
    } else if (currentStep === 2) {
      fieldsToValidate = isAWS
        ? ["bucketRegion", "roleArn"]
        : ["bucketEndpoint"];
    }

    const isValid = await trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep((prev) => prev + 1);
    }
    return isValid;
  };

  const onSubmit = (data: ConnectBucketFormData) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });
    submit(formData, { method: "post" });
  };

  const isLastStep = currentStep === 2;

  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && !isLastStep) {
      e.preventDefault();
      validateCurrentStep();
    }
  };

  return (
    <FormWizard
      currentStep={currentStep}
      totalSteps={3}
      onStepChange={setCurrentStep}
    >
      <FormWizardProgress labels={STEP_LABELS} />

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        onKeyDown={handleKeyDown}
        className="space-y-8 text-slate-500"
      >
        {/* Step 1: Provider */}
        {currentStep === 0 && (
          <ProviderFieldset
            control={control}
            register={register}
            errors={errors}
            isAWS={isAWS}
            adminScopes={adminScopes}
            userId={userId}
          />
        )}

        {/* Step 2: Location */}
        {currentStep === 1 && (
          <LocationFieldset control={control} register={register} errors={errors} isAWS={isAWS} />
        )}

        {/* Step 3: Access */}
        {currentStep === 2 && (
          <AccessFieldset register={register} errors={errors} isAWS={isAWS} />
        )}

        <FormWizardNav
          onNext={validateCurrentStep}
          isSubmitting={isSubmitting}
          submitLabel="Connect Storage"
        />
      </form>
    </FormWizard>
  );
};
