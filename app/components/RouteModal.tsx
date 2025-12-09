/* eslint-disable jsx-a11y/click-events-have-key-events */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */

import { ReactNode, useCallback, useEffect } from "react";
import { useNavigate } from "react-router";

import { IconButton } from "./Controls/IconButton";
import { H2 } from "./Fonts";

export function RouteModal({
  title,
  children,
  onClose,
}: Readonly<{
  title: string;
  children: ReactNode;
  onClose?: () => void;
}>) {
  const navigate = useNavigate();
  const goBack = useCallback(() => navigate(-1), [navigate]);
  const action = onClose ?? goBack;

  // Global Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        action();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [action]);

  // Update document title while modal is open
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  return (
    <div
      role="presentation"
      className={`
        fixed top-0 left-0 z-50 overflow-auto 
        grid place-items-center
        w-screen h-screen p-4
        bg-black/50 text-slate-900
        backdrop-blur-sm 
      `}
      aria-hidden="false"
      onClick={action}
    >
      <div
        role="dialog"
        className={`
          w-full max-w-lg bg-white rounded-xl border-slate-300 shadow-2xl
          max-h-full flex flex-col
          overflow-hidden border
          `}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className={`
            flex items-start justify-between
            p-4 bg-slate-100
            border-b border-slate-300
            rounded-t-xl
            flex-shrink-0
          `}
        >
          <H2>{title}</H2>
          <IconButton onClick={action} icon="X" label="Close modal" />
        </header>
        <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
