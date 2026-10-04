# One-shot Keycloak realm bootstrap for the devenv cluster: the realm, the
# app's OIDC clients, an Organization with groups and users, and the group
# claim wiring. Apply it against the running Keycloak (README "OpenTofu
# bootstrap") after `podman kube play local-deployment.yaml`.
#
# What lives here vs the admin console: everything the app needs at boot.
# What does NOT: the RustFS-side provisioning (see rustfs.tf) — storage
# policies/groups are created in the RustFS console or by script.

resource "keycloak_realm" "cytario" {
  realm   = var.keycloak_realm_name
  enabled = true

  # Organizations must be on for the tenant model.
  organizations_enabled = true
}

resource "keycloak_openid_client" "cytario_web" {
  realm_id                     = keycloak_realm.cytario.id
  client_id                    = "cytario-web"
  enabled                      = true
  direct_access_grants_enabled = true
  standard_flow_enabled        = true
  access_type                  = "CONFIDENTIAL"
  client_secret                = var.keycloak_client_secret
  valid_redirect_uris          = ["http://localhost:3000/*"]
  web_origins = [
    "http://localhost:3000"
  ]
}

# The nested `organization` claim the app reads
# (`{ "<alias>": { groups: [...] } }`): the built-in organization scope
# carries it, including the org-scoped group paths.
resource "keycloak_openid_client_default_scopes" "cytario_web" {
  realm_id  = keycloak_realm.cytario.id
  client_id = keycloak_openid_client.cytario_web.id

  default_scopes = [
    "organization",
    "profile",
    "email",
    "roles",
    "web-origins",
    "basic",
  ]
}

# The top-level `groups` claim (realm groups) — carried for parity with the
# legacy fixtures; the app prefers the org-nested groups when present.
resource "keycloak_openid_client_scope" "groups" {
  realm_id               = keycloak_realm.cytario.id
  name                   = "groups"
  description            = "Group membership"
  include_in_token_scope = true
  gui_order              = 1
}

resource "keycloak_openid_group_membership_protocol_mapper" "groups" {
  realm_id  = keycloak_realm.cytario.id
  client_id = keycloak_openid_client.cytario_web.id
  name      = "group-membership"

  claim_name = "groups"
}

resource "keycloak_openid_client_default_scopes" "groups" {
  realm_id  = keycloak_realm.cytario.id
  client_id = keycloak_openid_client.cytario_web.id

  default_scopes = [
    keycloak_openid_client_scope.groups.name,
  ]
}

# The organization every dev user belongs to. Its alias is the tenant key
# the app (and the RustFS marker scheme) derives everything from.
resource "keycloak_organization" "demo" {
  realm        = keycloak_realm.cytario.realm
  name         = "Demo Org"
  alias        = "demo"
  enabled      = true
  redirect_url = "http://localhost:3000/*"
}

# Org-scoped groups (created under the organization, not the realm). The
# `admins` subgroup is what grants the `*` admin scope in the app.
resource "keycloak_group" "lab" {
  realm_id        = keycloak_realm.cytario.id
  organization_id = keycloak_organization.demo.id
  name            = "Lab"
}

resource "keycloak_group" "admins" {
  realm_id        = keycloak_realm.cytario.id
  organization_id = keycloak_organization.demo.id
  name            = "admins"
}

resource "keycloak_group" "lab_teamx" {
  realm_id        = keycloak_realm.cytario.id
  organization_id = keycloak_organization.demo.id
  parent_id       = keycloak_group.lab.id
  name            = "TeamX"
}

resource "keycloak_user" "admin" {
  realm_id       = keycloak_realm.cytario.id
  username       = "admin@demo.dev"
  email          = "admin@demo.dev"
  first_name     = "Dana"
  last_name      = "Admin"
  email_verified = true
  enabled        = true
  initial_password {
    value     = "demo-admin"
    temporary = false
  }
}

resource "keycloak_user" "viewer" {
  realm_id       = keycloak_realm.cytario.id
  username       = "viewer@demo.dev"
  email          = "viewer@demo.dev"
  first_name     = "Vera"
  last_name      = "Viewer"
  email_verified = true
  enabled        = true
  initial_password {
    value     = "demo-viewer"
    temporary = false
  }
}
