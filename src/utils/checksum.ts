export function generateChecksum(data: any): string {
  // Use a replacer function to sort keys at every level for deterministic output
  const str = JSON.stringify(data, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Sort object keys for consistent serialization
      const sorted: any = {};
      Object.keys(value).sort().forEach(k => {
        sorted[k] = value[k];
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