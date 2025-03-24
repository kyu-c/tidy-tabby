<p align="center">
  <img src="src/assets/tidy-tabby.png" alt="TidyTabby Mascot" width="200">
</p>

# TidyTabby

A Chrome extension that automatically closes inactive tabs after a configurable time period.

## Features

- Automatically closes tabs that have been inactive for a specified period
- Locked tabs are protected from automatic closure
- "Close all tabs" feature for quick cleanup of your browser

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the extension:
   ```bash
   pnpm build
   ```
4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the extension directory

## License

MIT
