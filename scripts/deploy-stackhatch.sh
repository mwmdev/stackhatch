#!/usr/bin/env bash
# Production deploy entry point, installed on the host as /usr/local/bin/deploy-stackhatch.
# CI's deploy key may run only this script (authorized_keys `restrict,command=`), so the
# commit SHA arrives in SSH_ORIGINAL_COMMAND and a gzipped `docker save` archive on stdin.
set -euo pipefail

tag="${SSH_ORIGINAL_COMMAND:-${1:-}}"
if [[ ! "$tag" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "deploy-stackhatch: expected a commit SHA, got '$tag'" >&2
  exit 2
fi
image="stackhatch:$tag"
container=stackhatch
keep_images=3

# `docker load` applies every name stored in an archive. Strip them all, so the key can
# only add one untagged image, which this script names itself.
strip_names='
import io, json, sys, tarfile
src = tarfile.open(fileobj=sys.stdin.buffer, mode="r|")
dst = tarfile.open(fileobj=sys.stdout.buffer, mode="w|")
for member in src:
    if member.name == "repositories":
        continue
    data = src.extractfile(member) if member.isfile() else None
    if member.name in ("manifest.json", "index.json"):
        doc = json.load(data)
        entries = doc if member.name == "manifest.json" else doc.get("manifests", [])
        if len(entries) != 1:
            sys.exit("deploy-stackhatch: the archive must hold exactly one image")
        if member.name == "manifest.json":
            entries[0]["RepoTags"] = []
        else:
            entries[0].pop("annotations", None)
        raw = json.dumps(doc).encode()
        member.size = len(raw)
        data = io.BytesIO(raw)
    dst.addfile(member, data)
dst.close()
'

exec 9>/run/lock/deploy-stackhatch.lock
flock 9

loaded="$(gunzip | python3 -c "$strip_names" | docker load)"
new_id="$(sed -n 's/^Loaded image ID: //p' <<<"$loaded")"
if [[ ! "$new_id" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "deploy-stackhatch: could not read the loaded image ID from: $loaded" >&2
  exit 1
fi
docker tag "$new_id" "$image"

# Roll back by image ID: re-running a commit moves its tag to a fresh build.
previous="$(docker inspect --format '{{.Image}}' "$container" 2>/dev/null || true)"

start() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker run -d --name "$container" --restart unless-stopped \
    -p 127.0.0.1:8000:3000 --read-only --cap-drop ALL \
    --security-opt no-new-privileges --tmpfs /tmp "$1" >/dev/null
}

wait_healthy() {
  local status
  for _ in $(seq 45); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || true)"
    case "$status" in
      healthy) return 0 ;;
      unhealthy | "") return 1 ;;
    esac
    sleep 2
  done
  return 1
}

# Keep the newest tagged images for manual rollback; images in use are skipped by `docker rmi`.
prune() {
  docker images stackhatch --format '{{.Repository}}:{{.Tag}}' | tail -n +"$((keep_images + 1))" |
    xargs -r docker rmi >/dev/null 2>&1 || true
}

if start "$image" && wait_healthy; then
  # A re-run of the same commit leaves the replaced build untagged; nothing can reach it.
  if [[ -n "$previous" && "$previous" != "$new_id" &&
    -z "$(docker image inspect --format '{{join .RepoTags ""}}' "$previous" 2>/dev/null)" ]]; then
    docker rmi "$previous" >/dev/null 2>&1 || true
  fi
  prune
  echo "deploy-stackhatch: $image is live"
  exit 0
fi

echo "deploy-stackhatch: $image failed to start or is unhealthy" >&2
if [[ -n "$previous" && "$previous" != "$new_id" ]]; then
  echo "deploy-stackhatch: rolling back to $previous" >&2
  if ! { start "$previous" && wait_healthy; }; then
    echo "deploy-stackhatch: rollback is unhealthy too" >&2
  fi
fi
# Drop the failed build so it cannot push the last good image out of the kept set.
docker rmi "$image" >/dev/null 2>&1 || true
prune
exit 1
