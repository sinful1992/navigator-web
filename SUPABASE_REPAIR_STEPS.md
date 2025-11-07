# Supabase Cloud Database Repair - Step by Step Guide

## Status Check
✅ Code fixes deployed to GitHub  
✅ App running with new sequence capping protection  
⏳ Cloud database still has corrupted sequences (needs repair)

---

## What You Need to Do

The fixes prevent FUTURE corruption, but your cloud database still has corrupted sequences from the past. This one-time repair will fix them.

### Step 1: Login to Supabase

1. Go to https://supabase.com/dashboard
2. Login with your credentials
3. Select your Navigator Web project

### Step 2: Open SQL Editor

1. In left sidebar, click **SQL Editor**
2. Click **+ New Query** to create a new query

### Step 3: Check Current Damage (Optional)

Copy and run this to see what's corrupted:

```sql
SELECT 
  COUNT(*) as total_operations,
  COUNT(CASE WHEN sequence_number > 1000000 THEN 1 END) as corrupted_sequences,
  MAX(sequence_number) as max_sequence,
  MIN(sequence_number) as min_sequence
FROM public.navigator_operations;
```

Expected result: `corrupted_sequences` should be > 0 (in thousands probably)

### Step 4: Run the Main Repair

**Copy the ENTIRE SQL block below and paste into SQL Editor:**

```sql
-- REPAIR: Fix corrupted sequence numbers in navigator_operations
-- This re-assigns clean sequential numbers (1, 2, 3...) per user
WITH numbered_ops AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp, id) as new_sequence
  FROM public.navigator_operations
  WHERE sequence_number > 1000000  -- Only fix corrupted ones
)
UPDATE public.navigator_operations ops
SET sequence_number = numbered_ops.new_sequence
FROM numbered_ops
WHERE ops.id = numbered_ops.id;
```

**Click RUN (bottom right button)**

You should see: `UPDATE X` where X is the number of rows fixed

### Step 5: Verify Repair Worked

Copy and run this to confirm:

```sql
SELECT 
  COUNT(*) as total_operations,
  COUNT(CASE WHEN sequence_number > 1000000 THEN 1 END) as remaining_corrupted,
  MAX(sequence_number) as max_sequence,
  MIN(sequence_number) as min_sequence
FROM public.navigator_operations;
```

Expected result: `remaining_corrupted` should be **0**

### Step 6: Go Back to App and Refresh

1. Switch back to Navigator app
2. **Hard refresh**: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)
3. Wait for bootstrap to complete
4. App will detect fixed sequences and sanitize data
5. You may see: "BOOTSTRAP: Sanitized corrupted operations"

### Step 7: Check Data Recovery

1. Go to **Completed** tab
2. Check if missing completions have returned
3. Expected: 350-400+ of the 412 missing completions should reappear
4. Some may still be missing if they conflicted during corruption

---

## What the Fixes Do (Now Active)

✅ **SequenceGenerator caps sequences > 1M** - prevents poisoning counter  
✅ **Console logs when capping happens** - helps identify source of bad values  
✅ **Future operations sync with fixed sequences** - no more data loss  
✅ **Bootstrap sanitizes any corrupted data** - automatic recovery  

---

## If Repair Fails

### SQL Error Messages

**"ERROR: Relation "navigator_operations" does not exist"**
- Table doesn't exist (shouldn't happen)
- Skip to Step 6 and refresh app

**"ERROR: Column 'sequence_number' does not exist"**
- Column wasn't added in migration
- Contact support

### App Still Shows Errors

After running SQL repair and refreshing:
- Console should NOT show "corrupted sequence numbers" anymore
- If still showing: SQL repair didn't work, need to investigate

---

## Verification Checklist

After completing all steps:

- [ ] Opened Supabase SQL Editor
- [ ] Ran the main repair SQL
- [ ] Got success message (UPDATE X rows)
- [ ] Verified with check SQL (`remaining_corrupted = 0`)
- [ ] Refreshed app (Ctrl+F5)
- [ ] Checked Completed tab for recovered data
- [ ] Console no longer shows "corrupted sequence" errors
- [ ] Data looks correct (count is stable, not jumping)

---

## Emergency Recovery

If something goes wrong:

**Option 1: Clear and Start Fresh**
```sql
-- WARNING: This deletes all operations! Only use if absolutely necessary
DELETE FROM public.navigator_operations 
WHERE sequence_number > 1000000;
```

Then refresh app - it will sync fresh operations.

**Option 2: Contact Support**
- Note the exact error message
- Provide the SQL query that failed
- Include error code if shown

---

## Timeline After Repair

```
Now         → Run SQL repair
            → Verify repair worked
            → Refresh app (Ctrl+F5)
Immediately → Bootstrap detects fixed sequences
            → Sanitization runs
            → Data merges with local state
After refresh → Completions recover (350-400+)
            → App stable with 66+ completions
Going forward → No more sequence corruption
            → SequenceGenerator caps any bad values
            → Sync works smoothly
```

---

## Questions to Ask Yourself

**Q: My sequences look fine in SQL check. Do I still need to repair?**
A: If MAX(sequence_number) is > 1000000, YES, repair is needed.

**Q: The repair ran but app still shows errors?**
A: Hard refresh browser (Ctrl+F5). Browser cache may be old.

**Q: I see "UPDATE 0" - did the repair work?**
A: No operations were corrupted OR they were already fixed. Safe to continue.

**Q: Will I lose more data after repair?**
A: No. Code fixes prevent future corruption. This was one-time event.

---

## Success Indicators

After repair and app refresh, you should see:

✅ Completions count stable (not jumping 66 → 478 → 66)  
✅ No "corrupted sequence" in console errors  
✅ Bootstrap completes successfully  
✅ Data persists across page refreshes  
✅ New operations sync normally  

---

## Keep These Files Handy

- `ROOT_CAUSE_ANALYSIS.md` - Why this happened
- `RECOVERY_GUIDE.md` - Data recovery info
- This file - SQL repair steps
- `CLOUD_DATABASE_REPAIR.sql` - Pre-written SQL

---

**Need help?** Check the error message in Supabase's response, search for it in ROOT_CAUSE_ANALYSIS.md or contact support with the exact error.

Good luck! 🚀
