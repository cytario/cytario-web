import { useSearchParams } from "react-router";

export const useSearchParam = (
  paramName: string
): [string, (value: string) => void] => {
  const [searchParams, setSearchParams] = useSearchParams();

  const paramValue = searchParams.get(paramName) ?? "";

  const updateParam = (value: string) => {
    setSearchParams(
      (prev) => {
        const newParams = new URLSearchParams(prev);
        if (value.trim()) {
          newParams.set(paramName, value);
        } else {
          newParams.delete(paramName);
        }
        return newParams;
      },
      { replace: true }
    );
  };

  return [paramValue, updateParam];
};
