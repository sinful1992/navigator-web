// src/backup.ts
export async function readJsonFile(file: File): Promise<unknown> {
  console.log('📄 Reading backup file:', file.name, 'size:', file.size, 'bytes');
  const text = await file.text();
  console.log('📄 File.text() returned', text.length, 'characters');

  const parsed = JSON.parse(text);
  console.log('📄 JSON.parse completed, result type:', typeof parsed);

  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).completions)) {
    console.log('📄 Parsed backup has', (parsed as any).completions.length, 'completions');
  }

  return parsed;
}
