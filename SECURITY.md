# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

**Please do not report security vulnerabilities through public GitHub issues.**

### How to Report

1. Email your findings to the project maintainers
2. Include detailed steps to reproduce the vulnerability
3. Provide any relevant proof-of-concept code
4. Allow reasonable time for us to address the issue before public disclosure

### What to Include

- Type of vulnerability
- Full paths of affected source files
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce
- Proof-of-concept or exploit code (if possible)
- Impact of the issue and how an attacker might exploit it

### Response Timeline

- We will acknowledge receipt of your report within 48 hours
- We will provide a detailed response within 7 days
- We will work to address verified vulnerabilities promptly

## Security Best Practices

When deploying Cytario Web:

- Keep all dependencies up to date
- Use HTTPS in production
- Configure proper authentication (Keycloak or Cognito)
- Follow the principle of least privilege for S3/MinIO access
- Regularly review and rotate credentials
- Monitor application logs for suspicious activity
