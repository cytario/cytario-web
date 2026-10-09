output "realm" {
  value = keycloak_realm.cytario.realm
}

output "client_secret" {
  value = var.keycloak_client_secret
}

output "organization_id" {
  value = keycloak_organization.demo.id
}

output "admin_group_id" {
  value = keycloak_group.admins.id
}

output "lab_group_id" {
  value = keycloak_group.lab.id
}
