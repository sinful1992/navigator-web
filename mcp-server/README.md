# Navigator Race Condition Tester - MCP Server

This MCP (Model Context Protocol) server provides automated testing tools to verify that all race condition and data persistence fixes have been properly implemented in the Navigator Web application.

## Features

The server tests all 9 critical fixes across 3 phases:

### PHASE 1: Critical Data Loss Prevention
- ✅ Finite protection flag timeouts (5min active, 1min session)
- ✅ Abort controller with 15-second timeout
- ✅ Try/finally protection flag cleanup
- ✅ Atomic operations with rollback

### PHASE 2: Duplicate Prevention & State Consistency
- ✅ Atomic active state clearing (both activeIndex and activeStartTime)
- ✅ 5-second duplicate detection window
- ✅ Conflict detection for concurrent operations

### PHASE 3: Sync Reliability & Observability
- ✅ Enhanced logging with state snapshots
- ✅ Monotonic timestamps (clock-skew immune)
- ✅ Merge mutex (prevents concurrent merges)
- ✅ Global sync lock (prevents simultaneous sync)

## Installation

```bash
cd mcp-server
npm install
```

## Usage

### Run All Tests

```bash
node test-runner.js
```

### Available MCP Tools

When using the MCP server via MCP client:

1. **run_all_tests** - Run complete test suite (recommended)
2. **test_protection_flags** - Test protection flag implementations
3. **test_abort_controller** - Test abort controller
4. **test_atomic_operations** - Test atomic operation service
5. **test_duplicate_detection** - Test duplicate prevention
6. **test_merge_mutex** - Test merge mutex
7. **test_sync_lock** - Test global sync lock

## Test Results

The server validates:

- **30 total tests** (26 critical, 4 non-critical)
- Code pattern matching against source files
- Implementation correctness
- Security best practices

### Success Criteria

All 26 critical tests must pass for verification to succeed.

## Sample Output

```
═══════════════════════════════════════════════════════════
           RACE CONDITION FIX VERIFICATION REPORT
═══════════════════════════════════════════════════════════

✅ ALL CRITICAL TESTS PASSED

📊 Summary:
   Total Tests: 30
   Passed: 30
   Failed: 0
   Critical Passed: 26/26

───────────────────────────────────────────────────────────
...
═══════════════════════════════════════════════════════════
✅ VERIFICATION COMPLETE - All critical fixes implemented!
═══════════════════════════════════════════════════════════
```

## Integration

To add this MCP server to Claude Desktop, add to your MCP configuration:

```json
{
  "mcpServers": {
    "navigator-race-condition-tester": {
      "command": "node",
      "args": ["C:/Users/barku/Documents/navigator-web/mcp-server/index.js"]
    }
  }
}
```

## Files

- `index.js` - MCP server implementation
- `test-runner.js` - Standalone test runner
- `package.json` - Dependencies
- `README.md` - This file

## License

Same as parent project
