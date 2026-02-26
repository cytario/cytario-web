export const baseStyle = `
  flex w-full border rounded-sm
  transition duration-100 ease-in
  font-normal
  disabled:opacity-50 disabled:cursor-not-allowed
`;

export const heightStyles = {
  small: "h-6",
  medium: "h-8",
  large: "h-12",
};

export const textStyles = {
  small: "text-sm",
  medium: "text-base",
  large: "text-lg",
};

export const sizeStyles = {
  small: "h-6 px-2 text-sm",
  medium: "h-8 px-2 text-base",
  large: "h-12 px-2 text-lg",
};

export const themes = {
  dark: "bg-slate-950 border-slate-500 text-slate-300",
  light: "bg-white border-slate-300 text-slate-700",
};

// Shared Listbox (Select / TreeSelect) styles
export const listboxChevronSizes = {
  small: { size: 14 as const, className: "w-6" },
  medium: { size: 16 as const, className: "w-8" },
  large: { size: 20 as const, className: "w-12" },
};

export const listboxButtonStyle =
  "items-center bg-white border-slate-300 text-left overflow-hidden min-w-0";

export const listboxOptionsStyle =
  "z-20 min-w-[var(--button-width)] w-max p-1 border border-slate-300 bg-white rounded-sm shadow-lg";

export const listboxOptionStyle =
  "cursor-pointer data-[focus]:bg-slate-100 px-2 py-1 rounded";
