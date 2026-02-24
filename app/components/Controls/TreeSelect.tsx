import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { Icon } from "./Button/Icon";
import {
  baseStyle,
  heightStyles,
  listboxButtonStyle,
  listboxChevronSizes,
  listboxOptionStyle,
  listboxOptionsStyle,
  textStyles,
} from "./styles";
import { TooltipSpan } from "../Tooltip/TooltipSpan";

export interface TreeNode {
  id: string;
  label: string;
  value: string;
  count?: number;
  children: TreeNode[];
}

type TreeSelectProps = {
  tree: TreeNode;
  value: string;
  onChange: (value: string) => void;
  scale?: "small" | "medium" | "large";
  className?: string;
  children?: ReactNode;
};

function flattenTree(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap(flattenTree)];
}

function TreeOption({ node, depth }: { node: TreeNode; depth: number }) {
  return (
    <>
      <ListboxOption
        value={node.value}
        className={twMerge(
          listboxOptionStyle,
          "pr-2 flex items-center justify-between gap-4",
        )}
        style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
      >
        <span className="font-medium">{node.label}</span>
        {node.count != null && (
          <span className="text-slate-400 tabular-nums">{node.count}</span>
        )}
      </ListboxOption>
      {node.children.map((child) => (
        <TreeOption key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export const TreeSelect = ({
  tree,
  value,
  onChange,
  scale = "large",
  className,
  children,
}: TreeSelectProps) => {
  const allNodes = flattenTree(tree);
  const selected = allNodes.find((n) => n.value === value);

  return (
    <Listbox value={value} onChange={onChange}>
      {children ? (
        <ListboxButton className={className}>{children}</ListboxButton>
      ) : (
        <ListboxButton
          className={twMerge(
            baseStyle,
            heightStyles[scale],
            textStyles[scale],
            listboxButtonStyle,
            className,
          )}
        >
          <span className="min-w-0 flex-1 px-2">
            <TooltipSpan>{selected?.label ?? value}</TooltipSpan>
          </span>
          <Icon
            icon="ChevronDown"
            size={listboxChevronSizes[scale].size}
            className={twMerge(
              "flex items-center justify-center h-full",
              listboxChevronSizes[scale].className,
            )}
          />
        </ListboxButton>
      )}

      <ListboxOptions
        anchor="bottom start"
        className={twMerge(listboxOptionsStyle, textStyles[scale])}
      >
        <ListboxOption value="" className={listboxOptionStyle}>
          All
        </ListboxOption>
        <TreeOption node={tree} depth={0} />
      </ListboxOptions>
    </Listbox>
  );
};
