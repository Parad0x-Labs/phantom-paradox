# PHANTOM PARADOX BROWSER EXTENSION

Earn crypto by sharing bandwidth. Lightweight relay agent that runs in your browser.

## Supported Browsers

| Browser | Engine | Folder | Status |
|---------|--------|--------|--------|
| **Chrome** | Chromium | `chromium/` | ✅ Ready |
| **Edge** | Chromium | `chromium/` | ✅ Ready |
| **Brave** | Chromium | `chromium/` | ✅ Ready |
| **Opera** | Chromium | `chromium/` | ✅ Ready |
| **Firefox** | Gecko | `firefox/` | ✅ Ready |
| **Safari** | WebKit | `safari/` | 🔲 Planned |

## Quick Install (Developer Mode)

### Step 1: Generate Icons

Before loading the extension, you need icons:

1. Open `chromium/icons/generate-icons.html` in your browser
2. Click each "Download" link to save the PNG files
3. Save them to the `icons/` folder

Or use any 16x16, 32x32, 48x48, 128x128 PNG images.

### Step 2: Load Extension

#### Chrome / Edge / Brave / Opera

1. Open extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
   - Opera: `opera://extensions`

2. Enable **Developer mode** (toggle in top-right)

3. Click **Load unpacked**

4. Select the `chromium/` folder

5. Done! Click the extension icon in toolbar.

#### Firefox

1. Open `about:debugging#/runtime/this-firefox`

2. Click **Load Temporary Add-on**

3. Select `firefox/manifest.json`

4. Done! Click the extension icon in toolbar.

## Features

### Relay Mode
Share your bandwidth for VPN/proxy traffic. Your IP helps others access content.

### Configurable Limits
- **Bandwidth**: 1-100 Mbps cap
- **Daily Data**: 100 MB to 100 GB, or Unlimited

### Earnings Tracking
- Real-time earnings display
- Data relayed counter
- Uptime tracker
- Estimated hourly rate

### Privacy First
- No browsing history collected
- No personal information stored
- Wallet address = your identity
- All traffic encrypted

## File Structure

```
browser-extension/
├── README.md
│
├── chromium/                 # Chrome, Edge, Brave, Opera
│   ├── manifest.json         # Manifest V3
│   ├── src/
│   │   ├── background.js     # Service worker
│   │   ├── popup.html        # UI
│   │   └── popup.js          # UI controller
│   └── icons/
│       ├── generate-icons.html
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
│
├── firefox/                  # Firefox
│   ├── manifest.json         # Manifest V2
│   ├── src/
│   │   ├── background.js     # Background script
│   │   ├── popup.html        # UI
│   │   └── popup.js          # UI controller
│   └── icons/
│       └── (same as chromium)
│
└── safari/                   # Coming soon
    └── README.md
```

## How It Works

1. **Connect Wallet** - Enter your Solana wallet address
2. **Configure Limits** - Set max bandwidth and daily data cap
3. **Start Earning** - Click "START EARNING" to begin relaying
4. **Monitor Stats** - Watch your earnings grow in real-time

## Earnings Estimate

Based on network activity:

| Usage | Daily Earnings |
|-------|---------------|
| Light (1-2 hrs/day) | $0.10 - $0.50 |
| Medium (8 hrs/day) | $0.50 - $2.00 |
| Heavy (24/7) | $2.00 - $5.00 |

*Actual earnings depend on network demand and your connection quality.*

## Building for Store Submission

```bash
# Chrome Web Store / Edge Add-ons
cd chromium
zip -r ../phantom-agent-chromium.zip . -x "*.html" -x "*.svg"

# Firefox Add-ons
cd firefox  
zip -r ../phantom-agent-firefox.zip . -x "*.html" -x "*.svg"
```

## Troubleshooting

### Extension not loading
- Make sure you're in Developer mode
- Check that all icon files exist
- Look for errors in browser console

### Not earning
- Ensure wallet address is connected
- Check that agent status shows "ONLINE"
- Verify internet connection

### Badge not showing
- Some browsers hide badges by default
- Check extension settings

## Security

- **Open source** - All code is auditable
- **No tracking** - We don't collect browsing data
- **Encrypted traffic** - All relay traffic is encrypted
- **Local storage only** - Your data stays on your device

## Changelog

### v0.1.0 (Initial Release)
- Basic relay functionality
- Earnings tracking
- Bandwidth/data cap controls
- Multi-browser support

## License

MIT License - Phantom Paradox 2025
