import { useCallback, useRef, useState } from "react";

const FLASH_DURATION = 1500;

interface UseCopyToClipboardResult {
  handleClick: () => void;
  isCopied: boolean;
}

export function useCopyToClipboard(
  copyValue: string | undefined,
): UseCopyToClipboardResult {
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  const handleClick = useCallback(() => {
    if (copyValue == null) return;

    const selection = window.getSelection()?.toString();
    if (selection && selection.length > 0) return;

    navigator.clipboard.writeText(copyValue).then(() => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
      setIsCopied(true);
      timerRef.current = window.setTimeout(() => {
        setIsCopied(false);
        timerRef.current = null;
      }, FLASH_DURATION);
    });
  }, [copyValue]);

  return { handleClick, isCopied };
}
