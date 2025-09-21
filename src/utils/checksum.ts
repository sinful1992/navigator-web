export function generateChecksum(data: any): string {
  // Use a replacer function to sort keys at every level for deterministic output
  const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object') {
      return false;
    }
    if (Array.isArray(value)) {
      return false;
    }

    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  };

  const str = JSON.stringify(data, (key, value) => {
    if (!value || typeof value !== 'object') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof (value as { toJSON?: (key?: string) => unknown }).toJSON === 'function' && !isPlainObject(value)) {
      return (value as { toJSON: (key?: string) => unknown }).toJSON(key);
    }

    if (isPlainObject(value)) {
      // Sort object keys for consistent serialization
      const sorted: Record<string, unknown> = {};
      Object.keys(value).sort().forEach(k => {
        sorted[k] = (value as Record<string, unknown>)[k];
      });
      return sorted;
    }

    return value;
  });

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}
