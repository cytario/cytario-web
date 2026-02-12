import { BreadcrumbData } from "./Breadcrumbs";

export interface CrumbsOptions {
  /** Display name for the atomic data connection crumb (bucket + prefix as one unit) */
  dataConnectionName?: string;
  /** Full URL path to the data connection root */
  dataConnectionPath?: string;
}

export const getCrumbs = (
  basePath: string,
  segments: string[],
  options?: CrumbsOptions
): BreadcrumbData[] => {
  const { dataConnectionName, dataConnectionPath } = options ?? {};

  // When a data connection with prefix is provided, render it as a single atomic crumb
  if (dataConnectionName && dataConnectionPath) {
    const dataConnectionCrumb: BreadcrumbData = {
      label: dataConnectionName,
      to: dataConnectionPath,
      isActive: segments.length === 0,
    };

    // Build crumbs for the remaining path segments (relative to data connection root)
    let currentPath = dataConnectionPath;
    const remainingCrumbs: BreadcrumbData[] = segments.map((name, index) => {
      currentPath += `/${name}`;
      return {
        label: name,
        to: currentPath,
        isActive: index === segments.length - 1,
      };
    });

    return [dataConnectionCrumb, ...remainingCrumbs];
  }

  // Default behavior: build crumbs progressively from basePath
  let to = basePath;
  const crumbsObjects = segments.map((name) => {
    to += `/${name}`;
    return { name, to };
  });

  return crumbsObjects.map(({ name, to }, index) => ({
    label: name,
    to,
    isActive: index === crumbsObjects.length - 1,
  }));
};
