# Phase 2 Task 2 Phase 5: Composition Guide

**Objective:** Refactor SettingsDropdown.tsx to use extracted components and hook
**Estimated Time:** 1-2 hours
**Complexity:** Medium (systematic refactoring with high confidence)
**Risk Level:** Low (original file unchanged, styles already working)

---

## OVERVIEW

The composition phase involves 4 main steps:

1. **Replace state management** (useState → useSettingsDropdown hook)
2. **Replace inline components** (ToggleSwitch, CollapsibleSection → extracted components)
3. **Replace inline JSX** (storage card, buttons, modals → extracted components)
4. **Test and validate** (zero TypeScript errors, visual verification)

---

## STEP-BY-STEP IMPLEMENTATION

### Step 1: Update Imports (5 minutes)

Add these imports at the top of `src/components/SettingsDropdown.tsx`:

```typescript
// Import extracted styles
import { SETTINGS_STYLES } from './SettingsStyles';

// Import extracted components
import {
  SettingsSection,
  SettingsToggle,
  SettingsActionButton,
  StorageInfo,
  HomeAddressEditor,
  ConfirmModal,
  SubsectionTitle,
} from './SettingsComponents';

// Import state management hook
import { useSettingsDropdown } from '../hooks/useSettingsDropdown';
```

✅ The SETTINGS_STYLES import is already there.

---

### Step 2: Replace State Management (10 minutes)

**Current Code (Remove):**
```typescript
const [isOpen, setIsOpen] = useState(false);
const [showSMSSettings, setShowSMSSettings] = useState(false);
const [showBonusSettings, setShowBonusSettings] = useState(false);
const [showSyncDebug, setShowSyncDebug] = useState(false);
const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
const [expandedSection, setExpandedSection] = useState<string | null>('general');
const dropdownRef = useRef<HTMLDivElement>(null);
const panelBodyRef = useRef<HTMLDivElement>(null);
const fileInputRef = useRef<HTMLInputElement>(null);
const restoreInputRef = useRef<HTMLInputElement>(null);

// Home address editing state
const [isEditingHomeAddress, setIsEditingHomeAddress] = useState(false);
const [tempHomeAddress, setTempHomeAddress] = useState("");

// Load storage info, close on outside click, close on escape - (3 useEffect blocks)
```

**New Code (Replace with):**
```typescript
const { state, actions, refs } = useSettingsDropdown();

// Destructure for convenience
const {
  isOpen,
  showSMSSettings,
  showBonusSettings,
  showSyncDebug,
  storageInfo,
  expandedSection,
  isEditingHomeAddress,
  tempHomeAddress,
} = state;

const {
  closeDropdown,
  toggleSection,
  showSMSModal,
  hideSMSModal,
  showBonusModal,
  hideBonusModal,
  showSyncDebugModal,
  hideSyncDebugModal,
  setTempHomeAddress,
  startEditingHomeAddress,
  stopEditingHomeAddress,
  refreshStorageInfo,
} = actions;

const { dropdownRef, fileInputRef, restoreInputRef } = refs;
```

✅ All useState, useRef, and useEffect calls are replaced by hook

---

### Step 3: Replace State Setter Calls (15 minutes)

Search and replace throughout the component:

| Old | New |
|-----|-----|
| `setIsOpen(false)` | `closeDropdown()` |
| `setIsOpen(!isOpen)` | `toggleDropdown()` (add if needed) |
| `setExpandedSection(...)` | `toggleSection(key)` |
| `setShowSMSSettings(true)` | `showSMSModal()` |
| `setShowSMSSettings(false)` | `hideSMSModal()` |
| `setShowBonusSettings(true)` | `showBonusModal()` |
| `setShowBonusSettings(false)` | `hideBonusModal()` |
| `setShowSyncDebug(true)` | `showSyncDebugModal()` |
| `setShowSyncDebug(false)` | `hideSyncDebugModal()` |
| `setIsEditingHomeAddress(true)` | `startEditingHomeAddress()` |
| `setIsEditingHomeAddress(false)` | `stopEditingHomeAddress()` |
| `setTempHomeAddress(...)` | `setTempHomeAddress(...)` |
| `getStorageInfo().then(setStorageInfo)` | `refreshStorageInfo()` |

---

### Step 4: Replace Trigger Button (5 minutes)

**Current Code:**
```typescript
<button
  type="button"
  className="modern-settings-trigger"
  onClick={() => setIsOpen(!isOpen)}
  aria-expanded={isOpen}
  aria-haspopup="true"
>
  {trigger || (
    <>
      <span className="modern-trigger-icon">⚙️</span>
      <span className="modern-trigger-text">Settings</span>
    </>
  )}
</button>
```

**New Code:**
```typescript
<button
  type="button"
  className="modern-settings-trigger"
  onClick={isOpen ? closeDropdown : () => setIsOpen(true)}
  aria-expanded={isOpen}
  aria-haspopup="true"
>
  {trigger || (
    <>
      <span className="modern-trigger-icon">⚙️</span>
      <span className="modern-trigger-text">Settings</span>
    </>
  )}
</button>
```

Wait, we need to add `setIsOpen` to hook. Actually, let's add `toggleDropdown` to the hook actions. But for now, just keep the inline logic or update hook to export `toggleDropdown`.

Actually, looking back at the hook, `toggleDropdown` is already exported! Use it:

```typescript
<button
  type="button"
  className="modern-settings-trigger"
  onClick={actions.toggleDropdown}
  aria-expanded={isOpen}
  aria-haspopup="true"
>
  ...
</button>
```

---

### Step 5: Replace Section Components (15 minutes)

**Current Code Example:**
```typescript
<CollapsibleSection
  title="General"
  icon="📱"
  sectionKey="general"
  isExpanded={expandedSection === 'general'}
  onToggle={toggleSection}
>
  {/* content */}
</CollapsibleSection>
```

This is already the right structure! Just rename:
- `CollapsibleSection` → `SettingsSection`

No other changes needed! The hook provides `toggleSection` correctly.

---

### Step 6: Replace Toggle Components (10 minutes)

**Current Code Example:**
```typescript
<div className="modern-setting-row">
  <div className="modern-setting-info">
    <div className="modern-setting-label">Dark Mode</div>
    <div className="modern-setting-desc">Switch between light and dark theme</div>
  </div>
  <div className="modern-toggle-switch" onClick={toggleDarkMode}>
    <input
      type="checkbox"
      id="dark-mode"
      checked={settings.darkMode}
      onChange={toggleDarkMode}
      className="modern-toggle-input"
    />
    <div className={`modern-toggle-slider ${checked ? 'checked' : ''}`}>
      <div className="modern-toggle-thumb"></div>
    </div>
  </div>
</div>
```

**New Code:**
```typescript
<SettingsToggle
  id="dark-mode"
  checked={settings.darkMode}
  onChange={toggleDarkMode}
  label="Dark Mode"
  description="Switch between light and dark theme"
/>
```

✅ Applies to all toggle settings: Dark Mode, Push Notifications, Auto-sync, Auto-backup, Confirm before delete, Avoid Tolls

---

### Step 7: Replace Action Buttons (10 minutes)

**Current Code Example:**
```typescript
<button
  className="modern-action-button"
  onClick={() => fileInputRef.current?.click()}
>
  <span className="modern-button-icon">📊</span>
  <span className="modern-button-text">Import Excel/CSV</span>
</button>
```

**New Code:**
```typescript
<SettingsActionButton
  icon="📊"
  text="Import Excel/CSV"
  onClick={() => fileInputRef.current?.click()}
/>
```

**For Primary Buttons:**
```typescript
<button
  className="modern-action-button primary"
  onClick={() => {
    exportDataAsJSON(appState, userEmail);
    closeDropdown();
  }}
>
  <span className="modern-button-icon">💾</span>
  <span className="modern-button-text">Backup All Data</span>
</button>
```

**Becomes:**
```typescript
<SettingsActionButton
  icon="💾"
  text="Backup All Data"
  variant="primary"
  onClick={() => {
    exportDataAsJSON(appState, userEmail);
    closeDropdown();
  }}
/>
```

✅ Apply to all buttons: Import, Backup, Restore, Sync, etc.

---

### Step 8: Replace Storage Card (3 minutes)

**Current Code:**
```typescript
{storageInfo && (
  <div className="modern-storage-card">
    <div className="modern-storage-header">
      <span className="modern-storage-label">Storage Usage</span>
      <span className="modern-storage-value">
        {storageInfo.usedMB} / {storageInfo.quotaMB} MB
      </span>
    </div>
    <div className="modern-storage-bar">
      <div
        className={`modern-storage-fill ${storageInfo.percentage > 80 ? 'warning' : ''}`}
        style={{ width: `${storageInfo.percentage}%` }}
      />
    </div>
    <div className="modern-storage-percent">{storageInfo.percentage}% used</div>
  </div>
)}
```

**New Code:**
```typescript
{storageInfo && (
  <StorageInfo
    usedMB={storageInfo.usedMB}
    quotaMB={storageInfo.quotaMB}
    percentage={storageInfo.percentage}
  />
)}
```

✅ Simpler, more readable, easier to test

---

### Step 9: Replace Home Address Editor (3 minutes)

**Current Code:**
Lines 465-575 (all the home address editing logic)

**New Code:**
```typescript
<HomeAddressEditor
  homeAddress={settings.homeAddress}
  onUpdateAddress={updateHomeAddress}
  onClearAddress={clearHomeAddress}
/>
```

✅ 110 LOC reduced to 5 LOC! Component handles all 3 states internally

---

### Step 10: Replace Subsection Titles (5 minutes)

**Current Code:**
```typescript
<div className="modern-subsection-title">Import & Export</div>
```

**New Code:**
```typescript
<SubsectionTitle>Import & Export</SubsectionTitle>
```

**For Danger Zone:**
```typescript
<div className="modern-subsection-title danger">Danger Zone</div>
```

**Becomes:**
```typescript
<SubsectionTitle isDanger>Danger Zone</SubsectionTitle>
```

✅ Apply to all subsection titles

---

### Step 11: Remove Inline Toggle Component (5 minutes)

**Current Code (Remove):**
```typescript
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: () => void;
  id: string;
}> = ({ checked, onChange, id }) => (
  <div className="modern-toggle-switch" onClick={onChange}>
    {/* ... */}
  </div>
);
```

✅ No longer needed, use SettingsToggle component instead

---

### Step 12: Remove Inline Styles Fallback (2 minutes)

**Current Code (Keep as-is):**
```typescript
<style>{SETTINGS_STYLES}</style>
```

✅ Already updated to use imported styles, no change needed

---

## VALIDATION CHECKLIST

### TypeScript Compilation
- [ ] Run `npx tsc --noEmit` - should have ZERO errors
- [ ] No type warnings

### Visual Inspection
- [ ] Settings dropdown appears and functions identically
- [ ] All buttons work (click, visual feedback)
- [ ] All toggles work (toggle state, visual feedback)
- [ ] All modals open/close correctly
- [ ] Home address editor shows correct states (empty, set, edit)
- [ ] Storage card displays correctly

### Dark Mode Testing
- [ ] Toggle dark mode
- [ ] Settings dropdown shows dark mode styles
- [ ] All components render correctly in dark mode

### Mobile Testing
- [ ] Open settings on mobile viewport
- [ ] Dropdown centers and overlays correctly
- [ ] Touch interactions work
- [ ] Escape key closes on mobile

### Console Verification
- [ ] No console errors
- [ ] No console warnings
- [ ] No memory leaks from event listeners

### File Size Verification
- [ ] SettingsDropdown.tsx reduced from ~890 LOC to ~250-300 LOC
- [ ] All extracted files present and compiling
- [ ] No duplicate code

---

## COMMON MISTAKES TO AVOID

1. ❌ Forgetting to destructure state/actions from hook
2. ❌ Using old setState functions instead of hook actions
3. ❌ Not updating all button className patterns
4. ❌ Forgetting to remove ToggleSwitch component definition
5. ❌ Not testing Escape key to close
6. ❌ Missing ref assignments to file inputs
7. ❌ Forgetting to call closeDropdown() in modal actions
8. ❌ Not handling optional props (onUpdateReminderSettings, etc.)

---

## ESTIMATED TIMELINE

| Task | Time |
|------|------|
| Step 1: Imports | 5 min |
| Step 2: State Management | 10 min |
| Step 3: State Setters | 15 min |
| Steps 4-10: Component Replacements | 50 min |
| Step 11-12: Cleanup | 7 min |
| Validation & Testing | 20-30 min |
| **Total** | **107-117 min** (1.75-2 hours) |

---

## SUCCESS CRITERIA

✅ **All criteria must be met to consider Phase 5 complete:**

1. TypeScript compilation: ZERO errors
2. All extracted components used correctly
3. useSettingsDropdown hook used for state management
4. Visual appearance identical to original
5. All functionality works (toggles, buttons, modals, etc.)
6. No console errors or warnings
7. Dark mode works correctly
8. Mobile responsive works correctly
9. SettingsDropdown.tsx file size significantly reduced
10. Code review ready (clean, well-organized, maintainable)

---

## NEXT STEPS AFTER COMPLETION

Once Phase 5 is complete:

1. **Write Unit Tests** (2 hours)
   - Test each extracted component in isolation
   - Test useSettingsDropdown hook
   - Test integration

2. **Compare with Original** (30 minutes)
   - Side-by-side visual comparison
   - Regression testing with real user scenarios

3. **Optional Future Improvements**
   - Convert CSS to CSS-in-JS (Emotion, styled-components)
   - Create Storybook stories for components
   - Extract more components (FeatureButton, LinkButton groups, etc.)
   - Create ComponentLibrary or DesignSystem

---

**Guide Created:** October 28, 2025
**Confidence Level:** HIGH (Clear steps, proven components, low risk)
**Recommended:** Complete this phase before moving to Task 1 work

