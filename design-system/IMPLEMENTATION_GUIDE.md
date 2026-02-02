# Design System Implementation Guide

## Overview

This guide provides practical examples and instructions for using the new design system in Small-Squaretable components and pages.

**Last Updated**: February 2, 2026
**Design System Version**: 1.0.0

---

## Quick Start

### 1. CSS Variables Are Already Available

All CSS variables are automatically available in your Vue components and CSS files. No additional imports needed beyond what's already in `src/client/main.ts`.

### 2. Google Fonts

The Plus Jakarta Sans font family is automatically imported via `@import` in `global.css`. The font will load automatically when the application starts.

---

## Component Usage Examples

### Button Components

#### Primary Button
```vue
<template>
  <button class="btn-primary">Click Me</button>
</template>

<style scoped>
.btn-primary {
  background-color: var(--color-primary);
  color: white;
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  border-radius: var(--border-radius-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-duration) var(--ease-out);
}

.btn-primary:hover {
  opacity: 0.8;
  box-shadow: var(--box-shadow-md);
}

.btn-primary:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>
```

#### CTA Button (Call-to-Action)
```vue
<template>
  <button class="btn-cta">Subscribe Now</button>
</template>

<style scoped>
.btn-cta {
  background-color: var(--color-cta);
  color: white;
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  border-radius: var(--border-radius-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-duration) var(--ease-out);
}

.btn-cta:hover {
  opacity: 0.8;
  box-shadow: var(--box-shadow-md);
}
</style>
```

### Card Components

#### Standard Card
```vue
<template>
  <div class="card">
    <h3>Card Title</h3>
    <p>Card content goes here.</p>
  </div>
</template>

<style scoped>
.card {
  background-color: var(--bg-color);
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
  box-shadow: var(--box-shadow-md);
  border: 1px solid var(--border-color-light);
  transition: all var(--transition-duration) var(--ease-out);
}

.card:hover {
  box-shadow: var(--box-shadow-lg);
}

.card h3 {
  color: var(--text-color-primary);
  margin-bottom: var(--spacing-md);
}

.card p {
  color: var(--text-color-regular);
}
</style>
```

#### Glass Card (Glassmorphism)
```vue
<template>
  <div class="glass-card">
    <h3>Glass Card Title</h3>
    <p>This card has a frosted glass effect.</p>
  </div>
</template>

<style scoped>
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--backdrop-blur);
  border: var(--glass-border);
  border-radius: var(--border-radius-md);
  padding: var(--spacing-md);
  transition: all var(--transition-duration) var(--ease-out);
}

.glass-card:hover {
  background: rgba(255, 255, 255, 0.15);
  box-shadow: var(--box-shadow-md);
}

.glass-card h3 {
  color: var(--text-color-primary);
  margin-bottom: var(--spacing-md);
}

.glass-card p {
  color: var(--text-color-regular);
}
</style>
```

### Input Fields

```vue
<template>
  <div class="form-group">
    <label for="email">Email Address</label>
    <input
      id="email"
      type="email"
      placeholder="Enter your email"
      class="input-field"
    />
  </div>
</template>

<style scoped>
.form-group {
  margin-bottom: var(--spacing-lg);
}

label {
  display: block;
  margin-bottom: var(--spacing-sm);
  font-weight: 500;
  color: var(--text-color-primary);
}

.input-field {
  width: 100%;
  padding: var(--spacing-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  background-color: var(--bg-color);
  color: var(--text-color-primary);
  font-family: var(--font-family);
  font-size: var(--font-size-body);
  transition: all var(--transition-duration) var(--ease-out);
}

.input-field:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
}

.input-field::placeholder {
  color: var(--text-color-placeholder);
}
</style>
```

### Typography

```vue
<template>
  <div class="typography-demo">
    <h1>Heading 1</h1>
    <h2>Heading 2</h2>
    <h3>Heading 3</h3>
    <p>Body text - Regular paragraph with standard font size.</p>
    <p class="text-small">Small text - Used for secondary information.</p>
    <p class="text-caption">Caption text - Used for labels and metadata.</p>
    <p class="text-muted">Muted text - Reduced emphasis.</p>
  </div>
</template>

<style scoped>
h1 {
  font-size: var(--font-size-h1);
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--spacing-lg);
}

h2 {
  font-size: var(--font-size-h2);
  font-weight: 700;
  color: var(--text-color-primary);
  margin-bottom: var(--spacing-md);
}

h3 {
  font-size: var(--font-size-h3);
  font-weight: 600;
  color: var(--text-color-primary);
  margin-bottom: var(--spacing-md);
}

p {
  font-size: var(--font-size-body);
  line-height: 1.5;
  color: var(--text-color-regular);
  margin-bottom: var(--spacing-md);
}

.text-small {
  font-size: var(--font-size-body-sm);
  color: var(--text-color-secondary);
}

.text-caption {
  font-size: var(--font-size-caption);
  color: var(--text-color-secondary);
}

.text-muted {
  color: var(--text-color-secondary);
}
</style>
```

### Spacing Utilities

```vue
<template>
  <div class="spacing-demo">
    <div class="box mt-lg mb-md">Margin Top Large, Margin Bottom Medium</div>
    <div class="box p-lg">Padding Large</div>
    <div class="box mt-xl">Margin Top Extra Large</div>
  </div>
</template>

<style scoped>
.box {
  background-color: var(--bg-color);
  border: 1px solid var(--border-color-light);
  border-radius: var(--border-radius-md);
  padding: var(--spacing-md);
}

/* Margin utilities */
.mt-xs { margin-top: var(--spacing-xs); }
.mt-sm { margin-top: var(--spacing-sm); }
.mt-md { margin-top: var(--spacing-md); }
.mt-lg { margin-top: var(--spacing-lg); }
.mt-xl { margin-top: var(--spacing-xl); }

.mb-xs { margin-bottom: var(--spacing-xs); }
.mb-sm { margin-bottom: var(--spacing-sm); }
.mb-md { margin-bottom: var(--spacing-md); }
.mb-lg { margin-bottom: var(--spacing-lg); }
.mb-xl { margin-bottom: var(--spacing-xl); }

/* Padding utilities */
.p-xs { padding: var(--spacing-xs); }
.p-sm { padding: var(--spacing-sm); }
.p-md { padding: var(--spacing-md); }
.p-lg { padding: var(--spacing-lg); }
.p-xl { padding: var(--spacing-xl); }
</style>
```

### Animations

#### Fade Transition
```vue
<template>
  <Transition name="fade">
    <div v-if="isVisible" class="content">
      Fading content
    </div>
  </Transition>
</template>

<script setup>
import { ref } from 'vue';

const isVisible = ref(true);
</script>

<style scoped>
/* Transitions are defined in transitions.css */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-duration) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```

#### Slide Transition
```vue
<template>
  <Transition name="slide">
    <div v-if="isVisible" class="content">
      Sliding content
    </div>
  </Transition>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: transform var(--transition-duration) var(--ease-out),
              opacity var(--transition-duration) var(--ease-out);
}

.slide-enter-from {
  transform: translateX(-20px);
  opacity: 0;
}

.slide-leave-to {
  transform: translateX(20px);
  opacity: 0;
}
</style>
```

#### Scale Transition
```vue
<template>
  <Transition name="scale">
    <div v-if="isVisible" class="modal">
      Modal content
    </div>
  </Transition>
</template>

<style scoped>
.scale-enter-active,
.scale-leave-active {
  transition: all var(--transition-duration) var(--ease-out);
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
```

### Grid Layouts

```vue
<template>
  <div class="container">
    <div class="grid grid-2">
      <div class="card">Card 1</div>
      <div class="card">Card 2</div>
      <div class="card">Card 3</div>
      <div class="card">Card 4</div>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-md);
}

.grid {
  display: grid;
  gap: var(--spacing-md);
}

.grid-2 {
  grid-template-columns: repeat(2, 1fr);
}

@media (max-width: 768px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}

.card {
  background-color: var(--bg-color);
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
  box-shadow: var(--box-shadow-md);
}
</style>
```

---

## Color Usage Examples

### Using Brand Colors

```vue
<template>
  <div class="color-demo">
    <div class="primary-box">Primary Color</div>
    <div class="secondary-box">Secondary Color</div>
    <div class="cta-box">CTA Color</div>
    <div class="success-box">Success Color</div>
    <div class="warning-box">Warning Color</div>
    <div class="danger-box">Danger Color</div>
  </div>
</template>

<style scoped>
.primary-box {
  background-color: var(--color-primary);
  color: white;
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
  margin-bottom: var(--spacing-md);
}

.secondary-box {
  background-color: var(--color-secondary);
  color: white;
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
  margin-bottom: var(--spacing-md);
}

.cta-box {
  background-color: var(--color-cta);
  color: white;
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
  margin-bottom: var(--spacing-md);
}

.success-box {
  background-color: var(--color-success);
  color: white;
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
  margin-bottom: var(--spacing-md);
}

.warning-box {
  background-color: var(--color-warning);
  color: white;
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
  margin-bottom: var(--spacing-md);
}

.danger-box {
  background-color: var(--color-danger);
  color: white;
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
}
</style>
```

### Text Color Classes

```vue
<template>
  <div class="text-colors">
    <p class="text-primary">Primary text color</p>
    <p class="text-success">Success text color</p>
    <p class="text-warning">Warning text color</p>
    <p class="text-danger">Danger text color</p>
    <p class="text-muted">Muted text color</p>
  </div>
</template>

<style scoped>
.text-primary {
  color: var(--color-primary);
}

.text-success {
  color: var(--color-success);
}

.text-warning {
  color: var(--color-warning);
}

.text-danger {
  color: var(--color-danger);
}

.text-muted {
  color: var(--text-color-secondary);
}
</style>
```

---

## Dark Mode Support

Dark mode is automatically supported. When the `.dark` class is applied to the root element, all CSS variables automatically switch to dark mode values.

### Enabling Dark Mode

```vue
<template>
  <div :class="{ dark: isDarkMode }">
    <!-- Your content here -->
  </div>
</template>

<script setup>
import { ref } from 'vue';

const isDarkMode = ref(false);

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
};
</script>
```

### Dark Mode CSS Variables

When `.dark` class is applied:
- `--bg-color`: Changes to `#1d1e1f`
- `--text-color-primary`: Changes to `#e5eaf3`
- `--border-color`: Changes to `#414243`
- `--glass-bg`: Changes to `rgba(0, 0, 0, 0.2)`

---

## Responsive Design

### Mobile-First Approach

```vue
<template>
  <div class="responsive-layout">
    <div class="sidebar">Sidebar</div>
    <div class="main-content">Main Content</div>
  </div>
</template>

<style scoped>
.responsive-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--spacing-md);
}

/* Tablet and up */
@media (min-width: 640px) {
  .responsive-layout {
    grid-template-columns: 250px 1fr;
  }
}

/* Desktop and up */
@media (min-width: 1024px) {
  .responsive-layout {
    grid-template-columns: 300px 1fr;
  }
}

.sidebar {
  background-color: var(--bg-color);
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
}

.main-content {
  background-color: var(--bg-color);
  padding: var(--spacing-md);
  border-radius: var(--border-radius-md);
}
</style>
```

---

## Accessibility Best Practices

### Focus States

Always provide visible focus states for interactive elements:

```vue
<style scoped>
button:focus,
a:focus,
input:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>
```

### Respecting Motion Preferences

The design system automatically respects `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Color Contrast

Ensure sufficient contrast ratios:
- Primary text on light background: 4.5:1 minimum
- Secondary text on light background: 3:1 minimum

---

## Common Patterns

### Hero Section

```vue
<template>
  <section class="hero">
    <div class="hero-content">
      <h1>Welcome to Small-Squaretable</h1>
      <p>Discover amazing characters and stories</p>
      <button class="btn-cta">Get Started</button>
    </div>
  </section>
</template>

<style scoped>
.hero {
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  padding: var(--spacing-xl);
  border-radius: var(--border-radius-lg);
  color: white;
  text-align: center;
}

.hero-content {
  max-width: 600px;
  margin: 0 auto;
}

.hero h1 {
  color: white;
  margin-bottom: var(--spacing-md);
}

.hero p {
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: var(--spacing-lg);
}
</style>
```

### Card Grid

```vue
<template>
  <div class="card-grid">
    <div v-for="item in items" :key="item.id" class="card">
      <h3>{{ item.title }}</h3>
      <p>{{ item.description }}</p>
      <button class="btn-primary">Learn More</button>
    </div>
  </div>
</template>

<script setup>
const items = [
  { id: 1, title: 'Item 1', description: 'Description 1' },
  { id: 2, title: 'Item 2', description: 'Description 2' },
  { id: 3, title: 'Item 3', description: 'Description 3' },
];
</script>

<style scoped>
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacing-lg);
}

.card {
  background-color: var(--bg-color);
  padding: var(--spacing-lg);
  border-radius: var(--border-radius-md);
  box-shadow: var(--box-shadow-md);
  transition: all var(--transition-duration) var(--ease-out);
}

.card:hover {
  box-shadow: var(--box-shadow-lg);
  transform: translateY(-4px);
}

.card h3 {
  margin-bottom: var(--spacing-md);
}

.card p {
  margin-bottom: var(--spacing-lg);
}
</style>
```

---

## File Structure

```
src/client/
├── styles/
│   ├── variables.css      # CSS variables (colors, spacing, typography, etc.)
│   ├── global.css         # Global styles, resets, utilities
│   └── transitions.css    # Animation and transition definitions
├── main.ts                # Entry point (imports all styles)
├── components/            # Vue components
├── pages/                 # Page components
└── ...
```

---

## CSS Variables Reference

### Quick Lookup Table

| Category | Variable | Value |
|----------|----------|-------|
| **Colors** | `--color-primary` | #7C3AED |
| | `--color-secondary` | #A78BFA |
| | `--color-cta` | #22C55E |
| **Spacing** | `--spacing-md` | 16px |
| `--spacing-lg` | 24px |
| **Typography** | `--font-family` | Plus Jakarta Sans |
| | `--font-size-h1` | 32px |
| | `--font-size-body` | 14px |
| **Shadows** | `--box-shadow-md` | 0 4px 8px rgba(0,0,0,0.1) |
| **Transitions** | `--transition-duration` | 200ms |
| | `--ease-out` | cubic-bezier(0.4, 0, 0.2, 1) |

---

## Testing Your Implementation

### Verify Font Loading

Open browser DevTools and check:
1. Network tab: Confirm Plus Jakarta Sans font is loaded
2. Computed styles: Verify `font-family` is using Plus Jakarta Sans

### Verify CSS Variables

In browser console:
```javascript
// Check if CSS variables are available
const styles = getComputedStyle(document.documentElement);
console.log(styles.getPropertyValue('--color-primary')); // Should output: #7C3AED
console.log(styles.getPropertyValue('--spacing-md')); // Should output: 16px
```

### Test Dark Mode

```javascript
// Toggle dark mode in console
document.documentElement.classList.add('dark');
document.documentElement.classList.remove('dark');
```

---

## Troubleshooting

### Font Not Loading

**Problem**: Plus Jakarta Sans not appearing
**Solution**:
1. Check Network tab in DevTools for font loading errors
2. Verify `@import` statement in `global.css`
3. Clear browser cache and reload

### CSS Variables Not Working

**Problem**: Variables showing as undefined
**Solution**:
1. Ensure `variables.css` is imported in `main.ts`
2. Check for typos in variable names
3. Verify CSS is not being overridden by inline styles

### Dark Mode Not Switching

**Problem**: Dark mode colors not applying
**Solution**:
1. Ensure `.dark` class is applied to root element
2. Check that dark mode variables are defined in `variables.css`
3. Verify no hardcoded colors are overriding variables

---

## Next Steps

1. Review existing components and update them to use CSS variables
2. Test all pages in both light and dark modes
3. Verify responsive design on mobile, tablet, and desktop
4. Test accessibility with keyboard navigation and screen readers
5. Optimize animation performance on lower-end devices

---

## Resources

- [Design System Master Documentation](./MASTER.md)
- [CSS Variables (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [Plus Jakarta Sans Font](https://fonts.google.com/specimen/Plus+Jakarta+Sans)
- [Glassmorphism Design](https://glassmorphism.com/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
