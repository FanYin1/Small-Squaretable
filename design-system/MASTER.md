# Design System Master Documentation

## Overview

This document defines the complete design system for Small-Squaretable, based on the Marketplace/Directory pattern with Glassmorphism styling. The design system ensures visual consistency, accessibility, and optimal user experience across all components and pages.

**Last Updated**: February 2, 2026
**Version**: 1.0.0

---

## Color Palette

### Primary Colors

| Color | Hex Value | CSS Variable | Usage |
|-------|-----------|--------------|-------|
| Primary Purple | `#7C3AED` | `--color-primary` | Main brand color, primary actions, focus states |
| Secondary Purple | `#A78BFA` | `--color-secondary` | Secondary elements, hover states, accents |
| CTA Green | `#22C55E` | `--color-cta` | Call-to-action buttons, success states |
| Background Light | `#FAF5FF` | `--color-bg` | Page background, light surfaces |
| Text Dark | `#4C1D95` | `--color-text` | Primary text, headings |

### Extended Color Palette

| Color | Hex Value | CSS Variable | Usage |
|-------|-----------|--------------|-------|
| Success | `#67c23a` | `--color-success` | Success messages, positive feedback |
| Warning | `#e6a23c` | `--color-warning` | Warning messages, caution states |
| Danger | `#f56c6c` | `--color-danger` | Error messages, destructive actions |
| Info | `#909399` | `--color-info` | Informational messages |

### Neutral Colors

| Color | Hex Value | CSS Variable | Usage |
|-------|-----------|--------------|-------|
| White | `#ffffff` | `--bg-color` | Component backgrounds |
| Light Gray | `#f5f7fa` | `--bg-color-page` | Page background |
| Border Gray | `#dcdfe6` | `--border-color` | Borders, dividers |
| Text Secondary | `#606266` | `--text-color-regular` | Secondary text |
| Text Tertiary | `#909399` | `--text-color-secondary` | Tertiary text, placeholders |

### Dark Mode Colors

When dark mode is enabled (`.dark` class):

| Element | Dark Value | CSS Variable |
|---------|-----------|--------------|
| Background | `#1d1e1f` | `--bg-color` |
| Page Background | `#141414` | `--bg-color-page` |
| Primary Text | `#e5eaf3` | `--text-color-primary` |
| Regular Text | `#cfd3dc` | `--text-color-regular` |
| Border | `#414243` | `--border-color` |

---

## Typography

### Font Family

**Primary Font**: Plus Jakarta Sans
- **Google Fonts URL**: https://fonts.google.com/share?selection.family=Plus+Jakarta+Sans:wght@300;400;500;600;700
- **Fallback Stack**: `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`

### Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| Light | 300 | Subtle text, secondary information |
| Regular | 400 | Body text, default weight |
| Medium | 500 | Emphasis, labels, secondary headings |
| Semibold | 600 | Headings, strong emphasis |
| Bold | 700 | Primary headings, strong emphasis |

### Type Scale

| Element | Font Size | Line Height | Weight | CSS Variable |
|---------|-----------|-------------|--------|--------------|
| H1 | 32px | 1.2 | 700 | `--font-size-h1` |
| H2 | 28px | 1.2 | 700 | `--font-size-h2` |
| H3 | 24px | 1.2 | 600 | `--font-size-h3` |
| H4 | 20px | 1.2 | 600 | `--font-size-h4` |
| H5 | 16px | 1.2 | 600 | `--font-size-h5` |
| H6 | 14px | 1.2 | 600 | `--font-size-h6` |
| Body Large | 16px | 1.5 | 400 | `--font-size-body-lg` |
| Body Regular | 14px | 1.5 | 400 | `--font-size-body` |
| Body Small | 12px | 1.5 | 400 | `--font-size-body-sm` |
| Caption | 12px | 1.4 | 500 | `--font-size-caption` |

---

## Spacing System

All spacing follows an 8px base unit for consistency and scalability.

| Size | Value | CSS Variable | Usage |
|------|-------|--------------|-------|
| XS | 4px | `--spacing-xs` | Minimal spacing, tight layouts |
| SM | 8px | `--spacing-sm` | Small gaps, compact elements |
| MD | 16px | `--spacing-md` | Standard spacing, default padding |
| LG | 24px | `--spacing-lg` | Large gaps, section spacing |
| XL | 32px | `--spacing-xl` | Extra large gaps, major sections |

### Padding & Margin Guidelines

- **Buttons**: `--spacing-sm` (8px) horizontal, `--spacing-xs` (4px) vertical
- **Cards**: `--spacing-md` (16px) padding
- **Sections**: `--spacing-lg` (24px) margin between sections
- **Page**: `--spacing-xl` (32px) padding on sides

---

## Border Radius

| Size | Value | CSS Variable | Usage |
|------|-------|--------------|-------|
| Small | 4px | `--border-radius-sm` | Buttons, small elements |
| Medium | 8px | `--border-radius-md` | Cards, input fields |
| Large | 16px | `--border-radius-lg` | Large containers, modals |

---

## Shadows & Depth

### Box Shadows

| Level | Value | CSS Variable | Usage |
|-------|-------|--------------|-------|
| Small | `0 2px 4px rgba(0, 0, 0, 0.1)` | `--box-shadow-sm` | Subtle elevation |
| Medium | `0 4px 8px rgba(0, 0, 0, 0.1)` | `--box-shadow-md` | Standard elevation |
| Large | `0 8px 16px rgba(0, 0, 0, 0.1)` | `--box-shadow-lg` | Strong elevation |

### Glassmorphism Effects

| Effect | Value | CSS Variable | Usage |
|--------|-------|--------------|-------|
| Backdrop Blur | `blur(16px)` | `--backdrop-blur` | Glass effect background |
| Border | `1px solid rgba(255, 255, 255, 0.2)` | `--glass-border` | Glass effect border |
| Background | `rgba(255, 255, 255, 0.1)` | `--glass-bg` | Glass effect background |

---

## Animation & Transitions

### Timing

| Duration | Value | CSS Variable | Usage |
|----------|-------|--------------|-------|
| Fast | 150ms | `--transition-fast` | Micro-interactions, quick feedback |
| Standard | 200ms | `--transition-duration` | Default transitions |
| Slow | 300ms | `--transition-slow` | Page transitions, complex animations |

### Easing Functions

| Easing | Value | CSS Variable | Usage |
|--------|-------|--------------|-------|
| Ease Out | `cubic-bezier(0.4, 0, 0.2, 1)` | `--ease-out` | Entering animations |
| Ease In | `cubic-bezier(0.4, 0, 1, 1)` | `--ease-in` | Exiting animations |
| Ease In Out | `cubic-bezier(0.4, 0, 0.2, 1)` | `--ease-in-out` | Continuous animations |

### Predefined Transitions

| Transition | CSS | Usage |
|-----------|-----|-------|
| Fade | `opacity var(--transition-duration) var(--ease-out)` | Opacity changes |
| Slide | `transform var(--transition-duration) var(--ease-out)` | Position changes |
| Color | `color var(--transition-duration) var(--ease-out)` | Color changes |
| All | `all var(--transition-duration) var(--ease-out)` | Multiple properties |

### Accessibility

All animations respect the `prefers-reduced-motion` media query:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Component Patterns

### Buttons

**Primary Button**
- Background: `--color-primary` (#7C3AED)
- Text: White
- Padding: `--spacing-sm` (8px) horizontal, `--spacing-xs` (4px) vertical
- Border Radius: `--border-radius-sm` (4px)
- Hover: Opacity 0.8, shadow elevation

**Secondary Button**
- Background: `--color-secondary` (#A78BFA)
- Text: White
- Same padding and radius as primary

**CTA Button**
- Background: `--color-cta` (#22C55E)
- Text: White
- Used for primary actions

### Cards

- Background: `--bg-color` (white)
- Padding: `--spacing-md` (16px)
- Border Radius: `--border-radius-md` (8px)
- Shadow: `--box-shadow-md`
- Border: `1px solid --border-color-light`

### Glass Cards (Glassmorphism)

- Background: `--glass-bg` (rgba(255, 255, 255, 0.1))
- Backdrop Filter: `--backdrop-blur` (blur(16px))
- Border: `--glass-border` (1px solid rgba(255, 255, 255, 0.2))
- Border Radius: `--border-radius-md` (8px)

### Input Fields

- Background: `--bg-color` (white)
- Border: `1px solid --border-color`
- Border Radius: `--border-radius-sm` (4px)
- Padding: `--spacing-sm` (8px)
- Focus: Border color changes to `--color-primary`

---

## Usage Examples

### CSS Variables in Components

```css
/* Button Component */
.btn {
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--color-primary);
  color: white;
  border-radius: var(--border-radius-sm);
  border: none;
  font-family: var(--font-family);
  font-weight: 600;
  transition: all var(--transition-duration) var(--ease-out);
  cursor: pointer;
}

.btn:hover {
  opacity: 0.8;
  box-shadow: var(--box-shadow-md);
}

/* Card Component */
.card {
  background-color: var(--bg-color);
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
  box-shadow: var(--box-shadow-md);
  border: 1px solid var(--border-color-light);
}

/* Glass Card Component */
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--backdrop-blur);
  border: var(--glass-border);
  border-radius: var(--border-radius-md);
  padding: var(--spacing-md);
}

/* Heading */
h1 {
  font-size: var(--font-size-h1);
  font-weight: 700;
  line-height: 1.2;
  color: var(--color-text);
  margin-bottom: var(--spacing-lg);
}

/* Body Text */
p {
  font-size: var(--font-size-body);
  line-height: 1.5;
  color: var(--text-color-regular);
  margin-bottom: var(--spacing-md);
}
```

### Vue Component Example

```vue
<template>
  <div class="container">
    <h1>Welcome</h1>
    <div class="card">
      <p>This is a standard card with proper spacing and styling.</p>
      <button class="btn btn-primary">Click Me</button>
    </div>
    <div class="glass-card">
      <p>This is a glass morphism card with blur effect.</p>
    </div>
  </div>
</template>

<style scoped>
.container {
  padding: var(--spacing-xl);
  background-color: var(--bg-color-page);
}

.card {
  background-color: var(--bg-color);
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
  box-shadow: var(--box-shadow-md);
  margin-bottom: var(--spacing-lg);
}

.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--backdrop-blur);
  border: var(--glass-border);
  border-radius: var(--border-radius-md);
  padding: var(--spacing-md);
}

.btn {
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--border-radius-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-duration) var(--ease-out);
}

.btn:hover {
  opacity: 0.8;
  box-shadow: var(--box-shadow-md);
}
</style>
```

---

## Responsive Design

### Breakpoints

| Breakpoint | Width | CSS Variable | Usage |
|-----------|-------|--------------|-------|
| Mobile | < 640px | `--breakpoint-mobile` | Small phones |
| Tablet | 640px - 1024px | `--breakpoint-tablet` | Tablets, large phones |
| Desktop | > 1024px | `--breakpoint-desktop` | Desktop computers |

### Media Query Examples

```css
/* Mobile First Approach */
.container {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--spacing-md);
}

@media (min-width: 640px) {
  .container {
    grid-template-columns: 1fr 1fr;
  }
}

@media (min-width: 1024px) {
  .container {
    grid-template-columns: 1fr 1fr 1fr;
  }
}
```

---

## Accessibility Guidelines

### Color Contrast

- Primary text on light background: Minimum 4.5:1 contrast ratio
- Secondary text on light background: Minimum 3:1 contrast ratio
- All interactive elements must have visible focus states

### Focus States

```css
button:focus,
a:focus,
input:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

### Motion Preferences

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Implementation Checklist

- [ ] Google Fonts imported in main.ts
- [ ] CSS variables defined in variables.css
- [ ] Global styles applied in global.css
- [ ] Transitions defined in transitions.css
- [ ] All components use CSS variables
- [ ] Dark mode support implemented
- [ ] Accessibility guidelines followed
- [ ] Responsive design tested
- [ ] Animation performance optimized

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Feb 2, 2026 | Initial design system documentation |

---

## References

- [Google Fonts - Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)
- [CSS Variables (Custom Properties)](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [Glassmorphism Design](https://glassmorphism.com/)
- [WCAG 2.1 Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
