import { Field } from "@headlessui/react";

import { Label } from "../Label";
import { Input } from "~/components/Controls/Input";

export const EmailField = ({
  name,
  placeholder = "your@email.com",
}: {
  name: string;
  placeholder?: string;
}) => {
  return (
    <Field className="w-full">
      <Label>Email</Label>
      <Input name={name} type="email" scale="large" placeholder={placeholder} />
    </Field>
  );
};
