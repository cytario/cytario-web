import { Link as RouterLink, LinkProps } from "react-router";

export const Link = ({ children, ...props }: LinkProps) => {
  return (
    <RouterLink
      {...props}
      className={`
        underline focus:underline
      text-cytario-turquoise-700 hover:text-cytario-turquoise-900
      `}
    >
      {children}
    </RouterLink>
  );
};
