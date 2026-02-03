import { twMerge } from "tailwind-merge";

import { useFormWizard } from "./FormWizard";
import { Button } from "~/components/Controls";

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
          onClick={goBack}
          disabled={isSubmitting}
          theme="white"
          scale="large"
        >
          Back
        </Button>
      )}

      {isLastStep ? (
        <Button
          type="submit"
          theme="primary"
          scale="large"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Connecting..." : submitLabel}
        </Button>
      ) : (
        <Button
          type="button"
          onClick={handleNext}
          theme="primary"
          scale="large"
          disabled={isSubmitting}
        >
          Next
        </Button>
      )}
    </div>
  );
}
