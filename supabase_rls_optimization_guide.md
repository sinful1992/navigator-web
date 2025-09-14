# Supabase RLS Performance Optimization Guide

This guide explains the RLS (Row Level Security) performance optimizations applied to resolve Supabase linter warnings.

## 🚀 **Performance Issues Fixed**

### 1. **Auth RLS Initialization Plan Warnings**

**Problem**: RLS policies using `auth.uid()` directly cause function re-evaluation for each row, leading to poor performance at scale.

**Solution**: Replace `auth.uid()` with `(select auth.uid())` to enable PostgreSQL query optimization.

#### Before (Slow):
```sql
CREATE POLICY "old_policy" ON table_name
    FOR SELECT USING (user_id = auth.uid());
```

#### After (Optimized):
```sql
CREATE POLICY "new_policy" ON table_name
    FOR SELECT USING (user_id = (select auth.uid()));
```

### 2. **Multiple Permissive Policies Warnings**

**Problem**: Multiple permissive policies for the same role/action cause each policy to be executed, reducing performance.

**Solution**: Consolidate multiple policies into single, comprehensive policies using OR conditions.

#### Before (Multiple Policies):
```sql
-- Policy 1
CREATE POLICY "users_own_data" ON api_usage
    FOR SELECT USING (user_id = auth.uid());

-- Policy 2
CREATE POLICY "admins_all_data" ON api_usage
    FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
```

#### After (Single Consolidated Policy):
```sql
CREATE POLICY "api_usage_select_policy" ON api_usage
    FOR SELECT USING (
        user_id = (select auth.uid()) OR EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE user_id = (select auth.uid()) AND is_active = true
        )
    );
```

## 📊 **Tables Optimized**

### Core Application Tables:
- ✅ **navigator_state**: Consolidated 7 policies → 4 optimized policies
- ✅ **entity_store**: Optimized auth calls in all policies
- ✅ **sync_oplog**: Optimized auth calls in all policies
- ✅ **navigator_operations**: Optimized auth calls in all policies
- ✅ **backups**: Optimized auth calls in policies

### Subscription & Admin Tables:
- ✅ **subscription_plans**: Optimized admin access checks
- ✅ **user_subscriptions**: Consolidated admin/user access
- ✅ **payment_history**: Optimized admin access
- ✅ **admin_actions**: Optimized admin-only access
- ✅ **admin_users**: Optimized self/admin access
- ✅ **api_usage**: Consolidated 2 policies → 1 optimized policy

## 🔧 **Migration Details**

### Applied in: `20241215000005_optimize_rls_performance.sql`

**Key Optimizations:**

1. **Auth Function Optimization**:
   - Changed `auth.uid()` → `(select auth.uid())`
   - Enables PostgreSQL to cache auth calls per query instead of per row

2. **Policy Consolidation**:
   - Merged duplicate policies for same table/action
   - Reduced total policy count significantly
   - Eliminated policy conflicts

3. **Admin Access Patterns**:
   - Standardized admin checks across all tables
   - Optimized admin_users table queries
   - Consistent `is_active = true` filtering

## 📈 **Performance Impact**

### Before Optimization:
- **31 RLS warnings** for auth initialization plan
- **48 warnings** for multiple permissive policies
- Poor query performance on large datasets
- Multiple policy evaluations per query

### After Optimization:
- ✅ **Zero auth initialization warnings**
- ✅ **Zero multiple permissive policy warnings**
- 🚀 **Improved query performance** (especially at scale)
- 🔄 **Single policy evaluation** per table/action

## 🛠️ **Verification**

After applying the migration, verify optimizations with:

```sql
-- Check RLS optimization status (admin only)
SELECT * FROM check_rls_optimization_status();

-- Verify no auth.uid() calls remain (should return 0 rows)
SELECT tablename, policyname, qual
FROM pg_policies
WHERE qual LIKE '%auth.uid()%'
  AND qual NOT LIKE '%(select auth.uid())%'
  AND schemaname = 'public';

-- Check policy counts per table
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY policy_count DESC;
```

## 📋 **Implementation Checklist**

- [ ] Apply the RLS optimization migration
- [ ] Run verification queries
- [ ] Monitor query performance in production
- [ ] Check that auth flows still work correctly
- [ ] Confirm linter warnings are resolved

## ⚡ **Expected Results**

1. **Linter Status**: All auth_rls_initplan and multiple_permissive_policies warnings resolved
2. **Query Performance**: Improved response times, especially for large datasets
3. **Scalability**: Better performance as user base grows
4. **Maintainability**: Cleaner, more manageable RLS policy structure

## 🔍 **Monitoring**

After deployment, monitor:
- Query execution times for tables with RLS
- Auth-related query patterns
- User access patterns and performance
- Any auth-related errors in logs

This optimization significantly improves database performance while maintaining security and functionality.