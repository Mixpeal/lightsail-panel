# lightsail-panel

A lightweight web UI for managing systemd services on any Linux server. Auto-discovers services, manages environment variables, and tails logs — no SSH required.

Built for AWS Lightsail but works on any Linux box with systemd.

## Features

- **Auto-discovery** — scans `/etc/systemd/system/*.service` for services with a `WorkingDirectory`
- **Service controls** — start, stop, restart from the browser
- **Env editor** — view and edit `.env` files with sensitive value masking
- **Log viewer** — tail journalctl output with auto-refresh
- **System metrics** — hostname, uptime, RAM and disk usage at a glance

## Security

- bcrypt password authentication (cost factor 12)
- HMAC-SHA256 signed session cookies (`HttpOnly`, `SameSite=Strict`, `Secure`)
- CSRF double-submit pattern on all mutating endpoints
- Rate limiting: 5 login attempts per 15 min, lockout after 10
- Optional IP allowlisting via `PANEL_ALLOWED_IPS`
- Sensitive env values masked by default (keys matching `key|secret|password|token|cert|credential`)
- Password re-entry required to save env changes
- Dedicated `panel` system user with restricted sudoers (only `systemctl`, `journalctl`, `cat`, `tee`, `cp`)
- File-based audit log with logrotate
- Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/Mixpeal/lightsail-panel/main/setup.sh | sudo bash
```

The script will:
1. Create a `panel` system user with restricted sudo
2. Clone the repo to `/opt/lightsail-panel`
3. Install dependencies and build
4. Prompt for an admin password
5. Generate a signing secret
6. Create a systemd service
7. Optionally add a Caddy reverse proxy entry with auto TLS

### Prerequisites

- Linux with systemd
- [Bun](https://bun.sh) runtime
- Git
- Node.js (for bcrypt hashing during setup)

## Development

```bash
git clone https://github.com/Mixpeal/lightsail-panel
cd lightsail-panel
bun install

# Create a test password hash
node -e "const b=require('bcryptjs');console.log(b.hashSync('yourpassword',12))"

# Add to .env.local
echo 'PANEL_PASSWORD_HASH=<hash from above>' > .env.local
echo 'PANEL_SECRET=dev-secret' >> .env.local

bun dev
```

Open http://localhost:3000. Services list will be empty on non-Linux systems but login and UI will work.

## Configuration

All config is via environment variables in `.env`:

| Variable | Required | Description |
|---|---|---|
| `PANEL_PASSWORD_HASH` | Yes | bcrypt hash of the admin password |
| `PANEL_SECRET` | Yes | 64-char hex string for cookie signing |
| `PORT` | No | Server port (default: 3100) |
| `PANEL_ALLOWED_IPS` | No | Comma-separated IPs/CIDRs to allow |

## API

| Method | Path | Auth | CSRF | Description |
|---|---|---|---|---|
| POST | `/api/auth/login` | No | No | Authenticate |
| POST | `/api/auth/logout` | Yes | Yes | Clear session |
| GET | `/api/services` | Yes | No | List all services with status |
| GET | `/api/services/[name]` | Yes | No | Service detail |
| POST | `/api/services/[name]` | Yes | Yes | Action (start/stop/restart) |
| GET | `/api/services/[name]/env` | Yes | No | Read env vars (masked) |
| PUT | `/api/services/[name]/env` | Yes | Yes | Write env vars (requires password) |
| POST | `/api/services/[name]/env/reveal` | Yes | No | Reveal a masked value |
| GET | `/api/services/[name]/logs` | Yes | No | journalctl output |
| GET | `/api/system` | Yes | No | System info |

## License

MIT
