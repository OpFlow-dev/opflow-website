#!/usr/bin/env bash
set -euo pipefail

# Cron-safe PATH (gh is installed via linuxbrew on this host)
export PATH="/home/linuxbrew/.linuxbrew/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${GH_REPO:-OpFlow-dev/opflow-website}"
TZ_NAME="${BACKUP_TZ:-Asia/Shanghai}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

DATE_STAMP="$(TZ="$TZ_NAME" date +%Y%m%d)"
DATE_HUMAN="$(TZ="$TZ_NAME" date '+%F %T %Z')"
PASSWORD="$DATE_STAMP"
TAG="backup-${DATE_STAMP}"
TITLE="Daily Full Backup ${DATE_STAMP}"
ASSET_NAME="opflow-website-full-${DATE_STAMP}.tar.gz.enc"

TMP_DIR="$(mktemp -d /tmp/opflow-release-backup-${DATE_STAMP}-XXXXXX)"
ARCHIVE_TAR_GZ="${TMP_DIR}/opflow-website-full-${DATE_STAMP}.tar.gz"
ARCHIVE_ENC="${TMP_DIR}/${ASSET_NAME}"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

require_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required binary: $1" >&2
    exit 1
  }
}

require_bin gh
require_bin tar
require_bin openssl
require_bin date
require_bin jq

# Ensure gh auth is valid.
gh auth status >/dev/null

# Build compressed package (website + data) from working tree.
# Includes local content data (content/posts, categories, token store, uploads) and site code.
# Excludes VCS metadata, dependency caches, and transient runtime logs.
tar -C "$ROOT_DIR" -czf "$ARCHIVE_TAR_GZ" \
  --exclude='./.git' \
  --exclude='./node_modules' \
  --exclude='./.venv' \
  --exclude='./.local-libs' \
  --exclude='./qa-screenshots' \
  --exclude='./.server.log' \
  --exclude='./.admin.log' \
  --exclude='./.server.pid' \
  --exclude='./.admin.pid' \
  .

# Encrypt with daily rotation password (kept private).
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -in "$ARCHIVE_TAR_GZ" \
  -out "$ARCHIVE_ENC" \
  -pass "pass:${PASSWORD}"

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "$ARCHIVE_ENC#${ASSET_NAME}" --clobber --repo "$REPO"
  gh release edit "$TAG" --repo "$REPO" --title "$TITLE" --notes ""
  RELEASE_ACTION="updated"
else
  gh release create "$TAG" "$ARCHIVE_ENC#${ASSET_NAME}" \
    --repo "$REPO" \
    --title "$TITLE" \
    --notes ""
  RELEASE_ACTION="created"
fi

# Delete backup releases older than KEEP_DAYS.
CUTOFF_EPOCH="$(TZ="$TZ_NAME" date -d "-${KEEP_DAYS} days" +%s)"
DELETED_TAGS=()

while IFS=$'\t' read -r old_tag old_time; do
  [[ -z "${old_tag}" ]] && continue
  [[ "$old_tag" == "$TAG" ]] && continue

  # Only clean automated backup releases.
  [[ "$old_tag" =~ ^backup-[0-9]{8}$ ]] || continue
  [[ -n "$old_time" ]] || continue

  old_epoch="$(date -d "$old_time" +%s 2>/dev/null || echo 0)"
  if [[ "$old_epoch" -gt 0 && "$old_epoch" -lt "$CUTOFF_EPOCH" ]]; then
    gh release delete "$old_tag" --yes --cleanup-tag --repo "$REPO"
    DELETED_TAGS+=("$old_tag")
  fi
done < <(gh api "repos/${REPO}/releases?per_page=100" --paginate \
  --jq '.[] | "\(.tag_name)\t\(.published_at // .created_at // "")"')

if [[ ${#DELETED_TAGS[@]} -gt 0 ]]; then
  DELETED_TAGS_JSON="$(printf '%s\n' "${DELETED_TAGS[@]}" | jq -R . | jq -s .)"
else
  DELETED_TAGS_JSON='[]'
fi

jq -n \
  --arg repo "$REPO" \
  --arg tag "$TAG" \
  --arg releaseAction "$RELEASE_ACTION" \
  --arg asset "$ASSET_NAME" \
  --argjson deletedOldReleases "${#DELETED_TAGS[@]}" \
  --argjson deletedTags "$DELETED_TAGS_JSON" \
  '{
    repo: $repo,
    tag: $tag,
    releaseAction: $releaseAction,
    asset: $asset,
    deletedOldReleases: $deletedOldReleases,
    deletedTags: $deletedTags
  }'
