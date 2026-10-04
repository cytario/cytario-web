# NOTE: there is no maintained Terraform provider for RustFS. The buckets,
# objects, and IAM artifacts below are provisioned manually (or by script) via
# the RustFS console (http://localhost:9001, rustfsadmin/rustfsadmin) or the
# rustfs CLI, mirroring the customer-operator steps in the user guide's RustFS
# storage-onboarding runbook. This file documents the intended end state; it
# is NOT applied.
#
# End state per organization alias <alias> (the organization alias from
# Keycloak — `demo` in the terraform bootstrap):
#
#   - policy `cy-<alias>` on group `cy-<alias>`            (data access)
#   - policy `cy-<alias>_admins` on group `cy-<alias>_admins`
#     (GetBucketPolicy/PutBucketPolicy/PutBucketCors — management)
#
# Group paths use the flat claim encoding: `/` -> `_`, `_` -> `:_`,
# `:` -> `::` (see the user guide's runbook for the codec and examples).
