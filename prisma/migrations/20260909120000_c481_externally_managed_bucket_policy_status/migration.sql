-- Connections whose bucket policy is owned by an external system (the
-- demo bucket, managed by Terraform in admin-portal) are recorded as
-- externally managed instead of none/applied/drifted/error — cytario-web never
-- applies their bucket policy, and the UI badges them accordingly.
ALTER TYPE "BucketPolicyStatus" ADD VALUE 'externally-managed';
