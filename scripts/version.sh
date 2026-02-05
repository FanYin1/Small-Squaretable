#!/bin/bash

# Version Management Script for Small-Squaretable
# Usage: ./scripts/version.sh [major|minor|patch] [--no-tag] [--dry-run]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PACKAGE_JSON="$PROJECT_ROOT/package.json"

# Default options
CREATE_TAG=true
DRY_RUN=false
VERSION_TYPE=""

# Print usage
usage() {
    echo "Usage: $0 [major|minor|patch] [options]"
    echo ""
    echo "Version types:"
    echo "  major    Increment major version (1.0.0 -> 2.0.0)"
    echo "  minor    Increment minor version (1.0.0 -> 1.1.0)"
    echo "  patch    Increment patch version (1.0.0 -> 1.0.1)"
    echo ""
    echo "Options:"
    echo "  --no-tag     Don't create git tag"
    echo "  --dry-run    Show what would be done without making changes"
    echo "  -h, --help   Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 patch              # Bump patch version and create tag"
    echo "  $0 minor --no-tag     # Bump minor version without tag"
    echo "  $0 major --dry-run    # Show what major bump would do"
}

# Log functions
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

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            major|minor|patch)
                VERSION_TYPE="$1"
                shift
                ;;
            --no-tag)
                CREATE_TAG=false
                shift
                ;;
            --dry-run)
                DRY_RUN=true
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

    if [[ -z "$VERSION_TYPE" ]]; then
        log_error "Version type is required (major, minor, or patch)"
        usage
        exit 1
    fi
}

# Get current version from package.json
get_current_version() {
    if [[ ! -f "$PACKAGE_JSON" ]]; then
        log_error "package.json not found at $PACKAGE_JSON"
        exit 1
    fi

    local version
    version=$(grep -o '"version": *"[^"]*"' "$PACKAGE_JSON" | grep -o '[0-9]*\.[0-9]*\.[0-9]*')

    if [[ -z "$version" ]]; then
        log_error "Could not parse version from package.json"
        exit 1
    fi

    echo "$version"
}

# Calculate new version
calculate_new_version() {
    local current_version="$1"
    local version_type="$2"

    IFS='.' read -r major minor patch <<< "$current_version"

    case $version_type in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
    esac

    echo "$major.$minor.$patch"
}

# Update package.json
update_package_json() {
    local new_version="$1"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would update package.json to version $new_version"
        return
    fi

    # Use sed to update version in package.json
    if [[ "$(uname)" == "Darwin" ]]; then
        # macOS
        sed -i '' "s/\"version\": *\"[^\"]*\"/\"version\": \"$new_version\"/" "$PACKAGE_JSON"
    else
        # Linux
        sed -i "s/\"version\": *\"[^\"]*\"/\"version\": \"$new_version\"/" "$PACKAGE_JSON"
    fi

    log_success "Updated package.json to version $new_version"
}

# Check for uncommitted changes
check_git_status() {
    if ! git -C "$PROJECT_ROOT" diff --quiet 2>/dev/null; then
        log_warning "You have uncommitted changes"
        if [[ "$DRY_RUN" == false ]]; then
            read -p "Continue anyway? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "Aborted"
                exit 0
            fi
        fi
    fi
}

# Create git commit
create_commit() {
    local new_version="$1"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would create commit: chore(release): bump version to $new_version"
        return
    fi

    git -C "$PROJECT_ROOT" add package.json
    git -C "$PROJECT_ROOT" commit -m "chore(release): bump version to $new_version"
    log_success "Created commit for version $new_version"
}

# Create git tag
create_tag() {
    local new_version="$1"

    if [[ "$CREATE_TAG" == false ]]; then
        log_info "Skipping tag creation (--no-tag)"
        return
    fi

    local tag_name="v$new_version"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY-RUN] Would create tag: $tag_name"
        return
    fi

    # Check if tag already exists
    if git -C "$PROJECT_ROOT" tag -l "$tag_name" | grep -q "$tag_name"; then
        log_error "Tag $tag_name already exists"
        exit 1
    fi

    git -C "$PROJECT_ROOT" tag -a "$tag_name" -m "Release $tag_name"
    log_success "Created tag $tag_name"
}

# Print summary
print_summary() {
    local current_version="$1"
    local new_version="$2"

    echo ""
    echo "=========================================="
    echo "  Version Bump Summary"
    echo "=========================================="
    echo "  Type:     $VERSION_TYPE"
    echo "  Previous: $current_version"
    echo "  New:      $new_version"
    echo "  Tag:      $(if [[ "$CREATE_TAG" == true ]]; then echo "v$new_version"; else echo "skipped"; fi)"
    echo "=========================================="
    echo ""

    if [[ "$DRY_RUN" == true ]]; then
        log_warning "This was a dry run. No changes were made."
    else
        log_info "Next steps:"
        echo "  1. Review the changes: git log -1 && git show v$new_version"
        echo "  2. Push to remote: git push origin main --tags"
        echo "  3. This will trigger the release workflow"
    fi
}

# Main function
main() {
    parse_args "$@"

    log_info "Starting version bump ($VERSION_TYPE)"

    # Check git status
    check_git_status

    # Get current version
    local current_version
    current_version=$(get_current_version)
    log_info "Current version: $current_version"

    # Calculate new version
    local new_version
    new_version=$(calculate_new_version "$current_version" "$VERSION_TYPE")
    log_info "New version: $new_version"

    # Update package.json
    update_package_json "$new_version"

    # Create commit
    create_commit "$new_version"

    # Create tag
    create_tag "$new_version"

    # Print summary
    print_summary "$current_version" "$new_version"
}

# Run main function
main "$@"
