variable "keycloak_client_secret" {
  description = "Client secret for the Keycloak OIDC client"
  type        = string
  default     = "1234567" # You can set a default or pass it via CLI, environment variables, or Terraform Cloud
}

variable "keycloak_realm_name" {
  description = "The name of the Keycloak realm"
  type        = string
  default     = "master"
}
