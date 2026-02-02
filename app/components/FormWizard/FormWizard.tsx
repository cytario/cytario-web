import { ReactNode, createContext, useContext } from "react";

interface FormWizardContextValue {
  currentStep: number;
  totalSteps: number;
  canGoBack: boolean;
  goBack: () => void;
}

const FormWizardContext = createContext<FormWizardContextValue | null>(null);

export const useFormWizard = () => {
  const context = useContext(FormWizardContext);
  if (!context) {
    throw new Error("useFormWizard must be used within FormWizard");
  }
  return context;
};

interface FormWizardProps {
  children: ReactNode;
  currentStep: number;
  totalSteps: number;
  onStepChange: (step: number) => void;
}

export function FormWizard({
  children,
  currentStep,
  totalSteps,
  onStepChange,
}: FormWizardProps) {
  const value: FormWizardContextValue = {
    currentStep,
    totalSteps,
    canGoBack: currentStep > 0,
    goBack: () => onStepChange(Math.max(0, currentStep - 1)),
  };

  return (
    <FormWizardContext.Provider value={value}>
      {children}
    </FormWizardContext.Provider>
  );
}
