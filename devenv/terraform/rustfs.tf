# NOTE: there is no maintained Terraform provider for RustFS. The buckets,
# objects, and IAM artifacts below are provisioned manually (or by script) via
# the RustFS console (http://localhost:9001, rustfsadmin/rustfsadmin) or the
# rustfs CLI, mirroring the customer-operator steps in the user guide's RustFS
# storage-onboarding runbook. This file documents the intended end state; it
# is NOT applied.

# Buckets:
#   vericura-image-data        (org: VeriCura — lab + image-analysis prefixes)
#   vericura-neurovance-collab (shared collab bucket)
#   vericura-zenthera-collab   (shared collab bucket)
#
# Example objects in vericura-image-data:
#   collab/touch.txt
#   lab/touch.txt
#   image-analysis/touch.txt
#
# Per the runbook, each organization also needs (created in the RustFS console
# or via the admin API — `mc`-style tooling against :9000):
#   - the data policy attached to the org's `cy-<alias>` group
#   - the management policy (GetBucketPolicy/PutBucketPolicy/PutBucketCors)
#     attached to the org's `cy-<alias>_admins` group
#   where `<alias>` is the organization alias in Keycloak and group paths use
#   the flat claim encoding (`/` -> `_`, `_` -> `:_`, `:` -> `::`).
