# Security Fixes Testing Checklist

## Overview
This document provides comprehensive testing procedures for the security fixes implemented on **2025-10-18**.

**Last Updated**: 2025-10-19 - Revised Test 2 for meta tag corrections and connectivity check fixes.

## Fixes Implemented

### ✅ Phase 1: xlsx Library Security Update
- **Before**: xlsx@0.18.5 (vulnerable to CVE-2024-22363 ReDoS + prototype pollution)
- **After**: xlsx@0.20.2 from https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz
- **Status**: ✅ 0 vulnerabilities confirmed by `npm audit`

### ✅ Phase 2: Security Headers (REVISED 2025-10-19)
- **Update**: Removed CSP-Report-Only and X-Frame-Options (invalid in meta tags)
- **Protections Kept**:
  - MIME-sniffing protection (X-Content-Type-Options: nosniff)
  - Referrer policy for privacy (strict-origin-when-cross-origin)
- **Note**: Full CSP/X-Frame-Options require HTTP headers (CDN configuration)

### ✅ Phase 3: Password Policy Strengthening
- **Before**: Minimum 6 characters
- **After**: Minimum 8 characters + expanded weak password blacklist
- **Impact**: Only affects NEW user signups

### ✅ Phase 4: Enhanced Logout Data Clearing
- **Added 6 new localStorage keys** to clear on logout:
  - `navigator_state_v5` (main app state)
  - `navigator_device_id` (device identifier)
  - `navigator_address_view_mode` (view preferences)
  - `undo_stack` (undo history)
  - `navigator_pwa_prompt_dismissed` (PWA prompt state)
  - `navigator_ownership_uncertain` (ownership flag)

---

## Pre-Deployment Testing

### Test 1: Excel Import Functionality
**Purpose**: Verify xlsx library upgrade didn't break imports

**Test Cases**:
- [ ] **Test 1.1**: Import Excel with addresses only
  - Create Excel with columns: `Address`
  - Import file
  - ✅ **Expected**: Addresses appear in list, no errors

- [ ] **Test 1.2**: Import Excel with coordinates
  - Create Excel with columns: `Address`, `Lat`, `Lng`
  - Import file
  - ✅ **Expected**: Addresses with coordinates, map shows pins

- [ ] **Test 1.3**: Import empty Excel file
  - Create empty .xlsx file
  - Import file
  - ✅ **Expected**: Error message: "File appears to be empty"

- [ ] **Test 1.4**: Import corrupted file
  - Rename .txt file to .xlsx
  - Import file
  - ✅ **Expected**: Error message: "Failed to read Excel file"

- [ ] **Test 1.5**: Drag & drop Excel file
  - Drag Excel file to drop zone
  - ✅ **Expected**: File imports successfully

---

### Test 2: Browser Console Error Check (REVISED 2025-10-19)
**Purpose**: Verify no console errors from meta tags or connectivity checks

**Setup**: Open browser DevTools → Console → Look for errors

**Test Cases**:
- [ ] **Test 2.1**: Page load - no meta tag errors
  - Load application
  - ✅ **Expected**: No "Content-Security-Policy" or "X-Frame-Options" meta tag errors

- [ ] **Test 2.2**: Connectivity check - no manifest errors
  - Check browser console for "manifest.webmanifest" fetch errors
  - ✅ **Expected**: No 404 errors for manifest from wrong domain

- [ ] **Test 2.3**: Google Maps geocoding
  - Import addresses
  - Click "Geocode All"
  - ✅ **Expected**: Geocoding works, no errors

- [ ] **Test 2.4**: Address autocomplete (Places API)
  - Click "Add Address" manually
  - Type in address field
  - ✅ **Expected**: Autocomplete suggestions appear, no errors

- [ ] **Test 2.5**: OpenStreetMap tiles
  - View addresses in map mode
  - Pan/zoom map
  - ✅ **Expected**: Tiles load, no errors

- [ ] **Test 2.6**: Route optimization
  - Go to "Planning" tab
  - Click "Optimize Route"
  - ✅ **Expected**: Route calculates, no errors

- [ ] **Test 2.7**: Supabase real-time sync
  - Make changes on one device
  - Check sync on another device/tab
  - ✅ **Expected**: Changes sync, no websocket CSP violations

- [ ] **Test 2.7**: Modal/dropdown functionality
  - Open settings dropdown
  - Open all modals (backup, Supabase setup, etc.)
  - ✅ **Expected**: All modals open, no CSP violations

**CSP Violations to Document**:
- If any violations occur, note:
  - **Blocked Resource**: [URL]
  - **Directive**: [e.g., script-src, connect-src]
  - **Functionality Affected**: [description]
  - **Action Needed**: Add domain to CSP or investigate if legitimate

---

### Test 3: Password Policy
**Purpose**: Verify password requirements enforced

**Test Cases**:
- [ ] **Test 3.1**: Weak password rejection (too short)
  - Try signup with password: `pass123`
  - ✅ **Expected**: Error: "Password must be at least 8 characters"

- [ ] **Test 3.2**: Weak password rejection (common password)
  - Try signup with password: `password`
  - ✅ **Expected**: Error: "Please choose a stronger password"

- [ ] **Test 3.3**: Weak password rejection (numeric only)
  - Try signup with password: `12345678`
  - ✅ **Expected**: Error: "Please choose a stronger password"

- [ ] **Test 3.4**: Strong password acceptance
  - Try signup with password: `MySecure2024!`
  - ✅ **Expected**: Signup succeeds

- [ ] **Test 3.5**: Existing user login (unchanged)
  - Login with existing account (old password)
  - ✅ **Expected**: Login succeeds (old passwords still work)

---

### Test 4: Logout Data Clearing
**Purpose**: Verify all sensitive data cleared on logout

**Setup**:
1. Login
2. Add some addresses
3. Import Excel file (creates geocode cache)
4. Change view mode (list/map)
5. Make some completions
6. Logout

**Test Cases**:
- [ ] **Test 4.1**: localStorage cleared
  - After logout, open DevTools → Application → Local Storage
  - ✅ **Expected**: Only `navigator-supabase-auth-token` or minimal keys remain
  - ✅ **Verify cleared**:
    - `navigator_state_v5`
    - `navigator_device_id`
    - `navigator_address_view_mode`
    - `undo_stack`
    - `navigator_ownership_uncertain`

- [ ] **Test 4.2**: IndexedDB cleared
  - After logout, open DevTools → Application → IndexedDB
  - ✅ **Expected**: `keyval-store` database is empty or deleted
  - ✅ **Verify cleared**: `geocode-cache`

- [ ] **Test 4.3**: sessionStorage cleared
  - After logout, open DevTools → Application → Session Storage
  - ✅ **Expected**: Empty

- [ ] **Test 4.4**: Fresh start after re-login
  - Login again with same credentials
  - ✅ **Expected**: App starts fresh, pulls data from Supabase

---

## Post-Deployment Testing (Production)

### Test 5: No Vulnerabilities
```bash
# Run on development machine
cd navigator-web
npm audit
```
✅ **Expected**: `found 0 vulnerabilities`

---

### Test 6: CSP Report Monitoring (72-hour watch)

**Day 1-3**: Monitor browser console for CSP violations

**Acceptance Criteria**:
- ✅ 0 violations that block legitimate functionality
- ✅ All features work as expected
- ✅ No user reports of broken features

**After 72 hours**:
- If no issues: Switch from Report-Only to enforcing mode
- If issues found: Adjust CSP policy, restart 72-hour watch

---

### Test 7: User Acceptance

**Metrics to Monitor**:
- [ ] User signup rate (should not decrease)
- [ ] Login failure rate (should not increase)
- [ ] Excel import success rate (should be 100%)
- [ ] Support tickets related to:
  - Maps not loading
  - Login issues
  - "Weak password" complaints

**Acceptance Criteria**:
- ✅ <5 user complaints in first week
- ✅ No increase in support tickets
- ✅ No decrease in user engagement

---

## Rollback Procedures

### Rollback Trigger Conditions
Execute rollback if ANY of these occur:
- ⚠️ Excel import fails for >50% of users
- ⚠️ Google Maps doesn't load
- ⚠️ CSP blocks critical functionality
- ⚠️ >5 user reports of critical issues in 24 hours
- ⚠️ npm audit shows new vulnerabilities

---

### Rollback: xlsx Library
```bash
# Revert to previous version
git checkout HEAD~1 package.json
npm install
npm audit  # Verify
```

**Note**: This will re-introduce vulnerabilities. Only use as emergency measure.

---

### Rollback: CSP Headers
**Option 1**: Switch to Report-Only mode
```html
<!-- index.html - change line 21 -->
<meta http-equiv="Content-Security-Policy-Report-Only" content="...">
```

**Option 2**: Remove CSP entirely (emergency only)
```bash
git checkout HEAD~1 index.html
```

---

### Rollback: Password Policy
```typescript
// src/Auth.tsx line 57 - revert to 6 chars
if (password.length < 6) {
  setValidationError("Password must be at least 6 characters");
  return;
}
```

**Note**: Does NOT affect existing users, only new signups.

---

### Rollback: Logout Data Clearing
```bash
git checkout HEAD~1 src/useCloudSync.ts
```

**Note**: This rollback is LOW RISK since it's a security enhancement.

---

### Emergency Full Rollback
```bash
# Nuclear option - revert all changes
git revert HEAD
git push origin main
```

---

## Success Criteria

All phases considered successful when:

✅ **Technical Validation**
- [ ] `npm audit` shows 0 high/critical vulnerabilities
- [ ] All automated tests pass
- [ ] Manual testing checklist 100% complete

✅ **CSP Validation** (after 72 hours)
- [ ] 0 legitimate functionality blocked
- [ ] 0 user complaints about broken features
- [ ] All external resources loading correctly

✅ **User Experience Validation** (after 7 days)
- [ ] User signup rate stable or increasing
- [ ] <5 support tickets related to security changes
- [ ] No performance degradation

✅ **Security Validation**
- [ ] Row-Level Security (RLS) verified on all Supabase tables
- [ ] Google Maps API restrictions verified in Google Cloud Console
- [ ] CSP enforcement enabled (after monitoring period)

---

## Next Steps After Testing

### If All Tests Pass:
1. ✅ Monitor CSP for 72 hours in Report-Only mode
2. ✅ Switch CSP to enforcing mode (remove "Report-Only")
3. ✅ Update README.md with security improvements
4. ✅ Document password policy for users
5. ✅ Schedule monthly security audits

### If Tests Fail:
1. ⚠️ Document failure conditions
2. ⚠️ Execute appropriate rollback procedure
3. ⚠️ Investigate root cause
4. ⚠️ Re-test and re-deploy

---

## Contact

**For Questions or Issues**:
- Create issue on GitHub: https://github.com/your-repo/navigator-web/issues
- Mark as `security` label
- Include test results from this checklist

---

## Testing Sign-off

**Tested By**: _________________
**Date**: _________________
**All Tests Passed**: ☐ Yes ☐ No
**Notes**: _________________

**Approved for Production**: ☐ Yes ☐ No
**Approver**: _________________
**Date**: _________________
