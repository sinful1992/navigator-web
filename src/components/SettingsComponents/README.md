# Settings Components

Extracted reusable components from the SettingsDropdown component. These components promote reusability, testability, and maintainability.

## Components

### SettingsSection
Collapsible section container with icon, title, and expand/collapse chevron.

**Props:**
- `title` - Section title text
- `icon` - Emoji or icon character
- `sectionKey` - Unique identifier for tracking expansion state
- `isExpanded` - Whether section is currently expanded
- `onToggle` - Callback when user clicks to expand/collapse
- `children` - Content to display inside section

**Usage:**
```tsx
<SettingsSection
  title="General"
  icon="📱"
  sectionKey="general"
  isExpanded={expandedSection === 'general'}
  onToggle={toggleSection}
>
  {/* Settings content */}
</SettingsSection>
```

### SettingsToggle
Toggle switch with label and optional description.

**Props:**
- `id` - HTML id for the input element
- `checked` - Current toggle state
- `onChange` - Callback when user toggles
- `label` - Label text
- `description` - Optional description text below label

**Usage:**
```tsx
<SettingsToggle
  id="dark-mode"
  checked={settings.darkMode}
  onChange={toggleDarkMode}
  label="Dark Mode"
  description="Switch between light and dark theme"
/>
```

### StorageInfo
Displays current storage usage with progress bar.

**Props:**
- `usedMB` - Used storage in MB (string)
- `quotaMB` - Total quota in MB (string)
- `percentage` - Usage percentage (0-100)

**Usage:**
```tsx
{storageInfo && (
  <StorageInfo
    usedMB={storageInfo.usedMB}
    quotaMB={storageInfo.quotaMB}
    percentage={storageInfo.percentage}
  />
)}
```

### HomeAddressEditor
Complete home address management with three states:
1. Empty state - Prompt to set address
2. Set state - Display current address with Change/Clear buttons
3. Edit state - Show AddressAutocomplete input

**Props:**
- `homeAddress` - Current home address (optional)
- `onUpdateAddress` - Callback with address and coordinates
- `onClearAddress` - Callback to clear address

**Usage:**
```tsx
<HomeAddressEditor
  homeAddress={settings.homeAddress}
  onUpdateAddress={updateHomeAddress}
  onClearAddress={clearHomeAddress}
/>
```

### SettingsActionButton
Action button with icon and text, supporting multiple visual variants.

**Props:**
- `icon` - Emoji or icon character (optional)
- `text` - Button text
- `variant` - Visual style: 'primary' | 'secondary' | 'danger' | 'accent' | 'small'
  Can combine multiple: `['primary', 'small']`
- `onClick` - Button click callback
- `disabled` - Disable button
- Standard HTML button attributes

**Usage:**
```tsx
<SettingsActionButton
  icon="💾"
  text="Backup All Data"
  variant={['primary']}
  onClick={handleBackup}
/>
```

### ConfirmModal
Simple confirmation dialog for important or destructive actions.

**Props:**
- `title` - Modal title
- `message` - Confirmation message
- `confirmText` - Confirm button text (default: "Confirm")
- `cancelText` - Cancel button text (default: "Cancel")
- `onConfirm` - Called when user confirms
- `onCancel` - Called when user cancels
- `isDanger` - Style as danger action (red button)

**Usage:**
```tsx
<ConfirmModal
  title="Delete Account?"
  message="This action cannot be undone. All your data will be permanently deleted."
  confirmText="Delete"
  cancelText="Keep Account"
  isDanger
  onConfirm={handleDeleteAccount}
  onCancel={closeModal}
/>
```

### SubsectionTitle
Small uppercase title for grouping related items within a section.

**Props:**
- `children` - Title text
- `isDanger` - Color title red (for danger zones)

**Usage:**
```tsx
<SubsectionTitle>Import & Export</SubsectionTitle>

<SubsectionTitle isDanger>Danger Zone</SubsectionTitle>
```

## Styling

All components use CSS classes defined in `SettingsStyles.ts`. The modern design system uses:

- **Colors:** Indigo primary (#6366f1), grays for neutral
- **Spacing:** Consistent rem-based padding/margins
- **Animations:** Smooth transitions with cubic-bezier easing
- **Dark Mode:** Full support with `.dark-mode` prefix
- **Responsive:** Mobile-optimized with media queries

## Integration

These components are designed to work together to build the Settings panel. They share:
- Common CSS class patterns (`modern-*`)
- Consistent color palette
- Unified interaction patterns

## Future Improvements

1. CSS-in-JS: Convert SettingsStyles to styled-components or emotion
2. Theme System: Extract color values to theme tokens
3. Icon Component: Create Icon component to handle emoji/SVG icons
4. Form Component: Extract common form patterns
5. Accessibility: Add ARIA labels and keyboard navigation testing
