#!/bin/bash
# Kubernetes deployment script for Small Squaretable

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="small-squaretable"
K8S_DIR="./k8s"
ENVIRONMENT=""
USE_KUSTOMIZE=false
DRY_RUN=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -k|--kustomize)
            USE_KUSTOMIZE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -e, --environment ENV   Deploy to specific environment (staging, production)"
            echo "  -k, --kustomize         Use kustomize for deployment"
            echo "  --dry-run               Validate without applying changes"
            echo "  -h, --help              Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                      # Traditional deployment"
            echo "  $0 -k                   # Deploy using kustomize (base)"
            echo "  $0 -k -e production     # Deploy using kustomize production overlay"
            echo "  $0 -k -e staging        # Deploy using kustomize staging overlay"
            echo "  $0 --dry-run -k         # Validate kustomize configuration"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi

    # Check kustomize if using kustomize mode
    if [ "$USE_KUSTOMIZE" = true ]; then
        # kubectl has built-in kustomize support, but check for standalone if preferred
        log_info "Using kubectl's built-in kustomize support"
    fi

    # Check cluster connection (skip for dry-run)
    if [ "$DRY_RUN" = false ]; then
        if ! kubectl cluster-info &> /dev/null; then
            log_error "Cannot connect to Kubernetes cluster"
            exit 1
        fi
    fi

    # Check if secrets file exists (only for traditional deployment)
    if [ "$USE_KUSTOMIZE" = false ] && [ ! -f "$K8S_DIR/secrets-production.yaml" ]; then
        log_error "secrets-production.yaml not found"
        log_info "Please create it from secrets.yaml template"
        exit 1
    fi

    log_info "Prerequisites check passed"
}

deploy_namespace() {
    log_info "Creating namespace..."
    kubectl apply -f "$K8S_DIR/namespace.yaml"
}

deploy_config() {
    log_info "Deploying ConfigMap and Secrets..."
    kubectl apply -f "$K8S_DIR/configmap.yaml"
    kubectl apply -f "$K8S_DIR/secrets-production.yaml"
}

deploy_storage() {
    log_info "Creating Persistent Volume Claims..."
    kubectl apply -f "$K8S_DIR/pvc.yaml"
}

deploy_postgres() {
    log_info "Deploying PostgreSQL..."
    kubectl apply -f "$K8S_DIR/postgres-deployment.yaml"

    log_info "Waiting for PostgreSQL to be ready..."
    kubectl wait --for=condition=ready pod -l app=postgres -n "$NAMESPACE" --timeout=300s

    log_info "PostgreSQL is ready"
}

deploy_redis() {
    log_info "Deploying Redis..."
    kubectl apply -f "$K8S_DIR/redis-deployment.yaml"

    log_info "Waiting for Redis to be ready..."
    kubectl wait --for=condition=ready pod -l app=redis -n "$NAMESPACE" --timeout=300s

    log_info "Redis is ready"
}

run_migrations() {
    log_info "Running database migrations..."

    # Delete existing migration job if exists
    kubectl delete job db-migration -n "$NAMESPACE" --ignore-not-found=true

    # Apply migration job
    kubectl apply -f "$K8S_DIR/db-migration-job.yaml"

    log_info "Waiting for migration to complete..."
    kubectl wait --for=condition=complete job/db-migration -n "$NAMESPACE" --timeout=300s

    log_info "Database migration completed"
}

deploy_app() {
    log_info "Deploying application..."
    kubectl apply -f "$K8S_DIR/app-deployment.yaml"

    log_info "Waiting for application to be ready..."
    kubectl wait --for=condition=available deployment/app -n "$NAMESPACE" --timeout=300s

    log_info "Application is ready"
}

deploy_ingress() {
    log_info "Deploying Ingress..."
    kubectl apply -f "$K8S_DIR/ingress.yaml"
}

deploy_hpa() {
    log_info "Deploying Horizontal Pod Autoscaler..."
    kubectl apply -f "$K8S_DIR/hpa.yaml"
}

deploy_pdb() {
    log_info "Deploying Pod Disruption Budgets..."
    kubectl apply -f "$K8S_DIR/pdb.yaml"
}

deploy_network_policy() {
    log_info "Deploying Network Policies..."
    kubectl apply -f "$K8S_DIR/network-policy.yaml"
}

# Kustomize deployment functions
deploy_with_kustomize() {
    local kustomize_path="$K8S_DIR"

    # Determine kustomize path based on environment
    if [ -n "$ENVIRONMENT" ]; then
        kustomize_path="$K8S_DIR/overlays/$ENVIRONMENT"
        if [ ! -d "$kustomize_path" ]; then
            log_error "Environment overlay not found: $kustomize_path"
            exit 1
        fi
        log_info "Using $ENVIRONMENT overlay"

        # Update namespace for staging
        if [ "$ENVIRONMENT" = "staging" ]; then
            NAMESPACE="small-squaretable-staging"
        fi
    else
        log_info "Using base kustomize configuration"
    fi

    if [ "$DRY_RUN" = true ]; then
        log_info "Dry-run mode: validating kustomize configuration..."
        kubectl kustomize "$kustomize_path" | kubectl apply --dry-run=client -f -
        log_info "Dry-run validation passed!"
        return
    fi

    log_info "Building and applying kustomize configuration..."
    kubectl apply -k "$kustomize_path"

    log_info "Waiting for deployments to be ready..."

    # Wait for PostgreSQL
    log_info "Waiting for PostgreSQL..."
    kubectl wait --for=condition=ready pod -l app=postgres -n "$NAMESPACE" --timeout=300s || true

    # Wait for Redis
    log_info "Waiting for Redis..."
    kubectl wait --for=condition=ready pod -l app=redis -n "$NAMESPACE" --timeout=300s || true

    # Wait for App
    log_info "Waiting for Application..."
    kubectl wait --for=condition=available deployment/app -n "$NAMESPACE" --timeout=300s || true

    log_info "Kustomize deployment completed"
}

validate_yaml_syntax() {
    log_info "Validating YAML syntax..."
    local has_errors=false

    for file in "$K8S_DIR"/*.yaml; do
        if [ -f "$file" ]; then
            if ! kubectl apply --dry-run=client -f "$file" > /dev/null 2>&1; then
                log_error "Invalid YAML: $file"
                has_errors=true
            else
                echo -e "  ${GREEN}[OK]${NC} $(basename "$file")"
            fi
        fi
    done

    if [ "$has_errors" = true ]; then
        log_error "YAML validation failed"
        exit 1
    fi

    log_info "All YAML files are valid"
}

verify_deployment() {
    log_info "Verifying deployment..."

    echo ""
    log_info "Pod status:"
    kubectl get pods -n "$NAMESPACE"

    echo ""
    log_info "Service status:"
    kubectl get svc -n "$NAMESPACE"

    echo ""
    log_info "Ingress status:"
    kubectl get ingress -n "$NAMESPACE"

    echo ""
    log_info "Testing health endpoint..."

    # Get a pod name
    POD_NAME=$(kubectl get pods -n "$NAMESPACE" -l app=small-squaretable -o jsonpath='{.items[0].metadata.name}')

    if [ -n "$POD_NAME" ]; then
        HEALTH_CHECK=$(kubectl exec -n "$NAMESPACE" "$POD_NAME" -- curl -s http://localhost:3000/health)
        echo "$HEALTH_CHECK" | grep -q '"status":"ok"' && log_info "Health check passed" || log_error "Health check failed"
    fi
}

show_summary() {
    echo ""
    echo "=========================================="
    log_info "Deployment Summary"
    echo "=========================================="
    echo ""
    echo "Namespace: $NAMESPACE"
    echo ""
    echo "Useful commands:"
    echo "  View pods:        kubectl get pods -n $NAMESPACE"
    echo "  View logs:        kubectl logs -f deployment/app -n $NAMESPACE"
    echo "  View services:    kubectl get svc -n $NAMESPACE"
    echo "  View ingress:     kubectl get ingress -n $NAMESPACE"
    echo "  Scale app:        kubectl scale deployment/app --replicas=5 -n $NAMESPACE"
    echo "  Rollback:         kubectl rollout undo deployment/app -n $NAMESPACE"
    echo ""
    echo "Kustomize commands:"
    echo "  Preview changes:  kubectl kustomize $K8S_DIR"
    echo "  Apply base:       kubectl apply -k $K8S_DIR"
    echo "  Apply production: kubectl apply -k $K8S_DIR/overlays/production"
    echo "  Apply staging:    kubectl apply -k $K8S_DIR/overlays/staging"
    echo ""
    echo "Health check endpoints:"
    echo "  Basic:    /health"
    echo "  Live:     /health/live"
    echo "  Ready:    /health/ready"
    echo ""
}

# Main deployment flow
main() {
    echo "=========================================="
    echo "Small Squaretable Kubernetes Deployment"
    echo "=========================================="
    echo ""

    if [ "$USE_KUSTOMIZE" = true ]; then
        echo -e "${BLUE}Mode: Kustomize${NC}"
        [ -n "$ENVIRONMENT" ] && echo -e "${BLUE}Environment: $ENVIRONMENT${NC}"
        [ "$DRY_RUN" = true ] && echo -e "${YELLOW}Dry-run mode enabled${NC}"
        echo ""
    fi

    check_prerequisites

    if [ "$USE_KUSTOMIZE" = true ]; then
        deploy_with_kustomize
    else
        # Traditional deployment
        deploy_namespace
        deploy_config
        deploy_storage
        deploy_postgres
        deploy_redis
        run_migrations
        deploy_app
        deploy_ingress
        deploy_hpa
        deploy_pdb
        deploy_network_policy
    fi

    if [ "$DRY_RUN" = false ]; then
        verify_deployment
        show_summary
        log_info "Deployment completed successfully!"
    fi
}

# Run main function
main
