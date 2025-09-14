# Centralized Routing System Setup

This guide explains how to deploy and configure the centralized OpenRouteService integration using Supabase Edge Functions.

## Overview

The centralized routing system eliminates the need for users to manage their own OpenRouteService API keys by handling all routing operations server-side through Supabase Edge Functions.

### Benefits
- **Zero user friction** - No API key setup required for users
- **Cost control** - Centralized API usage and billing
- **Rate limit management** - Proper throttling and usage tracking
- **Security** - API key stays secure on your server
- **Usage analytics** - Track API usage per user/subscription
- **Subscription enforcement** - Built-in access control

## Required Files

The system includes these components:

### Edge Functions
1. `supabase/functions/geocode/index.ts` - Geocoding service
2. `supabase/functions/optimize-route/index.ts` - Route optimization service  
3. `supabase/functions/search-addresses/index.ts` - Address search/autocomplete

### Database Migration
- `supabase/migrations/20240914000003_add_api_usage_tracking.sql` - API usage tracking

### Frontend Services
- `src/services/centralizedRouting.ts` - Updated service that calls Edge Functions
- Updated components use centralized service (no API key required)

## Deployment Steps

### 1. Set Up Environment Variables

Add your OpenRouteService API key to your Supabase project:

```bash
# Set the environment variable in Supabase Dashboard > Settings > Environment Variables
OPENROUTE_SERVICE_API_KEY=your_openrouteservice_api_key_here
```

Or via Supabase CLI:
```bash
supabase secrets set OPENROUTE_SERVICE_API_KEY=your_api_key_here
```

### 2. Run Database Migration

Apply the migration to add API usage tracking:

```bash
supabase migration up
```

Or manually run the SQL in `supabase/migrations/20240914000003_add_api_usage_tracking.sql`

### 3. Deploy Edge Functions

Deploy the Edge Functions to your Supabase project:

```bash
# Deploy all functions
supabase functions deploy geocode
supabase functions deploy optimize-route  
supabase functions deploy search-addresses

# Or deploy all at once
supabase functions deploy
```

### 4. Configure Row Level Security

Ensure RLS policies are properly set up (included in migration):

- Users can only access services with valid subscriptions
- API usage tracking is properly secured
- Admin users can view analytics

### 5. Frontend Integration

The frontend automatically uses the centralized service:

- **AddressAutocomplete** - No API key parameter needed
- **RoutePlanning** - Seamless geocoding and optimization
- **Error handling** - Clear feedback for service availability

## API Usage Tracking

The system tracks API usage in the `api_usage` table:

```sql
-- View your API usage
SELECT * FROM get_user_api_usage();

-- Admin: View overall usage stats  
SELECT * FROM get_api_usage_stats();
```

## Service Functions

### Geocoding (`/geocode`)
- Batch geocodes up to 50 addresses per request
- Returns confidence scores and formatted addresses
- Rate limited to 5 addresses per batch with delays

### Route Optimization (`/optimize-route`)  
- Optimizes routes for up to 100 addresses
- Returns optimized order with distance/time estimates
- Handles unassigned addresses gracefully

### Address Search (`/search-addresses`)
- Real-time address autocomplete
- Returns up to 10 suggestions per query
- Optimized for UK addresses

## Rate Limiting & Costs

### OpenRouteService Limits
- Free tier: 2,000 requests/day
- Standard plan: 40,000 requests/day ($10/month)
- Professional: 200,000 requests/day ($50/month)

### Estimated Usage per User
- **Light user**: ~50 requests/month (geocoding + optimization)
- **Heavy user**: ~500 requests/month (frequent route planning)
- **Enterprise user**: ~2,000 requests/month (daily route optimization)

### Cost Management
With 100 active subscribers:
- Light usage: ~5,000 requests/month (Free tier)
- Mixed usage: ~30,000 requests/month (Standard plan - $10/month)
- Heavy usage: ~150,000 requests/month (Professional plan - $50/month)

Cost per user: **$0.10 - $0.50/month** depending on usage patterns.

## Monitoring & Analytics

### Usage Analytics
Access detailed usage statistics:
- Requests per service type
- Success rates
- Users per subscription tier
- API costs and trends

### Admin Dashboard
The admin dashboard includes:
- Real-time API usage metrics
- Cost tracking and projections  
- User activity monitoring
- Service health status

## Error Handling

The system provides clear error messages:
- **Unauthorized**: User not signed in
- **Subscription required**: Premium feature access denied
- **Service unavailable**: API or network issues
- **Rate limited**: Too many requests

## Security Features

- **Authentication required** - All requests verify user auth
- **Subscription enforcement** - Access control via RLS policies
- **API key protection** - Never exposed to frontend
- **Usage logging** - Full audit trail of API calls
- **Input validation** - Prevents abuse and injection attacks

## Troubleshooting

### Common Issues

1. **"Service unavailable" errors**
   - Check OPENROUTE_SERVICE_API_KEY is set
   - Verify Edge Functions are deployed
   - Check Supabase function logs

2. **"Subscription required" errors**  
   - Verify RLS policies are applied
   - Check user subscription status
   - Ensure `has_subscription_access()` function exists

3. **Geocoding failures**
   - Check OpenRouteService API quota
   - Verify address format (UK addresses work best)
   - Review function logs for API responses

### Debugging Commands

```bash
# Check function logs
supabase functions logs geocode

# Test function locally
supabase functions serve
curl -X POST http://localhost:54321/functions/v1/geocode \
  -H "Authorization: Bearer your_anon_key" \
  -H "Content-Type: application/json" \
  -d '{"addresses":["10 Downing Street, London"]}'
```

## Migration from Direct API Usage

If users were previously using their own API keys:

1. **Remove API key UI** - Settings panels no longer needed
2. **Update service calls** - Use `centralizedRouting.ts` instead of `geocoding.ts`
3. **Clear stored keys** - Remove localStorage API keys
4. **Test functionality** - Verify geocoding and optimization work

## Cost Optimization Tips

1. **Batch requests** - Group geocoding calls when possible
2. **Cache results** - Store geocoded addresses to avoid re-geocoding
3. **Implement debouncing** - Reduce autocomplete API calls
4. **Monitor usage** - Set up alerts for high usage patterns
5. **Optimize queries** - Use appropriate search limits and filters

## Next Steps

After deployment:

1. **Monitor usage patterns** - Track API costs and user behavior
2. **Set up alerts** - Get notified of high usage or errors
3. **Plan scaling** - Consider higher-tier OpenRouteService plans
4. **Gather feedback** - Ensure users find the service reliable
5. **Optimize performance** - Fine-tune rate limits and caching

The centralized routing system is now ready to provide seamless geocoding and route optimization to all your subscribers! 🚀