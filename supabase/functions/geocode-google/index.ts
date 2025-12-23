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
    // Get the Google Maps API key from environment variables
    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error('Google Maps API key not configured')
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
    const { addresses }: GeocodeRequest = await req.json()

    if (!addresses || !Array.isArray(addresses)) {
      throw new Error('Invalid request: addresses array required')
    }

    // Limit batch size to prevent abuse and respect Google's quotas
    if (addresses.length > 25) {
      throw new Error('Maximum 25 addresses per request')
    }

    console.log(`[geocode-google] Starting geocode for ${addresses.length} addresses, user: ${user.email}`)
    console.log(`[geocode-google] API key configured: ${GOOGLE_MAPS_API_KEY ? 'YES (length: ' + GOOGLE_MAPS_API_KEY.length + ')' : 'NO'}`)

    // Function to geocode a single address
    const geocodeSingle = async (address: string): Promise<GeocodeResult> => {
      try {
        if (!address.trim()) {
          console.log(`[geocode-google] Empty address provided, skipping`)
          return {
            success: false,
            address: address,
            originalAddress: address,
            error: 'Empty address provided'
          }
        }

        // Restrict to UK to prevent wrong city matches
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address.trim())}&components=country:GB&region=gb&key=${GOOGLE_MAPS_API_KEY}`

        console.log(`[geocode-google] Geocoding: "${address}"`)

        const response = await fetch(url)
        console.log(`[geocode-google] Response status: ${response.status}`)

        if (!response.ok) {
          console.error(`[geocode-google] HTTP error: ${response.status} ${response.statusText}`)
          throw new Error(`Google Maps API error: ${response.status}`)
        }

        const data = await response.json()
        console.log(`[geocode-google] API response status: ${data.status}, results: ${data.results?.length || 0}`)

        if (data.status === 'OK' && data.results?.length > 0) {
          const result = data.results[0]
          console.log(`[geocode-google] SUCCESS: "${address}" -> "${result.formatted_address}"`)

          return {
            success: true,
            address: address,
            originalAddress: address,
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
            confidence: 1.0, // Google doesn't provide confidence, assume high
            formattedAddress: result.formatted_address
          }
        } else if (data.status === 'ZERO_RESULTS') {
          console.log(`[geocode-google] ZERO_RESULTS for: "${address}"`)
          return {
            success: false,
            address: address,
            originalAddress: address,
            error: 'No geocoding results found'
          }
        } else {
          console.error(`[geocode-google] API ERROR: ${data.status} - ${data.error_message || 'no message'}`)
          return {
            success: false,
            address: address,
            originalAddress: address,
            error: `Google Maps API error: ${data.status}${data.error_message ? ' - ' + data.error_message : ''}`
          }
        }

      } catch (error) {
        console.error(`[geocode-google] EXCEPTION for "${address}":`, error)
        return {
          success: false,
          address: address,
          originalAddress: address,
          error: error instanceof Error ? error.message : 'Geocoding failed'
        }
      }
    }

    // Process addresses in smaller batches to respect Google's rate limits
    const results: GeocodeResult[] = []
    const batchSize = 3 // Smaller batches for Google Maps

    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize)
      const batchPromises = batch.map(address => geocodeSingle(address))
      const batchResults = await Promise.all(batchPromises)

      results.push(...batchResults)

      // Longer delay between batches for Google Maps
      if (i + batchSize < addresses.length) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }
    }

    // Log usage for analytics
    try {
      await supabaseClient.from('api_usage').insert({
        user_id: user.id,
        service: 'geocoding-google',
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
    console.error('Google geocoding function error:', error)
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