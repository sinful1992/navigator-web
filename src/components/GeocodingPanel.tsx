import React from 'react';
import { useGeocodingIntegration } from '../hooks/useGeocodingIntegration';
import type { AddressRow } from '../types';

interface GeocodingPanelProps {
  addresses: AddressRow[];
  onAddressesUpdated: (addresses: AddressRow[]) => void;
  className?: string;
}

export function GeocodingPanel({ addresses, onAddressesUpdated, className = '' }: GeocodingPanelProps) {
  const { isGeocoding, geocodingProgress, geocodeBatch, getCacheStats } = useGeocodingIntegration();
  const [cacheStats, setCacheStats] = React.useState(getCacheStats());

  React.useEffect(() => {
    setCacheStats(getCacheStats());
  }, [isGeocoding]);

  const addressesNeedingGeocode = React.useMemo(() => {
    return addresses.filter(addr =>
      !addr.lat || !addr.lng || isNaN(addr.lat) || isNaN(addr.lng)
    ).length;
  }, [addresses]);

  const addressesWithCoords = addresses.length - addressesNeedingGeocode;

  const handleGeocodeAll = async () => {
    if (isGeocoding || addressesNeedingGeocode === 0) return;

    try {
      const geocodedAddresses = await geocodeBatch(addresses, (processed, total) => {
        console.log(`Geocoding progress: ${processed}/${total}`);
      });
      onAddressesUpdated(geocodedAddresses);
      setCacheStats(getCacheStats());
    } catch (error) {
      console.error('Geocoding failed:', error);
      alert('Geocoding failed. Please check your Google Maps API key and internet connection.');
    }
  };

  if (addresses.length === 0) {
    return null;
  }

  return (
    <div className={`geocoding-panel ${className}`}>
      <div className="geocoding-status">
        <div className="coords-summary">
          <span className="coords-good">✅ {addressesWithCoords} with coordinates</span>
          {addressesNeedingGeocode > 0 && (
            <span className="coords-missing">📍 {addressesNeedingGeocode} need geocoding</span>
          )}
        </div>

        {addressesNeedingGeocode > 0 && (
          <button
            className="btn btn-primary btn-sm"
            onClick={handleGeocodeAll}
            disabled={isGeocoding}
          >
            {isGeocoding ? '🔄 Geocoding...' : '🗺️ Geocode Missing'}
          </button>
        )}
      </div>

      {isGeocoding && geocodingProgress && (
        <div className="geocoding-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(geocodingProgress.current / geocodingProgress.total) * 100}%` }}
            />
          </div>
          <div className="progress-text">
            {geocodingProgress.current}/{geocodingProgress.total} - {geocodingProgress.currentAddress}
          </div>
        </div>
      )}

      <div className="cache-info">
        <small>
          Cache: {cacheStats.validEntries} entries
          {cacheStats.expiredEntries > 0 && ` (${cacheStats.expiredEntries} expired)`}
        </small>
      </div>

      <style>{`
        .geocoding-panel {
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 12px;
          margin: 8px 0;
        }

        .geocoding-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }

        .coords-summary {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 14px;
        }

        .coords-good {
          color: #28a745;
        }

        .coords-missing {
          color: #dc3545;
        }

        .geocoding-progress {
          margin: 8px 0;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: #e9ecef;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 4px;
        }

        .progress-fill {
          height: 100%;
          background: #007bff;
          transition: width 0.3s ease;
        }

        .progress-text {
          font-size: 12px;
          color: #6c757d;
          text-align: center;
        }

        .cache-info {
          color: #6c757d;
          font-size: 12px;
          text-align: right;
        }

        @media (max-width: 480px) {
          .geocoding-status {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </div>
  );
}