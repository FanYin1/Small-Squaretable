# Claude-Style Frontend Redesign

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Use frontend-design skill for design quality. Use webapp-testing (Playwright) to screenshot and verify after each phase.

**Goal:** Redesign the entire frontend to a Claude-style chat-app aesthetic with warm neutral palette, unified sidebar layout, and polished typography.

**Architecture:** Single unified AppShell layout replaces DashboardLayout/ChatLayout/MainLayout. All authenticated pages share the same sidebar + content area. Auth pages are standalone centered cards. Warm cream/amber palette replaces purple/cyan.

**Tech Stack:** Vue 3, Element Plus (with warm-toned overrides), CSS custom properties, Plus Jakarta Sans + Newsreader (serif display font)

**Playwright Verification:** After each phase, start the dev server and take screenshots of affected pages to verify visual correctness. Use `with_server.py` helper.

---

## Design Tokens (Warm Neutral Palette)

```css
:root {
  /* Accent */
  --accent: #D97706;
  --accent-hover: #B45309;
  --accent-light: #FEF3C7;
  --accent-gradient: linear-gradient(135deg, #D97706, #F59E0B);

  /* Backgrounds */
  --bg-base: #FAF9F6;
  --bg-surface: #FFFFFF;
  --bg-subtle: #F5F3EF;
  --bg-hover: #F0EDE8;

  /* Text */
  --text-primary: #2D2B2A;
  --text-secondary: #6B6560;
  --text-tertiary: #A39E99;
  --text-inverse: #FFFFFF;

  /* Borders */
  --border-default: #E8E5E0;
  --border-subtle: #F0EDE8;
  --border-strong: #D4D0CA;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(45, 43, 42, 0.05);
  --shadow-md: 0 4px 12px rgba(45, 43, 42, 0.08);
  --shadow-lg: 0 8px 24px rgba(45, 43, 42, 0.12);

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  /* Sidebar */
  --sidebar-width: 280px;
  --sidebar-bg: #FFFFFF;
  --sidebar-border: #E8E5E0;
  --sidebar-text: #6B6560;
  --sidebar-text-active: #2D2B2A;
  --sidebar-hover: #F5F3EF;
  --sidebar-active: #FEF3C7;

  /* Semantic */
  --color-success: #059669;
  --color-warning: #D97706;
  --color-danger: #DC2626;
  --color-info: #6B6560;

  /* Typography */
  --font-body: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-display: 'Newsreader', 'Georgia', serif;

  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 200ms ease;
  --transition-slow: 300ms ease;
}

.dark, [data-theme="dark"] {
  --accent: #F59E0B;
  --accent-hover: #FBBF24;
  --accent-light: #451A03;

  --bg-base: #1A1918;
  --bg-surface: #2D2B2A;
  --bg-subtle: #363432;
  --bg-hover: #3D3A38;

  --text-primary: #E8E5E0;
  --text-secondary: #A39E99;
  --text-tertiary: #6B6560;

  --border-default: #3D3A38;
  --border-subtle: #363432;
  --border-strong: #4A4745;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);

  --sidebar-bg: #2D2B2A;
  --sidebar-border: #3D3A38;
  --sidebar-hover: #363432;
  --sidebar-active: #451A03;
}
```

---

## Phase 1: Design System Foundation

### Task 1: Rewrite variables.css

**File:** `src/client/styles/variables.css`

Replace the entire file with the new warm neutral design tokens above. Keep backward-compatible aliases for old variable names that are still referenced (map old names to new values).

**Backward-compatible aliases (in :root):**
```css
/* Legacy aliases — map old names to new system */
--color-primary: var(--accent);
--color-secondary: #F59E0B;
--color-cta: var(--color-success);
--color-text: var(--text-primary);
--color-bg: var(--bg-surface);
--bg-color: var(--bg-surface);
--bg-color-page: var(--bg-base);
--bg-color-overlay: rgba(0, 0, 0, 0.5);
--text-color-primary: var(--text-primary);
--text-color-regular: var(--text-secondary);
--text-color-secondary: var(--text-tertiary);
--text-color-placeholder: var(--text-tertiary);
--border-color: var(--border-default);
--border-color-light: var(--border-subtle);
--border-color-lighter: var(--border-subtle);
--sidebar-bg: var(--sidebar-bg);
--sidebar-hover-bg: var(--sidebar-hover);
--sidebar-active-bg: var(--accent);
--sidebar-text-color: var(--sidebar-text);
--box-shadow-sm: var(--shadow-sm);
--box-shadow-md: var(--shadow-md);
--box-shadow-lg: var(--shadow-lg);
--border-radius-sm: var(--radius-sm);
--border-radius-md: var(--radius-md);
--border-radius-lg: var(--radius-lg);
--font-family: var(--font-body);

/* Chat */
--chat-bg: var(--bg-base);
--chat-sidebar-bg: var(--bg-surface);
--chat-user-msg-bg: var(--bg-subtle);
--chat-divider: var(--border-default);
--chat-assistant-msg-bg: var(--bg-surface);

/* Old Iteration 13 aliases */
--accent-purple: var(--accent);
--accent-cyan: #F59E0B;
--accent-pink: #DC2626;
--accent-gradient: var(--accent-gradient);
--surface-card: var(--bg-surface);
--surface-hover: var(--bg-hover);
--border-default: var(--border-default);
--border-subtle: var(--border-subtle);
--shadow-sm: var(--shadow-sm);
--sidebar-width-expanded: var(--sidebar-width);
--sidebar-text-active: var(--sidebar-text-active);
```

**Dark mode aliases:** Same pattern, map old dark names to new dark values.

### Task 2: Rewrite global.css

**File:** `src/client/styles/global.css`

Update to use new design tokens. Key changes:
- Import Newsreader font alongside Plus Jakarta Sans
- Body uses `--bg-base` background, `--text-primary` color
- Buttons use `--accent` for primary, `--radius-md` for border-radius
- Cards use `--bg-surface`, `--border-default`, `--shadow-sm`
- Links use `--accent` color
- Scrollbar uses warm tones
- Selection uses `--accent` background
- Remove glassmorphism utility classes (`.glass-card`)
- Add new utility: `.surface-card` (flat white card with subtle border)

### Task 3: Playwright verification — Design system

Start dev server, screenshot Home page and Login page to verify warm palette is applied.

```python
# verify_phase1.py
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/phase1_home.png", full_page=True)
    page.goto("http://localhost:5173/auth/login")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/phase1_login.png", full_page=True)
    browser.close()
```

---

## Phase 2: Unified Layout Shell

### Task 4: Create AppShell.vue

**File:** Create `src/client/components/layout/AppShell.vue`

Single layout shell for ALL authenticated pages. Structure:

```
┌─────────────┬──────────────────────────┐
│  AppSidebar │  <slot />                │
│  (280px)    │  (page content)          │
│             │                          │
│  Convo list │                          │
│  ─────────  │                          │
│  Nav items  │                          │
│  ─────────  │                          │
│  User menu  │                          │
└─────────────┴──────────────────────────┘
```

- No top-bar header (Claude-style: content goes edge-to-edge)
- Sidebar is 280px, collapsible on mobile
- Content area has no padding (pages control their own padding)
- Mobile: sidebar slides in as overlay, bottom tab bar appears

### Task 5: Redesign AppSidebar.vue

**File:** Rewrite `src/client/components/layout/LeftSidebar.vue` → rename to AppSidebar or rewrite in-place

Claude-style sidebar:
- Top: "New Chat" button (amber accent)
- Middle: Recent conversations list (scrollable)
- Divider
- Nav items: Market, My Characters, World Books, Plugins
- Divider
- Bottom: Theme toggle, Language, User avatar + name, Logout
- Warm white background, subtle right border
- Active nav item: warm amber highlight background

### Task 6: Update DashboardLayout to use AppShell

**File:** `src/client/components/layout/DashboardLayout.vue`

Replace current implementation to just wrap AppShell. Or update router to use AppShell directly for all authenticated routes.

### Task 7: Update ChatLayout to use AppShell

**File:** `src/client/components/layout/ChatLayout.vue`

Chat page renders inside AppShell. The chat-specific sidebar (conversation list) is part of AppSidebar, not a separate component.

### Task 8: Playwright verification — Layout

Screenshot Chat page, Market page, MyCharacters page to verify unified layout.

---

## Phase 3: Auth Pages (Standalone, No Sidebar)

### Task 9: Redesign Login.vue

**File:** `src/client/pages/auth/Login.vue`

Claude-style auth page:
- Warm cream background (`--bg-base`)
- Centered card, max-width 400px
- Newsreader serif font for "Welcome back" heading
- Clean form with warm-toned inputs
- Amber primary button
- Subtle OAuth buttons
- No glassmorphism, no gradients — flat and warm

### Task 10: Redesign Register.vue

**File:** `src/client/pages/auth/Register.vue`

Same style as Login. Consistent auth experience.

### Task 11: Update other auth pages

**Files:** ForgotPassword.vue, ResetPassword.vue, VerifyEmail.vue, OAuthCallback.vue

Apply same warm auth card style.

### Task 12: Playwright verification — Auth pages

Screenshot Login, Register, ForgotPassword.

---

## Phase 4: Chat Experience

### Task 13: Redesign ChatSidebar.vue

**File:** `src/client/components/chat/ChatSidebar.vue`

This becomes part of AppSidebar's conversation list section. Recent chats with character avatar, name, last message preview, timestamp.

### Task 14: Redesign ChatWindow.vue

**File:** `src/client/components/chat/ChatWindow.vue`

- Clean header: character name + avatar, minimal action buttons
- Messages area: warm cream background
- Full-width message blocks (no bubbles)
- User messages: right-aligned or subtle background difference
- Assistant messages: avatar + name + content, left-aligned

### Task 15: Redesign MessageBubble.vue

**File:** `src/client/components/chat/MessageBubble.vue`

- Full-width blocks, not bubbles
- Assistant: avatar (left) + name + emotion tag + content
- User: subtle warm background, right-aligned name
- Hover: show action buttons (edit, delete, regenerate)
- Markdown content with warm-toned code blocks

### Task 16: Redesign MessageInput.vue

**File:** `src/client/components/chat/MessageInput.vue`

Claude-style pill input:
- Centered, max-width 768px
- Rounded pill shape (radius-xl)
- Warm border, amber focus ring
- Attachment button, send button
- Subtle shadow on focus

### Task 17: Redesign WelcomePage.vue

**File:** `src/client/components/chat/WelcomePage.vue`

Shown when no chat is selected:
- Centered content
- Newsreader serif heading: "What would you like to talk about?"
- Character suggestion cards (warm cards with avatars)
- Quick-start prompts

### Task 18: Playwright verification — Chat

Screenshot Chat page (empty state), Chat page (with messages).

---

## Phase 5: Home & Content Pages

### Task 19: Redesign Home.vue (Landing Page)

**File:** `src/client/pages/Home.vue`

Guest-only marketing page:
- Warm cream background
- Newsreader serif display heading
- Clean feature cards (flat, warm borders)
- Amber CTA buttons
- Stats section
- No glassmorphism

### Task 20: Redesign Market.vue

**File:** `src/client/pages/Market.vue`

Inside AppShell:
- Grid of character cards
- Warm card style with subtle shadows
- Filter toolbar with warm-toned controls
- Search bar with amber focus

### Task 21: Redesign MyCharacters.vue + CharacterCard.vue

**Files:**
- `src/client/pages/MyCharacters.vue`
- `src/client/components/character/CharacterCard.vue`

Warm card grid, consistent with Market.

### Task 22: Redesign CharacterDetail.vue + CharacterEditor.vue

**Files:**
- `src/client/pages/CharacterDetail.vue`
- `src/client/pages/CharacterEditor.vue`

### Task 23: Playwright verification — Content pages

Screenshot Home, Market, MyCharacters.

---

## Phase 6: Settings & Profile Pages

### Task 24: Redesign Profile, Security, Account pages

**Files:**
- `src/client/pages/Profile.vue`
- `src/client/pages/SecuritySettings.vue`
- `src/client/pages/AccountSettings.vue`

Settings pages inside AppShell:
- Left nav for settings sections (or tabs)
- Clean form layouts with warm inputs
- Amber save buttons

### Task 25: Redesign Subscription.vue

**File:** `src/client/pages/Subscription.vue`

Pricing cards with warm palette. Current plan highlighted with amber.

### Task 26: Playwright verification — Settings

Screenshot Profile, Subscription.

---

## Phase 7: Remaining Pages

### Task 27: Redesign utility pages

**Files:**
- `src/client/pages/Notifications.vue`
- `src/client/pages/Search.vue`
- `src/client/pages/PluginMarketplace.vue`
- `src/client/pages/DeveloperSettings.vue`
- `src/client/pages/WorldBooks.vue`
- `src/client/pages/WorldBookDetail.vue`
- `src/client/pages/ActivityFeed.vue`
- `src/client/pages/UserProfile.vue`
- `src/client/pages/SharedCharacter.vue`
- `src/client/pages/SnapshotViewer.vue`
- `src/client/pages/CharacterTemplates.vue`
- `src/client/pages/ChatTemplates.vue`

Apply warm palette and AppShell layout consistently.

### Task 28: Redesign legal pages

**Files:** Terms.vue, Privacy.vue, About.vue

Standalone pages (no sidebar), warm typography.

### Task 29: Redesign NotFound.vue

Warm 404 page.

---

## Phase 8: Admin Pages

### Task 30: Redesign AdminLayout + admin pages

**Files:**
- `src/client/pages/admin/AdminLayout.vue`
- `src/client/pages/admin/UserManagement.vue`
- `src/client/pages/admin/ContentModeration.vue`
- `src/client/pages/admin/SystemDashboard.vue`
- `src/client/pages/admin/AuditLogs.vue`
- `src/client/pages/admin/Experiments.vue`
- `src/client/pages/admin/GdprManagement.vue`

Admin uses AppShell with admin-specific sidebar section.

### Task 31: Playwright verification — Admin

Screenshot admin pages.

---

## Phase 9: Mobile & Responsive

### Task 32: Mobile responsive adjustments

- AppShell: sidebar collapses to overlay on mobile
- BottomTabBar: warm palette, shows on mobile only
- All pages: responsive padding and grid adjustments
- Touch-friendly tap targets (44px minimum)

### Task 33: Playwright verification — Mobile

Screenshot at 375px viewport: Home, Login, Chat, Market.

---

## Phase 10: Component Polish

### Task 34: Polish shared components

**Files:**
- `src/client/components/ui/LoadingSpinner.vue` — warm amber spinner
- `src/client/components/ui/Toast.vue` — warm toast notifications
- `src/client/components/ui/SkeletonCard.vue` — warm skeleton loading
- `src/client/components/ui/LazyImage.vue`
- `src/client/components/subscription/UpgradePrompt.vue`
- `src/client/components/recommendation/RecommendationCarousel.vue`
- `src/client/components/social/*` — warm social components
- `src/client/components/market/*` — warm market components
- `src/client/components/profile/*` — warm profile components

### Task 35: Element Plus theme overrides

Add Element Plus CSS variable overrides to match warm palette:
```css
:root {
  --el-color-primary: #D97706;
  --el-color-primary-light-3: #FBBF24;
  --el-color-primary-light-5: #FDE68A;
  --el-color-primary-light-7: #FEF3C7;
  --el-color-primary-light-9: #FFFBEB;
  --el-color-primary-dark-2: #B45309;
  --el-bg-color: #FFFFFF;
  --el-bg-color-page: #FAF9F6;
  --el-text-color-primary: #2D2B2A;
  --el-text-color-regular: #6B6560;
  --el-text-color-secondary: #A39E99;
  --el-text-color-placeholder: #A39E99;
  --el-border-color: #E8E5E0;
  --el-border-color-light: #F0EDE8;
  --el-border-color-lighter: #F5F3EF;
  --el-fill-color-blank: #FFFFFF;
  --el-font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
}
```

### Task 36: Final Playwright verification

Full-page screenshots of all key pages at 1440px and 375px.

---

## Phase 11: Test & Cleanup

### Task 37: Run unit tests

```bash
npx vitest run
```

Fix any test failures caused by component changes (updated class names, removed imports, etc.).

### Task 38: Run E2E tests

```bash
npx playwright test
```

Fix any E2E failures caused by selector changes.

### Task 39: Remove dead code

- Remove unused layout components (if replaced)
- Remove unused CSS classes
- Remove old Iteration 13 variables that are now aliased

---

## Files Modified Summary

| Category | Files | Count |
|----------|-------|-------|
| Design System | variables.css, global.css | 2 |
| Layouts | AppShell.vue, AppSidebar.vue, DashboardLayout.vue, ChatLayout.vue, BottomTabBar.vue, MainLayout.vue | 6 |
| Auth Pages | Login, Register, ForgotPassword, ResetPassword, VerifyEmail, OAuthCallback | 6 |
| Chat Components | ChatSidebar, ChatWindow, MessageBubble, MessageInput, WelcomePage, MarkdownRenderer | 6 |
| Content Pages | Home, Market, MyCharacters, CharacterDetail, CharacterEditor, CharacterTemplates, ChatTemplates | 7 |
| Settings Pages | Profile, SecuritySettings, AccountSettings, Subscription | 4 |
| Utility Pages | Notifications, Search, PluginMarketplace, DeveloperSettings, WorldBooks, WorldBookDetail, ActivityFeed, UserProfile, SharedCharacter, SnapshotViewer | 10 |
| Legal Pages | Terms, Privacy, About, NotFound | 4 |
| Admin Pages | AdminLayout, UserManagement, ContentModeration, SystemDashboard, AuditLogs, Experiments, GdprManagement | 7 |
| Shared Components | CharacterCard, CharacterPublishForm, CharacterPreview, CharacterStats, FilterToolbar, SearchCombo, EmptyState, UpgradePrompt, UsageDashboard, RecommendationCarousel, social/*, profile/*, ui/*, analytics/*, debug/* | ~30 |
| **Total** | | **~82 files** |
