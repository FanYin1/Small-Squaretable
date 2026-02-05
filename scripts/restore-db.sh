#!/bin/bash
# =============================================================================
# PostgreSQL Database Restore Script
# Small-Squaretable Project - Phase 7.4
# =============================================================================
# Features:
#   - Restore from local backup files
#   - Restore from S3
#   - Point-in-time recovery (PITR)
#   - Safety confirmation prompts
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
BACKUP_PREFIX="${BACKUP_PREFIX:-small-squaretable}"

# S3 settings (optional)
S3_BUCKET="${S3_BUCKET:-}"
S3_PREFIX="${S3_PREFIX:-backups/postgres}"
S3_REGION="${S3_REGION:-us-east-1}"

# WAL archiving settings (for PITR)
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/var/backups/postgres/wal}"

# Logging
LOG_DIR="${LOG_DIR:-/var/log/backup}"
LOG_FILE="${LOG_DIR}/restore-$(date +%Y%m%d).log"

# Safety settings
FORCE_RESTORE="${FORCE_RESTORE:-false}"
DRY_RUN="${DRY_RUN:-false}"

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
    mkdir -p "${BACKUP_DIR}"
    mkdir -p "${LOG_DIR}"
}

# Safety confirmation prompt
confirm_restore() {
    local target_db="$1"
    local backup_file="$2"

    if [[ "${FORCE_RESTORE}" == "true" ]]; then
        log_warn "Force restore enabled, skipping confirmation"
        return 0
    fi

    echo ""
    echo "=============================================="
    echo "           DATABASE RESTORE WARNING"
    echo "=============================================="
    echo ""
    echo "You are about to restore the database:"
    echo "  Target Database: ${target_db}"
    echo "  Backup File: ${backup_file}"
    echo "  Database Host: ${DB_HOST}:${DB_PORT}"
    echo ""
    echo "THIS WILL OVERWRITE ALL EXISTING DATA!"
    echo ""
    echo "=============================================="
    echo ""

    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [[ "${confirm}" != "yes" ]]; then
        log_info "Restore cancelled by user"
        exit 0
    fi

    read -p "Please type the database name to confirm: " confirm_db
    if [[ "${confirm_db}" != "${target_db}" ]]; then
        log_error "Database name does not match. Restore cancelled."
        exit 1
    fi

    log_info "Restore confirmed by user"
    return 0
}

# Wait for database to be ready
wait_for_db() {
    log_info "Waiting for database to be ready..."
    local max_attempts=30
    local attempt=1

    while [[ ${attempt} -le ${max_attempts} ]]; do
        if PGPASSWORD="${DB_PASSWORD}" pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" > /dev/null 2>&1; then
            log_info "Database server is ready"
            return 0
        fi
        log_warn "Database not ready, attempt ${attempt}/${max_attempts}..."
        sleep 2
        ((attempt++))
    done

    log_error "Database not ready after ${max_attempts} attempts"
    return 1
}

# Verify backup file integrity
verify_backup() {
    local backup_path="$1"

    log_info "Verifying backup file integrity..."

    # Check if file exists
    if [[ ! -f "${backup_path}" ]]; then
        log_error "Backup file not found: ${backup_path}"
        return 1
    fi

    # Check checksum if available
    if [[ -f "${backup_path}.sha256" ]]; then
        log_info "Verifying checksum..."
        if sha256sum -c "${backup_path}.sha256" > /dev/null 2>&1; then
            log_success "Checksum verification passed"
        else
            log_error "Checksum verification failed"
            return 1
        fi
    else
        log_warn "No checksum file found, skipping verification"
    fi

    # Check if file is readable
    if [[ ! -r "${backup_path}" ]]; then
        log_error "Backup file is not readable: ${backup_path}"
        return 1
    fi

    # Check file size
    local file_size=$(stat -c%s "${backup_path}" 2>/dev/null || stat -f%z "${backup_path}" 2>/dev/null)
    if [[ ${file_size} -lt 100 ]]; then
        log_error "Backup file appears to be empty or corrupted"
        return 1
    fi

    log_success "Backup file verification passed"
    return 0
}

# Download backup from S3
download_from_s3() {
    local s3_path="$1"
    local local_path="$2"

    if [[ -z "${S3_BUCKET}" ]]; then
        log_error "S3_BUCKET is not set"
        return 1
    fi

    log_info "Downloading backup from S3: ${s3_path}"

    aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}/${s3_path}" "${local_path}" \
        --region "${S3_REGION}" \
        2>> "${LOG_FILE}"

    if [[ $? -eq 0 ]]; then
        log_success "Backup downloaded from S3"

        # Download checksum if available
        aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}/${s3_path}.sha256" "${local_path}.sha256" \
            --region "${S3_REGION}" \
            2>/dev/null || log_warn "No checksum file found in S3"

        return 0
    else
        log_error "Failed to download backup from S3"
        return 1
    fi
}

# List available backups
list_backups() {
    echo ""
    echo "=== Local Backups ==="
    if ls "${BACKUP_DIR}"/${BACKUP_PREFIX}_*.sql.gz 2>/dev/null; then
        ls -lht "${BACKUP_DIR}"/${BACKUP_PREFIX}_*.sql.gz 2>/dev/null | head -20
    else
        echo "No SQL backups found"
    fi

    echo ""
    if ls "${BACKUP_DIR}"/${BACKUP_PREFIX}_*.dump 2>/dev/null; then
        ls -lht "${BACKUP_DIR}"/${BACKUP_PREFIX}_*.dump 2>/dev/null | head -20
    else
        echo "No custom format backups found"
    fi

    echo ""
    echo "=== WAL Archives (for PITR) ==="
    if ls -d "${WAL_ARCHIVE_DIR}"/base_* 2>/dev/null; then
        ls -lhtd "${WAL_ARCHIVE_DIR}"/base_* 2>/dev/null | head -10
    else
        echo "No WAL archives found"
    fi

    if [[ -n "${S3_BUCKET}" ]]; then
        echo ""
        echo "=== S3 Backups ==="
        aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" --region "${S3_REGION}" 2>/dev/null | tail -20 || echo "No S3 backups found or unable to access S3"
    fi
}

# Restore from SQL dump (gzipped)
restore_from_sql() {
    local backup_path="$1"

    log_info "Restoring from SQL dump: ${backup_path}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY RUN] Would restore from: ${backup_path}"
        return 0
    fi

    # Drop and recreate database
    log_info "Dropping existing database..."
    PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d postgres \
        -c "DROP DATABASE IF EXISTS ${DB_NAME};" \
        2>> "${LOG_FILE}"

    log_info "Creating new database..."
    PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d postgres \
        -c "CREATE DATABASE ${DB_NAME};" \
        2>> "${LOG_FILE}"

    # Restore from backup
    log_info "Restoring data..."
    gunzip -c "${backup_path}" | PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --quiet \
        2>> "${LOG_FILE}"

    if [[ $? -eq 0 ]]; then
        log_success "Database restored successfully from SQL dump"
        return 0
    else
        log_error "Failed to restore database from SQL dump"
        return 1
    fi
}

# Restore from custom format dump
restore_from_custom() {
    local backup_path="$1"
    local jobs="${RESTORE_JOBS:-4}"

    log_info "Restoring from custom format dump: ${backup_path}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY RUN] Would restore from: ${backup_path}"
        return 0
    fi

    # Drop and recreate database
    log_info "Dropping existing database..."
    PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d postgres \
        -c "DROP DATABASE IF EXISTS ${DB_NAME};" \
        2>> "${LOG_FILE}"

    log_info "Creating new database..."
    PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d postgres \
        -c "CREATE DATABASE ${DB_NAME};" \
        2>> "${LOG_FILE}"

    # Restore using pg_restore with parallel jobs
    log_info "Restoring data with ${jobs} parallel jobs..."
    PGPASSWORD="${DB_PASSWORD}" pg_restore \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --jobs="${jobs}" \
        --no-owner \
        --no-acl \
        --verbose \
        "${backup_path}" \
        2>> "${LOG_FILE}"

    if [[ $? -eq 0 ]]; then
        log_success "Database restored successfully from custom format dump"
        return 0
    else
        log_error "Failed to restore database from custom format dump"
        return 1
    fi
}

# Point-in-time recovery
restore_pitr() {
    local base_backup="$1"
    local target_time="$2"

    log_info "Starting Point-in-Time Recovery"
    log_info "Base backup: ${base_backup}"
    log_info "Target time: ${target_time}"

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "[DRY RUN] Would perform PITR to: ${target_time}"
        return 0
    fi

    # Validate base backup exists
    if [[ ! -d "${base_backup}" ]]; then
        log_error "Base backup directory not found: ${base_backup}"
        return 1
    fi

    # Validate target time format
    if ! date -d "${target_time}" > /dev/null 2>&1; then
        log_error "Invalid target time format: ${target_time}"
        log_info "Use format: 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DD HH:MM:SS+TZ'"
        return 1
    fi

    log_warn "PITR requires PostgreSQL to be stopped and reconfigured"
    log_warn "This operation should be performed by a database administrator"
    echo ""
    echo "Manual PITR Steps:"
    echo "1. Stop PostgreSQL server"
    echo "2. Clear the data directory"
    echo "3. Extract base backup to data directory:"
    echo "   tar -xzf ${base_backup}/base.tar.gz -C \$PGDATA"
    echo "4. Create recovery.signal file in \$PGDATA"
    echo "5. Configure postgresql.conf:"
    echo "   restore_command = 'cp ${WAL_ARCHIVE_DIR}/%f %p'"
    echo "   recovery_target_time = '${target_time}'"
    echo "   recovery_target_action = 'promote'"
    echo "6. Start PostgreSQL server"
    echo "7. Verify recovery completed successfully"
    echo ""

    return 0
}

# Restore to a specific backup by selecting from list
restore_interactive() {
    echo ""
    echo "=== Available Backups ==="
    echo ""

    local backups=()
    local i=1

    # List SQL backups
    while IFS= read -r file; do
        if [[ -n "${file}" ]]; then
            backups+=("${file}")
            echo "${i}) $(basename "${file}") ($(du -h "${file}" | cut -f1))"
            ((i++))
        fi
    done < <(ls -t "${BACKUP_DIR}"/${BACKUP_PREFIX}_*.sql.gz 2>/dev/null)

    # List custom format backups
    while IFS= read -r file; do
        if [[ -n "${file}" ]]; then
            backups+=("${file}")
            echo "${i}) $(basename "${file}") ($(du -h "${file}" | cut -f1))"
            ((i++))
        fi
    done < <(ls -t "${BACKUP_DIR}"/${BACKUP_PREFIX}_*.dump 2>/dev/null)

    if [[ ${#backups[@]} -eq 0 ]]; then
        log_error "No backups found in ${BACKUP_DIR}"
        return 1
    fi

    echo ""
    read -p "Select backup number to restore (1-$((i-1))): " selection

    if [[ ! "${selection}" =~ ^[0-9]+$ ]] || [[ ${selection} -lt 1 ]] || [[ ${selection} -ge ${i} ]]; then
        log_error "Invalid selection"
        return 1
    fi

    local selected_backup="${backups[$((selection-1))]}"
    log_info "Selected backup: ${selected_backup}"

    # Confirm and restore
    confirm_restore "${DB_NAME}" "${selected_backup}"

    if [[ "${selected_backup}" == *.sql.gz ]]; then
        restore_from_sql "${selected_backup}"
    elif [[ "${selected_backup}" == *.dump ]]; then
        restore_from_custom "${selected_backup}"
    fi
}

# Print usage
usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

PostgreSQL Database Restore Script for Small-Squaretable

OPTIONS:
    -f, --file FILE     Restore from specific backup file
    -s, --s3 FILE       Download and restore from S3
    -p, --pitr TIME     Point-in-time recovery to specified time
    -b, --base DIR      Base backup directory for PITR
    -i, --interactive   Interactive mode - select from available backups
    -l, --list          List available backups
    -d, --dry-run       Show what would be done without making changes
    --force             Skip confirmation prompts (DANGEROUS)
    -h, --help          Show this help message

ENVIRONMENT VARIABLES:
    POSTGRES_HOST           Database host (default: localhost)
    POSTGRES_PORT           Database port (default: 5432)
    POSTGRES_DB             Database name (default: sillytavern_saas)
    POSTGRES_USER           Database user (default: postgres)
    POSTGRES_PASSWORD       Database password
    BACKUP_DIR              Backup directory (default: /var/backups/postgres)
    S3_BUCKET               S3 bucket name
    S3_PREFIX               S3 prefix (default: backups/postgres)
    S3_REGION               AWS region (default: us-east-1)
    RESTORE_JOBS            Parallel jobs for pg_restore (default: 4)
    FORCE_RESTORE           Skip confirmation (default: false)
    DRY_RUN                 Dry run mode (default: false)

EXAMPLES:
    # Restore from local SQL dump
    $(basename "$0") --file /var/backups/postgres/small-squaretable_full_20240115_020000.sql.gz

    # Restore from local custom format dump
    $(basename "$0") --file /var/backups/postgres/small-squaretable_custom_20240115_020000.dump

    # Download and restore from S3
    $(basename "$0") --s3 small-squaretable_full_20240115_020000.sql.gz

    # Interactive mode
    $(basename "$0") --interactive

    # Point-in-time recovery
    $(basename "$0") --pitr "2024-01-15 14:30:00" --base /var/backups/postgres/wal/base_20240115_020000

    # Dry run
    $(basename "$0") --file backup.sql.gz --dry-run

    # Force restore (skip confirmation)
    $(basename "$0") --file backup.sql.gz --force

EOF
}

# =============================================================================
# Main
# =============================================================================

main() {
    local backup_file=""
    local s3_file=""
    local pitr_time=""
    local pitr_base=""
    local do_list=false
    local do_interactive=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -f|--file)
                backup_file="$2"
                shift 2
                ;;
            -s|--s3)
                s3_file="$2"
                shift 2
                ;;
            -p|--pitr)
                pitr_time="$2"
                shift 2
                ;;
            -b|--base)
                pitr_base="$2"
                shift 2
                ;;
            -i|--interactive)
                do_interactive=true
                shift
                ;;
            -l|--list)
                do_list=true
                shift
                ;;
            -d|--dry-run)
                DRY_RUN="true"
                shift
                ;;
            --force)
                FORCE_RESTORE="true"
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
    log_info "PostgreSQL Restore Script Started"
    log_info "Target Database: ${DB_HOST}:${DB_PORT}/${DB_NAME}"
    log_info "Dry Run: ${DRY_RUN}"
    log_info "=========================================="

    # List backups only
    if [[ "${do_list}" == "true" ]]; then
        list_backups
        exit 0
    fi

    # Interactive mode
    if [[ "${do_interactive}" == "true" ]]; then
        restore_interactive
        exit $?
    fi

    # Wait for database
    wait_for_db || exit 1

    # Point-in-time recovery
    if [[ -n "${pitr_time}" ]]; then
        if [[ -z "${pitr_base}" ]]; then
            # Find latest base backup
            pitr_base=$(ls -td "${WAL_ARCHIVE_DIR}"/base_* 2>/dev/null | head -1)
            if [[ -z "${pitr_base}" ]]; then
                log_error "No base backup found for PITR. Specify with --base"
                exit 1
            fi
        fi
        restore_pitr "${pitr_base}" "${pitr_time}"
        exit $?
    fi

    # Download from S3 if specified
    if [[ -n "${s3_file}" ]]; then
        backup_file="${BACKUP_DIR}/${s3_file}"
        download_from_s3 "${s3_file}" "${backup_file}" || exit 1
    fi

    # Restore from file
    if [[ -n "${backup_file}" ]]; then
        # Verify backup
        verify_backup "${backup_file}" || exit 1

        # Confirm restore
        confirm_restore "${DB_NAME}" "${backup_file}"

        # Restore based on file type
        if [[ "${backup_file}" == *.sql.gz ]]; then
            restore_from_sql "${backup_file}"
        elif [[ "${backup_file}" == *.dump ]]; then
            restore_from_custom "${backup_file}"
        else
            log_error "Unknown backup file format: ${backup_file}"
            log_info "Supported formats: .sql.gz, .dump"
            exit 1
        fi
    else
        log_error "No backup file specified"
        echo ""
        echo "Use --file, --s3, --pitr, or --interactive to specify restore source"
        echo "Use --list to see available backups"
        echo "Use --help for more information"
        exit 1
    fi

    log_info "=========================================="
    log_success "Restore operation completed"
    log_info "=========================================="
}

# Run main function
main "$@"
