import { Field } from "@headlessui/react";
import { useState } from "react";

import { Label } from "../Label";
import { IconButton } from "~/components/Controls/IconButton";
import Input from "~/components/Controls/Input";
import { InputGroup } from "~/components/Controls/InputGroup";

export const PasswordField = ({
  name,
  placeholder = "••••••••••••••••",
}: {
  name: string;
  placeholder?: string;
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Field className="flex flex-col gap-1">
      <Label>Password</Label>

      <InputGroup>
        <Input
          scale="large"
          name={name}
          type={showPassword ? "text" : "password"}
          placeholder={placeholder}
        />
        <IconButton
          className="bg-slate-100 hover:bg-slate-200 border-slate-300"
          scale="large"
          icon={showPassword ? "EyeOff" : "Eye"}
          onClick={() => setShowPassword(!showPassword)}
          label={showPassword ? "Hide password" : "Show password"}
        />
      </InputGroup>
    </Field>
  );
};
