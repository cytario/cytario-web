terraform {
  required_version = "~> 1.6"
  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "5.5.0"
    }
    minio = {
      version = "3.2.1"
      source  = "aminueza/minio"
    }
  }

}

provider "keycloak" {
  client_id = "admin-cli"
  username  = "admin"
  password  = "admin"
  url       = "http://localhost:8080"
}

provider "minio" {
  minio_server   = "localhost:9000"
  minio_ssl      = false
  minio_user     = "minioadmin"
  minio_password = "minioadmin"
}

