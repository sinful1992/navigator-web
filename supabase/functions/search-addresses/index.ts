import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AddressSearchRequest {
  query: string;
  countryCode?: string;
  limit?: number;
}

interface AddressSearchResult {
  label: string;
  coordinates: [number, number]; // [lng, lat]
  confidence: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the API key from environment variables
    const ORS_API_KEY = Deno.env.get('OPENROUTE_SERVICE_API_KEY')
    if (!ORS_API_KEY) {
      throw new Error('OpenRouteService API key not configured')
    }

    // Initialize Supabase client for user authentication
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Verify user authentication
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Check if user has access (subscription or owner)
    const { data: hasAccess } = await supabaseClient.rpc('has_subscription_access')
    const { data: isOwner } = await supabaseClient.rpc('is_owner')
    
    if (!hasAccess && !isOwner) {
      return new Response(
        JSON.stringify({ error: 'Subscription required for address search' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse request - handle both GET and POST
    let query: string, countryCode: string, limit: number

    if (req.method === 'GET') {
      const url = new URL(req.url)
      query = url.searchParams.get('query') || ''
      countryCode = url.searchParams.get('countryCode') || 'GB'
      limit = parseInt(url.searchParams.get('limit') || '5')
    } else {
      const body: AddressSearchRequest = await req.json()
      query = body.query
      countryCode = body.countryCode || 'GB'
      limit = body.limit || 5
    }

    if (!query.trim() || query.length < 3) {
      return new Response(
        JSON.stringify({ results: [] }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Limit to prevent abuse
    if (limit > 10) {
      limit = 10
    }

    console.log(`Address search for "${query}" by user ${user.email}`)

    const searchUrl = 'https://api.openrouteservice.org/geocode/search'
    const params = new URLSearchParams({
      api_key: ORS_API_KEY,
      text: query.trim(),
      'boundary.country': countryCode,
      size: limit.toString(),
    })

    const response = await fetch(`${searchUrl}?${params}`)
    
    if (!response.ok) {
      throw new Error(`Search API error: ${response.status}`)
    }

    const data = await response.json()
    
    const results: AddressSearchResult[] = data.features ? data.features.map((feature: any) => ({
      label: feature.properties.label,
      coordinates: feature.geometry.coordinates,
      confidence: feature.properties.confidence
    })) : []

    // Log usage for analytics (lightweight for autocomplete)
    try {
      await supabaseClient.from('api_usage').insert({
        user_id: user.id,
        service: 'address_search',
        requests_count: 1,
        success_count: results.length > 0 ? 1 : 0,
      })
    } catch (logError) {
      console.warn('Failed to log API usage:', logError)
    }

    return new Response(
      JSON.stringify({ results }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Address search function error:', error)
    return new Response(
      JSON.stringify({ 
        results: [],
        error: error instanceof Error ? error.message : 'Search failed' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})