import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
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

export const ConnectBucketForm = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const {
    control,
    register,
    watch,
    trigger,
    handleSubmit,
    formState: { errors },
  } = useForm<ConnectBucketFormData>({
    resolver: zodResolver(connectBucketSchema),
    defaultValues: defaultFormValues,
    mode: "onBlur",
  });

  const providerType = watch("providerType");
  const isAWS = providerType === "aws";

  const validateCurrentStep = async (): Promise<boolean> => {
    let fieldsToValidate: (keyof ConnectBucketFormData)[] = [];

    if (currentStep === 0) {
      fieldsToValidate = isAWS
        ? ["providerType"]
        : ["providerType", "provider"];
    } else if (currentStep === 1) {
      fieldsToValidate = ["bucketName", "prefix"];
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

  return (
    <FormWizard
      currentStep={currentStep}
      totalSteps={3}
      onStepChange={setCurrentStep}
    >
      <FormWizardProgress labels={STEP_LABELS} />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Step 1: Provider */}
        {currentStep === 0 && (
          <ProviderFieldset
            control={control}
            register={register}
            errors={errors}
            isAWS={isAWS}
          />
        )}

        {/* Step 2: Location */}
        {currentStep === 1 && (
          <LocationFieldset register={register} errors={errors} />
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
