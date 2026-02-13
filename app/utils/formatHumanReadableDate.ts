import { format, formatDistance } from "date-fns";

export const formatHumanReadableDate = (dateStr: Date | number): string => {
  const distance = formatDistance(dateStr, new Date());
  return `${format(dateStr, "yyyy-MM-dd, HH:mm")} (${distance} ago)`;
};

export const formatShortDate = (dateStr: Date | number): string => {
  return format(dateStr, "MMM d, yyyy");
};
