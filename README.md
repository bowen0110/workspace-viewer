# Workspace Viewer

A lightweight, mobile-first markdown file viewer for browsing and reading `.md` files from any directory. Dark theme, two view modes (list + tree), breadcrumb navigation, syntax highlighting, and search.

Built to be accessed remotely over [Tailscale](https://tailscale.com) — read your workspace files from your phone.

![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- 📁 **Two view modes** — folder list view and expandable tree view (toggle in header, persisted)
- 🔍 **File search** — search by filename across all directories
- 📱 **Mobile-first** — optimized for phone screens, works great on desktop too
- 🌙 **Dark theme** — GitHub-dark inspired, easy on the eyes
- 💡 **Syntax highlighting** — code blocks highlighted via highlight.js
- 🍞 **Full breadcrumb navigation** — always know where you are, tap to navigate back
- 🔒 **Safe** — HTML sanitized with DOMPurify, directory traversal protection on the API
- ⚡ **Zero build step** — just `node server.js`

## Prerequisites

- **Node.js 18+**
- **[Tailscale](https://tailscale.com)** — for secure remote access from your phone/other devices (both the host machine and your phone need Tailscale installed and connected to the same tailnet)

## Quick Start

```bash
git clone https://github.com/citrini-research/workspace-viewer.git
cd workspace-viewer
npm install
npm start
```

Opens at **http://localhost:3500**

### Custom directory and port

```bash
# Serve a specific directory
WORKSPACE_ROOT=/path/to/your/files npm start

# Change port
PORT=8080 npm start

# Both
WORKSPACE_ROOT=~/my-notes PORT=8080 npm start
```

## Remote Access via Tailscale

Once Tailscale is installed on both your host machine and phone:

```bash
# Find your Tailscale hostname
tailscale status

# Access from any device on your tailnet
# http://<your-hostname>:3500
```

## Long-Running Setup

You probably want this always running in the background so you can access it anytime. Here's how depending on your OS:

### Linux (systemd) — Recommended

```bash
# Create a systemd user service
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/workspace-viewer.service << EOF
[Unit]
Description=Workspace Viewer
After=network.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
WorkingDirectory=/path/to/workspace-viewer
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=PORT=3500
Environment=WORKSPACE_ROOT=/path/to/your/files
MemoryMax=256M
TimeoutStartSec=15
WatchdogSec=120

[Install]
WantedBy=default.target
EOF

# Enable and start
systemctl --user daemon-reload
systemctl --user enable workspace-viewer
systemctl --user start workspace-viewer

# Allow services to run after logout
loginctl enable-linger $USER

# Check status
systemctl --user status workspace-viewer

# View logs
journalctl --user -u workspace-viewer -f

# Restart after updates
systemctl --user restart workspace-viewer
```

**Crash protection built in:**
- `Restart=on-failure` — only restarts on crashes, not clean exits
- `StartLimitBurst=5` — max 5 restarts in 5 minutes, then stops (no infinite loop)
- `MemoryMax=256M` — kills if memory exceeds limit
- `WatchdogSec=120` — kills if process hangs for 2 minutes

### macOS (launchd)

```bash
cat > ~/Library/LaunchAgents/com.workspace-viewer.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.workspace-viewer</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/workspace-viewer/server.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>3500</string>
    <key>WORKSPACE_ROOT</key>
    <string>/path/to/your/files</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>/tmp/workspace-viewer.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/workspace-viewer.log</string>
</dict>
</plist>
EOF

# Load and start
launchctl load ~/Library/LaunchAgents/com.workspace-viewer.plist

# Check status
launchctl list | grep workspace-viewer

# Restart
launchctl kickstart -k gui/$(id -u)/com.workspace-viewer

# Stop
launchctl unload ~/Library/LaunchAgents/com.workspace-viewer.plist
```

### Windows (Task Scheduler)

1. Open **Task Scheduler** (`taskschd.msc`)
2. Click **Create Task** (not Basic Task)
3. **General tab:**
   - Name: `Workspace Viewer`
   - Check "Run whether user is logged on or not"
4. **Triggers tab:**
   - New → "At startup"
5. **Actions tab:**
   - New → Action: "Start a program"
   - Program: `node` (or full path like `C:\Program Files\nodejs\node.exe`)
   - Arguments: `server.js`
   - Start in: `C:\path\to\workspace-viewer`
6. **Settings tab:**
   - Check "If the task fails, restart every 1 minute"
   - Set "Attempt to restart up to 5 times"

**Or use PM2 (cross-platform alternative):**

```bash
npm install -g pm2

# Start
pm2 start server.js --name workspace-viewer --env PORT=3500

# Auto-start on boot
pm2 startup
pm2 save

# Status / restart
pm2 status
pm2 restart workspace-viewer
```

### WSL2

Follow the Linux (systemd) instructions above. WSL2 supports systemd natively. Make sure to enable linger so services survive after closing the terminal:

```bash
loginctl enable-linger $USER
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3500` | Server port |
| `WORKSPACE_ROOT` | Parent directory of `server.js` | Root directory to serve files from |

## API

| Endpoint | Description |
|----------|-------------|
| `GET /` | Web UI |
| `GET /api/tree` | JSON directory tree of all `.md` files |
| `GET /api/file?path=<relative-path>` | Rendered HTML + raw content of a file |
| `GET /api/search?q=<query>` | Search filenames (max 30 results) |

## Tech Stack

- [Express](https://expressjs.com/) — HTTP server
- [Marked](https://marked.js.org/) — Markdown → HTML
- [highlight.js](https://highlightjs.org/) — Syntax highlighting
- [DOMPurify](https://github.com/cure53/DOMPurify) — HTML sanitization (client-side)

## License

MIT
