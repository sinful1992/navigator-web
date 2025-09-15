import type { AddressRow } from "../types";

// OpenRouteService API configuration
const ORS_BASE_URL = "https://api.openrouteservice.org/v2";

interface OptimizationRequest {
  jobs: Array<{
    id: number;
    location: [number, number]; // [lng, lat]
    description?: string;
  }>;
  vehicles: Array<{
    id: number;
    start: [number, number]; // [lng, lat]
    end?: [number, number]; // Optional return location
  }>;
}

interface OptimizationResponse {
  code: number;
  routes: Array<{
    vehicle: number;
    cost: number;
    steps: Array<{
      type: string;
      job?: number;
      location: [number, number];
      arrival?: number;
      duration?: number;
    }>;
  }>;
  unassigned?: Array<{
    id: number;
    location: [number, number];
  }>;
}

interface RouteOptimizationResult {
  success: boolean;
  optimizedOrder: number[]; // Array of original address indices in optimized order
  totalDistance: number; // In meters
  totalDuration: number; // In seconds
  unassigned: number[]; // Indices of addresses that couldn't be included
  error?: string;
}

/**
 * Optimizes the route for a list of addresses using OpenRouteService
 * @param addresses - Array of addresses to optimize
 * @param apiKey - OpenRouteService API key
 * @param startLocation - Optional starting location [lng, lat]
 * @param endLocation - Optional ending location [lng, lat]
 */
export async function optimizeRoute(
  addresses: AddressRow[],
  apiKey: string,
  startLocation?: [number, number],
  endLocation?: [number, number]
): Promise<RouteOptimizationResult> {
  try {
    // Filter addresses that have valid coordinates
    const validAddresses = addresses
      .map((addr, index) => ({ addr, originalIndex: index }))
      .filter(({ addr }) => 
        addr.lat !== null && 
        addr.lat !== undefined && 
        addr.lng !== null && 
        addr.lng !== undefined &&
        !isNaN(addr.lat) &&
        !isNaN(addr.lng)
      );

    if (validAddresses.length === 0) {
      return {
        success: false,
        optimizedOrder: [],
        totalDistance: 0,
        totalDuration: 0,
        unassigned: addresses.map((_, i) => i),
        error: "No addresses have valid coordinates for route optimization"
      };
    }

    // If only one address, return it as-is
    if (validAddresses.length === 1) {
      return {
        success: true,
        optimizedOrder: [validAddresses[0].originalIndex],
        totalDistance: 0,
        totalDuration: 0,
        unassigned: []
      };
    }

    // Use the first address as start location if not provided
    const defaultStart: [number, number] = startLocation || [
      validAddresses[0].addr.lng!,
      validAddresses[0].addr.lat!
    ];

    // Prepare jobs (delivery locations)
    const jobs = validAddresses.map(({ addr, originalIndex }) => ({
      id: originalIndex,
      location: [addr.lng!, addr.lat!] as [number, number],
      description: addr.address
    }));

    // Prepare vehicle (enforcement agent)
    const vehicles = [{
      id: 1,
      start: defaultStart,
      end: endLocation || defaultStart // Return to start if no end location specified
    }];

    const requestBody: OptimizationRequest = {
      jobs,
      vehicles
    };

    console.log('Sending optimization request to OpenRouteService:', requestBody);

    const response = await fetch(`${ORS_BASE_URL}/optimization`, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouteService API error: ${response.status} - ${errorText}`);
    }

    const data: OptimizationResponse = await response.json();
    console.log('Received optimization response:', data);

    if (data.code !== 0) {
      throw new Error(`Optimization failed with code: ${data.code}`);
    }

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes returned from optimization service');
    }

    const route = data.routes[0];
    
    // Extract the optimized order from the route steps
    const optimizedOrder: number[] = [];
    let totalDistance = 0;
    let totalDuration = 0;

    route.steps.forEach(step => {
      if (step.type === 'job' && step.job !== undefined) {
        optimizedOrder.push(step.job);
      }
      if (step.duration) {
        totalDuration += step.duration;
      }
    });

    // Calculate total distance (rough estimation based on route cost)
    totalDistance = route.cost || 0;

    // Handle unassigned addresses
    const unassigned = data.unassigned ? data.unassigned.map(u => u.id) : [];

    return {
      success: true,
      optimizedOrder,
      totalDistance,
      totalDuration,
      unassigned
    };

  } catch (error) {
    console.error('Route optimization failed:', error);
    return {
      success: false,
      optimizedOrder: [],
      totalDistance: 0,
      totalDuration: 0,
      unassigned: addresses.map((_, i) => i),
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Estimates travel time between two coordinates using OpenRouteService directions API
 */
export async function getDirections(
  start: [number, number],
  end: [number, number],
  apiKey: string
): Promise<{ distance: number; duration: number } | null> {
  try {
    const url = `${ORS_BASE_URL}/directions/driving-car`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        coordinates: [start, end]
      })
    });

    if (!response.ok) {
      throw new Error(`Directions API error: ${response.status}`);
    }

    const data = await response.json();
    const route = data.routes?.[0];
    
    if (!route) {
      return null;
    }

    return {
      distance: route.summary.distance, // meters
      duration: route.summary.duration  // seconds
    };
  } catch (error) {
    console.error('Failed to get directions:', error);
    return null;
  }
}

// Re-export formatters from shared utilities
export { formatDuration, formatDistance } from '../utils/formatters';