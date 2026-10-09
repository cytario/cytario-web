variable "keycloak_realm_name" {
  description = "The realm the bootstrap creates"
  type        = string
  default     = "cytario"
}

variable "keycloak_client_secret" {
  description = "Client secret for the cytario-web OIDC client"
  type        = string
  default     = "1234567"
}
