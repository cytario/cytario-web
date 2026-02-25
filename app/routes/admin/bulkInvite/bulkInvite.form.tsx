import { Button, Checkbox, Field, Icon, IconButton, Select } from "@cytario/design";
import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmit } from "react-router";

import {
  type BulkInviteRow,
  bulkInviteRowSchema,
  bulkInviteSchema,
} from "./bulkInvite.schema";
import { Input } from "~/components/Controls";

interface BulkInviteFormProps {
  scope: string;
  groupOptions: string[];
  onNonEmptyCountChange?: (count: number) => void;
}

interface RowState extends BulkInviteRow {
  id: string;
  errors?: Partial<Record<keyof BulkInviteRow, string>>;
}

let rowCounter = 0;

const emptyRow = (): RowState => ({
  id: String(++rowCounter),
  email: "",
  firstName: "",
  lastName: "",
});

function isRowEmpty(row: RowState): boolean {
  return !row.email && !row.firstName && !row.lastName;
}

export function BulkInviteForm({
  scope,
  groupOptions,
  onNonEmptyCountChange,
}: BulkInviteFormProps) {
  const submit = useSubmit();

  const [groupPath, setGroupPath] = useState(scope);
  const [enabled, setEnabled] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [rows, setRows] = useState<RowState[]>([
    emptyRow(),
    emptyRow(),
    emptyRow(),
  ]);

  const tableRef = useRef<HTMLTableElement>(null);

  const updateRow = useCallback(
    (index: number, field: keyof BulkInviteRow, value: string) => {
      setRows((prev) =>
        prev.map((row, i) =>
          i === index
            ? {
                ...row,
                [field]: value,
                errors: { ...row.errors, [field]: undefined },
              }
            : row,
        ),
      );
    },
    [],
  );

  const removeRow = useCallback((index: number) => {
    setRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    );
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
    // Focus the email input of the new row after render
    requestAnimationFrame(() => {
      const inputs = tableRef.current?.querySelectorAll<HTMLInputElement>(
        "tbody tr:last-child input",
      );
      inputs?.[0]?.focus();
    });
  }, []);

  const nonEmptyCount = rows.filter((r) => !isRowEmpty(r)).length;

  useEffect(() => {
    onNonEmptyCountChange?.(nonEmptyCount);
  }, [nonEmptyCount, onNonEmptyCountChange]);

  const handleSubmit = () => {
    // Validate non-empty rows
    let hasErrors = false;
    const validated = rows.map((row) => {
      if (isRowEmpty(row)) return row;

      const result = bulkInviteRowSchema.safeParse(row);
      if (!result.success) {
        hasErrors = true;
        const fieldErrors = result.error.flatten().fieldErrors;
        return {
          ...row,
          errors: {
            email: fieldErrors.email?.[0],
            firstName: fieldErrors.firstName?.[0],
            lastName: fieldErrors.lastName?.[0],
          },
        };
      }
      return { ...row, errors: undefined };
    });

    if (hasErrors) {
      setRows(validated);
      return;
    }

    const nonEmptyRows = rows.filter((r) => !isRowEmpty(r));
    const payload = {
      groupPath,
      enabled,
      rows: nonEmptyRows.map(({ email, firstName, lastName }) => ({
        email,
        firstName,
        lastName,
      })),
    };

    const result = bulkInviteSchema.safeParse(payload);
    if (!result.success) {
      setFormError(result.error.issues[0]?.message ?? "Validation failed");
      return;
    }
    setFormError(null);

    submit(JSON.stringify(payload), {
      method: "post",
      encType: "application/json",
    });
  };

  const selectItems = groupOptions.map((p) => ({ id: p, name: p }));

  return (
    <form
      id="bulk-invite-form"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <div className="space-y-4 mb-6">
        <Field label="Group Membership">
          {selectItems.length > 0 ? (
            <Select
              label="Group Membership"
              items={selectItems}
              selectedKey={groupPath}
              onSelectionChange={(key) => setGroupPath(key as string)}
            />
          ) : (
            <p className="text-sm text-slate-400">
              No groups available in this scope.
            </p>
          )}
        </Field>
        <div className="flex items-center gap-2">
          <Checkbox isSelected={enabled} onChange={setEnabled}>
            Enabled
          </Checkbox>
          <p className="text-sm text-slate-500">
            Uncheck to pre-provision accounts without granting immediate access.
          </p>
        </div>
      </div>

      {formError && (
        <p className="text-sm text-rose-600 mb-4">{formError}</p>
      )}

      <table ref={tableRef} className="w-full border-collapse">
        <thead>
          <tr className="text-left text-sm text-slate-500">
            <th className="w-10 pr-2 py-2 font-medium">#</th>
            <th className="px-1 py-2 font-medium">Email</th>
            <th className="px-1 py-2 font-medium">First Name</th>
            <th className="px-1 py-2 font-medium">Last Name</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const emailErrorId = `row-${row.id}-email-error`;
            const firstNameErrorId = `row-${row.id}-firstName-error`;
            const lastNameErrorId = `row-${row.id}-lastName-error`;
            return (
              <tr key={row.id}>
                <td className="pr-2 py-1 text-sm text-slate-400 tabular-nums text-right">
                  {i + 1}
                </td>
                <td className="px-1 py-1">
                  <Input
                    value={row.email}
                    onChange={(e) => updateRow(i, "email", e.target.value)}
                    placeholder="email@example.com"
                    scale="small"
                    theme="light"
                    className={row.errors?.email ? "border-rose-500" : ""}
                    aria-invalid={!!row.errors?.email}
                    aria-describedby={
                      row.errors?.email ? emailErrorId : undefined
                    }
                  />
                  {row.errors?.email && (
                    <p id={emailErrorId} className="text-xs text-rose-600 mt-0.5">
                      {row.errors.email}
                    </p>
                  )}
                </td>
                <td className="px-1 py-1">
                  <Input
                    value={row.firstName}
                    onChange={(e) => updateRow(i, "firstName", e.target.value)}
                    placeholder="First"
                    scale="small"
                    theme="light"
                    className={row.errors?.firstName ? "border-rose-500" : ""}
                    aria-invalid={!!row.errors?.firstName}
                    aria-describedby={
                      row.errors?.firstName ? firstNameErrorId : undefined
                    }
                  />
                  {row.errors?.firstName && (
                    <p
                      id={firstNameErrorId}
                      className="text-xs text-rose-600 mt-0.5"
                    >
                      {row.errors.firstName}
                    </p>
                  )}
                </td>
                <td className="px-1 py-1">
                  <Input
                    value={row.lastName}
                    onChange={(e) => updateRow(i, "lastName", e.target.value)}
                    placeholder="Last"
                    scale="small"
                    theme="light"
                    className={row.errors?.lastName ? "border-rose-500" : ""}
                    aria-invalid={!!row.errors?.lastName}
                    aria-describedby={
                      row.errors?.lastName ? lastNameErrorId : undefined
                    }
                  />
                  {row.errors?.lastName && (
                    <p
                      id={lastNameErrorId}
                      className="text-xs text-rose-600 mt-0.5"
                    >
                      {row.errors.lastName}
                    </p>
                  )}
                </td>
                <td className="pl-1 py-1">
                  {rows.length > 1 && (
                    <IconButton
                      icon={X}
                      size="sm"
                      variant="ghost"
                      onPress={() => removeRow(i)}
                      aria-label="Remove row"
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-2">
        <Button variant="ghost" size="sm" onPress={addRow}>
          <Icon icon={Plus} size="sm" />
          Add Row
        </Button>
      </div>
    </form>
  );
}
