#!/bin/bash
# =============================================================================
# Docker Build Script for Small-Squaretable
# =============================================================================
# Usage: ./scripts/docker-build.sh [environment] [options]
#
# Environments:
#   dev      - Development build (default)
#   staging  - Staging build
#   prod     - Production build
#
# Options:
#   --push           Push image to registry after build
#   --no-cache       Build without cache
#   --scan           Run Trivy security scan after build
#   --tag TAG        Additional tag for the image
#   --registry URL   Container registry URL
#   --help           Show this help message
#
# Examples:
#   ./scripts/docker-build.sh dev
#   ./scripts/docker-build.sh prod --push --scan
#   ./scripts/docker-build.sh staging --tag v1.0.0 --registry ghcr.io/myorg
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="small-squaretable"
DEFAULT_REGISTRY=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    head -30 "$0" | tail -28 | sed 's/^# //' | sed 's/^#//'
    exit 0
}

get_version() {
    # Get version from package.json
    if [ -f "$PROJECT_ROOT/package.json" ]; then
        grep '"version"' "$PROJECT_ROOT/package.json" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/'
    else
        echo "0.0.0"
    fi
}

get_git_sha() {
    # Get short git SHA if in a git repo
    if git rev-parse --short HEAD 2>/dev/null; then
        return
    fi
    echo "unknown"
}

get_git_branch() {
    # Get current git branch
    if git rev-parse --abbrev-ref HEAD 2>/dev/null; then
        return
    fi
    echo "unknown"
}

get_build_date() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# -----------------------------------------------------------------------------
# Parse Arguments
# -----------------------------------------------------------------------------
ENVIRONMENT="${1:-dev}"
shift || true

PUSH_IMAGE=false
NO_CACHE=false
RUN_SCAN=false
ADDITIONAL_TAG=""
REGISTRY="$DEFAULT_REGISTRY"

while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH_IMAGE=true
            shift
            ;;
        --no-cache)
            NO_CACHE=true
            shift
            ;;
        --scan)
            RUN_SCAN=true
            shift
            ;;
        --tag)
            ADDITIONAL_TAG="$2"
            shift 2
            ;;
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            ;;
    esac
done

# -----------------------------------------------------------------------------
# Validate Environment
# -----------------------------------------------------------------------------
case $ENVIRONMENT in
    dev|development)
        ENVIRONMENT="dev"
        ;;
    staging|stage)
        ENVIRONMENT="staging"
        ;;
    prod|production)
        ENVIRONMENT="prod"
        ;;
    *)
        log_error "Invalid environment: $ENVIRONMENT"
        log_info "Valid environments: dev, staging, prod"
        exit 1
        ;;
esac

# -----------------------------------------------------------------------------
# Build Configuration
# -----------------------------------------------------------------------------
VERSION=$(get_version)
GIT_SHA=$(get_git_sha)
GIT_BRANCH=$(get_git_branch)
BUILD_DATE=$(get_build_date)

# Construct image tags
if [ -n "$REGISTRY" ]; then
    FULL_IMAGE_NAME="${REGISTRY}/${IMAGE_NAME}"
else
    FULL_IMAGE_NAME="${IMAGE_NAME}"
fi

# Primary tags
TAGS=(
    "${FULL_IMAGE_NAME}:${ENVIRONMENT}"
    "${FULL_IMAGE_NAME}:${ENVIRONMENT}-${VERSION}"
    "${FULL_IMAGE_NAME}:${ENVIRONMENT}-${GIT_SHA}"
)

# Add latest tag for production
if [ "$ENVIRONMENT" = "prod" ]; then
    TAGS+=("${FULL_IMAGE_NAME}:latest")
    TAGS+=("${FULL_IMAGE_NAME}:${VERSION}")
fi

# Add additional tag if specified
if [ -n "$ADDITIONAL_TAG" ]; then
    TAGS+=("${FULL_IMAGE_NAME}:${ADDITIONAL_TAG}")
fi

# -----------------------------------------------------------------------------
# Pre-build Checks
# -----------------------------------------------------------------------------
log_info "Starting Docker build for Small-Squaretable"
log_info "============================================"
log_info "Environment:  $ENVIRONMENT"
log_info "Version:      $VERSION"
log_info "Git SHA:      $GIT_SHA"
log_info "Git Branch:   $GIT_BRANCH"
log_info "Build Date:   $BUILD_DATE"
log_info "Registry:     ${REGISTRY:-'(local)'}"
log_info "============================================"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if Dockerfile exists
if [ ! -f "$PROJECT_ROOT/Dockerfile" ]; then
    log_error "Dockerfile not found at $PROJECT_ROOT/Dockerfile"
    exit 1
fi

# -----------------------------------------------------------------------------
# Build Docker Image
# -----------------------------------------------------------------------------
cd "$PROJECT_ROOT"

log_info "Building Docker image..."

# Construct build arguments
BUILD_ARGS=(
    --file Dockerfile
    --build-arg "NODE_ENV=${ENVIRONMENT}"
)

# Add OCI labels
BUILD_ARGS+=(
    --label "org.opencontainers.image.created=${BUILD_DATE}"
    --label "org.opencontainers.image.revision=${GIT_SHA}"
    --label "org.opencontainers.image.version=${VERSION}"
    --label "org.opencontainers.image.ref.name=${GIT_BRANCH}"
    --label "com.small-squaretable.environment=${ENVIRONMENT}"
)

# Add tags
for tag in "${TAGS[@]}"; do
    BUILD_ARGS+=(--tag "$tag")
done

# Add no-cache flag if specified
if [ "$NO_CACHE" = true ]; then
    BUILD_ARGS+=(--no-cache)
    log_info "Building without cache"
fi

# Add progress output
BUILD_ARGS+=(--progress=plain)

# Run the build
if docker build "${BUILD_ARGS[@]}" .; then
    log_success "Docker image built successfully!"
else
    log_error "Docker build failed!"
    exit 1
fi

# -----------------------------------------------------------------------------
# Display Image Info
# -----------------------------------------------------------------------------
log_info "Built image tags:"
for tag in "${TAGS[@]}"; do
    echo "  - $tag"
done

# Show image size
IMAGE_SIZE=$(docker images "${TAGS[0]}" --format "{{.Size}}" | head -1)
log_info "Image size: $IMAGE_SIZE"

# -----------------------------------------------------------------------------
# Security Scan (Optional)
# -----------------------------------------------------------------------------
if [ "$RUN_SCAN" = true ]; then
    log_info "Running Trivy security scan..."

    if command -v trivy &> /dev/null; then
        TRIVY_CONFIG="$PROJECT_ROOT/.trivy.yaml"
        SCAN_TARGET="${TAGS[0]}"

        if [ -f "$TRIVY_CONFIG" ]; then
            trivy image --config "$TRIVY_CONFIG" "$SCAN_TARGET"
        else
            trivy image --severity HIGH,CRITICAL "$SCAN_TARGET"
        fi

        if [ $? -eq 0 ]; then
            log_success "Security scan passed!"
        else
            log_warning "Security scan found vulnerabilities. Review the report above."
        fi
    else
        log_warning "Trivy not installed. Skipping security scan."
        log_info "Install Trivy: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
    fi
fi

# -----------------------------------------------------------------------------
# Push to Registry (Optional)
# -----------------------------------------------------------------------------
if [ "$PUSH_IMAGE" = true ]; then
    if [ -z "$REGISTRY" ]; then
        log_warning "No registry specified. Skipping push."
        log_info "Use --registry to specify a container registry."
    else
        log_info "Pushing images to registry..."

        for tag in "${TAGS[@]}"; do
            log_info "Pushing $tag..."
            if docker push "$tag"; then
                log_success "Pushed $tag"
            else
                log_error "Failed to push $tag"
                exit 1
            fi
        done

        log_success "All images pushed successfully!"
    fi
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
log_success "============================================"
log_success "Build completed successfully!"
log_success "============================================"
echo ""
log_info "To run the container locally:"
echo "  docker run -p 3000:3000 --env-file .env ${TAGS[0]}"
echo ""
log_info "To run with docker-compose:"
echo "  docker-compose up -d"
echo ""

if [ "$PUSH_IMAGE" = false ] && [ -n "$REGISTRY" ]; then
    log_info "To push to registry:"
    echo "  ./scripts/docker-build.sh $ENVIRONMENT --push --registry $REGISTRY"
fi
