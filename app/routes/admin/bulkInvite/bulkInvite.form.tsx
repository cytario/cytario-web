import { Button, Icon, IconButton, Input } from "@cytario/design";
import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmit } from "react-router";

import { type BulkInviteRow, bulkInviteRowSchema, bulkInviteSchema } from "./bulkInvite.schema";

interface BulkInviteFormProps {
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

export function BulkInviteForm({ onNonEmptyCountChange }: BulkInviteFormProps) {
  const submit = useSubmit();

  const [formError, setFormError] = useState<string | null>(null);
  const [rows, setRows] = useState<RowState[]>([emptyRow(), emptyRow(), emptyRow()]);

  const tableRef = useRef<HTMLTableElement>(null);

  const updateRow = useCallback((index: number, field: keyof BulkInviteRow, value: string) => {
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
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
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

  return (
    <form
      id="bulk-invite-form"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <p className="text-sm text-slate-500 mb-4">
        Keycloak emails the invite to each address below. Group membership can be assigned after
        each user accepts.
      </p>

      {formError && (
        <p role="alert" className="text-sm text-rose-600 mb-4">
          {formError}
        </p>
      )}

      <table ref={tableRef} className="w-full border-collapse">
        <thead>
          <tr className="text-left text-sm text-slate-500">
            <th scope="col" className="w-10 pr-2 py-2 font-medium">
              #
            </th>
            <th scope="col" className="px-1 py-2 font-medium">
              Email
            </th>
            <th scope="col" className="px-1 py-2 font-medium">
              First Name
            </th>
            <th scope="col" className="px-1 py-2 font-medium">
              Last Name
            </th>
            <th scope="col" className="w-8">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            return (
              <tr key={row.id}>
                <td className="pr-2 py-1 text-sm text-slate-400 tabular-nums text-right">
                  {i + 1}
                </td>
                <td className="px-1 py-1">
                  <Input
                    aria-label={`Email, row ${i + 1}`}
                    value={row.email}
                    onChange={(value) => updateRow(i, "email", value)}
                    placeholder="email@example.com"
                    size="sm"
                    errorMessage={row.errors?.email}
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    aria-label={`First name, row ${i + 1}`}
                    value={row.firstName ?? ""}
                    onChange={(value) => updateRow(i, "firstName", value)}
                    placeholder="First (optional)"
                    size="sm"
                    errorMessage={row.errors?.firstName}
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    aria-label={`Last name, row ${i + 1}`}
                    value={row.lastName ?? ""}
                    onChange={(value) => updateRow(i, "lastName", value)}
                    placeholder="Last (optional)"
                    size="sm"
                    errorMessage={row.errors?.lastName}
                  />
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
