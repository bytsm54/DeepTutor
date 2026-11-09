#!/usr/bin/env bash
set -euo pipefail
umask 077

repo=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
home_dir=${DEEPTUTOR_DEPLOY_DIR:-/home/ubuntu/deeptutor}
base=deeptutor-local:1.7.2-no-signup-manim
base_revision=60fb3bdfddb30b7740c7ce3bd9b28d908f2af6db

cd "$repo"
test "$(git branch --show-current)" = custom || { echo "Switch to custom before deployment." >&2; exit 1; }
test -z "$(git status --porcelain)" || { echo "The server checkout has uncommitted changes." >&2; exit 1; }

# Re-execute after the fast-forward so that this run uses the fetched script.
if [ "${DEEPTUTOR_DEPLOY_FETCHED:-}" != 1 ]; then
  git fetch origin custom
  git merge --ff-only origin/custom
  export DEEPTUTOR_DEPLOY_FETCHED=1
  exec bash "$repo/deployment/deploy.sh" "$@"
fi

revision=$(git rev-parse HEAD)
test "$revision" = "$(git rev-parse origin/custom)"
git merge-base --is-ancestor "$base_revision" "$revision"

# The base image contains the v1.7.2 backend and pinned dependencies.
# Do not silently deploy an updated frontend over a different backend.
if ! git diff --quiet "$base_revision" "$revision" -- deeptutor deeptutor_cli deeptutor_web scripts requirements requirements.txt pyproject.toml build_metadata.py Dockerfile; then
  echo "Backend, dependencies, or runtime changed since v1.7.2. Update the base image and deployment patches before deploying." >&2
  exit 1
fi

cd "$home_dir"
container=$(sudo -n docker compose ps -q deeptutor)
test -n "$container"
test "$(sudo -n docker inspect --format '{{.State.Health.Status}}' "$container")" = healthy
running_revision=$(sudo -n docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$container")
if git -C "$repo" cat-file -e "${running_revision}^{commit}" 2>/dev/null &&
   git -C "$repo" diff --quiet "$running_revision" "$revision" -- web deeptutor/__version__.py; then
  printf 'Already deployed: application source is identical to %s. Checkout: %s.\n' "$running_revision" "$revision"
  exit 0
fi

test "$(sudo -n docker image inspect --format '{{.Id}}' "$base")" = sha256:03922e5cd7b69d4f1395122f70fe2b0eee76c23e92f53e97b750eb6a4a9ec6e9
stage=$(mktemp -d "$home_dir/.git-deploy.XXXXXX")
candidate=""
stopped=0
cleanup() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ "$stopped" = 1 ]; then
    cp -p "$backup/compose.yaml" "$candidate"
    mv -f "$candidate" "$home_dir/compose.yaml"
    sudo -n docker compose up -d --no-build --wait --wait-timeout 120 deeptutor ||
      echo "Automatic rollback failed; check the server immediately." >&2
  fi
  [ -z "$candidate" ] || rm -f "$candidate"
  rm -rf "$stage"
  exit "$status"
}
trap cleanup EXIT

mkdir "$stage/deploy"
git -C "$repo" archive --format=tar --prefix=src/ "$revision" web deeptutor/__version__.py | tar -xf - -C "$stage"
cp "$repo/deployment/"{Dockerfile.web,disable-registration.mjs,geogebra-compat.js,patch-geogebra.mjs,verify-geogebra.mjs} "$stage/deploy/"
image="deeptutor-local:git-${revision:0:12}"
sudo -n docker build --label "org.opencontainers.image.revision=$revision" -f "$stage/deploy/Dockerfile.web" -t "$image" "$stage"
test "$(sudo -n docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" = "$revision"

backup=$(mktemp -d "$home_dir/backups/git-deploy-${revision:0:12}-$(date +%Y%m%d-%H%M%S).XXXXXX")
cp -p compose.yaml .env "$backup/"
mkdir "$backup/model-picker"
cp -p model-picker/settings.py "$backup/model-picker/"
candidate=$(mktemp "$home_dir/.compose-git-deploy.XXXXXX")
awk -v image="$image" '/^    image: / {print "    image: " image; n++; next} {print} END {if (n!=1) exit 1}' compose.yaml > "$candidate"
chmod --reference=compose.yaml "$candidate"
test "$(sudo -n docker compose -f "$candidate" config --images)" = "$image"
sudo -n docker compose config --format json | jq -S 'del(.services.deeptutor.image)' > "$stage/before.json"
sudo -n docker compose -f "$candidate" config --format json | jq -S 'del(.services.deeptutor.image)' > "$stage/after.json"
cmp -s "$stage/before.json" "$stage/after.json"
volume=$(sudo -n docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' "$container")
test "$volume" = deeptutor_deeptutor-data
cmp -s compose.yaml "$backup/compose.yaml"

stopped=1
sudo -n docker compose stop -t 20 deeptutor
sudo -n docker run --rm --network none --user 0 --entrypoint tar --mount "type=volume,source=$volume,target=/app/data,readonly" "$base" -C /app/data -czf - . > "$backup/runtime-data.tgz"
tar -tzf "$backup/runtime-data.tgz" > /dev/null
sudo -n docker run --rm --network none --user 0 --entrypoint /bin/sh --tmpfs /app/data:rw,nosuid,nodev,size=256m --mount "type=bind,source=$backup,target=/backup" --mount "type=bind,source=$repo/deployment/snapshot-databases.py,target=/snapshot.py,readonly" "$base" -ec 'tar -xzf /backup/runtime-data.tgz -C /app/data; /opt/deeptutor-venv/bin/python /snapshot.py'
mv -f "$candidate" compose.yaml
sudo -n docker compose up -d --no-build --wait --wait-timeout 120 deeptutor
container=$(sudo -n docker compose ps -q deeptutor)
test "$(sudo -n docker inspect --format '{{.Config.Image}}' "$container")" = "$image"
curl -fsS --max-time 10 http://127.0.0.1:3782/login > /dev/null
sudo -n docker cp "$backup/database-baseline.json" "$container:/tmp/database-baseline.json"
verified=0
sudo -n docker exec -i --user 0 "$container" /opt/deeptutor-venv/bin/python - < "$repo/deployment/verify-databases.py" || verified=$?
sudo -n docker exec --user 0 "$container" rm -f /tmp/database-baseline.json
test "$verified" -eq 0
stopped=0
printf 'Deployed %s. Backup: %s\n' "$revision" "$backup"
