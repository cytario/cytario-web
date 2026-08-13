#!/usr/bin/env bash
# rclone serve s3 — local S3-compatible endpoint for presigned-URL development.
#
# rclone's `serve s3` provides a minimal S3-compatible server with SigV4 auth,
# path-style addressing, and zero external dependencies — ideal for testing
# the presigned-URL credential path (C-377) without MinIO or cloud buckets.
#
# The presign route has a dev-only carve-out for http://localhost / http://127.0.0.1
# so it bypasses the HTTPS-only isAllowedS3Host guard in development.
#
# Usage:
#   ./scripts/rclone-serve-s3.sh                    # default port 9000, data in ./devenv/rclone-s3-data
#   ./scripts/rclone-serve-s3.sh 8080               # custom port
#   ./scripts/rclone-serve-s3.sh 8080 /path/to/dir  # custom port + data dir
#
# Credentials (match the dev providers YAML):
#   AccessKeyId:     cytario-dev
#   SecretAccessKey: cytario-dev-secret
#
# Then configure a presigned connection with endpoint http://localhost:9000
# and staticCredentials { accessKeyId: "cytario-dev", secretAccessKey: "cytario-dev-secret" }.

set -euo pipefail

PORT="${1:-9000}"
DATA_DIR="${2:-$(dirname "$0")/../devenv/rclone-s3-data}"
AUTH_KEY="cytario-dev,cytario-dev-secret"

mkdir -p "$DATA_DIR"

echo "Starting rclone serve s3 on http://localhost:${PORT}"
echo "  Data dir:   ${DATA_DIR}"
echo "  AccessKey:  cytario-dev"
echo "  SecretKey:  cytario-dev-secret"
echo ""
echo "Configure a presigned provider in devenv/providers.dev.yaml with:"
echo "  endpoint: http://localhost:${PORT}"
echo "  staticCredentials:"
echo "    accessKeyId: cytario-dev"
echo "    secretAccessKey: cytario-dev-secret"
echo ""
echo "Press Ctrl+C to stop."

exec rclone serve s3 "local:${DATA_DIR}" \
  --addr "127.0.0.1:${PORT}" \
  --auth-key "${AUTH_KEY}" \
  --server-side-auth
