import { useState, useEffect, useRef, useCallback } from "react";
import { searchAddresses, isHybridRoutingAvailable } from "../services/hybridRouting";
import type { AddressAutocompleteResult } from "../services/hybridRouting";

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: string, lat: number, lng: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing an address...",
  disabled = false,
  className = "input"
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressAutocompleteResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Debounced search function
  const debouncedSearch = useCallback(async (query: string) => {
    if (!isHybridRoutingAvailable() || !query.trim() || query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    try {
      const results = await searchAddresses(query);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Address search failed:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle input change with debouncing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for search
    searchTimeoutRef.current = setTimeout(() => {
      debouncedSearch(newValue);
    }, 300);
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion: AddressAutocompleteResult) => {
    const [lng, lat] = suggestion.coordinates;
    onChange(suggestion.label);
    onSelect(suggestion.label, lat, lng);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    setSuggestions([]);
    inputRef.current?.blur();
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
        break;
      
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Hide suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current && 
        !inputRef.current.contains(event.target as Node) &&
        suggestionsRef.current && 
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'var(--success)';
    if (confidence >= 0.5) return 'var(--warning)';
    return 'var(--danger)';
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={className}
          style={{
            width: '100%',
            paddingRight: isLoading ? '2.5rem' : '1rem'
          }}
          autoComplete="off"
        />
        
        {/* Loading spinner */}
        {isLoading && (
          <div style={{
            position: 'absolute',
            right: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '1rem',
            height: '1rem'
          }}>
            <div className="spinner" style={{ width: '100%', height: '100%' }} />
          </div>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            background: 'var(--surface)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: '300px',
            overflowY: 'auto',
            marginTop: '0.25rem'
          }}
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.label}-${index}`}
              onClick={() => handleSelectSuggestion(suggestion)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                border: 'none',
                background: selectedIndex === index ? 'var(--primary-light)' : 'transparent',
                color: selectedIndex === index ? 'var(--primary)' : 'var(--text-primary)',
                textAlign: 'left',
                cursor: 'pointer',
                borderBottom: index < suggestions.length - 1 ? '1px solid var(--border-light)' : 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.875rem',
                lineHeight: '1.4'
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {suggestion.label}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  color: getConfidenceColor(suggestion.confidence),
                  marginLeft: '0.5rem',
                  flexShrink: 0
                }}
                title={`Confidence: ${Math.round(suggestion.confidence * 100)}%`}
              >
                {Math.round(suggestion.confidence * 100)}%
              </span>
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {showSuggestions && suggestions.length === 0 && !isLoading && value.length >= 3 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            background: 'var(--surface)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)',
            padding: '1rem',
            marginTop: '0.25rem',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.875rem'
          }}
        >
          {/[A-Z]{1,2}[0-9]{1,2}\s?[0-9][A-Z]{2}/i.test(value) ? 
            'Address not found. Try removing the house number or use just the postcode.' :
            'No addresses found. Try including the postcode (e.g., "High Street SW1A 1AA").'
          }
        </div>
      )}
    </div>
  );
}