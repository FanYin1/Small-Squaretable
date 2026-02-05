#!/bin/bash
# =============================================================================
# PostgreSQL Database Backup Script
# Small-Squaretable Project - Phase 7.4
# =============================================================================
# Features:
#   - Full backup using pg_dump
#   - Gzip compression
#   - Optional S3 upload
#   - Retention policy (delete old backups)
#   - WAL archiving support for incremental backups
#   - Comprehensive logging
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

# Database connection settings (from environment or defaults)
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-sillytavern_saas}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"

# Backup settings
BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
BACKUP_PREFIX="${BACKUP_PREFIX:-small-squaretable}"

# S3 settings (optional)
S3_ENABLED="${S3_ENABLED:-false}"
S3_BUCKET="${S3_BUCKET:-}"
S3_PREFIX="${S3_PREFIX:-backups/postgres}"
S3_REGION="${S3_REGION:-us-east-1}"

# WAL archiving settings (for PITR)
WAL_ARCHIVE_ENABLED="${WAL_ARCHIVE_ENABLED:-false}"
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/var/backups/postgres/wal}"

# Logging
LOG_DIR="${LOG_DIR:-/var/log/backup}"
LOG_FILE="${LOG_DIR}/backup-$(date +%Y%m%d).log"

# =============================================================================
# Functions
# =============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

log_info() {
    log "INFO" "$@"
}

log_error() {
    log "ERROR" "$@"
}

log_warn() {
    log "WARN" "$@"
}

log_success() {
    log "SUCCESS" "$@"
}

# Create required directories
setup_directories() {
    log_info "Setting up backup directories..."
    mkdir -p "${BACKUP_DIR}"
    mkdir -p "${LOG_DIR}"

    if [[ "${WAL_ARCHIVE_ENABLED}" == "true" ]]; then
        mkdir -p "${WAL_ARCHIVE_DIR}"
    fi

    log_info "Directories created successfully"
}

# Wait for database to be ready
wait_for_db() {
    log_info "Waiting for database to be ready..."
    local max_attempts=30
    local attempt=1

    while [[ ${attempt} -le ${max_attempts} ]]; do
        if PGPASSWORD="${DB_PASSWORD}" pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" > /dev/null 2>&1; then
            log_info "Database is ready"
            return 0
        fi
        log_warn "Database not ready, attempt ${attempt}/${max_attempts}..."
        sleep 2
        ((attempt++))
    done

    log_error "Database not ready after ${max_attempts} attempts"
    return 1
}

# Perform full backup using pg_dump
perform_full_backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_filename="${BACKUP_PREFIX}_full_${timestamp}.sql.gz"
    local backup_path="${BACKUP_DIR}/${backup_filename}"

    log_info "Starting full backup: ${backup_filename}"

    # Perform backup with pg_dump and compress with gzip
    PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --format=plain \
        --no-owner \
        --no-acl \
        --verbose \
        2>> "${LOG_FILE}" | gzip > "${backup_path}"

    if [[ $? -eq 0 ]]; then
        local backup_size=$(du -h "${backup_path}" | cut -f1)
        log_success "Full backup completed: ${backup_path} (${backup_size})"

        # Create checksum
        sha256sum "${backup_path}" > "${backup_path}.sha256"
        log_info "Checksum created: ${backup_path}.sha256"

        echo "${backup_path}"
        return 0
    else
        log_error "Full backup failed"
        rm -f "${backup_path}"
        return 1
    fi
}

# Perform custom format backup (for parallel restore)
perform_custom_backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_filename="${BACKUP_PREFIX}_custom_${timestamp}.dump"
    local backup_path="${BACKUP_DIR}/${backup_filename}"

    log_info "Starting custom format backup: ${backup_filename}"

    PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --format=custom \
        --compress=9 \
        --no-owner \
        --no-acl \
        --verbose \
        --file="${backup_path}" \
        2>> "${LOG_FILE}"

    if [[ $? -eq 0 ]]; then
        local backup_size=$(du -h "${backup_path}" | cut -f1)
        log_success "Custom format backup completed: ${backup_path} (${backup_size})"

        # Create checksum
        sha256sum "${backup_path}" > "${backup_path}.sha256"
        log_info "Checksum created: ${backup_path}.sha256"

        echo "${backup_path}"
        return 0
    else
        log_error "Custom format backup failed"
        rm -f "${backup_path}"
        return 1
    fi
}

# Archive WAL files for point-in-time recovery
archive_wal() {
    if [[ "${WAL_ARCHIVE_ENABLED}" != "true" ]]; then
        log_info "WAL archiving is disabled"
        return 0
    fi

    log_info "Starting WAL archive..."

    # Create base backup for PITR
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local base_backup_dir="${WAL_ARCHIVE_DIR}/base_${timestamp}"

    mkdir -p "${base_backup_dir}"

    PGPASSWORD="${DB_PASSWORD}" pg_basebackup \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -D "${base_backup_dir}" \
        --format=tar \
        --gzip \
        --checkpoint=fast \
        --wal-method=stream \
        --verbose \
        2>> "${LOG_FILE}"

    if [[ $? -eq 0 ]]; then
        local backup_size=$(du -sh "${base_backup_dir}" | cut -f1)
        log_success "WAL base backup completed: ${base_backup_dir} (${backup_size})"
        return 0
    else
        log_error "WAL base backup failed"
        rm -rf "${base_backup_dir}"
        return 1
    fi
}

# Upload backup to S3
upload_to_s3() {
    local backup_path="$1"

    if [[ "${S3_ENABLED}" != "true" ]]; then
        log_info "S3 upload is disabled"
        return 0
    fi

    if [[ -z "${S3_BUCKET}" ]]; then
        log_error "S3_BUCKET is not set"
        return 1
    fi

    local filename=$(basename "${backup_path}")
    local s3_path="s3://${S3_BUCKET}/${S3_PREFIX}/${filename}"

    log_info "Uploading backup to S3: ${s3_path}"

    # Upload backup file
    aws s3 cp "${backup_path}" "${s3_path}" \
        --region "${S3_REGION}" \
        --storage-class STANDARD_IA \
        2>> "${LOG_FILE}"

    if [[ $? -eq 0 ]]; then
        log_success "Backup uploaded to S3: ${s3_path}"

        # Upload checksum file
        if [[ -f "${backup_path}.sha256" ]]; then
            aws s3 cp "${backup_path}.sha256" "${s3_path}.sha256" \
                --region "${S3_REGION}" \
                2>> "${LOG_FILE}"
            log_info "Checksum uploaded to S3"
        fi

        return 0
    else
        log_error "Failed to upload backup to S3"
        return 1
    fi
}

# Apply retention policy - delete old backups
apply_retention_policy() {
    log_info "Applying retention policy (keeping ${BACKUP_RETENTION_DAYS} days)..."

    # Delete old local backups
    local deleted_count=0
    while IFS= read -r -d '' file; do
        log_info "Deleting old backup: ${file}"
        rm -f "${file}" "${file}.sha256"
        ((deleted_count++))
    done < <(find "${BACKUP_DIR}" -name "${BACKUP_PREFIX}_*.sql.gz" -type f -mtime +${BACKUP_RETENTION_DAYS} -print0 2>/dev/null)

    while IFS= read -r -d '' file; do
        log_info "Deleting old backup: ${file}"
        rm -f "${file}" "${file}.sha256"
        ((deleted_count++))
    done < <(find "${BACKUP_DIR}" -name "${BACKUP_PREFIX}_*.dump" -type f -mtime +${BACKUP_RETENTION_DAYS} -print0 2>/dev/null)

    log_info "Deleted ${deleted_count} old backup(s)"

    # Delete old WAL archives
    if [[ "${WAL_ARCHIVE_ENABLED}" == "true" ]]; then
        local wal_deleted=0
        while IFS= read -r -d '' dir; do
            log_info "Deleting old WAL archive: ${dir}"
            rm -rf "${dir}"
            ((wal_deleted++))
        done < <(find "${WAL_ARCHIVE_DIR}" -maxdepth 1 -name "base_*" -type d -mtime +${BACKUP_RETENTION_DAYS} -print0 2>/dev/null)
        log_info "Deleted ${wal_deleted} old WAL archive(s)"
    fi

    # Delete old S3 backups
    if [[ "${S3_ENABLED}" == "true" && -n "${S3_BUCKET}" ]]; then
        log_info "Cleaning up old S3 backups..."
        local cutoff_date=$(date -d "-${BACKUP_RETENTION_DAYS} days" +%Y-%m-%d)

        aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" --region "${S3_REGION}" 2>/dev/null | while read -r line; do
            local file_date=$(echo "${line}" | awk '{print $1}')
            local filename=$(echo "${line}" | awk '{print $4}')

            if [[ "${file_date}" < "${cutoff_date}" && -n "${filename}" ]]; then
                log_info "Deleting old S3 backup: ${filename}"
                aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}/${filename}" --region "${S3_REGION}" 2>> "${LOG_FILE}"
            fi
        done
    fi

    log_success "Retention policy applied"
}

# List existing backups
list_backups() {
    log_info "Listing existing backups..."

    echo ""
    echo "=== Local Backups ==="
    ls -lh "${BACKUP_DIR}"/${BACKUP_PREFIX}_*.sql.gz 2>/dev/null || echo "No SQL backups found"
    ls -lh "${BACKUP_DIR}"/${BACKUP_PREFIX}_*.dump 2>/dev/null || echo "No custom format backups found"

    if [[ "${WAL_ARCHIVE_ENABLED}" == "true" ]]; then
        echo ""
        echo "=== WAL Archives ==="
        ls -lhd "${WAL_ARCHIVE_DIR}"/base_* 2>/dev/null || echo "No WAL archives found"
    fi

    if [[ "${S3_ENABLED}" == "true" && -n "${S3_BUCKET}" ]]; then
        echo ""
        echo "=== S3 Backups ==="
        aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" --region "${S3_REGION}" 2>/dev/null || echo "No S3 backups found"
    fi
}

# Print usage
usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

PostgreSQL Database Backup Script for Small-Squaretable

OPTIONS:
    -f, --full          Perform full backup (default)
    -c, --custom        Perform custom format backup (for parallel restore)
    -w, --wal           Perform WAL base backup for PITR
    -a, --all           Perform all backup types
    -l, --list          List existing backups
    -r, --retention     Apply retention policy only
    -h, --help          Show this help message

ENVIRONMENT VARIABLES:
    POSTGRES_HOST           Database host (default: localhost)
    POSTGRES_PORT           Database port (default: 5432)
    POSTGRES_DB             Database name (default: sillytavern_saas)
    POSTGRES_USER           Database user (default: postgres)
    POSTGRES_PASSWORD       Database password
    BACKUP_DIR              Backup directory (default: /var/backups/postgres)
    BACKUP_RETENTION_DAYS   Days to keep backups (default: 7)
    S3_ENABLED              Enable S3 upload (default: false)
    S3_BUCKET               S3 bucket name
    S3_PREFIX               S3 prefix (default: backups/postgres)
    S3_REGION               AWS region (default: us-east-1)
    WAL_ARCHIVE_ENABLED     Enable WAL archiving (default: false)
    WAL_ARCHIVE_DIR         WAL archive directory

EXAMPLES:
    # Full backup with default settings
    $(basename "$0") --full

    # Custom format backup with S3 upload
    S3_ENABLED=true S3_BUCKET=my-bucket $(basename "$0") --custom

    # All backup types with WAL archiving
    WAL_ARCHIVE_ENABLED=true $(basename "$0") --all

    # List existing backups
    $(basename "$0") --list

EOF
}

# =============================================================================
# Main
# =============================================================================

main() {
    local backup_type="full"
    local do_list=false
    local do_retention_only=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -f|--full)
                backup_type="full"
                shift
                ;;
            -c|--custom)
                backup_type="custom"
                shift
                ;;
            -w|--wal)
                backup_type="wal"
                shift
                ;;
            -a|--all)
                backup_type="all"
                shift
                ;;
            -l|--list)
                do_list=true
                shift
                ;;
            -r|--retention)
                do_retention_only=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    # Setup
    setup_directories

    log_info "=========================================="
    log_info "PostgreSQL Backup Script Started"
    log_info "Database: ${DB_HOST}:${DB_PORT}/${DB_NAME}"
    log_info "Backup Directory: ${BACKUP_DIR}"
    log_info "S3 Enabled: ${S3_ENABLED}"
    log_info "WAL Archive Enabled: ${WAL_ARCHIVE_ENABLED}"
    log_info "=========================================="

    # List backups only
    if [[ "${do_list}" == "true" ]]; then
        list_backups
        exit 0
    fi

    # Retention only
    if [[ "${do_retention_only}" == "true" ]]; then
        apply_retention_policy
        exit 0
    fi

    # Wait for database
    wait_for_db || exit 1

    local backup_path=""
    local exit_code=0

    # Perform backup based on type
    case "${backup_type}" in
        full)
            backup_path=$(perform_full_backup) || exit_code=1
            if [[ ${exit_code} -eq 0 && -n "${backup_path}" ]]; then
                upload_to_s3 "${backup_path}" || exit_code=1
            fi
            ;;
        custom)
            backup_path=$(perform_custom_backup) || exit_code=1
            if [[ ${exit_code} -eq 0 && -n "${backup_path}" ]]; then
                upload_to_s3 "${backup_path}" || exit_code=1
            fi
            ;;
        wal)
            archive_wal || exit_code=1
            ;;
        all)
            backup_path=$(perform_full_backup) || exit_code=1
            if [[ ${exit_code} -eq 0 && -n "${backup_path}" ]]; then
                upload_to_s3 "${backup_path}" || true
            fi

            backup_path=$(perform_custom_backup) || exit_code=1
            if [[ ${exit_code} -eq 0 && -n "${backup_path}" ]]; then
                upload_to_s3 "${backup_path}" || true
            fi

            archive_wal || true
            ;;
    esac

    # Apply retention policy
    apply_retention_policy

    # Summary
    log_info "=========================================="
    if [[ ${exit_code} -eq 0 ]]; then
        log_success "Backup completed successfully"
    else
        log_error "Backup completed with errors"
    fi
    log_info "=========================================="

    exit ${exit_code}
}

# Run main function
main "$@"
