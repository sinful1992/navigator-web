import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RouteOptimizationRequest {
  addresses: Array<{
    address: string;
    lat: number;
    lng: number;
  }>;
  startLocation?: [number, number]; // [lng, lat]
  endLocation?: [number, number];
}

interface RouteOptimizationResult {
  success: boolean;
  optimizedOrder: number[];
  totalDistance: number;
  totalDuration: number;
  unassigned: number[];
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
        JSON.stringify({ error: 'Subscription required for route optimization' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse request body
    const { addresses, startLocation, endLocation }: RouteOptimizationRequest = await req.json()

    if (!addresses || !Array.isArray(addresses)) {
      throw new Error('Invalid request: addresses array required')
    }

    // Limit to prevent abuse
    if (addresses.length > 100) {
      throw new Error('Maximum 100 addresses per optimization request')
    }

    // Filter addresses that have valid coordinates
    const validAddresses = addresses.filter(addr => 
      addr.lat !== null && 
      addr.lat !== undefined && 
      addr.lng !== null && 
      addr.lng !== undefined &&
      !isNaN(addr.lat) &&
      !isNaN(addr.lng)
    )

    if (validAddresses.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          optimizedOrder: [],
          totalDistance: 0,
          totalDuration: 0,
          unassigned: addresses.map((_, i) => i),
          error: "No addresses have valid coordinates for route optimization"
        } as RouteOptimizationResult),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log(`Optimizing route for ${validAddresses.length} addresses for user ${user.email}`)

    // If only one address, return it as-is
    if (validAddresses.length === 1) {
      return new Response(
        JSON.stringify({
          success: true,
          optimizedOrder: [0],
          totalDistance: 0,
          totalDuration: 0,
          unassigned: []
        } as RouteOptimizationResult),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Use the first address as start location if not provided
    const defaultStart: [number, number] = startLocation || [
      validAddresses[0].lng,
      validAddresses[0].lat
    ]

    // Prepare jobs (delivery locations) and track mapping to original indices
    // FIX: Use validIndex as job ID to ensure uniqueness (prevents duplicate ID errors)
    const originalIndexMap: number[] = [] // Maps validIndex -> originalIndex
    const jobs = validAddresses.map((addr, validIndex) => {
      // Find the original index of this address in the full addresses array
      // Use lastIndexOf with a starting position to handle duplicates correctly
      let searchStartIndex = 0
      if (validIndex > 0) {
        // Start search after the last found index to handle duplicates
        const lastFoundIndex = originalIndexMap[validIndex - 1] || 0
        searchStartIndex = lastFoundIndex + 1
      }

      let originalIndex = -1
      for (let i = searchStartIndex; i < addresses.length; i++) {
        const originalAddr = addresses[i]
        if (originalAddr.lat === addr.lat &&
            originalAddr.lng === addr.lng &&
            originalAddr.address === addr.address) {
          originalIndex = i
          break
        }
      }

      if (originalIndex === -1) {
        // Fallback: search from beginning
        originalIndex = addresses.findIndex(originalAddr =>
          originalAddr.lat === addr.lat &&
          originalAddr.lng === addr.lng &&
          originalAddr.address === addr.address
        )
      }

      originalIndexMap.push(originalIndex >= 0 ? originalIndex : validIndex)

      return {
        id: validIndex, // Use validIndex to ensure unique IDs
        location: [addr.lng, addr.lat] as [number, number],
        description: addr.address
      }
    })

    // Prepare vehicle (enforcement agent)
    const vehicles = [{
      id: 1,
      profile: 'driving-car',
      start: defaultStart,
      end: endLocation || defaultStart
    }]

    const requestBody = {
      jobs,
      vehicles
    }

    console.log('Sending optimization request to OpenRouteService')

    const response = await fetch('https://api.openrouteservice.org/optimization', {
      method: 'POST',
      headers: {
        'Authorization': ORS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouteService API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    if (data.code !== 0) {
      throw new Error(`Optimization failed with code: ${data.code}`)
    }

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes returned from optimization service')
    }

    const route = data.routes[0]
    
    // Extract the optimized order from the route steps
    const optimizedOrder: number[] = []
    let totalDistance = 0
    let totalDuration = 0

    route.steps.forEach((step: any) => {
      if (step.type === 'job' && step.job !== undefined) {
        // Map validIndex (job ID) back to originalIndex
        const validIndex = step.job
        const originalIndex = originalIndexMap[validIndex]
        if (originalIndex !== undefined) {
          optimizedOrder.push(originalIndex)
        }
      }
      if (step.duration) {
        totalDuration += step.duration
      }
    })

    // Calculate total distance (rough estimation based on route cost)
    totalDistance = route.cost || 0

    // Handle unassigned addresses - map validIndex back to originalIndex
    const unassigned = data.unassigned ? data.unassigned.map((u: any) => {
      const validIndex = u.id
      return originalIndexMap[validIndex] !== undefined ? originalIndexMap[validIndex] : validIndex
    }) : []

    const result: RouteOptimizationResult = {
      success: true,
      optimizedOrder,
      totalDistance,
      totalDuration,
      unassigned
    }

    // Log usage for analytics
    try {
      await supabaseClient.from('api_usage').insert({
        user_id: user.id,
        service: 'route_optimization',
        requests_count: 1,
        success_count: 1,
        addresses_count: validAddresses.length,
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
    console.error('Route optimization function error:', error)
    
    const result: RouteOptimizationResult = {
      success: false,
      optimizedOrder: [],
      totalDistance: 0,
      totalDuration: 0,
      unassigned: [],
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