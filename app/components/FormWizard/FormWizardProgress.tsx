import { twMerge } from "tailwind-merge";

import { useFormWizard } from "./FormWizard";

interface FormWizardProgressProps {
  labels: string[];
}

export function FormWizardProgress({ labels }: FormWizardProgressProps) {
  const { currentStep, totalSteps } = useFormWizard();

  return (
    <ol className="relative flex gap-4 items-center justify-between w-full text-slate-500">
      {labels.map((label, index) => {
        const i = index + 1;
        const isActiveStep = currentStep === index;
        const isLastStep = i === totalSteps;
        const cx = twMerge("text-sm", isActiveStep && "font-bold");
        return (
          <>
            <li key={label} className={cx}>
              {i}. {label}
            </li>
            {/* Devider */}
            {!isLastStep && <div className="grow h-[1px] bg-slate-500" />}
          </>
        );
      })}
    </ol>
  );
}
