import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";

interface NodeInfoModalParams {
  type: string;
  name: string;
}

export function useNodeInfoModal(matchRegex: RegExp) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [infoModal, setInfoModal] = useState<NodeInfoModalParams | null>(null);

  useEffect(() => {
    searchParams.forEach((name, type) => {
      if (matchRegex.test(type)) {
        setInfoModal({ type, name });
      }
    });

    return () => {
      setInfoModal(null);
    };
  }, [matchRegex, searchParams]);

  const closeInfoModal = () => {
    setSearchParams(new URLSearchParams());
  };

  return [infoModal, closeInfoModal] as const;
}
