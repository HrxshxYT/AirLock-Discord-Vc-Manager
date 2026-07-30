# Privacy Policy — AirLock

**Effective date:** 30 July 2026
**Last updated:** 30 July 2026

This Privacy Policy explains what information the **AirLock** Discord bot ("AirLock",
"the bot", "we", "us") collects, how it is used, and your choices. By adding AirLock to
a Discord server or using its features, you agree to this policy.

AirLock is not affiliated with, endorsed by, or sponsored by Discord Inc.

---

## 1. Summary (the short version)

- AirLock stores **only Discord identifiers** (server, channel, user, and role IDs) that
  are strictly required for its features to work.
- AirLock does **not** store your messages, does **not** record or listen to voice audio,
  and does **not** collect emails, passwords, IP addresses, or any real-world personal
  information.
- Data is used **only** to provide the bot's features, is **never sold**, and is **never
  shared** with third parties for advertising.

---

## 2. What we collect and why

AirLock stores a small amount of operational data in a local database on the machine that
hosts the bot. Specifically:

| Data | Example | Why it's stored |
| --- | --- | --- |
| **Server (guild) configuration** | server ID → "join to create" channel ID + category ID | so joining the hub creates your voice channel |
| **Temporary voice channels** | channel ID → owner user ID, server ID, locked state | to know who owns a channel and to clean it up |
| **Voice-ban list** | server ID → list of user IDs | to enforce `/block` until `/unblock` |
| **Quarantine records** | server ID → quarantine role ID, and per-user a snapshot of role IDs that were removed | to isolate a member and **restore their exact roles** on `/unquarantine` |
| **Bump reminders** | server ID → channel ID, the bumper's user ID, and the reminder time | to ping the right person ~2 hours after a bump |

That is the complete list. No other data is written to disk.

## 3. What we do NOT collect

- ❌ **Message content.** AirLock uses Discord's "Message Content" gateway intent for a
  single purpose: to detect DISBOARD's public "Bump done!" confirmation so it can schedule
  a reminder. Message content is read transiently in memory and is **never logged or
  stored**. AirLock does not read, store, or process the content of your conversations.
- ❌ **Voice audio.** AirLock manages voice *channels*; it never connects to voice to
  listen and never records audio.
- ❌ **Direct messages.**
- ❌ **Personal data** such as real names, emails, phone numbers, payment details, or IP
  addresses.

## 4. How we use the data

The data in Section 2 is used solely to operate the bot's features (creating and cleaning
up voice channels, enforcing locks/permits, applying and reversing moderation actions, and
sending bump reminders). It is **not** used for profiling, analytics, advertising, or any
purpose beyond making the bot work.

## 5. Data sharing

We do **not** sell, rent, or trade your data. We do not share it with third parties, except
that the bot necessarily transmits data to **Discord** in order to function (for example,
creating a channel or moving a member). Your use of Discord is governed by
[Discord's Privacy Policy](https://discord.com/privacy).

## 6. Data retention and deletion

AirLock keeps data only as long as it is needed:

- A temporary voice channel's record is **deleted automatically** when the channel is
  deleted or becomes empty.
- A voice-ban is removed when an admin runs `/unblock`.
- A quarantine record (including the saved role snapshot) is removed when an admin runs
  `/unquarantine`.
- A bump reminder record is cleared after the reminder is sent.
- Server configuration is stored until the "join to create" hub is deleted or the bot is
  removed from the server.

**Removing the bot** from your server, and deleting the channels/roles it created, removes
its associated stored data going forward. You may also request deletion of any data
associated with your server or user ID — see Section 9.

## 7. Security

Data is stored in a local file on the host and is not exposed to any public endpoint.
No method of storage is 100% secure, but we take reasonable measures to protect it. AirLock
is open source; if you **self-host** it, you are the data controller for your own instance
and are responsible for securing it.

## 8. Children

Discord's Terms require users to be at least 13 years old (or the minimum age of digital
consent in their country). AirLock is not directed at children under this age and does not
knowingly collect their data.

## 9. Your choices & contact

- **Access / deletion requests:** contact us (below) with your server ID or user ID and we
  will remove the associated data from the hosted instance.
- You can stop all data collection at any time by **removing the bot** from your server.

**Contact:** contact@hrxshx.com

## 10. Changes to this policy

We may update this Privacy Policy from time to time. Material changes will be reflected by
updating the "Last updated" date above. Continued use of the bot after changes constitutes
acceptance of the revised policy.
