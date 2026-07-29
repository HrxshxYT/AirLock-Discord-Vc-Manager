// storage.js — tiny synchronous JSON persistence (mirrors the Python version).
// One file on disk, loaded/saved on demand. Fine for a single-process bot.

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');

const DEFAULT = () => ({
  guilds: {},     // guildId -> { jtcChannel, category }
  temp: {},       // channelId -> { owner, guild, locked }
  blocks: {},     // guildId -> [userId, ...]
  bumps: {},      // guildId -> { channel, user, remindAt, done }
  quarantine: {}, // guildId -> { role, users: { userId: [roleId, ...] } }
});

function read() {
  if (!fs.existsSync(DB_PATH)) return DEFAULT();
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return { ...DEFAULT(), ...data };
  } catch {
    return DEFAULT();
  }
}

function write(data) {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

// ---- guild setup config ----
function setGuildConfig(guildId, jtcChannel, category) {
  const d = read();
  d.guilds[guildId] = { jtcChannel, category };
  write(d);
}
function getGuildConfig(guildId) {
  return read().guilds[guildId] || null;
}

// ---- live temp channels ----
function addTemp(channelId, ownerId, guildId) {
  const d = read();
  d.temp[channelId] = { owner: ownerId, guild: guildId, locked: false };
  write(d);
}
function getTemp(channelId) {
  return read().temp[channelId] || null;
}
function isTemp(channelId) {
  return Object.prototype.hasOwnProperty.call(read().temp, String(channelId));
}
function setOwner(channelId, ownerId) {
  const d = read();
  if (d.temp[channelId]) { d.temp[channelId].owner = ownerId; write(d); }
}
function setLocked(channelId, locked) {
  const d = read();
  if (d.temp[channelId]) { d.temp[channelId].locked = locked; write(d); }
}
function removeTemp(channelId) {
  const d = read();
  delete d.temp[channelId];
  write(d);
}

// ---- admin voice blocks ----
function addBlock(guildId, userId) {
  const d = read();
  const list = (d.blocks[guildId] ||= []);
  if (!list.includes(userId)) list.push(userId);
  write(d);
}
function removeBlock(guildId, userId) {
  const d = read();
  const list = d.blocks[guildId] || [];
  d.blocks[guildId] = list.filter((u) => u !== userId);
  write(d);
}
function getBlocks(guildId) {
  return read().blocks[guildId] || [];
}

// ---- bump reminders ----
function setBump(guildId, channelId, userId, remindAt) {
  const d = read();
  d.bumps[guildId] = { channel: channelId, user: userId, remindAt, done: false };
  write(d);
}
function dueBumps(now) {
  const d = read();
  const out = [];
  for (const [gid, rec] of Object.entries(d.bumps)) {
    if (!rec.done && (rec.remindAt || 0) <= now) out.push([gid, rec]);
  }
  return out;
}
function markBumpDone(guildId) {
  const d = read();
  if (d.bumps[guildId]) { d.bumps[guildId].done = true; write(d); }
}

// ---- quarantine ----
function setQuarantineRole(guildId, roleId) {
  const d = read();
  const q = (d.quarantine[guildId] ||= { role: null, users: {} });
  q.role = roleId;
  write(d);
}
function getQuarantineRole(guildId) {
  const q = read().quarantine[guildId];
  return q ? q.role : null;
}
function stashRoles(guildId, userId, roleIds) {
  const d = read();
  const q = (d.quarantine[guildId] ||= { role: null, users: {} });
  q.users[userId] = roleIds;
  write(d);
}
function popRoles(guildId, userId) {
  const d = read();
  const q = d.quarantine[guildId];
  if (!q) return [];
  const roles = q.users[userId] || [];
  delete q.users[userId];
  write(d);
  return roles;
}
function isQuarantined(guildId, userId) {
  const q = read().quarantine[guildId];
  return !!(q && q.users && Object.prototype.hasOwnProperty.call(q.users, String(userId)));
}

module.exports = {
  setGuildConfig, getGuildConfig,
  addTemp, getTemp, isTemp, setOwner, setLocked, removeTemp,
  addBlock, removeBlock, getBlocks,
  setBump, dueBumps, markBumpDone,
  setQuarantineRole, getQuarantineRole, stashRoles, popRoles, isQuarantined,
};
