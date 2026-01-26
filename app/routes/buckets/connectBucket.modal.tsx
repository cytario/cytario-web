import { Field, RadioGroup } from "@headlessui/react";
import { useState } from "react";
import {
  type ActionFunction,
  Form,
  type MetaFunction,
  redirect,
} from "react-router";

import AWS_REGIONS from "./awsRegions.json";
import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { getSession } from "~/.server/auth/getSession";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { BreadcrumbLink } from "~/components/Breadcrumbs/BreadcrumbLink";
import { Button } from "~/components/Controls/Button";
import { Input } from "~/components/Controls/Input";
import { Label } from "~/components/Controls/Label";
import { Radio } from "~/components/Controls/Radio";
import { Select } from "~/components/Controls/Select";
import { RouteModal } from "~/components/RouteModal";
import { upsertBucketConfig } from "~/utils/bucketConfig";

const title = "Connect Bucket";

export const meta: MetaFunction = () => {
  return [{ title }];
};

export const handle = {
  breadcrumb: () => (
    <BreadcrumbLink key="connect-bucket" to={`/connect-bucket`}>
      Connect Bucket
    </BreadcrumbLink>
  ),
};

export const middleware = [authMiddleware];

export const action: ActionFunction = async ({ request, context }) => {
  const { user } = context.get(authContext);
  const { sub: userId } = user;

  const formData = await request.formData();
  const provider = formData.get("provider") as string;
  const bucketName = formData.get("bucketName") as string;
  const roleArn = formData.get("roleArn") as string;
  const bucketRegion = formData.get("bucketRegion") as string;
  const bucketEndpoint = formData.get("bucketEndpoint") as string;

  if (!bucketName?.trim()) {
    return { error: "Bucket name is required" };
  }

  const session = await getSession(request);

  try {
    // Construct endpoint based on provider
    const endpoint =
      provider === "aws"
        ? `https://s3.${bucketRegion}.amazonaws.com`
        : bucketEndpoint.trim();

    const newConfig = {
      name: bucketName.trim(),
      provider,
      roleArn: provider === "aws" ? roleArn.trim() : null,
      region: provider === "aws" ? bucketRegion : null,
      endpoint,
    };

    await upsertBucketConfig(userId, newConfig);

    session.set("notification", {
      status: "success",
      message: "Bucket connected successfully.",
    });

    return redirect(`/buckets/${provider}/${bucketName}`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  } catch (error) {
    console.error("Error upserting bucket config:", error);

    session.set("notification", {
      status: "error",
      message: "Error connecting bucket.",
    });

    return redirect(`/`, {
      headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
    });
  }
};

export default function ConnectBucketModal() {
  const [provider, setProvider] = useState<"aws" | string>("aws");

  const isAWS = provider === "aws";

  return (
    <RouteModal title={title}>
      <p className="text-slate-700">
        Connect your cloud storage bucket to view whole-slide images directly in
        cytario.
      </p>

      <Form method="post" className="space-y-4">
        {/* Provider Selection */}
        <Field>
          <Label>Provider</Label>
          <RadioGroup
            value={provider}
            onChange={setProvider}
            className="mt-2 flex gap-4"
          >
            <Radio value="aws">AWS S3</Radio>
            <Radio value="other">Other</Radio>
          </RadioGroup>
        </Field>

        {/* Other Provider Name */}
        {!isAWS && (
          <Field>
            <Label>Provider Name</Label>
            <Input name="provider" required placeholder="minio" scale="large" />
          </Field>
        )}

        {/* Bucket Name */}
        <Field>
          <Label>Bucket Name</Label>
          <Input
            name="bucketName"
            required
            placeholder="my-bucket-name"
            scale="large"
          />
        </Field>

        {/* AWS-specific fields */}
        {isAWS && (
          <>
            <input type="hidden" name="provider" value="aws" />

            <Field>
              <Label>Region</Label>
              <Select name="bucketRegion" required defaultValue="eu-central-1">
                {AWS_REGIONS.map((region) => (
                  <option key={region.value} value={region.value}>
                    {region.value}
                  </option>
                ))}
              </Select>
            </Field>

            <Field>
              <Label>Role ARN</Label>
              <Input
                name="roleArn"
                required
                placeholder="arn:aws:iam::123456789012:role/MyRole"
                scale="large"
              />
            </Field>
          </>
        )}

        {/* Other provider fields */}
        {!isAWS && (
          <Field>
            <Label>Endpoint</Label>

            <Input
              name="bucketEndpoint"
              required
              placeholder="http://localhost:9000"
              scale="large"
            />
          </Field>
        )}

        <Button type="submit" scale="large" theme="primary">
          Connect Bucket
        </Button>
      </Form>
    </RouteModal>
  );
}
