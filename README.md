# Bombarossa

Online + single-player Bomberman-style game for iOS and Android (Expo / React Native + Skia).

```
packages/game-core   game logic shared by client and server: movement, bombs, bots, snapshots,
                     client-side prediction, local/online game sources, tests
apps/server          authoritative WebSocket game server: rooms with codes, lobby, quick match
apps/mobile          Expo app: floating joystick, two themes, sound, haptics, settings
deploy/              Dockerfile + docker-compose + Caddy (automatic HTTPS) for a VPS
tools/               sound-effect generator and a software-rasteriser theme previewer
```

## Features
- Smooth, classic Bomberman movement (corner sliding, walk off your own bomb), 5.1 cells/s
- 1-5 bots offline, or an empty "antrenman" map; 2-6 players online (13x11 arena, 15x13 for 5-6)
- Online: **room codes**, lobby, host starts the match (optionally fills with bots), **quick match**, reconnect after a dropped connection
- Server-authoritative with client-side prediction for your own player and interpolation for the others
- Floating joystick on the left half, tap anywhere on the right half to drop a bomb, haptics
- Themes: cartoon (default) and classic pixel; automatic quality fallback for slow phones (e.g. Redmi 9C); optional FPS counter
- Generated sound effects (no licensing issues), settings persisted on the device

## Local development

```bash
npm install
npm test                 # game-core + server tests
npm run typecheck
npm run server           # ws://localhost:8080  (GET /health for a liveness check)
npm run preview -- out   # renders theme previews (PNG) into ./out without a phone
python3 tools/generate-sfx.py   # regenerates apps/mobile/assets/sfx/*.wav
```

The app contains native modules (Skia, audio), so Expo Go is not enough: build the app with the workflows below.

## Server on your VPS

You need a domain pointing to the VPS (DNS A record, e.g. `oyun.example.com`) and ports 80/443 open.

```bash
# on the VPS (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
git clone https://github.com/mifarosa/bombarossa.git && cd bombarossa/deploy
cp .env.example .env && nano .env        # set DOMAIN=oyun.example.com
docker compose up -d --build
curl https://oyun.example.com/health     # {"ok":true,...}
```

Update: `git pull && docker compose up -d --build`. Logs: `docker compose logs -f server`.
Caddy fetches and renews the TLS certificate by itself and proxies the WebSocket.

Then tell the app where the server is, either way:
- GitHub → Settings → Secrets and variables → Actions → **Variables** → `SERVER_URL` = `wss://oyun.example.com` (used by the next build), or
- in the app: **Ayarlar → Sunucu adresi** (no rebuild needed).

## iOS → TestFlight (GitHub Actions)

`.github/workflows/ios.yml` builds on a macOS runner and uploads to TestFlight. One-time setup:

1. App Store Connect: create an app record whose bundle ID is `com.farukgul.bombarossa` (`ios.bundleIdentifier` in `apps/mobile/app.json`).
2. App Store Connect → Users and Access → Integrations → create an API key with the **Admin** role (App Manager cannot create the cloud distribution certificate). Download the `.p8`.
3. GitHub → Settings → Secrets and variables → Actions → **Secrets**: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (full file contents), `APPLE_TEAM_ID`.
4. Actions → **iOS → TestFlight** → Run workflow. The build appears in TestFlight after Apple processes it (add yourself to an Internal Testing group once).

## Android APK (GitHub Actions)

Actions → **Android APK** → Run workflow → download the `bombarossa-android-N` artifact (a zip containing `app-release.apk`) → copy to the phone → open it and allow installs from unknown sources. No Google Play account needed. Each build gets a higher version code, so new APKs install over old ones.

## Notes
- The app icon and splash are still the Expo placeholders in `apps/mobile/assets`.
- Online uses `wss://` only in production: iOS/Android block plain `ws://` to remote hosts.
