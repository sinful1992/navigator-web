import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RouteDirectionsRequest {
  coordinates: [number, number][]; // [lng, lat] pairs in order
  profile?: string; // driving-car, foot-walking, etc.
}

interface RouteSegment {
  from: number;
  to: number;
  geometry: [number, number][];
  distance: number;
  duration: number;
}

interface RouteDirectionsResult {
  success: boolean;
  segments: RouteSegment[];
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

    // Parse request body
    const { coordinates, profile = 'driving-car' }: RouteDirectionsRequest = await req.json()

    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
      throw new Error('Invalid request: need at least 2 coordinates')
    }

    // Limit to prevent abuse
    if (coordinates.length > 50) {
      throw new Error('Maximum 50 waypoints per directions request')
    }

    console.log(`Getting route directions for ${coordinates.length} waypoints for user ${user.email}`)

    // Build segments by getting directions between each pair of consecutive waypoints
    const segments: RouteSegment[] = []

    for (let i = 0; i < coordinates.length - 1; i++) {
      const from = coordinates[i]
      const to = coordinates[i + 1]

      // Get directions between this pair of coordinates
      const directionsBody = {
        coordinates: [from, to],
        format: 'geojson',
        instructions: false
      }

      console.log(`Getting directions from waypoint ${i} to ${i + 1}`)

      const response = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}`, {
        method: 'POST',
        headers: {
          'Authorization': ORS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(directionsBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`OpenRouteService directions error for segment ${i}->${i+1}:`, errorText)

        // Continue with other segments even if one fails
        segments.push({
          from: i,
          to: i + 1,
          geometry: [from, to], // Fallback to straight line
          distance: 0,
          duration: 0
        })
        continue
      }

      const data = await response.json()

      if (data.features && data.features.length > 0) {
        const route = data.features[0]
        const geometry = route.geometry.coordinates || []
        const properties = route.properties || {}

        segments.push({
          from: i,
          to: i + 1,
          geometry: geometry, // Already in [lng, lat] format for GeoJSON
          distance: properties.summary?.distance || 0,
          duration: properties.summary?.duration || 0
        })
      } else {
        // Fallback to straight line
        segments.push({
          from: i,
          to: i + 1,
          geometry: [from, to],
          distance: 0,
          duration: 0
        })
      }
    }

    const result: RouteDirectionsResult = {
      success: true,
      segments
    }

    // Log usage for analytics
    try {
      await supabaseClient.from('api_usage').insert({
        user_id: user.id,
        service: 'route_directions',
        requests_count: 1,
        success_count: 1,
        addresses_count: coordinates.length,
      })
    } catch (logError) {
      console.warn('Failed to log API usage:', logError)
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Route directions function error:', error)

    const result: RouteDirectionsResult = {
      success: false,
      segments: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }

    return new Response(
      JSON.stringify(result),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})