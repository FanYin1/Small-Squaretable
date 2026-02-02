#!/bin/bash
# Kubernetes deployment script for Small Squaretable

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="small-squaretable"
K8S_DIR="./k8s"

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

    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    # Check if secrets file exists
    if [ ! -f "$K8S_DIR/secrets-production.yaml" ]; then
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

    check_prerequisites

    deploy_namespace
    deploy_config
    deploy_storage
    deploy_postgres
    deploy_redis
    run_migrations
    deploy_app
    deploy_ingress
    deploy_hpa

    verify_deployment
    show_summary

    log_info "Deployment completed successfully!"
}

# Run main function
main
