# MCP Servers Configuration

To help debug the Navigator Web app in real-time, add this to your Claude Code settings:

## Browser Debug Server

Create a local server that connects to the browser's dev tools and IndexedDB.

```bash
# Install dependencies
npm install puppeteer-extra puppeteer-extra-plugin-stealth

# Create the server file and it will be available via MCP
```

This allows Claude to:
- Inspect IndexedDB data directly
- Check actual app state in memory
- Compare console logs with real data
- Test the sync flow step by step
