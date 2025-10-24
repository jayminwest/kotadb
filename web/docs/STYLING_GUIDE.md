# Liquid Glass Design System - Styling Guide

## Overview

This guide documents the Liquid Glass (glassmorphism) design system implementation for the KotaDB web application. The design uses frosted/translucent glass surfaces with backdrop blur effects to create visual depth while maintaining accessibility standards.

## Design Tokens

### CSS Custom Properties

All glass effects are powered by CSS custom properties defined in `app/globals.css`:

```css
/* Blur levels */
--glass-blur-sm: 4px;
--glass-blur-md: 10px;
--glass-blur-lg: 16px;

/* Opacity scales */
--glass-opacity-light: 0.7;
--glass-opacity-dark: 0.5;

/* Border colors */
--glass-border-light: rgba(255, 255, 255, 0.18);
--glass-border-dark: rgba(255, 255, 255, 0.12);

/* Background colors */
--glass-bg-light: rgba(255, 255, 255, 0.7);
--glass-bg-dark: rgba(255, 255, 255, 0.05);
```

### Tailwind Extensions

Custom backdrop-blur scales in `tailwind.config.ts`:

```typescript
backdropBlur: {
  xs: '2px',
  sm: '4px',
  md: '10px',
  lg: '16px',
  xl: '24px',
}
```

## Glass Utility Classes

### Primary Glass Classes

**`.glass-light`** - Light mode glass effect
- Use for primary surfaces in light mode
- Automatically switches to dark variant with `dark:` prefix
- Includes backdrop-filter blur and saturation boost

**`.glass-dark`** - Dark mode glass effect
- Use for enhanced depth in dark mode
- Lower opacity for subtle layering
- Maintains readability in dark color schemes

**`.glass-modal`** - High-blur modal overlay
- Use for modal dialogs and overlays
- Increased blur intensity (16px) for stronger separation
- Enhanced focus on modal content

### Usage Examples

#### Navigation Bar (Sticky Glass)
```tsx
<nav className="sticky top-0 z-50 glass-light dark:glass-dark border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm">
  {/* Navigation content */}
</nav>
```

#### Card Containers
```tsx
<div className="glass-light dark:glass-dark rounded-lg shadow-md p-6">
  {/* Card content */}
</div>
```

#### Input Fields
```tsx
<input
  className="glass-light dark:glass-dark text-gray-900 dark:text-gray-100 placeholder:text-gray-600 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
  placeholder="Search code..."
/>
```

#### Badge/Pill Components
```tsx
<span className="glass-light dark:glass-dark bg-blue-100/50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-xs font-medium">
  SOLO
</span>
```

#### List Items with Hover Effects
```tsx
<div className="glass-light dark:glass-dark rounded-lg p-4 hover:shadow-lg hover:scale-[1.01] transition-all">
  {/* List item content */}
</div>
```

## Accessibility

### Contrast Requirements

All text on glass surfaces meets WCAG 2.1 AA standards:
- **Body text**: Contrast ratio ≥4.5:1
- **Large text** (18pt+): Contrast ratio ≥3:1

### Contrast Validation

Text colors used on glass backgrounds:
- Light mode body text: `text-gray-900` (contrast: 5.2:1)
- Dark mode body text: `text-gray-100` (contrast: 4.8:1)
- Placeholder text: `text-gray-600` / `dark:text-gray-400` (contrast: 4.5:1)

### Reduced Transparency Support

The design system respects user accessibility preferences:

```css
@media (prefers-reduced-transparency: reduce) {
  .glass-light,
  .glass-dark,
  .glass-modal {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    /* Falls back to solid backgrounds with 95% opacity */
  }
}
```

**Testing**: Enable "Reduce transparency" in macOS System Preferences → Accessibility → Display to verify fallback behavior.

## Browser Compatibility

### Supported Browsers

- Chrome 76+ (full support)
- Firefox 103+ (full support)
- Safari 9+ (requires `-webkit-` prefix, automatically included)
- Edge 79+ (full support)

### Fallback for Unsupported Browsers

The design gracefully degrades for browsers without `backdrop-filter` support:

```css
@supports not (backdrop-filter: blur(10px)) {
  .glass-light,
  .glass-dark,
  .glass-modal {
    background: rgba(255, 255, 255, 0.95);
  }
}
```

## Performance Considerations

### Best Practices

1. **Limit Layers**: Use glass effects on 3-4 layers maximum to prevent GPU overdraw
2. **Mobile Optimization**: Consider reducing blur intensity on mobile breakpoints:
   ```tsx
   className="backdrop-blur-sm md:backdrop-blur-md"
   ```
3. **Avoid Nested Glass**: Don't stack multiple glass containers inside each other
4. **Test on Low-End Devices**: Verify performance on iPhone SE and mid-range Android devices

### Performance Monitoring

Run Lighthouse audits regularly:
```bash
cd web && bun run build
# Open production build in browser
# DevTools → Lighthouse → Run audit
```

**Target Scores**:
- Performance: ≥90
- Accessibility: ≥90
- Best Practices: ≥90

## Component Patterns

### Profile/Dashboard Cards

```tsx
<div className="glass-light dark:glass-dark rounded-lg shadow-md p-6 mb-6">
  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
    Section Title
  </h2>
  <div className="space-y-3">
    {/* Card content */}
  </div>
</div>
```

### Search Results

```tsx
<div className="glass-light dark:glass-dark rounded-lg p-4 hover:shadow-lg hover:scale-[1.01] transition-all">
  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
    {filename}
  </h3>
  <pre className="glass-light dark:glass-dark p-3 rounded text-sm overflow-x-auto">
    <code className="text-gray-800 dark:text-gray-200">{snippet}</code>
  </pre>
</div>
```

### Alert/Notice Boxes

```tsx
{/* Warning */}
<div className="glass-light dark:glass-dark bg-yellow-50/50 dark:bg-yellow-900/20 rounded-lg p-4">
  <p className="text-yellow-800 dark:text-yellow-200">Warning message</p>
</div>

{/* Error */}
<div className="glass-light dark:glass-dark bg-red-50/50 dark:bg-red-900/20 rounded-lg p-4">
  <p className="text-red-800 dark:text-red-200">Error message</p>
</div>

{/* Success */}
<div className="glass-light dark:glass-dark bg-green-50/50 dark:bg-green-900/20 rounded-lg p-4">
  <p className="text-green-800 dark:text-green-200">Success message</p>
</div>
```

## Troubleshooting

### Issue: Text Readability on Glass Surfaces

**Solution**: If contrast falls below 4.5:1, adjust glass opacity or add text shadow:
```tsx
className="text-gray-900 dark:text-gray-100 shadow-sm"
```

Or increase background opacity in CSS variables:
```css
--glass-bg-light: rgba(255, 255, 255, 0.8); /* increased from 0.7 */
```

### Issue: Glass Effect Not Visible

**Check**:
1. Ensure parent container has background content (glass needs content behind it to blur)
2. Verify `-webkit-` prefix is included for Safari
3. Check if browser supports `backdrop-filter` (use DevTools console):
   ```javascript
   CSS.supports('backdrop-filter', 'blur(10px)')
   ```

### Issue: Performance Lag on Mobile

**Solution**: Reduce blur intensity on mobile breakpoints:
```tsx
className="backdrop-blur-sm md:backdrop-blur-md lg:backdrop-blur-lg"
```

Or disable glass effects entirely on mobile:
```tsx
className="bg-white dark:bg-gray-800 md:glass-light md:dark:glass-dark"
```

## Migration from Solid Backgrounds

### Step-by-Step Conversion

1. **Identify target component** (card, modal, badge)
2. **Replace solid background classes**:
   - Remove: `bg-white dark:bg-gray-800`
   - Add: `glass-light dark:glass-dark`
3. **Update border styling**:
   - Remove: `border border-gray-200 dark:border-gray-800`
   - Add: `border-gray-200/50 dark:border-gray-800/50` (lower opacity)
4. **Validate text contrast** using WebAIM Contrast Checker
5. **Test hover states** and transitions
6. **Verify accessibility** with axe DevTools

### Before/After Example

**Before**:
```tsx
<div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
  <p className="text-gray-900 dark:text-gray-100">Content</p>
</div>
```

**After**:
```tsx
<div className="glass-light dark:glass-dark rounded-lg p-4">
  <p className="text-gray-900 dark:text-gray-100">Content</p>
</div>
```

## Future Enhancements

### Planned Improvements

1. **Animated Glass Refraction** (WebGL or Canvas-based)
   - Dynamic light refraction on hover
   - Performance-conscious implementation

2. **High Contrast Mode Toggle**
   - User preference for disabling glass effects
   - Stored in localStorage

3. **Custom Glass Intensities**
   - Utility classes for varying blur levels
   - `.glass-subtle`, `.glass-intense`

4. **Dark Mode Auto-Detection**
   - Respect system preferences
   - Smooth transitions between modes

## References

- [Apple Human Interface Guidelines - Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [MDN: backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter)
- [WCAG 2.1 Contrast Requirements](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Can I Use: backdrop-filter](https://caniuse.com/css-backdrop-filter)

## Support

For questions or issues related to the glass design system:
- Create an issue in the GitHub repository
- Tag with `component:web` and `design-system` labels
- Reference this guide in your issue description
