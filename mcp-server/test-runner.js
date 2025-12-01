#!/usr/bin/env node

/**
 * Test runner for MCP server
 * Executes the MCP server and calls the run_all_tests tool
 */

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function runTests() {
  console.log('🚀 Starting MCP server test runner...\n');

  // Start the MCP server
  const serverProcess = spawn('node', ['index.js'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'inherit']
  });

  // Create client transport
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['index.js']
  });

  // Create MCP client
  const client = new Client(
    {
      name: 'test-runner',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    // Connect to server
    await client.connect(transport);
    console.log('✅ Connected to MCP server\n');

    // Call run_all_tests tool
    const result = await client.callTool({
      name: 'run_all_tests',
      arguments: {}
    });

    // Display results
    if (result.content && result.content[0]) {
      console.log(result.content[0].text);
    }

    // Check if tests passed
    const passed = result.content[0].text.includes('✅ ALL CRITICAL TESTS PASSED');

    await client.close();

    process.exit(passed ? 0 : 1);

  } catch (error) {
    console.error('❌ Test runner failed:', error);
    await client.close();
    process.exit(1);
  }
}

runTests();
