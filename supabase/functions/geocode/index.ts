import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GeocodeRequest {
  addresses: string[];
  countryCode?: string;
}

interface GeocodeResult {
  success: boolean;
  address: string;
  originalAddress: string;
  lat?: number;
  lng?: number;
  confidence?: number;
  formattedAddress?: string;
  error?: string;
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
        JSON.stringify({ error: 'Subscription required for geocoding service' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse request body
    const { addresses, countryCode = 'GB' }: GeocodeRequest = await req.json()

    if (!addresses || !Array.isArray(addresses)) {
      throw new Error('Invalid request: addresses array required')
    }

    // Limit batch size to prevent abuse
    if (addresses.length > 50) {
      throw new Error('Maximum 50 addresses per request')
    }

    console.log(`Geocoding ${addresses.length} addresses for user ${user.email}`)

    // Function to geocode a single address
    const geocodeSingle = async (address: string): Promise<GeocodeResult> => {
      try {
        if (!address.trim()) {
          return {
            success: false,
            address: address,
            originalAddress: address,
            error: 'Empty address provided'
          }
        }

        const url = 'https://api.openrouteservice.org/geocode/search'
        const params = new URLSearchParams({
          api_key: ORS_API_KEY,
          text: address.trim(),
          'boundary.country': countryCode,
          size: '1',
        })

        const response = await fetch(`${url}?${params}`)
        
        if (!response.ok) {
          throw new Error(`Geocoding API error: ${response.status}`)
        }

        const data = await response.json()
        
        if (!data.features || data.features.length === 0) {
          return {
            success: false,
            address: address,
            originalAddress: address,
            error: 'No geocoding results found'
          }
        }

        const result = data.features[0]
        const [lng, lat] = result.geometry.coordinates
        
        return {
          success: true,
          address: address,
          originalAddress: address,
          lat,
          lng,
          confidence: result.properties.confidence,
          formattedAddress: result.properties.label
        }

      } catch (error) {
        console.error(`Geocoding failed for "${address}":`, error)
        return {
          success: false,
          address: address,
          originalAddress: address,
          error: error instanceof Error ? error.message : 'Geocoding failed'
        }
      }
    }

    // Process addresses in batches to respect rate limits
    const results: GeocodeResult[] = []
    const batchSize = 5

    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize)
      const batchPromises = batch.map(address => geocodeSingle(address))
      const batchResults = await Promise.all(batchPromises)
      
      results.push(...batchResults)
      
      // Small delay between batches
      if (i + batchSize < addresses.length) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    // Log usage for analytics
    try {
      await supabaseClient.from('api_usage').insert({
        user_id: user.id,
        service: 'geocoding',
        requests_count: addresses.length,
        success_count: results.filter(r => r.success).length,
      })
    } catch (logError) {
      console.warn('Failed to log API usage:', logError)
      // Don't fail the request if logging fails
    }

    return new Response(
      JSON.stringify({ results }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Geocoding function error:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})