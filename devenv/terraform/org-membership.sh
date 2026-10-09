#!/usr/bin/env bash
# Assign users to the bootstrap Organization's groups via the org-scoped
# admin API — the same endpoint the app uses (organizations.ts
# addUserToOrganizationGroup). The terraform provider cannot express this:
# its group-membership resources target the legacy realm endpoint, which
# does not work for Organization groups in Keycloak 26.
#
# Usage: org-membership.sh <realm> <org_id> <user>:<group> [<user>:<group>...]
# Group names are relative to the organization (e.g. admins, Lab/TeamX).

set -euo pipefail

realm="${1:?usage: org-membership.sh <realm> <org_id> <user>:<group>...}"
org_id="${2:?missing organization id}"
shift 2

base="http://localhost:8080/admin/realms/${realm}"

token=$(curl -s "http://localhost:8080/realms/${realm}/protocol/openid-connect/token" \
  -d grant_type=password -d client_id=admin-cli \
  -d username=admin -d password=admin |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

groups_json=$(curl -s -H "Authorization: Bearer $token" \
  "${base}/organizations/${org_id}/groups")

group_id() { # group path relative to the org
  printf '%s' "$groups_json" | python3 -c "
import json, sys
want = '$1'.strip('/')
def find(groups):
    for g in groups:
        if g['path'].strip('/') == want or g['name'] == want:
            return g['id']
        hit = find(g.get('subGroups', []))
        if hit: return hit
print(find(json.load(sys.stdin)) or '')"
}

user_id() {
  curl -s -H "Authorization: Bearer $token" \
    "${base}/users?username=${1}&exact=true" |
    python3 -c 'import json,sys; u=json.load(sys.stdin); print(u[0]["id"] if u else "")'
}

failures=0
for assignment in "$@"; do
  user="${assignment%%:*}"
  group="${assignment##*:}"
  uid=$(user_id "$user")
  gid=$(group_id "$group")
  if [ -z "$uid" ] || [ -z "$gid" ]; then
    echo "FAIL: ${user} -> ${group} (user or group not found)" >&2
    failures=$((failures + 1))
    continue
  fi
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
    -H "Authorization: Bearer $token" \
    "${base}/organizations/${org_id}/groups/${gid}/members/${uid}")
  echo "${user} -> ${group}: HTTP ${code}"
  [ "$code" = "204" ] || failures=$((failures + 1))
done

exit $((failures > 0))
