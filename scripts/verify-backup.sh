#!/bin/bash
# =============================================================================
# PostgreSQL Backup Verification Script
# Small-Squaretable Project - Phase 7.4
# =============================================================================
# Features:
#   - Verify backup file integrity (checksum)
#   - Test restore to temporary database
#   - Validate data integrity
#   - Report verification results
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

# Database connection settings
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"

# Verification settings
VERIFY_DB_NAME="${VERIFY_DB_NAME:-backup_verify_temp}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres}"
BACKUP_PREFIX="${BACKUP_PREFIX:-small-squaretable}"

# Logging
LOG_DIR="${LOG_DIR:-/var/log/backup}"
LOG_FILE="${LOG_DIR}/verify-$(date +%Y%m%d).log"

# Report settings
REPORT_FILE="${REPORT_FILE:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"

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

# Setup directories
setup() {
    mkdir -p "${LOG_DIR}"
}

# Verify checksum
verify_checksum() {
    local backup_path="$1"

    log_info "Verifying checksum for: $(basename "${backup_path}")"

    if [[ ! -f "${backup_path}.sha256" ]]; then
        log_warn "No checksum file found: ${backup_path}.sha256"
        return 2
    fi

    if sha256sum -c "${backup_path}.sha256" > /dev/null 2>&1; then
        log_success "Checksum verification PASSED"
        return 0
    else
        log_error "Checksum verification FAILED"
        return 1
    fi
}

# Verify file integrity
verify_file_integrity() {
    local backup_path="$1"

    log_info "Verifying file integrity..."

    # Check file exists and is readable
    if [[ ! -f "${backup_path}" ]]; then
        log_error "Backup file not found: ${backup_path}"
        return 1
    fi

    if [[ ! -r "${backup_path}" ]]; then
        log_error "Backup file not readable: ${backup_path}"
        return 1
    fi

    # Check file size
    local file_size=$(stat -c%s "${backup_path}" 2>/dev/null || stat -f%z "${backup_path}" 2>/dev/null)
    if [[ ${file_size} -lt 100 ]]; then
        log_error "Backup file appears empty or corrupted (size: ${file_size} bytes)"
        return 1
    fi

    log_info "File size: $(du -h "${backup_path}" | cut -f1)"

    # Verify gzip integrity for .sql.gz files
    if [[ "${backup_path}" == *.sql.gz ]]; then
        log_info "Verifying gzip integrity..."
        if gunzip -t "${backup_path}" 2>/dev/null; then
            log_success "Gzip integrity check PASSED"
        else
            log_error "Gzip integrity check FAILED"
            return 1
        fi
    fi

    # Verify custom format integrity for .dump files
    if [[ "${backup_path}" == *.dump ]]; then
        log_info "Verifying custom format integrity..."
        if pg_restore --list "${backup_path}" > /dev/null 2>&1; then
            log_success "Custom format integrity check PASSED"
        else
            log_error "Custom format integrity check FAILED"
            return 1
        fi
    fi

    log_success "File integrity verification PASSED"
    return 0
}

# Create temporary database for testing
create_temp_db() {
    log_info "Creating temporary database: ${VERIFY_DB_NAME}"

    # Drop if exists
    PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d postgres \
        -c "DROP DATABASE IF EXISTS ${VERIFY_DB_NAME};" \
        2>> "${LOG_FILE}" || true

    # Create new
    PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d postgres \
        -c "CREATE DATABASE ${VERIFY_DB_NAME};" \
        2>> "${LOG_FILE}"

    if [[ $? -eq 0 ]]; then
        log_success "Temporary database created"
        return 0
    else
        log_error "Failed to create temporary database"
        return 1
    fi
}

# Drop temporary database
drop_temp_db() {
    log_info "Dropping temporary database: ${VERIFY_DB_NAME}"

    PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d postgres \
        -c "DROP DATABASE IF EXISTS ${VERIFY_DB_NAME};" \
        2>> "${LOG_FILE}" || true

    log_info "Temporary database dropped"
}

# Test restore to temporary database
test_restore() {
    local backup_path="$1"

    log_info "Testing restore to temporary database..."

    local restore_start=$(date +%s)

    # Restore based on file type
    if [[ "${backup_path}" == *.sql.gz ]]; then
        gunzip -c "${backup_path}" | PGPASSWORD="${DB_PASSWORD}" psql \
            -h "${DB_HOST}" \
            -p "${DB_PORT}" \
            -U "${DB_USER}" \
            -d "${VERIFY_DB_NAME}" \
            --quiet \
            2>> "${LOG_FILE}"
    elif [[ "${backup_path}" == *.dump ]]; then
        PGPASSWORD="${DB_PASSWORD}" pg_restore \
            -h "${DB_HOST}" \
            -p "${DB_PORT}" \
            -U "${DB_USER}" \
            -d "${VERIFY_DB_NAME}" \
            --no-owner \
            --no-acl \
            "${backup_path}" \
            2>> "${LOG_FILE}"
    else
        log_error "Unknown backup format: ${backup_path}"
        return 1
    fi

    local restore_end=$(date +%s)
    local restore_duration=$((restore_end - restore_start))

    if [[ $? -eq 0 ]]; then
        log_success "Test restore completed in ${restore_duration} seconds"
        return 0
    else
        log_error "Test restore FAILED"
        return 1
    fi
}

# Validate restored data
validate_data() {
    log_info "Validating restored data..."

    local validation_errors=0

    # Get table count
    local table_count=$(PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${VERIFY_DB_NAME}" \
        -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" \
        2>/dev/null | tr -d ' ')

    if [[ -z "${table_count}" || "${table_count}" -eq 0 ]]; then
        log_error "No tables found in restored database"
        ((validation_errors++))
    else
        log_info "Tables found: ${table_count}"
    fi

    # Check critical tables exist
    local critical_tables=("users" "characters" "chats" "messages" "subscriptions")

    for table in "${critical_tables[@]}"; do
        local exists=$(PGPASSWORD="${DB_PASSWORD}" psql \
            -h "${DB_HOST}" \
            -p "${DB_PORT}" \
            -U "${DB_USER}" \
            -d "${VERIFY_DB_NAME}" \
            -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}');" \
            2>/dev/null | tr -d ' ')

        if [[ "${exists}" == "t" ]]; then
            # Get row count
            local row_count=$(PGPASSWORD="${DB_PASSWORD}" psql \
                -h "${DB_HOST}" \
                -p "${DB_PORT}" \
                -U "${DB_USER}" \
                -d "${VERIFY_DB_NAME}" \
                -t -c "SELECT COUNT(*) FROM ${table};" \
                2>/dev/null | tr -d ' ')
            log_info "Table '${table}': ${row_count} rows"
        else
            log_warn "Critical table '${table}' not found"
            # Don't count as error - table might not exist yet in new deployments
        fi
    done

    # Check for data integrity
    log_info "Running data integrity checks..."

    # Check for orphaned records (example)
    local orphaned_messages=$(PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${VERIFY_DB_NAME}" \
        -t -c "SELECT COUNT(*) FROM messages m LEFT JOIN chats c ON m.chat_id = c.id WHERE c.id IS NULL;" \
        2>/dev/null | tr -d ' ' || echo "0")

    if [[ "${orphaned_messages}" -gt 0 ]]; then
        log_warn "Found ${orphaned_messages} orphaned messages"
    fi

    if [[ ${validation_errors} -eq 0 ]]; then
        log_success "Data validation PASSED"
        return 0
    else
        log_error "Data validation FAILED with ${validation_errors} errors"
        return 1
    fi
}

# Generate verification report
generate_report() {
    local backup_path="$1"
    local checksum_result="$2"
    local integrity_result="$3"
    local restore_result="$4"
    local validation_result="$5"

    local overall_status="PASSED"
    if [[ "${integrity_result}" != "0" || "${restore_result}" != "0" || "${validation_result}" != "0" ]]; then
        overall_status="FAILED"
    fi

    local report=$(cat << EOF
================================================================================
BACKUP VERIFICATION REPORT
================================================================================
Date: $(date '+%Y-%m-%d %H:%M:%S')
Backup File: $(basename "${backup_path}")
Backup Size: $(du -h "${backup_path}" | cut -f1)
Backup Date: $(stat -c %y "${backup_path}" 2>/dev/null || stat -f %Sm "${backup_path}" 2>/dev/null)

VERIFICATION RESULTS:
---------------------
Checksum Verification: $([ "${checksum_result}" == "0" ] && echo "PASSED" || ([ "${checksum_result}" == "2" ] && echo "SKIPPED (no checksum file)" || echo "FAILED"))
File Integrity:        $([ "${integrity_result}" == "0" ] && echo "PASSED" || echo "FAILED")
Test Restore:          $([ "${restore_result}" == "0" ] && echo "PASSED" || echo "FAILED")
Data Validation:       $([ "${validation_result}" == "0" ] && echo "PASSED" || echo "FAILED")

OVERALL STATUS: ${overall_status}
================================================================================
EOF
)

    echo "${report}"
    echo "${report}" >> "${LOG_FILE}"

    # Save to report file if specified
    if [[ -n "${REPORT_FILE}" ]]; then
        echo "${report}" > "${REPORT_FILE}"
        log_info "Report saved to: ${REPORT_FILE}"
    fi

    # Send to Slack if configured
    if [[ -n "${SLACK_WEBHOOK}" ]]; then
        local color="good"
        [[ "${overall_status}" == "FAILED" ]] && color="danger"

        curl -s -X POST "${SLACK_WEBHOOK}" \
            -H 'Content-Type: application/json' \
            -d "{
                \"attachments\": [{
                    \"color\": \"${color}\",
                    \"title\": \"Backup Verification: ${overall_status}\",
                    \"text\": \"Backup: $(basename "${backup_path}")\nSize: $(du -h "${backup_path}" | cut -f1)\",
                    \"footer\": \"Small-Squaretable Backup System\",
                    \"ts\": $(date +%s)
                }]
            }" > /dev/null 2>&1 || log_warn "Failed to send Slack notification"
    fi

    return $([ "${overall_status}" == "PASSED" ] && echo 0 || echo 1)
}

# Verify latest backup
verify_latest() {
    log_info "Finding latest backup..."

    local latest_backup=$(ls -t "${BACKUP_DIR}"/${BACKUP_PREFIX}_*.sql.gz 2>/dev/null | head -1)

    if [[ -z "${latest_backup}" ]]; then
        latest_backup=$(ls -t "${BACKUP_DIR}"/${BACKUP_PREFIX}_*.dump 2>/dev/null | head -1)
    fi

    if [[ -z "${latest_backup}" ]]; then
        log_error "No backups found in ${BACKUP_DIR}"
        return 1
    fi

    log_info "Latest backup: ${latest_backup}"
    verify_backup "${latest_backup}"
}

# Main verification function
verify_backup() {
    local backup_path="$1"

    log_info "=========================================="
    log_info "Starting backup verification"
    log_info "Backup: ${backup_path}"
    log_info "=========================================="

    local checksum_result=0
    local integrity_result=0
    local restore_result=0
    local validation_result=0

    # Step 1: Verify checksum
    verify_checksum "${backup_path}"
    checksum_result=$?

    # Step 2: Verify file integrity
    verify_file_integrity "${backup_path}"
    integrity_result=$?

    if [[ ${integrity_result} -ne 0 ]]; then
        log_error "File integrity check failed, skipping restore test"
        generate_report "${backup_path}" "${checksum_result}" "${integrity_result}" "1" "1"
        return 1
    fi

    # Step 3: Test restore
    create_temp_db
    if [[ $? -eq 0 ]]; then
        test_restore "${backup_path}"
        restore_result=$?

        if [[ ${restore_result} -eq 0 ]]; then
            # Step 4: Validate data
            validate_data
            validation_result=$?
        fi

        # Cleanup
        drop_temp_db
    else
        restore_result=1
        validation_result=1
    fi

    # Generate report
    generate_report "${backup_path}" "${checksum_result}" "${integrity_result}" "${restore_result}" "${validation_result}"

    log_info "=========================================="
    log_info "Backup verification completed"
    log_info "=========================================="

    return $([ "${integrity_result}" == "0" ] && [ "${restore_result}" == "0" ] && [ "${validation_result}" == "0" ] && echo 0 || echo 1)
}

# Print usage
usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] [BACKUP_FILE]

PostgreSQL Backup Verification Script for Small-Squaretable

OPTIONS:
    -l, --latest        Verify the latest backup
    -a, --all           Verify all backups in backup directory
    -r, --report FILE   Save report to file
    -s, --slack URL     Send notification to Slack webhook
    -h, --help          Show this help message

ARGUMENTS:
    BACKUP_FILE         Path to specific backup file to verify

ENVIRONMENT VARIABLES:
    POSTGRES_HOST       Database host (default: localhost)
    POSTGRES_PORT       Database port (default: 5432)
    POSTGRES_USER       Database user (default: postgres)
    POSTGRES_PASSWORD   Database password
    BACKUP_DIR          Backup directory (default: /var/backups/postgres)
    VERIFY_DB_NAME      Temporary database name (default: backup_verify_temp)
    REPORT_FILE         Report output file
    SLACK_WEBHOOK       Slack webhook URL

EXAMPLES:
    # Verify specific backup
    $(basename "$0") /backups/small-squaretable_full_20240115_020000.sql.gz

    # Verify latest backup
    $(basename "$0") --latest

    # Verify all backups with report
    $(basename "$0") --all --report /tmp/backup-report.txt

    # Verify with Slack notification
    $(basename "$0") --latest --slack https://hooks.slack.com/services/xxx

EOF
}

# =============================================================================
# Main
# =============================================================================

main() {
    local backup_file=""
    local do_latest=false
    local do_all=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -l|--latest)
                do_latest=true
                shift
                ;;
            -a|--all)
                do_all=true
                shift
                ;;
            -r|--report)
                REPORT_FILE="$2"
                shift 2
                ;;
            -s|--slack)
                SLACK_WEBHOOK="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
            *)
                backup_file="$1"
                shift
                ;;
        esac
    done

    # Setup
    setup

    # Verify latest
    if [[ "${do_latest}" == "true" ]]; then
        verify_latest
        exit $?
    fi

    # Verify all
    if [[ "${do_all}" == "true" ]]; then
        local exit_code=0
        for file in "${BACKUP_DIR}"/${BACKUP_PREFIX}_*.sql.gz "${BACKUP_DIR}"/${BACKUP_PREFIX}_*.dump; do
            if [[ -f "${file}" ]]; then
                verify_backup "${file}" || exit_code=1
                echo ""
            fi
        done
        exit ${exit_code}
    fi

    # Verify specific file
    if [[ -n "${backup_file}" ]]; then
        verify_backup "${backup_file}"
        exit $?
    fi

    # No arguments - show usage
    log_error "No backup file specified"
    usage
    exit 1
}

# Run main function
main "$@"
