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

    // Make ONE API call with all coordinates instead of multiple calls
    // This avoids rate limiting and is more efficient
    const directionsBody = {
      coordinates: coordinates,
      instructions: false
    }

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
      console.error('OpenRouteService directions API error:', response.status, errorText)

      // Return error with details
      return new Response(
        JSON.stringify({
          success: false,
          segments: [],
          error: `OpenRouteService API error: ${response.status} - ${errorText}`
        } as RouteDirectionsResult),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const data = await response.json()

    // Build segments from the complete route
    const segments: RouteSegment[] = []

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0]
      const encodedGeometry = route.geometry

      // Decode polyline - ORS uses precision 5 (same as Google's polyline format)
      const decodePolyline = (encoded: string): [number, number][] => {
        const coords: [number, number][] = []
        let index = 0
        let lat = 0
        let lng = 0

        while (index < encoded.length) {
          let b: number
          let shift = 0
          let result = 0

          do {
            b = encoded.charCodeAt(index++) - 63
            result |= (b & 0x1f) << shift
            shift += 5
          } while (b >= 0x20)

          const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1
          lat += dlat

          shift = 0
          result = 0

          do {
            b = encoded.charCodeAt(index++) - 63
            result |= (b & 0x1f) << shift
            shift += 5
          } while (b >= 0x20)

          const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1
          lng += dlng

          coords.push([lng / 1e5, lat / 1e5]) // [lng, lat] format
        }

        return coords
      }

      const fullGeometry = decodePolyline(encodedGeometry)

      // Create segments - use full geometry for each segment (simplified approach)
      for (let i = 0; i < coordinates.length - 1; i++) {
        segments.push({
          from: i,
          to: i + 1,
          geometry: fullGeometry, // Use full route geometry for all segments
          distance: route.summary?.distance / (coordinates.length - 1) || 0, // Estimate
          duration: route.summary?.duration / (coordinates.length - 1) || 0  // Estimate
        })
      }
    } else {
      // Fallback to straight lines for all segments
      console.warn('No routes returned, using straight line fallback')
      for (let i = 0; i < coordinates.length - 1; i++) {
        segments.push({
          from: i,
          to: i + 1,
          geometry: [coordinates[i], coordinates[i + 1]],
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