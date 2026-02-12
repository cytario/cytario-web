export const buttonBaseStyles = `
  inline-flex items-center justify-center self-center w-auto
  rounded-sm border gap-1 px-2
  disabled:cursor-not-allowed disabled:opacity-50
  whitespace-nowrap font-bold
`;

export const buttonScaleStyles = {
  small: "h-6 text-sm",
  medium: "h-8 text-base",
  large: "h-12 text-lg",
};

export const buttonThemeStyles = {
  default: `
    text-slate-300
    bg-slate-800 hover:bg-slate-700
    border border-slate-500
  `,
  transparent: `
    text-inherit
    bg-transparent hover:bg-white/20 
  `,
  white: `
    text-inherit
    bg-white hover:bg-slate-50
    border border-inherit
  `,
  primary: `
    text-white
    bg-cytario-turquoise-500 hover:bg-cytario-turquoise-700
    border border-cytario-turquoise-500 border-t-cytario-turquoise-300 border-b-cytario-turquoise-700
  `,
  error: `
    text-white
    bg-rose-700 hover:bg-rose-500 
    border border-rose-500 border-t-rose-300 border-b-rose-900
  `,
  success: `
    text-white
    bg-green-700 hover:bg-green-500
    border border-green-500 border-t-green-300 border-b-green-900
  `,
  info: `
    text-white
    bg-slate-700 hover:bg-slate-500
    border border-slate-500 border-t-slate-300 border-b-slate-900
  `,
};

export const iconButtonBaseStyles = `
  flex place-items-center place-content-center flex-shrink-0
  rounded-sm border border-slate-500 text-white
  disabled:opacity-50 disabled:cursor-not-allowed
`;

export const iconButtonScaleStyles = {
  small: "w-4 h-4",
  medium: "w-8 h-8",
  large: "w-12 h-12",
};
