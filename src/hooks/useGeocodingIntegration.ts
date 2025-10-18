import { useState, useCallback } from 'react';
import { geocodeAddress, getCacheStats } from '../services/geocoding';
import type { AddressRow } from '../types';

import { logger } from '../utils/logger';

export interface GeocodingProgress {
  current: number;
  total: number;
  currentAddress: string;
}

export function useGeocodingIntegration() {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState<GeocodingProgress | null>(null);

  const geocodeAddressRow = useCallback(async (address: AddressRow): Promise<AddressRow> => {
    // Skip if already has coordinates
    if (address.lat !== null && address.lat !== undefined &&
        address.lng !== null && address.lng !== undefined &&
        !isNaN(address.lat) && !isNaN(address.lng)) {
      return address;
    }

    if (!address.address?.trim()) {
      return address;
    }

    try {
      const result = await geocodeAddress(address.address);
      if (result.success && result.lat && result.lng) {
        return {
          ...address,
          lat: result.lat,
          lng: result.lng,
        };
      }
    } catch (error) {
      logger.warn(`Failed to geocode address "${address.address}":`, error);
    }

    return address;
  }, []);

  const geocodeBatch = useCallback(async (
    addresses: AddressRow[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<AddressRow[]> => {
    if (addresses.length === 0) return addresses;

    setIsGeocoding(true);
    setGeocodingProgress({ current: 0, total: addresses.length, currentAddress: '' });

    try {
      const results: AddressRow[] = [];

      // Filter addresses that need geocoding
      const needsGeocoding = addresses.filter(addr =>
        !addr.lat || !addr.lng || isNaN(addr.lat) || isNaN(addr.lng)
      );

      const alreadyGeocoded = addresses.filter(addr =>
        addr.lat !== null && addr.lat !== undefined &&
        addr.lng !== null && addr.lng !== undefined &&
        !isNaN(addr.lat) && !isNaN(addr.lng)
      );

      logger.info(`Geocoding ${needsGeocoding.length}/${addresses.length} addresses (${alreadyGeocoded.length} already have coordinates)`);

      // Process addresses that need geocoding in small batches
      const batchSize = 3;
      let processed = 0;

      // Add already geocoded addresses first
      results.push(...alreadyGeocoded);

      for (let i = 0; i < needsGeocoding.length; i += batchSize) {
        const batch = needsGeocoding.slice(i, i + batchSize);

        const batchPromises = batch.map(async (addr, batchIndex) => {
          setGeocodingProgress({
            current: processed + batchIndex + 1,
            total: addresses.length,
            currentAddress: addr.address || ''
          });

          return await geocodeAddressRow(addr);
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        processed += batch.length;

        onProgress?.(processed + alreadyGeocoded.length, addresses.length);

        // Small delay between batches to respect rate limits
        if (i + batchSize < needsGeocoding.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      logger.info(`Geocoding completed. Cache stats:`, getCacheStats());
      return results;

    } finally {
      setIsGeocoding(false);
      setGeocodingProgress(null);
    }
  }, [geocodeAddressRow]);

  const geocodeIfNeeded = useCallback(async (address: AddressRow): Promise<AddressRow> => {
    return await geocodeAddressRow(address);
  }, [geocodeAddressRow]);

  return {
    isGeocoding,
    geocodingProgress,
    geocodeAddressRow,
    geocodeBatch,
    geocodeIfNeeded,
    getCacheStats,
  };
}