import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Utility function to sanitize and validate limit parameter
function sanitizeLimit(value: unknown, fallback = 5): number {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 1) {
    return fallback
  }
  
  // Enforce maximum limit to prevent abuse
  if (num > 10) {
    return 10
  }
  
  return num
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AddressSearchRequest {
  query: string;
  countryCode?: string;
  limit?: number;
  focusLat?: number;
  focusLon?: number;
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
    let focusLat: number | undefined, focusLon: number | undefined

    if (req.method === 'GET') {
      const url = new URL(req.url)
      query = url.searchParams.get('query') || ''
      countryCode = url.searchParams.get('countryCode') || 'GB'
      limit = sanitizeLimit(url.searchParams.get('limit'))
      const latParam = Number(url.searchParams.get('focusLat'))
      focusLat = Number.isFinite(latParam) ? latParam : undefined
      const lonParam = Number(url.searchParams.get('focusLon'))
      focusLon = Number.isFinite(lonParam) ? lonParam : undefined
    } else {
      const body: AddressSearchRequest = await req.json()
      query = body.query
      countryCode = body.countryCode || 'GB'
      limit = sanitizeLimit(body.limit)
      const latParam = Number(body.focusLat)
      focusLat = Number.isFinite(latParam) ? latParam : undefined
      const lonParam = Number(body.focusLon)
      focusLon = Number.isFinite(lonParam) ? lonParam : undefined
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

    // Enhanced address search with multiple strategies for UK addresses
    const searchResults: AddressSearchResult[] = []
    const searchUrl = 'https://api.openrouteservice.org/geocode/search'
    
    // Strategy 1: Exact search with all available layers for UK
    const primaryParams = new URLSearchParams({
      api_key: ORS_API_KEY,
      text: query.trim(),
      'boundary.country': countryCode,
      size: Math.min(limit, 15).toString(), // Get more results for better coverage
      layers: 'address,venue,street,localadmin,locality,region', // Include all relevant layers
      sources: 'osm,wof,oa,gn', // Multiple data sources
    })

    let response = await fetch(`${searchUrl}?${primaryParams}`)
    
    if (!response.ok) {
      throw new Error(`Primary search API error: ${response.status}`)
    }

    let data = await response.json()
    
    if (data.features) {
      searchResults.push(...data.features.map((feature: any) => ({
        label: feature.properties.label,
        coordinates: feature.geometry.coordinates,
        confidence: feature.properties.confidence || 0.5
      })))
    }

    // Strategy 2: Try fallback approaches for UK addresses (with or without postcodes)
    const hasGoodResults = searchResults.some(r => r.confidence > 0.8)
    const hasPostcode = /[A-Z]{1,2}[0-9]{1,2}\s?[0-9][A-Z]{2}/i.test(query)
    const hasHouseNumber = /^\d+\s/.test(query.trim()) // Starts with number
    
    if (countryCode === 'GB' && (hasPostcode || (!hasGoodResults && hasHouseNumber))) {
      const postcodeMatch = query.match(/([A-Z]{1,2}[0-9]{1,2}\s?[0-9][A-Z]{2})/i)
      const addressPart = query.replace(/[A-Z]{1,2}[0-9]{1,2}\s?[0-9][A-Z]{2}/i, '').trim()

      // Handle both postcode and non-postcode scenarios
      const searchStrategies: any[] = []
      
      if (postcodeMatch) {
        // Scenario A: Has postcode
        const addressPart = query.replace(/[A-Z]{1,2}[0-9]{1,2}\s?[0-9][A-Z]{2}/i, '').trim()

        if (addressPart) {
          // Strategy 2A: Structured search "address, postcode"
          const focusParams = (focusLat !== undefined && focusLon !== undefined)
            ? { 'focus.point.lat': focusLat.toString(), 'focus.point.lon': focusLon.toString() }
            : { 'focus.point.lat': '51.5074', 'focus.point.lon': '-0.1278' }

          searchStrategies.push({
            name: 'structured',
            params: {
              api_key: ORS_API_KEY,
              text: `${addressPart}, ${postcodeMatch[1]}`,
              'boundary.country': countryCode,
              size: Math.min(limit, 10).toString(),
              layers: 'address,venue',
              ...focusParams,
            }
          })

          // Strategy 2B: Just the street name + postcode (for interpolation)
          const streetName = addressPart.replace(/^\d+\s*/, '').trim() // Remove house number
          if (streetName !== addressPart && streetName.length > 3) {
            searchStrategies.push({
              name: 'street_postcode',
              params: {
                api_key: ORS_API_KEY,
                text: `${streetName}, ${postcodeMatch[1]}`,
                'boundary.country': countryCode,
                size: '5',
                layers: 'street,address',
              }
            })
          }
        }

        // Strategy 2C: Just the postcode for area context (works for postcode-only queries like "SW1 1AA")
        if (!hasGoodResults) {
          searchStrategies.push({
            name: 'postcode_only',
            params: {
              api_key: ORS_API_KEY,
              text: postcodeMatch[1],
              'boundary.country': countryCode,
              size: '3',
              layers: 'locality,region',
            }
          })
        }
      } else if (hasHouseNumber && !hasGoodResults) {
        // Scenario B: No postcode but has house number (e.g., "14 denzil avenue")
        const houseNumber = query.match(/^\d+/)
        const streetName = query.replace(/^\d+\s*/, '').trim()
        
        if (houseNumber && streetName.length > 3) {
          console.log(`Trying street search without postcode: "${streetName}"`)
          
          // Search for just the street name, then add house number to results
          searchStrategies.push({
            name: 'street_only',
            params: {
              api_key: ORS_API_KEY,
              text: streetName,
              'boundary.country': countryCode,
              size: '5',
              layers: 'street,address',
            }
          })
        }
      }

      // Execute fallback strategies
      for (const strategy of searchStrategies) {
        console.log(`Trying ${strategy.name} search: ${strategy.params.text}`)

        const fallbackResponse = await fetch(`${searchUrl}?${new URLSearchParams(strategy.params)}`)

        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json()

          if (fallbackData.features) {
            const fallbackResults = fallbackData.features.map((feature: any) => {
              let confidence = feature.properties.confidence || 0.4

              // Boost confidence based on strategy
              switch (strategy.name) {
                case 'structured':
                  confidence += 0.1
                  break
                case 'street_postcode':
                  confidence += 0.05
                  // Add house number to label if missing
                  const houseNumber = addressPart.match(/^\d+/)
                  if (houseNumber && !feature.properties.label.includes(houseNumber[0])) {
                    feature.properties.label = `${houseNumber[0]} ${feature.properties.label}`
                  }
                  break
                case 'postcode_only':
                  confidence = Math.max(confidence, 0.3) // Lower confidence for area-only
                  if (addressPart) {
                    feature.properties.label = `${addressPart} (near ${feature.properties.label})`
                  }
                  break
                case 'street_only':
                  confidence += 0.03
                  // Add house number to label for non-postcode searches
                  const houseNum = query.match(/^\d+/)
                  if (houseNum && !feature.properties.label.includes(houseNum[0])) {
                    feature.properties.label = `${houseNum[0]} ${feature.properties.label}`
                  }
                  break
              }

              return {
                label: feature.properties.label,
                coordinates: feature.geometry.coordinates,
                confidence
              }
            })

            // Add fallback results, avoiding duplicates
            fallbackResults.forEach(newResult => {
              const isDuplicate = searchResults.some(existing =>
                Math.abs(existing.coordinates[0] - newResult.coordinates[0]) < 0.001 &&
                Math.abs(existing.coordinates[1] - newResult.coordinates[1]) < 0.001
              )
              if (!isDuplicate) {
                searchResults.push(newResult)
              }
            })
          }
        }

        // If we got good results from this strategy, stop trying more fallbacks
        const currentBest = Math.max(...searchResults.map(r => r.confidence || 0))
        if (currentBest > 0.8) {
          break
        }
      }
    }

    // Sort by confidence and remove duplicates
    const uniqueResults = searchResults
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, limit)

    const results: AddressSearchResult[] = uniqueResults

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