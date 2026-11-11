#!/usr/bin/env bash
set -Eeuo pipefail

# Never print credentials or the DATABASE_URL.
umask 077

required_vars=(
  DATABASE_URL
  AGE_RECIPIENT
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  R2_ENDPOINT
  R2_BUCKET
)

for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: required environment variable is missing: ${name}" >&2
    exit 1
  fi
done

export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
export AWS_EC2_METADATA_DISABLED=true
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"
export AWS_MAX_ATTEMPTS="${AWS_MAX_ATTEMPTS:-5}"

WORK_DIR="$(mktemp -d /tmp/sportsmack-db-backup.XXXXXX)"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_PREFIX="${BACKUP_PREFIX:-sportsmack-production}"
BACKUP_PATH_PREFIX="${BACKUP_PATH_PREFIX:-database-backups}"
OBJECT_KEY="${BACKUP_PATH_PREFIX%/}/${BACKUP_PREFIX}-${TIMESTAMP}.dump.age"

PLAIN_DUMP="$WORK_DIR/production.dump"
ENCRYPTED_DUMP="$WORK_DIR/production.dump.age"
DOWNLOADED_DUMP="$WORK_DIR/remote-production.dump.age"

echo "Starting SportSmack PostgreSQL backup at ${TIMESTAMP} (UTC)."

echo "Creating PostgreSQL custom-format dump..."
pg_dump \
  --no-password \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$PLAIN_DUMP" \
  "$DATABASE_URL"

if [[ ! -s "$PLAIN_DUMP" ]]; then
  echo "ERROR: pg_dump produced an empty file." >&2
  exit 1
fi

echo "Validating PostgreSQL archive..."
pg_restore --list "$PLAIN_DUMP" >/dev/null

echo "Encrypting backup for the configured age recipient..."
age \
  --encrypt \
  --recipient "$AGE_RECIPIENT" \
  --output "$ENCRYPTED_DUMP" \
  "$PLAIN_DUMP"

if [[ ! -s "$ENCRYPTED_DUMP" ]]; then
  echo "ERROR: age produced an empty encrypted file." >&2
  exit 1
fi

LOCAL_SHA256="$(sha256sum "$ENCRYPTED_DUMP" | awk '{print $1}')"
LOCAL_SIZE="$(wc -c < "$ENCRYPTED_DUMP" | tr -d '[:space:]')"

echo "Uploading encrypted backup to private R2 bucket..."
aws s3 cp "$ENCRYPTED_DUMP" "s3://${R2_BUCKET}/${OBJECT_KEY}" \
  --endpoint-url "$R2_ENDPOINT" \
  --region "$AWS_DEFAULT_REGION" \
  --only-show-errors

echo "Downloading uploaded object for independent verification..."
aws s3 cp "s3://${R2_BUCKET}/${OBJECT_KEY}" "$DOWNLOADED_DUMP" \
  --endpoint-url "$R2_ENDPOINT" \
  --region "$AWS_DEFAULT_REGION" \
  --only-show-errors

REMOTE_SHA256="$(sha256sum "$DOWNLOADED_DUMP" | awk '{print $1}')"
REMOTE_SIZE="$(wc -c < "$DOWNLOADED_DUMP" | tr -d '[:space:]')"

if [[ "$LOCAL_SHA256" != "$REMOTE_SHA256" || "$LOCAL_SIZE" != "$REMOTE_SIZE" ]] || ! cmp -s "$ENCRYPTED_DUMP" "$DOWNLOADED_DUMP"; then
  echo "ERROR: downloaded R2 object does not match the uploaded encrypted backup." >&2
  exit 1
fi

echo "BACKUP_VERIFIED"
echo "Object: s3://${R2_BUCKET}/${OBJECT_KEY}"
echo "Encrypted size: ${LOCAL_SIZE} bytes"
echo "SHA-256: ${LOCAL_SHA256}"
echo "The uploaded object was downloaded and matched the local encrypted file."
echo "The plaintext dump and temporary files will now be removed."
