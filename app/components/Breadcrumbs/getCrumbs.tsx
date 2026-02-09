import { BreadcrumbLink } from "./BreadcrumbLink";

export interface CrumbsOptions {
  /** Display name for the atomic storage connection crumb (bucket + prefix as one unit) */
  dataConnectionName?: string;
  /** Full URL path to the storage connection root */
  dataConnectionPath?: string;
}

export const getCrumbs = (
  basePath: string,
  segments: string[],
  options?: CrumbsOptions
): JSX.Element[] => {
  const { dataConnectionName, dataConnectionPath } = options ?? {};

  // When a storage connection with prefix is provided, render it as a single atomic crumb
  if (dataConnectionName && dataConnectionPath) {
    const dataConnectionCrumb = (
      <BreadcrumbLink
        key={dataConnectionPath}
        to={dataConnectionPath}
        className={segments.length === 0 ? "text-white" : ""}
      >
        {dataConnectionName}
      </BreadcrumbLink>
    );

    // Build crumbs for the remaining path segments (relative to storage connection root)
    let currentPath = dataConnectionPath;
    const remainingCrumbs = segments.map((name, index) => {
      currentPath += `/${name}`;
      const isActive = index === segments.length - 1;
      return (
        <BreadcrumbLink
          key={currentPath}
          to={currentPath}
          className={isActive ? "text-white" : ""}
        >
          {name}
        </BreadcrumbLink>
      );
    });

    return [dataConnectionCrumb, ...remainingCrumbs];
  }

  // Default behavior: build crumbs progressively from basePath
  let to = basePath;
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
