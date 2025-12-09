const ansiColors = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

export const createLabel = (
  str: string,
  color: keyof typeof ansiColors = "white"
) =>
  `${ansiColors[color]}[${str.slice(0, 10).toUpperCase().padEnd(10, " ")}]\x1b[0m`;
