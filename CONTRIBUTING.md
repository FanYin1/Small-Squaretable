# Contributing to Small-Squaretable

Thank you for your interest in contributing to Small-Squaretable! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Branch Strategy](#branch-strategy)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Development Workflow](#development-workflow)
- [Version Release Process](#version-release-process)
- [Code Style](#code-style)
- [Testing](#testing)

## Code of Conduct

Please be respectful and constructive in all interactions. We are committed to providing a welcoming and inclusive environment for all contributors.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Small-Squaretable.git
   cd Small-Squaretable
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/Small-Squaretable.git
   ```
4. **Install dependencies**:
   ```bash
   npm install
   ```
5. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```
6. **Run database migrations**:
   ```bash
   npm run db:migrate
   ```

## Branch Strategy

We follow a Git Flow-inspired branching model:

### Main Branches

| Branch | Purpose | Protected |
|--------|---------|-----------|
| `main` | Production-ready code | Yes |
| `develop` | Integration branch for features | Yes |

### Supporting Branches

| Branch Type | Naming Convention | Base Branch | Merge Target |
|-------------|-------------------|-------------|--------------|
| Feature | `feature/<description>` | `develop` | `develop` |
| Bugfix | `bugfix/<description>` | `develop` | `develop` |
| Hotfix | `hotfix/<description>` | `main` | `main` & `develop` |
| Release | `release/<version>` | `develop` | `main` & `develop` |

### Branch Naming Examples

```
feature/add-user-avatar-upload
feature/marketplace-search-filters
bugfix/fix-login-redirect
bugfix/character-pagination-error
hotfix/security-patch-csrf
release/1.2.0
```

### Branch Workflow

```
main ─────────────────────────────────────────────────────────►
       │                                    ▲
       │                                    │ (merge release)
       ▼                                    │
develop ──────┬─────────────────────────────┴─────────────────►
              │         ▲         ▲
              │         │         │
              ▼         │         │
         feature/x ─────┘         │
                                  │
              ▼                   │
         feature/y ───────────────┘
```

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Code style changes (formatting, semicolons, etc.) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Changes to build system or dependencies |
| `ci` | Changes to CI configuration |
| `chore` | Other changes that don't modify src or test files |
| `revert` | Reverts a previous commit |

### Scopes

Common scopes for this project:

- `auth` - Authentication related
- `characters` - Character management
- `chat` - Chat functionality
- `marketplace` - Marketplace features
- `api` - API changes
- `ui` - User interface
- `db` - Database changes
- `config` - Configuration changes

### Examples

```bash
# Feature
feat(characters): add character import from PNG

# Bug fix
fix(auth): resolve token refresh race condition

# Documentation
docs(api): update OpenAPI specification for chat endpoints

# Performance
perf(db): add indexes for marketplace queries

# Breaking change
feat(api)!: change character response format

BREAKING CHANGE: Character API now returns nested creator object
```

### Commit Message Guidelines

1. **Use imperative mood**: "add feature" not "added feature"
2. **Don't capitalize first letter** of description
3. **No period** at the end of the subject line
4. **Keep subject line under 72 characters**
5. **Separate subject from body with blank line**
6. **Use body to explain what and why**, not how

## Pull Request Process

### Before Creating a PR

1. **Sync with upstream**:
   ```bash
   git fetch upstream
   git rebase upstream/develop
   ```

2. **Run all checks locally**:
   ```bash
   npm run lint
   npm run type-check
   npm run test
   npm run build
   ```

3. **Ensure your branch is up to date**:
   ```bash
   git push origin feature/your-feature
   ```

### Creating a PR

1. **Create PR** from your feature branch to `develop`
2. **Fill out the PR template** completely
3. **Link related issues** using keywords (Fixes #123, Closes #456)
4. **Request reviewers** from the team

### PR Title Format

Follow the same convention as commits:
```
feat(scope): description of changes
```

### PR Description Template

```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update

## Related Issues
Fixes #(issue number)

## Testing
- [ ] Unit tests pass
- [ ] E2E tests pass
- [ ] Manual testing completed

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code where necessary
- [ ] I have updated the documentation accordingly
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix/feature works
```

### Review Process

1. **At least one approval** required for merge
2. **All CI checks must pass**
3. **No unresolved conversations**
4. **Squash and merge** is preferred for feature branches

## Development Workflow

### Daily Development

```bash
# Start your day by syncing
git fetch upstream
git checkout develop
git merge upstream/develop

# Create feature branch
git checkout -b feature/my-feature

# Make changes, commit frequently
git add .
git commit -m "feat(scope): description"

# Push to your fork
git push origin feature/my-feature
```

### Running the Application

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Frontend
npm run dev:client
```

### Database Operations

```bash
# Generate migration after schema changes
npm run db:generate

# Apply migrations
npm run db:migrate

# Open Drizzle Studio for database inspection
npm run db:studio
```

## Version Release Process

### Automated Release (Recommended)

1. **Ensure all changes are merged** to `develop`
2. **Create release branch**:
   ```bash
   git checkout develop
   git pull upstream develop
   git checkout -b release/1.2.0
   ```

3. **Bump version**:
   ```bash
   ./scripts/version.sh minor  # or major/patch
   ```

4. **Create PR** from `release/1.2.0` to `main`
5. **After merge**, the release workflow will:
   - Generate changelog
   - Create GitHub Release
   - Trigger Docker build
   - Deploy to staging (automatically)

### Manual Release

```bash
# Bump version
./scripts/version.sh patch

# Push with tags
git push origin main --tags
```

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Checklist

- [ ] All tests passing
- [ ] Documentation updated
- [ ] CHANGELOG reviewed
- [ ] Version bumped appropriately
- [ ] Release notes prepared
- [ ] Stakeholders notified

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use explicit return types for functions
- Avoid `any` type

### Vue Components

- Use Composition API with `<script setup>`
- Use named routes for navigation
- Use Pinia for state management
- Follow single-file component structure

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (components) | PascalCase | `UserProfile.vue` |
| Files (utilities) | camelCase | `formatDate.ts` |
| Variables | camelCase | `userName` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Types/Interfaces | PascalCase | `UserProfile` |
| CSS classes | kebab-case | `user-profile` |

### ESLint

Run linting before committing:
```bash
npm run lint        # Check for issues
npm run lint:fix    # Auto-fix issues
```

## Testing

### Unit Tests

```bash
# Run all unit tests
npm run test

# Run with coverage
npm run test:coverage

# Run specific test file
npm run test -- src/server/services/auth.service.spec.ts
```

### E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run specific test
npm run test:e2e -- e2e/auth.spec.ts
```

### Writing Tests

- Place unit tests next to source files (`*.spec.ts`)
- Place E2E tests in `e2e/` directory
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

---

## Questions?

If you have questions about contributing, please:

1. Check existing [documentation](./docs/)
2. Search [existing issues](https://github.com/OWNER/Small-Squaretable/issues)
3. Create a new issue with the `question` label

Thank you for contributing to Small-Squaretable!
