# resource "keycloak_realm" "keycloak_realm" {
#   realm   =  var.keycloak_realm_name
#   enabled = true
# }
#
resource "keycloak_openid_client" "minio" {
  realm_id                     = var.keycloak_realm_name
  client_id                    = "minio"
  enabled                      = true
  direct_access_grants_enabled = true
  standard_flow_enabled        = true
  access_type                  = "CONFIDENTIAL"
  client_secret                = var.keycloak_client_secret
  valid_redirect_uris = [
    "http://localhost:5173/*"
  ]
  web_origins = [
    "http://localhost:5173"
  ]
}

resource "keycloak_openid_client_scope" "group_membership_scope" {
  realm_id               = var.keycloak_realm_name
  name                   = "groups"
  description            = "Group membership"
  include_in_token_scope = true
  gui_order              = 1
}

resource "keycloak_openid_group_membership_protocol_mapper" "group_membership_mapper" {
  realm_id  = var.keycloak_realm_name
  client_id = keycloak_openid_client.minio.id
  name      = "group-membership"

  claim_name = "groups"
}

resource "keycloak_openid_hardcoded_claim_protocol_mapper" "policy_mapper" {
  realm_id  = var.keycloak_realm_name
  client_id = keycloak_openid_client.minio.id
  name      = "policy-claim"

  claim_name       = "policy"
  claim_value      = "vericura_policy"
  claim_value_type = "String"
  add_to_id_token  = true
  add_to_access_token = true
}

resource "keycloak_openid_client_default_scopes" "minio_client_default_scopes" {
  realm_id  = var.keycloak_realm_name
  client_id = keycloak_openid_client.minio.id

  default_scopes = [
    keycloak_openid_client_scope.group_membership_scope.name,
    "profile",
    "email",
    "roles",
    "web-origins",
    "basic",
  ]
}

###############################################################################
# Groups:
###############################################################################


resource "keycloak_group" "vericura" {
  realm_id = var.keycloak_realm_name
  name     = "VeriCura"
}

resource "keycloak_group" "vericura_employees" {
  realm_id = var.keycloak_realm_name
  name     = "Employees"
  parent_id = keycloak_group.vericura.id
}

resource "keycloak_group" "vericura_admins" {
  realm_id = var.keycloak_realm_name
  name     = "Admins"
  parent_id = keycloak_group.vericura.id
}

resource "keycloak_group" "vericura_lab" {
  realm_id = var.keycloak_realm_name
  name     = "Lab"
  parent_id = keycloak_group.vericura.id
}


resource "keycloak_group" "vericura_ia" {
  realm_id = var.keycloak_realm_name
  name     = "ImageAnalysis"
  parent_id = keycloak_group.vericura.id
}


resource "keycloak_group" "neurovance" {
  realm_id = var.keycloak_realm_name
  name     = "NeurovanceTherapeutics"
}

resource "keycloak_group" "neurovance_employees" {
  realm_id = var.keycloak_realm_name
  name     = "Employees"
  parent_id = keycloak_group.neurovance.id
}


resource "keycloak_group" "zenthera" {
  realm_id = var.keycloak_realm_name
  name     = "ZentheraPharma"
}


resource "keycloak_group" "zenthera_employees" {
  realm_id = var.keycloak_realm_name
  name     = "Employees"
  parent_id = keycloak_group.zenthera.id
}


###############################################################################
# Users:
###############################################################################

resource "keycloak_user" "marcus" {
  realm_id       = var.keycloak_realm_name
  username       = "marcus.deleon@neurovance.com"
  email          = "marcus.deleon@neurovance.com"
  first_name     = "Marcus"
  last_name      = "Deleon"
  email_verified = true
  initial_password {
    value     = "marcus"
    temporary = false
  }
}

resource "keycloak_user_groups" "marcus" {
  realm_id  = var.keycloak_realm_name
  user_id   = keycloak_user.marcus.id
  group_ids = [keycloak_group.neurovance.id]
}

resource "keycloak_user" "anika" {
  realm_id       = var.keycloak_realm_name
  username       = "anika.rothstein@zenthera.com"
  email          = "anika.rothstein@zenthera.com"
  first_name     = "Anika"
  last_name      = "Rothstein"
  email_verified = true
  initial_password {
    value     = "anika"
    temporary = false
  }
}

resource "keycloak_user_groups" "anika" {
  realm_id  = var.keycloak_realm_name
  user_id   = keycloak_user.anika.id
  group_ids = [keycloak_group.zenthera.id]
}

resource "keycloak_user" "elara" {
  realm_id       = var.keycloak_realm_name
  username       = "elara.voss@vericura.com"
  email          = "elara.voss@vericura.com"
  first_name     = "Elara"
  last_name      = "Voss"
  email_verified = true
  initial_password {
    value     = "elara"
    temporary = false
  }
}

resource "keycloak_user_groups" "elara" {
  realm_id = var.keycloak_realm_name
  user_id  = keycloak_user.elara.id
  group_ids = [
    keycloak_group.vericura_admins.id,
    keycloak_group.vericura_employees.id,
    keycloak_group.vericura_lab.id,
    keycloak_group.zenthera.id,
  ]
}


resource "keycloak_user" "priya" {
  realm_id       = var.keycloak_realm_name
  username       = "priya.chandrasekar@vericura.com"
  email          = "priya.chandrasekar@vericura.com"
  first_name     = "Priya"
  last_name      = "Chandrasekar"
  email_verified = true
  initial_password {
    value     = "priya"
    temporary = false
  }
}

resource "keycloak_user_groups" "priya" {
  realm_id = var.keycloak_realm_name
  user_id  = keycloak_user.priya.id
  group_ids = [
    keycloak_group.vericura_employees.id,
    keycloak_group.vericura_ia.id,
    keycloak_group.neurovance.id,
  ]
}
