# Disaster Recovery Plan

## Small-Squaretable Database Backup and Recovery

This document outlines the disaster recovery (DR) strategy for the Small-Squaretable platform, including backup procedures, recovery objectives, and step-by-step recovery instructions.

---

## Table of Contents

1. [Overview](#overview)
2. [Recovery Objectives](#recovery-objectives)
3. [Backup Strategy](#backup-strategy)
4. [Recovery Procedures](#recovery-procedures)
5. [Disaster Scenarios](#disaster-scenarios)
6. [Contact Information](#contact-information)
7. [Regular Drills](#regular-drills)
8. [Appendix](#appendix)

---

## Overview

### Purpose

This disaster recovery plan ensures business continuity by providing documented procedures for:
- Regular database backups
- Data restoration in case of failure
- Minimizing downtime and data loss

### Scope

This plan covers:
- PostgreSQL database backups and recovery
- Redis cache recovery (stateless, rebuilt from database)
- Application state recovery
- User data protection

### Document Maintenance

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-04 | DevOps Team | Initial version |

---

## Recovery Objectives

### RTO (Recovery Time Objective)

| Scenario | Target RTO | Maximum RTO |
|----------|------------|-------------|
| Database corruption | 30 minutes | 1 hour |
| Hardware failure | 1 hour | 2 hours |
| Data center outage | 2 hours | 4 hours |
| Complete disaster | 4 hours | 8 hours |

### RPO (Recovery Point Objective)

| Backup Type | RPO | Description |
|-------------|-----|-------------|
| Full backup | 24 hours | Daily full backups at 2:00 AM UTC |
| WAL archiving | 5 minutes | Continuous WAL streaming (when enabled) |
| Point-in-time | Variable | Recovery to any point with WAL archives |

### Service Level Targets

- **Availability Target**: 99.9% uptime (8.76 hours downtime/year)
- **Data Durability**: 99.999999999% (11 nines) with S3 storage
- **Backup Success Rate**: 99.5% minimum

---

## Backup Strategy

### Backup Types

#### 1. Full Database Backup (Daily)

- **Schedule**: Daily at 2:00 AM UTC
- **Method**: `pg_dump` with gzip compression
- **Retention**: 7 days local, 30 days S3
- **Storage**: Local PVC + S3 (optional)

#### 2. Custom Format Backup (Weekly)

- **Schedule**: Weekly on Sundays at 3:00 AM UTC
- **Method**: `pg_dump --format=custom`
- **Benefit**: Parallel restore capability
- **Retention**: 4 weeks

#### 3. WAL Archiving (Continuous)

- **Method**: `pg_basebackup` + WAL streaming
- **Benefit**: Point-in-time recovery (PITR)
- **Retention**: 7 days of WAL files
- **Note**: Requires PostgreSQL configuration

### Backup Storage Locations

| Location | Type | Retention | Purpose |
|----------|------|-----------|---------|
| `/backups` PVC | Primary | 7 days | Fast local recovery |
| S3 Bucket | Secondary | 30 days | Disaster recovery |
| Cross-region S3 | Tertiary | 90 days | Regional disaster |

### Backup Verification

- **Automatic**: Daily checksum verification
- **Manual**: Weekly restore test to staging
- **Full DR Drill**: Quarterly complete recovery test

---

## Recovery Procedures

### Pre-Recovery Checklist

Before starting any recovery:

- [ ] Identify the failure type and scope
- [ ] Notify stakeholders (see Contact Information)
- [ ] Document the incident start time
- [ ] Assess data loss window
- [ ] Choose appropriate recovery method
- [ ] Prepare recovery environment

### Procedure 1: Restore from Local Backup

**Use when**: Local backup files are available and intact.

**Estimated time**: 15-30 minutes

```bash
# 1. List available backups
./scripts/restore-db.sh --list

# 2. Verify backup integrity
./scripts/verify-backup.sh /backups/small-squaretable_full_YYYYMMDD_HHMMSS.sql.gz

# 3. Restore from backup (interactive mode)
./scripts/restore-db.sh --interactive

# Or specify file directly
./scripts/restore-db.sh --file /backups/small-squaretable_full_YYYYMMDD_HHMMSS.sql.gz
```

### Procedure 2: Restore from S3 Backup

**Use when**: Local backups are unavailable or corrupted.

**Estimated time**: 30-60 minutes

```bash
# 1. List S3 backups
aws s3 ls s3://your-bucket/backups/postgres/

# 2. Download and restore
./scripts/restore-db.sh --s3 small-squaretable_full_YYYYMMDD_HHMMSS.sql.gz

# Or manually download first
aws s3 cp s3://your-bucket/backups/postgres/backup.sql.gz /backups/
./scripts/restore-db.sh --file /backups/backup.sql.gz
```

### Procedure 3: Point-in-Time Recovery (PITR)

**Use when**: Need to recover to a specific point in time (e.g., before accidental deletion).

**Estimated time**: 1-2 hours

**Prerequisites**: WAL archiving must be enabled.

```bash
# 1. Identify target recovery time
# Example: Recover to 2024-01-15 14:30:00 UTC

# 2. Find the appropriate base backup
ls -la /backups/wal/base_*

# 3. Initiate PITR
./scripts/restore-db.sh --pitr "2024-01-15 14:30:00" --base /backups/wal/base_20240115_020000
```

**Manual PITR Steps** (if script cannot be used):

1. Stop PostgreSQL server
2. Clear the data directory
3. Extract base backup:
   ```bash
   tar -xzf /backups/wal/base_YYYYMMDD/base.tar.gz -C $PGDATA
   ```
4. Create `recovery.signal` in `$PGDATA`
5. Configure `postgresql.conf`:
   ```
   restore_command = 'cp /backups/wal/%f %p'
   recovery_target_time = '2024-01-15 14:30:00'
   recovery_target_action = 'promote'
   ```
6. Start PostgreSQL server
7. Verify recovery completed

### Procedure 4: Kubernetes Recovery

**Use when**: Recovering in Kubernetes environment.

```bash
# 1. Scale down application
kubectl scale deployment app-deployment --replicas=0 -n small-squaretable

# 2. Create restore job
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: db-restore-$(date +%Y%m%d%H%M%S)
  namespace: small-squaretable
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: restore
          image: postgres:15-alpine
          command: ["/bin/sh", "-c"]
          args:
            - |
              # Download backup from S3 or use local
              # Restore database
              gunzip -c /backups/latest.sql.gz | psql -h postgres-service -U postgres -d sillytavern_saas
          envFrom:
            - secretRef:
                name: postgres-secrets
          volumeMounts:
            - name: backup-storage
              mountPath: /backups
      volumes:
        - name: backup-storage
          persistentVolumeClaim:
            claimName: backup-pvc
EOF

# 3. Monitor restore job
kubectl logs -f job/db-restore-* -n small-squaretable

# 4. Scale up application
kubectl scale deployment app-deployment --replicas=3 -n small-squaretable

# 5. Verify application health
kubectl get pods -n small-squaretable
curl -f https://your-domain.com/health/ready
```

### Post-Recovery Checklist

After completing recovery:

- [ ] Verify database connectivity
- [ ] Run application health checks
- [ ] Verify critical data integrity
- [ ] Check user authentication works
- [ ] Test critical user flows
- [ ] Monitor error rates
- [ ] Document recovery time and data loss
- [ ] Update incident report
- [ ] Schedule post-mortem meeting

---

## Disaster Scenarios

### Scenario 1: Database Corruption

**Symptoms**: Query errors, inconsistent data, PostgreSQL crashes

**Response**:
1. Stop application to prevent further corruption
2. Identify corruption scope
3. Restore from most recent clean backup
4. Apply WAL logs if available
5. Verify data integrity
6. Resume application

### Scenario 2: Accidental Data Deletion

**Symptoms**: Missing data reported by users

**Response**:
1. Identify deletion time from logs
2. Stop writes to affected tables (if possible)
3. Use PITR to recover to pre-deletion state
4. Or restore specific tables from backup
5. Merge recovered data if needed

### Scenario 3: Hardware/Infrastructure Failure

**Symptoms**: Database unreachable, pod crashes

**Response**:
1. Verify failure scope (single node vs cluster)
2. For single node: Wait for Kubernetes to reschedule
3. For persistent failure: Provision new storage
4. Restore from backup
5. Update DNS/routing if needed

### Scenario 4: Ransomware/Security Breach

**Symptoms**: Encrypted files, unauthorized access

**Response**:
1. **IMMEDIATELY** isolate affected systems
2. Notify security team and management
3. Do NOT pay ransom
4. Provision clean infrastructure
5. Restore from verified clean backup
6. Rotate all credentials
7. Conduct security audit

### Scenario 5: Regional Disaster

**Symptoms**: Entire region unavailable

**Response**:
1. Activate DR site in alternate region
2. Restore from cross-region S3 backup
3. Update DNS to point to DR site
4. Notify users of potential data loss
5. Plan migration back when primary recovers

---

## Contact Information

### Escalation Path

| Level | Role | Contact | Response Time |
|-------|------|---------|---------------|
| L1 | On-Call Engineer | PagerDuty | 15 minutes |
| L2 | Database Admin | [DBA Team Slack] | 30 minutes |
| L3 | Platform Lead | [Direct Phone] | 1 hour |
| L4 | CTO | [Emergency Line] | 2 hours |

### Key Contacts

| Role | Name | Email | Phone |
|------|------|-------|-------|
| Primary DBA | [Name] | dba@company.com | +1-XXX-XXX-XXXX |
| Backup DBA | [Name] | dba-backup@company.com | +1-XXX-XXX-XXXX |
| Platform Lead | [Name] | platform@company.com | +1-XXX-XXX-XXXX |
| Security Team | [Name] | security@company.com | +1-XXX-XXX-XXXX |

### External Contacts

| Service | Contact | Account ID |
|---------|---------|------------|
| AWS Support | aws.amazon.com/support | [Account ID] |
| PostgreSQL Support | [Vendor] | [Contract ID] |
| Incident Response | [Security Vendor] | [Contract ID] |

---

## Regular Drills

### Drill Schedule

| Drill Type | Frequency | Duration | Participants |
|------------|-----------|----------|--------------|
| Backup verification | Weekly | 30 min | Automated |
| Restore test (staging) | Monthly | 2 hours | DBA Team |
| Full DR drill | Quarterly | 4 hours | All Teams |
| Tabletop exercise | Semi-annual | 2 hours | Leadership |

### Drill Procedures

#### Weekly Backup Verification

Automated via `verify-backup.sh`:
- Verify latest backup checksum
- Test restore to temporary database
- Validate row counts
- Report results to monitoring

#### Monthly Restore Test

1. Select random backup from past week
2. Restore to staging environment
3. Run data integrity checks
4. Document restore time
5. Report findings

#### Quarterly DR Drill

1. **Preparation** (1 week before)
   - Schedule maintenance window
   - Notify stakeholders
   - Prepare runbooks

2. **Execution**
   - Simulate failure scenario
   - Execute recovery procedures
   - Measure RTO/RPO
   - Document issues

3. **Review**
   - Compare against targets
   - Identify improvements
   - Update procedures
   - Schedule follow-up

### Drill Documentation

After each drill, document:
- Date and participants
- Scenario tested
- Actual RTO/RPO achieved
- Issues encountered
- Lessons learned
- Action items

---

## Appendix

### A. Backup File Naming Convention

```
{prefix}_{type}_{timestamp}.{extension}

Examples:
- small-squaretable_full_20240115_020000.sql.gz
- small-squaretable_custom_20240115_020000.dump
- base_20240115_020000/ (WAL base backup directory)
```

### B. Environment Variables

```bash
# Database
POSTGRES_HOST=postgres-service
POSTGRES_PORT=5432
POSTGRES_DB=sillytavern_saas
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<secret>

# Backup
BACKUP_DIR=/var/backups/postgres
BACKUP_RETENTION_DAYS=7
BACKUP_PREFIX=small-squaretable

# S3
S3_ENABLED=true
S3_BUCKET=your-backup-bucket
S3_PREFIX=backups/postgres
S3_REGION=us-east-1

# WAL
WAL_ARCHIVE_ENABLED=false
WAL_ARCHIVE_DIR=/var/backups/postgres/wal
```

### C. Monitoring Alerts

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| Backup Failed | CronJob failed | Critical | Investigate immediately |
| Backup Age | No backup in 26 hours | Warning | Check CronJob status |
| Backup Size | Size changed >50% | Warning | Verify data integrity |
| S3 Sync Failed | S3 upload failed | Warning | Check AWS credentials |
| Storage Full | PVC >80% used | Warning | Clean old backups |

### D. Recovery Time Estimates

| Database Size | Backup Type | Estimated Restore Time |
|---------------|-------------|------------------------|
| < 1 GB | SQL dump | 5-10 minutes |
| 1-10 GB | SQL dump | 10-30 minutes |
| 10-50 GB | Custom format | 30-60 minutes |
| 50-100 GB | Custom format (parallel) | 1-2 hours |
| > 100 GB | Custom format (parallel) | 2-4 hours |

### E. Related Documentation

- [Deployment Guide](../deployment/deployment-guide.md)
- [Monitoring & Alerts](../monitoring/alerts.md)
- [Security Policies](../security/README.md)
- [Incident Response](../security/incident-response.md)

---

## Document Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Author | DevOps Team | 2026-02-04 | |
| Reviewer | DBA Lead | | |
| Approver | CTO | | |

---

*Last Updated: 2026-02-04*
*Next Review: 2026-05-04*
