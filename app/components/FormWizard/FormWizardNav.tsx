import { Button } from "@cytario/design";
import { twMerge } from "tailwind-merge";

import { useFormWizard } from "./FormWizard";

interface FormWizardNavProps {
  onNext?: () => Promise<boolean> | boolean;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function FormWizardNav({
  onNext,
  isSubmitting,
  submitLabel = "Submit",
}: FormWizardNavProps) {
  const { currentStep, totalSteps, canGoBack, goBack } = useFormWizard();
  const isLastStep = currentStep === totalSteps - 1;

  const handleNext = async () => {
    if (onNext) {
      await onNext();
    }
  };

  return (
    <div
      className={twMerge("flex", canGoBack ? "justify-between" : "justify-end")}
    >
      {canGoBack && (
        <Button
          onPress={goBack}
          isDisabled={isSubmitting}
          variant="secondary"
          size="lg"
        >
          Back
        </Button>
      )}

      {isLastStep ? (
        <Button
          type="submit"
          variant="primary"
          size="lg"
          isDisabled={isSubmitting}
        >
          {isSubmitting ? "Connecting..." : submitLabel}
        </Button>
      ) : (
        <Button
          type="button"
          onPress={handleNext}
          variant="primary"
          size="lg"
          isDisabled={isSubmitting}
        >
          Next
        </Button>
      )}
    </div>
  );
}
