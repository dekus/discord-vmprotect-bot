# Discord VMProtect Bot

A Discord bot that automates VMProtect-based protection of custom builds. Staff members drop an `.exe` or a `.vmp` project file into a designated channel (or point the bot at a URL), the bot runs it through `VMProtect_Con.exe`, and returns the protected binary — either as a Discord attachment (≤ 8 MB) or as a one-time web download link (larger files).

Built on `discord.js` v14 with a classic message-prefix (`!`) command dispatcher. Ships with a simulator mode for development so the real VMProtect installation is not required while iterating on the bot.

---

## Features

- Prefix-based commands (`!help`, `!status`, `!custombuild`, `!largefile`) on top of `discord.js` v14 with the `MessageContent` intent.
- URL-based build pipeline: download loader → protect with VMProtect → return artifact.
- Automatic dispatch on channel uploads: drop a `.exe` or `.vmp` in the configured channel and the bot processes it.
- 8 MB Discord attachment cap handled automatically — anything larger is served through the built-in `web-uploader` (one-time link, auto-cleaned after 30 minutes).
- Server whitelist + staff-role gate on every privileged command.
- Development mode uses `vmprotect-simulator.js` — no VMProtect license needed to test the bot loop.
- Large-file management commands (`list`, `info`, `clean`) for the output directory.
- Logging via `utils/logger.js` for administrative review.

---

## Repository Layout

```
src/
├── index.js                    # entry point — client bootstrap, channel-upload handler
├── config.env                  # environment template (rename/copy to .env)
├── package.json
├── commands/
│   ├── custombuild.js          # !custombuild <url>
│   ├── help.js                 # !help
│   ├── largefile.js            # !largefile [list|info|clean] [fileId]
│   └── status.js               # !status
└── utils/
    ├── commandHandler.js       # command loader / dispatcher
    ├── logger.js               # log formatting
    ├── permissions.js          # whitelist + staff-role checks
    ├── vmprotect-handler.js    # spawns VMProtect_Con.exe
    ├── vmprotect-simulator.js  # dev-mode stand-in
    └── web-uploader.js         # one-time download links for > 8 MB output
```

---

## Requirements

- **Node.js** ≥ 16 (declared in `package.json` `engines`).
- **VMProtect Ultimate** installed on the host running the bot (production mode).
  - Default expected path: `C:/Program Files/VMProtect Ultimate/VMProtect_Con.exe`.
- **Discord bot application** with the `MessageContent` privileged intent enabled in the Developer Portal.
- Windows host recommended (VMProtect_Con.exe path is Windows-style by default; adjust for other OSes).

Runtime dependencies (`package.json`):

| Package        | Version   | Purpose                          |
|----------------|-----------|----------------------------------|
| `discord.js`   | ^14.14.1  | Discord gateway + REST client    |
| `dotenv`       | ^16.3.1   | Load `config.env` / `.env`       |
| `fs-extra`     | ^11.2.0   | File operations, temp dirs       |
| `node-fetch`   | ^2.6.9    | HTTP download of loader URLs     |

Dev dependencies:

| Package      | Version | Purpose                          |
|--------------|---------|----------------------------------|
| `cross-env`  | ^7.0.3  | Cross-platform env var setting   |
| `nodemon`    | ^3.0.2  | Auto-restart on file changes     |

---

## Installation

```bash
git clone https://github.com/dekus/discord-vmprotect-bot.git
cd discord-vmprotect-bot
```

Install dependencies (the `package.json` lives inside `src/`):

```bash
cd src
npm install
```

---

## Configuration

Edit `src/config.env` and fill in the placeholders:

```env
# Enter your Discord bot token
DISCORD_TOKEN=YOURTOKEN

# Enter the channel ID where the bot will accept files
BUILD_CHANNEL_ID=YOURCHANNEL

# Enter the path to VMProtect executable
VMPROTECT_PATH=C:/Program Files/VMProtect Ultimate/VMProtect_Con.exe

# Enter whitelisted Discord server IDs (comma-separated)
WHITELISTED_SERVER_IDS=YOURDISCORDSERVERID

# Enter Staff role ID
STAFF_ROLE_ID=STAFFROLEID
```

### Variable reference

| Key                       | Required | Description                                                                  |
|---------------------------|----------|------------------------------------------------------------------------------|
| `DISCORD_TOKEN`           | yes      | Bot token from the Discord Developer Portal.                                 |
| `BUILD_CHANNEL_ID`        | yes      | Numeric ID of the channel the bot watches for `.exe` / `.vmp` uploads.       |
| `VMPROTECT_PATH`          | yes*     | Absolute path to `VMProtect_Con.exe`. *Not required in development mode.     |
| `WHITELISTED_SERVER_IDS`  | yes      | Comma-separated guild IDs allowed to use privileged commands.                |
| `STAFF_ROLE_ID`           | yes      | Role ID required for `!custombuild` and `!largefile`.                        |

### Getting the IDs

Enable **Developer Mode** in Discord (`User Settings → Advanced → Developer Mode`), then right-click any server / channel / role → **Copy ID**.

### Enabling the privileged intent

In the Discord Developer Portal for your application:

1. `Bot` → toggle **Message Content Intent** on.
2. Save.

Without this, the prefix-command dispatcher will not receive message text.

### Inviting the bot

Use an OAuth2 URL with the `bot` scope and at minimum these permissions: `View Channels`, `Send Messages`, `Attach Files`, `Read Message History`, `Embed Links`.

---

## Running

### Production

```bash
npm start
```

Equivalent to `node src/index.js`. Uses the real VMProtect executable pointed to by `VMPROTECT_PATH`.

### Development (simulator, no VMProtect required)

```bash
npm run dev
```

Sets `NODE_ENV=development` and runs under `nodemon`. The bot routes protection jobs through `vmprotect-simulator.js` instead of spawning `VMProtect_Con.exe`, so the whole download → process → upload loop can be exercised without a licensed VMProtect install.

---

## Commands

Prefix: `!`

### Public

| Command   | Description                             |
|-----------|-----------------------------------------|
| `!help`   | Show the command list.                  |
| `!status` | Show bot operational status.            |

### Staff-only (require whitelisted guild + `STAFF_ROLE_ID`)

#### `!custombuild <url>`

Downloads the file at `<url>`, runs it through VMProtect, and returns the protected artifact.

- URL must be `http://` or `https://`.
- 30-second download timeout.
- Output ≤ 8 MB → attached to the reply.
- Output > 8 MB → uploaded to the internal web endpoint; the bot posts a one-time download link that auto-deletes after 30 minutes.

Example:

```
!custombuild https://cdn.example.com/loader.exe
```

#### `!largefile [list|info|clean] [fileId]`

Manage protected outputs held on disk because they exceeded the Discord attachment cap.

| Subcommand         | Args                                           | Effect                                                                 |
|--------------------|------------------------------------------------|------------------------------------------------------------------------|
| `list` *(default)* | none                                           | List stored large files with ID, size, timestamp, requesting user.     |
| `info`             | `<fileId>` — numeric index from `list` or name | Show full path, size, creation time, and metadata for one entry.       |
| `clean`            | none                                           | Delete every large file older than 7 days from the output directory.   |

Examples:

```
!largefile
!largefile list
!largefile info 3
!largefile clean
```

### Channel upload flow

Independently of `!custombuild`, any `.exe` or `.vmp` attachment posted in `BUILD_CHANNEL_ID` by a staff member is picked up automatically. The bot:

1. Validates the extension.
2. Downloads to a temporary directory.
3. Emits progress messages (file size received, protection stage).
4. Runs VMProtect (or the simulator in dev mode).
5. Returns the protected file (attachment or web link).
6. Cleans up the input file — `.exe` inputs are deleted, `.vmp` project files are kept.
7. Output files and metadata are retained on the server for `!largefile` retrieval.

---

## Operational Notes

- **Timeouts & empty files** are caught and reported back in-channel rather than crashing the process.
- **Attachment ceiling** is fixed at 8 MB — matches Discord's default upload limit for unboosted servers. If the guild has Nitro-boost tier bumps, the current code still routes anything > 8 MB through the web uploader.
- **Cleanup policy**: temp inputs removed post-run (except `.vmp` project sources); outputs remain until `!largefile clean` sweeps them (> 7 days).
- **Logging** goes through `utils/logger.js` — extend it if you want to persist logs to disk or ship them to a SIEM.

---

## Troubleshooting

| Symptom                                      | Likely cause / fix                                                                 |
|----------------------------------------------|------------------------------------------------------------------------------------|
| Bot online but ignores commands              | `MessageContent` intent not enabled in the Developer Portal.                       |
| `!custombuild` replies "not authorized"      | Guild ID missing from `WHITELISTED_SERVER_IDS`, or user lacks `STAFF_ROLE_ID`.     |
| Protection fails immediately in prod         | `VMPROTECT_PATH` wrong, or the account running Node lacks execute rights on it.    |
| Large-file link 404s after a while           | Expected — one-time links auto-expire after 30 minutes.                            |
| `!largefile info <n>` returns nothing        | Numeric index refers to a `list` position; re-run `!largefile list` to refresh.    |
| Want to develop without a VMProtect license  | Use `npm run dev` — routes through the simulator.                                  |

---

## Extending

- Add a command: drop a new file into `src/commands/`, export a `name` and `execute(message, args, client)` function; `commandHandler.js` picks it up automatically.
- Swap the storage backend for `web-uploader.js` (S3, R2, local static server) — the rest of the pipeline is agnostic as long as the returned URL is downloadable.
- Harden the whitelist / role gate in `utils/permissions.js` if additional roles or per-channel policies are needed.

---
