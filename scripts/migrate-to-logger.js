#!/usr/bin/env node
/**
 * Automated migration script: Replace console.* calls with logger.*
 *
 * This script:
 * 1. Finds all .ts/.tsx files with console statements
 * 2. Adds logger import if needed
 * 3. Replaces console.log/warn/error with logger.info/warn/error
 * 4. Removes console.log from production code (keeps in tests)
 *
 * Usage: node scripts/migrate-to-logger.js [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import globPkg from 'glob';

const { glob } = globPkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = process.argv.includes('--dry-run');
const SRC_DIR = path.join(__dirname, '..', 'src');

// Files to exclude
const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/setupTests.ts',
  '**/testUtils.ts',
  // Keep console in logger.ts itself
  '**/logger.ts',
];

// Console method mappings
const CONSOLE_TO_LOGGER = {
  'console.log': 'logger.info',
  'console.info': 'logger.info',
  'console.warn': 'logger.warn',
  'console.error': 'logger.error',
  'console.debug': 'logger.debug',
};

/**
 * Check if file should be processed
 */
function shouldProcessFile(filePath) {
  // Must be .ts or .tsx
  if (!['.ts', '.tsx'].includes(path.extname(filePath))) {
    return false;
  }

  // Check exclusions
  for (const pattern of EXCLUDE_PATTERNS) {
    if (filePath.includes(pattern.replace(/\*\*/g, ''))) {
      return false;
    }
  }

  return true;
}

/**
 * Detect if file uses console statements
 */
function hasConsoleStatements(content) {
  return /console\.(log|info|warn|error|debug)\(/.test(content);
}

/**
 * Check if file already imports logger
 */
function hasLoggerImport(content) {
  return /import.*logger.*from.*['"].*logger/.test(content);
}

/**
 * Calculate relative import path for logger
 */
function getLoggerImportPath(filePath) {
  const fileDir = path.dirname(filePath);
  const loggerPath = path.join(SRC_DIR, 'utils', 'logger.ts');
  const relativePath = path.relative(fileDir, loggerPath);

  // Convert Windows backslashes to forward slashes
  const normalizedPath = relativePath.replace(/\\/g, '/');

  // Remove .ts extension and ensure it starts with ./
  const importPath = normalizedPath.replace(/\.ts$/, '');
  return importPath.startsWith('.') ? importPath : `./${importPath}`;
}

/**
 * Add logger import to file content
 */
function addLoggerImport(content, filePath) {
  const importPath = getLoggerImportPath(filePath);
  const loggerImport = `import { logger } from '${importPath}';\n`;

  // Find the best place to add the import
  // Try to add after existing imports
  const importRegex = /^import\s+.*from\s+['"].*['"];?\s*$/gm;
  const imports = content.match(importRegex);

  if (imports && imports.length > 0) {
    // Add after last import
    const lastImport = imports[imports.length - 1];
    const lastImportIndex = content.lastIndexOf(lastImport);
    const insertPosition = lastImportIndex + lastImport.length;

    return (
      content.slice(0, insertPosition) +
      '\n' +
      loggerImport +
      content.slice(insertPosition)
    );
  } else {
    // No imports found, add at the top (after any comments)
    const lines = content.split('\n');
    let insertIndex = 0;

    // Skip leading comments and blank lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
        insertIndex = i;
        break;
      }
    }

    lines.splice(insertIndex, 0, loggerImport);
    return lines.join('\n');
  }
}

/**
 * Replace console.* with logger.*
 */
function replaceConsoleWithLogger(content) {
  let newContent = content;

  for (const [consoleMethod, loggerMethod] of Object.entries(CONSOLE_TO_LOGGER)) {
    // Replace console.log(...) with logger.info(...)
    const regex = new RegExp(consoleMethod.replace('.', '\\.'), 'g');
    newContent = newContent.replace(regex, loggerMethod);
  }

  return newContent;
}

/**
 * Process a single file
 */
function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Check if file has console statements
  if (!hasConsoleStatements(content)) {
    return null;
  }

  let newContent = content;

  // Add logger import if needed
  if (!hasLoggerImport(content)) {
    newContent = addLoggerImport(newContent, filePath);
  }

  // Replace console with logger
  newContent = replaceConsoleWithLogger(newContent);

  // Count changes
  const consoleCalls = (content.match(/console\.(log|info|warn|error|debug)\(/g) || []).length;

  return {
    filePath,
    consoleCalls,
    newContent,
  };
}

/**
 * Main migration function
 */
function migrate() {
  console.log('🔍 Scanning for files with console statements...\n');

  // Find all TypeScript files
  const pattern = path.join(SRC_DIR, '**', '*.{ts,tsx}');
  const files = glob.sync(pattern, {
    ignore: EXCLUDE_PATTERNS.map(p => path.join(SRC_DIR, p)),
  });

  console.log(`Found ${files.length} TypeScript files\n`);

  const results = [];
  let totalConsoleRemoved = 0;
  let filesModified = 0;

  for (const filePath of files) {
    if (!shouldProcessFile(filePath)) {
      continue;
    }

    const result = processFile(filePath);

    if (result) {
      results.push(result);
      totalConsoleRemoved += result.consoleCalls;
      filesModified++;

      const relativePath = path.relative(process.cwd(), result.filePath);
      console.log(`✓ ${relativePath} (${result.consoleCalls} console calls replaced)`);

      // Write file if not dry run
      if (!DRY_RUN) {
        fs.writeFileSync(result.filePath, result.newContent, 'utf8');
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Migration Summary`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Files modified: ${filesModified}`);
  console.log(`Console calls replaced: ${totalConsoleRemoved}`);

  if (DRY_RUN) {
    console.log(`\n⚠️  DRY RUN MODE - No files were actually modified`);
    console.log(`Run without --dry-run to apply changes\n`);
  } else {
    console.log(`\n✅ Migration complete!\n`);
  }
}

// Run migration
try {
  migrate();
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}
