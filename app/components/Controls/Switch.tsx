import { Switch as HeadlessSwitch } from "@headlessui/react";
import colors from "tailwindcss/colors";

import tailwindConfig from "tailwind.config";

export function Switch({
  checked,
  onChange,
  color = tailwindConfig.theme.extend.colors.cytario.turquoise[500],
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <HeadlessSwitch
      checked={checked}
      onChange={onChange}
      className="
        flex flex-shrink-0
        items-center justify-center
        w-9 h-5 rounded-full
        border-2 border-slate-800
        bg-slate-700
        disabled:opacity-40 disabled:cursor-not-allowed
      "
      style={{
        backgroundColor: checked ? color : colors.slate[700],
      }}
      disabled={disabled}
    >
      <span
        className={`
        h-3 w-3 rounded-full
        transition
        border border-slate-500
        ${checked ? "translate-x-2 bg-white" : "-translate-x-2 bg-slate-500"}
      `}
      />
    </HeadlessSwitch>
  );
}
