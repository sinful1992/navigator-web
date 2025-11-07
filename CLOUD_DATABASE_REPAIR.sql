-- NAVIGATOR WEB: Cloud Database Repair Script
-- Fixes corrupted sequence numbers in navigator_operations table
-- Run as Supabase admin in SQL Editor

-- STEP 1: Check current damage (optional, for inspection)
-- SELECT COUNT(*) as corrupted_count FROM public.navigator_operations 
-- WHERE sequence_number > 1000000;

-- STEP 2: Fix corrupted sequence numbers by re-assigning clean sequences
-- Re-assigns sequential numbers (1, 2, 3...) per user, ordered by timestamp
WITH numbered_ops AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp, id) as new_sequence
  FROM public.navigator_operations
  WHERE sequence_number > 1000000  -- Only fix operations with corrupted (huge) sequences
)
UPDATE public.navigator_operations ops
SET sequence_number = numbered_ops.new_sequence
FROM numbered_ops
WHERE ops.id = numbered_ops.id;

-- STEP 3: Verify repair (optional, for verification)
-- SELECT COUNT(*) as total_ops, MAX(sequence_number) as max_seq FROM public.navigator_operations;
-- Should show max_seq in reasonable range (e.g., 100-10000 depending on activity)

-- STEP 4: Check for any remaining large sequences (should be 0)
-- SELECT COUNT(*) FROM public.navigator_operations WHERE sequence_number > 1000000;

-- After running this SQL:
-- 1. Go back to Navigator app
-- 2. Force refresh (Ctrl+F5)
-- 3. Check console for bootstrap messages
-- 4. Data should recover with sanitized sequences
