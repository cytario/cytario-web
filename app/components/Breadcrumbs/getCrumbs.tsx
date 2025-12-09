import BreadcrumbLink from "./BreadcrumbLink";

export const getCrumbs = (to: string, segments: string[]): JSX.Element[] => {
  const crumbsObjects = segments.map((name) => {
    to += `/${name}`;
    return { name, to };
  });

  return crumbsObjects.map(({ name, to }, index) => {
    const isActive = index === crumbsObjects.length - 1;

    return (
      <BreadcrumbLink key={to} to={to} className={isActive ? "text-white" : ""}>
        {name}
      </BreadcrumbLink>
    );
  });
};
