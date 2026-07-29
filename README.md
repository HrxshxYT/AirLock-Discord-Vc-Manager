# ꒰ঌ cutie vc manager ໒꒱ — discord.js edition

A soft, pastel **join-to-create** voice manager + light moderation bot, written in
**discord.js v14**. Join one hub channel and the bot makes your own private voice
channel, drags you in, and posts a cute control panel — with a pixel-art banner
(`base pic.jpg`) and chunky bitmap-style bold text rendered onto it via `@napi-rs/canvas`.

> This is a full port of the Python version. Same features, same look.

## ✧ features

- **/setup** *(admin)* — creates the `꒰ঌ join to create ໒꒱` hub + category
- **join the hub** → your own temp VC, you're moved in, control panel appears
- **panel buttons** *(owner only)*: 🔒 lock/unlock · 👥 limit · ✏️ rename · 💬 status ·
  ➕ permit · ➖ reject · 👑 claim · 🗑️ delete
- **/allow @user** — owner-only, run **in the vc's own chat**
- **/block @user** / **/unblock @user** *(admin)* — voice-ban: a single clean disconnect
  whenever they join any VC, until lifted
- **moderation:** **/kick**, **/ban** (with optional message purge), **/quarantine** +
  **/unquarantine** (isolates a member with a locked-down role, restores their roles on release)
- **auto bump reminders** — pings the bumper 2h after each DISBOARD bump (survives restarts)
- **/help** aesthetic menu · **thank-you embed** when the bot is added to a server
- empty temp channels auto-delete

## ✧ a note on "keeping people out"

This bot does **not** rapid-drag or "bounce" users between channels — that's targeted
harassment, it violates Discord's ToS, and it gets bots (and hosts) banned. Instead:
**lock** denies the `Connect` permission so unwanted people can't join, and **/block**
gives one clean disconnect. Stronger control, zero ToS risk.

## ✧ setup

1. **Create the bot & invite it**
   - <https://discord.com/developers/applications> → *New Application* → **Bot** → *Reset Token*
   - **Bot → Privileged Gateway Intents:** enable **Server Members Intent** *and*
     **Message Content Intent** (the latter is required for bump detection)
   - For a public bot, also toggle **Public Bot** on
   - **OAuth2 → URL Generator:** scopes **`bot`** + **`applications.commands`**;
     permissions: **Manage Channels, Move Members, Connect, View Channels, Send Messages,
     Kick Members, Ban Members, Manage Roles**
   - Open the generated URL and add the bot
   - ⚠️ For quarantine/kick/ban, drag the bot's role **above** the people it moderates

2. **Install & run**
   ```bash
   cd "Vc bot js"
   npm install
   cp .env.example .env      # then paste your token into .env
   npm start                 # or: node index.js
   ```

3. In Discord, run `/setup`, then join `꒰ঌ join to create ໒꒱`. ♡

## ✧ slash-command registration

- Leave **`GUILD_ID` blank** → commands register **globally** (correct for a public bot,
  but can take up to ~1 hour to first appear).
- Set **`GUILD_ID`** to a server ID → commands register in that one server **instantly**
  (great for development).

If commands never appear, the usual cause is the bot being invited **without the
`applications.commands` scope** — re-invite with the OAuth2 URL above.

## ✧ files

| file | what it does |
| --- | --- |
| `index.js` | the whole bot: events, join-to-create, panel, commands, bumps |
| `imageGen.js` | renders the pixel-sky banner + bitmap bold text (`@napi-rs/canvas`) |
| `storage.js` | tiny JSON persistence (`data.json`) |
| `base pic.jpg` | your pixel-art sky (banner background) |

## ✧ customising the look

- **Background:** replace `base pic.jpg` (keep the wide banner shape)
- **Bitmap font:** drop a `font.ttf` next to `imageGen.js` and it's used automatically
- **Chunkiness:** tweak `PIXEL_SCALE` in `imageGen.js`
- **Colors / names:** `EMBED_COLOR`, `HUB_NAME`, `CATEGORY_NAME` near the top of `index.js`
