// ꒰ঌ AirLock manager ໒꒱  (discord.js v14)
// A soft, aesthetic join-to-create voice manager + light moderation bot.
//
// /setup            (admin)  build the join-to-create hub
// join the hub      -> your own temp VC + a control panel
// /allow @user      (vc owner, in the vc chat)  permit someone into a locked vc
// /block /unblock   (admin)  voice-ban (single clean disconnect on join) / lift it
// /kick /ban        moderation
// /quarantine /unquarantine   isolate a member / release them
// /help             aesthetic command menu
// + auto DISBOARD bump reminders (2h) and a thank-you embed on join
//
// SAFETY: this bot never rapid-drags or "bounces" anyone between channels.
// Keeping people out is done correctly — deny Connect (lock) and a single clean
// disconnect for voice-banned users. Rapid channel-flinging violates Discord ToS.

require('dotenv').config();
const {
  Client, GatewayIntentBits, Events, PermissionFlagsBits, ChannelType,
  EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder,
  SlashCommandBuilder, REST, Routes, ActivityType,
} = require('discord.js');

const storage = require('./storage');
const { makeBanner } = require('./imageGen');

// ───────────────────────────────────────────── config ──
const TOKEN = process.env.DISCORD_TOKEN || '';
const GUILD_ID = (process.env.GUILD_ID || '').trim(); // set for instant sync in one server
const HUB_NAME = "꒰ঌ join to create ໒꒱";
const CATEGORY_NAME = "꒰ঌ AirLock voice ໒꒱";
const QUARANTINE_ROLE_NAME = "꒰ঌ quarantined ໒꒱";
const EMBED_COLOR = 0xf7b5d3;
const DISBOARD_ID = '302050872383242240';
const BUMP_COOLDOWN = 2 * 60 * 60 * 1000; // ms

// /moveloop state — only one bounce loop may run at a time (per process).
let isLooping = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // needed to read DISBOARD's bump embed
  ],
});

// ───────────────────────────────────────────── helpers ──
const isOwner = (channelId, userId) => {
  const rec = storage.getTemp(channelId);
  return rec && rec.owner === userId;
};
const isAdmin = (interaction) =>
  interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
  interaction.guild.ownerId === interaction.user.id;

async function bannerAttachment(title, subtitle) {
  const buf = await makeBanner(title, subtitle);
  return new AttachmentBuilder(buf, { name: 'banner.png' });
}

function controlPanelRows() {
  const btn = (id, emoji, label, style) =>
    new ButtonBuilder().setCustomId(id).setEmoji(emoji).setLabel(label).setStyle(style);
  return [
    new ActionRowBuilder().addComponents(
      btn('vc:lock', '🔒', 'lock', ButtonStyle.Secondary),
      btn('vc:limit', '👥', 'limit', ButtonStyle.Secondary),
      btn('vc:rename', '✏️', 'rename', ButtonStyle.Secondary),
      btn('vc:status', '💬', 'status', ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      btn('vc:permit', '➕', 'permit', ButtonStyle.Success),
      btn('vc:reject', '➖', 'reject', ButtonStyle.Danger),
      btn('vc:claim', '👑', 'claim', ButtonStyle.Primary),
      btn('vc:delete', '🗑️', 'delete', ButtonStyle.Danger),
    ),
  ];
}

async function panelEmbed(channel, owner) {
  const rec = storage.getTemp(channel.id);
  const locked = rec ? rec.locked : false;
  const limit = channel.userLimit || '∞';
  const embed = new EmbedBuilder()
    .setTitle('✧ voice control panel ✧')
    .setDescription(`welcome to your channel, <@${owner.id}>! ♡\nuse the buttons below to make it *yours*.\n​`)
    .setColor(EMBED_COLOR)
    .addFields(
      { name: '◟ owner', value: `<@${owner.id}>`, inline: true },
      { name: '◟ limit', value: String(limit), inline: true },
      { name: '◟ status', value: locked ? '🔒 locked' : '🔓 open', inline: true },
      {
        name: '​',
        value:
          '🔒 **lock / unlock** · only permitted people can join\n' +
          '👥 **limit** · cap how many can join\n' +
          '✏️ **rename** · give it a cute name\n' +
          '💬 **status** · set the channel status\n' +
          '➕ **permit** · let a friend in · also `/allow @user`\n' +
          '➖ **reject** · remove someone & keep them out\n' +
          '👑 **claim** · take ownership if the owner left\n' +
          '🗑️ **delete** · close the channel',
      },
    )
    .setImage('attachment://banner.png')
    .setFooter({ text: '꒰ঌ AirLock ໒꒱ · be kind, stay cozy' });
  const file = await bannerAttachment(channel.name, '* your cozy little vc *');
  return { embed, file };
}

// set a voice channel's "status" (no direct helper in djs — use the REST route)
async function setVoiceStatus(channelId, status) {
  await client.rest.put(`/channels/${channelId}/voice-status`, {
    body: { status: status || null },
  });
}

// ───────────────────────────────────────────── slash command defs ──
const commands = [
  new SlashCommandBuilder().setName('setup')
    .setDescription('✧ set up the join-to-create voice hub (admin)'),
  new SlashCommandBuilder().setName('allow')
    .setDescription('♡ let someone into your vc (owner only, in the vc chat)')
    .addUserOption((o) => o.setName('user').setDescription('the friend to permit').setRequired(true)),
  new SlashCommandBuilder().setName('block')
    .setDescription('⚠ voice-ban a user — disconnected on join (admin)')
    .addUserOption((o) => o.setName('user').setDescription('user to voice-ban').setRequired(true)),
  new SlashCommandBuilder().setName('unblock')
    .setDescription('♡ lift a voice-ban (admin)')
    .addUserOption((o) => o.setName('user').setDescription('user to unblock').setRequired(true)),
  new SlashCommandBuilder().setName('kick')
    .setDescription('🥾 kick a member (needs Kick Members)')
    .addUserOption((o) => o.setName('user').setDescription('who to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('why (optional)')),
  new SlashCommandBuilder().setName('ban')
    .setDescription('🔨 ban a member (needs Ban Members)')
    .addUserOption((o) => o.setName('user').setDescription('who to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('why (optional)'))
    .addIntegerOption((o) => o.setName('delete_days').setDescription('purge their last N days of msgs (0-7)').setMinValue(0).setMaxValue(7)),
  new SlashCommandBuilder().setName('quarantine')
    .setDescription('🚧 quarantine a member — isolates them (needs Manage Roles)')
    .addUserOption((o) => o.setName('user').setDescription('who to quarantine').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('why (optional)')),
  new SlashCommandBuilder().setName('unquarantine')
    .setDescription('♡ release a member from quarantine (needs Manage Roles)')
    .addUserOption((o) => o.setName('user').setDescription('who to release').setRequired(true)),
  new SlashCommandBuilder().setName('help')
    .setDescription('✧ show everything AirLock can do'),
  new SlashCommandBuilder().setName('bounce')
    .setDescription('loop members back and forth between two voice channels')
    .addChannelOption((o) => o.setName('channel_a').setDescription('the first voice channel')
      .addChannelTypes(ChannelType.GuildVoice).setRequired(true))
    .addChannelOption((o) => o.setName('channel_b').setDescription('the second voice channel')
      .addChannelTypes(ChannelType.GuildVoice).setRequired(true)),
  new SlashCommandBuilder().setName('stopbounce')
    .setDescription('stop the active voice channel loop'),
].map((c) => c.toJSON());

// ───────────────────────────────────────────── ready + sync ──
client.once(Events.ClientReady, async (c) => {
  const rest = new REST().setToken(TOKEN);
  try {
    if (GUILD_ID) {
      const data = await rest.put(
        Routes.applicationGuildCommands(c.user.id, GUILD_ID), { body: commands });
      console.log(`✧ synced ${data.length} commands to guild ${GUILD_ID} (instant)`);
    } else {
      const data = await rest.put(
        Routes.applicationCommands(c.user.id), { body: commands });
      console.log(`✧ synced ${data.length} commands globally (can take ~1h to appear — set GUILD_ID for instant)`);
    }
  } catch (err) {
    console.error('command sync failed:', err);
  }
  console.log(`꒰ঌ logged in as ${c.user.tag} ໒꒱ — in ${c.guilds.cache.size} guild(s)`);
  await validateStoredData();
  updatePresence();
  setInterval(updatePresence, 5 * 60 * 1000); // refresh the member count every 5 min
  setInterval(runBumpReminders, 30 * 1000);
});

// "Listening to N members" — total members across every server the bot is in.
function updatePresence() {
  if (!client.user) return;
  const total = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0);
  client.user.setActivity(`${total.toLocaleString()} members`, {
    type: ActivityType.Listening,
  });
}

// On boot, make sure the channels we remembered still exist. If a hub was
// deleted, forget it (the admin should re-run /setup). Also prune temp channels
// that no longer exist so cleanup logic doesn't reference ghosts.
async function validateStoredData() {
  const configs = storage.allGuildConfigs();
  for (const [guildId, cfg] of Object.entries(configs)) {
    const hub = await client.channels.fetch(cfg.jtcChannel).catch(() => null);
    if (!hub) {
      storage.clearGuildConfig(guildId);
      console.warn(`[setup] hub channel ${cfg.jtcChannel} for guild ${guildId} is gone — cleared config. Re-run /setup there.`);
    } else {
      console.log(`[setup] hub OK for guild ${guildId}: #${hub.name} (${hub.id})`);
    }
  }
  for (const channelId of storage.allTempIds()) {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch) {
      storage.removeTemp(channelId);
      console.warn(`[cleanup] temp channel ${channelId} no longer exists — removed from data.`);
    }
  }
}

// Real-time self-heal: if a remembered hub (or a temp channel) is deleted in
// Discord, forget it immediately so stale data never lingers.
client.on(Events.ChannelDelete, (channel) => {
  const configs = storage.allGuildConfigs();
  for (const [guildId, cfg] of Object.entries(configs)) {
    if (cfg.jtcChannel === channel.id) {
      storage.clearGuildConfig(guildId);
      console.warn(`[setup] hub #${channel.name} was deleted — cleared config for guild ${guildId}.`);
    }
  }
  if (storage.isTemp(channel.id)) {
    storage.removeTemp(channel.id);
  }
});

// ───────────────────────────────────────────── voice: join-to-create ──
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member;
  const guild = newState.guild;

  // (1) voice-ban: blocked users get a single clean disconnect on join
  if (newState.channelId && storage.getBlocks(guild.id).includes(member.id)) {
    try { await member.voice.disconnect('voice-banned via /block'); } catch {}
    return;
  }

  // (2) join-to-create hub
  const cfg = storage.getGuildConfig(guild.id);
  if (cfg && newState.channelId && newState.channelId === cfg.jtcChannel) {
    console.log(`[jtc] ${member.user.tag} joined the hub in guild ${guild.id} — spawning...`);
    await spawnChannel(member, guild, cfg);
  }

  // (3) auto-cleanup: delete empty temp channels
  const left = oldState.channel;
  if (left && storage.isTemp(left.id) && left.members.size === 0) {
    storage.removeTemp(left.id);
    try { await left.delete('AirLock channel empty'); } catch {}
  }
});

async function spawnChannel(member, guild, cfg) {
  // if the stored category was deleted, create the vc without a parent rather
  // than throwing on an invalid parent id.
  let parent = null;
  if (cfg.category) {
    const cat = await client.channels.fetch(cfg.category).catch(() => null);
    parent = cat ? cat.id : null;
  }

  let ch;
  try {
    ch = await guild.channels.create({
      name: `꒰ঌ ${member.displayName}'s vc ໒꒱`.slice(0, 100),
      type: ChannelType.GuildVoice,
      parent,
      permissionOverwrites: [
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ViewChannel,
          ],
        },
      ],
      reason: 'join-to-create',
    });
  } catch (err) {
    console.error('[jtc] channel create FAILED:', err.message,
      '\n       -> the bot likely lacks the "Manage Channels" permission.');
    return;
  }

  // move them in; if this fails (usually missing "Move Members"), don't leave an
  // orphan channel sitting around — delete it and log the real reason.
  try {
    await member.voice.setChannel(ch, 'moved to their new AirLock channel');
  } catch (err) {
    console.error('[jtc] move FAILED:', err.message,
      '\n       -> the bot likely lacks the "Move Members" permission. Deleting the orphaned channel.');
    await ch.delete('could not move member — cleaning up').catch(() => {});
    return;
  }

  storage.addTemp(ch.id, member.id, guild.id);
  console.log(`[jtc] created ${ch.id} for ${member.user.tag}`);
  try {
    const { embed, file } = await panelEmbed(ch, member.user);
    await ch.send({ content: `<@${member.id}>`, embeds: [embed], files: [file], components: controlPanelRows() });
  } catch (err) {
    console.error('[jtc] panel send failed (channel still works):', err.message);
  }
}

// ───────────────────────────────────────────── interaction router ──
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) return void (await onCommand(interaction));
    if (interaction.isButton()) return void (await onButton(interaction));
    if (interaction.isUserSelectMenu()) return void (await onSelect(interaction));
    if (interaction.isModalSubmit()) return void (await onModal(interaction));
  } catch (err) {
    console.error('interaction error:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      interaction.reply({ content: 'something went wrong ｡ﾟ(ﾟ´ω`ﾟ)ﾟ｡', ephemeral: true }).catch(() => {});
    }
  }
});

// ---- slash commands ----
async function onCommand(interaction) {
  const name = interaction.commandName;
  if (name === 'setup') return cmdSetup(interaction);
  if (name === 'allow') return cmdAllow(interaction);
  if (name === 'block') return cmdBlock(interaction);
  if (name === 'unblock') return cmdUnblock(interaction);
  if (name === 'kick') return cmdKick(interaction);
  if (name === 'ban') return cmdBan(interaction);
  if (name === 'quarantine') return cmdQuarantine(interaction);
  if (name === 'unquarantine') return cmdUnquarantine(interaction);
  if (name === 'help') return cmdHelp(interaction);
  if (name === 'bounce') return cmdBounce(interaction);
  if (name === 'stopbounce') return cmdStopBounce(interaction);
}

// ---- /bounce + /stopbounce ----
async function cmdBounce(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.MoveMembers)) {
    return interaction.reply({ content: 'you need the **Move Members** permission to run this ｡ﾟ(ﾟ´ω`ﾟ)ﾟ｡', ephemeral: true });
  }
  if (isLooping) {
    return interaction.reply({ content: '❌ a voice loop is already active. stop it first with `/stopbounce`.', ephemeral: true });
  }

  const channelA = interaction.options.getChannel('channel_a');
  const channelB = interaction.options.getChannel('channel_b');
  if (channelA.id === channelB.id) {
    return interaction.reply({ content: '❌ please pick two different voice channels.', ephemeral: true });
  }

  // Defer — the loop runs well past the 3s interaction window.
  await interaction.deferReply();
  isLooping = true;
  await interaction.editReply(`🔄 loop started! bouncing members between **${channelA.name}** and **${channelB.name}** ~`);

  let source = channelA;
  let target = channelB;
  while (isLooping) {
    const currentSource = interaction.guild.channels.cache.get(source.id);
    if (!currentSource) break; // channel was deleted mid-loop

    for (const member of currentSource.members.values()) {
      if (!isLooping) break;
      if (member.voice.channelId !== source.id) continue; // left while we were mid-pass
      try {
        await member.voice.setChannel(target);
        await sleep(500); // stay under Discord's move rate limit
      } catch (err) {
        console.error(`could not move ${member.user.tag}: ${err.message}`);
      }
    }

    [source, target] = [target, source]; // swap for the next pass
    await sleep(3000);
  }
}

async function cmdStopBounce(interaction) {
  if (!isLooping) {
    return interaction.reply({ content: '❌ there is no voice loop running right now.', ephemeral: true });
  }
  isLooping = false;
  return interaction.reply('🛑 the voice channel loop has been stopped.');
}

async function cmdSetup(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({ content: 'you need **Manage Channels** to run setup ♡', ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;

  // idempotent: if we already remember a hub here and it still exists, reuse it
  // instead of piling up duplicate categories.
  const existing = storage.getGuildConfig(guild.id);
  if (existing) {
    const stillThere = await client.channels.fetch(existing.jtcChannel).catch(() => null);
    if (stillThere) {
      return interaction.editReply({
        content: `✧ already set up! join **${stillThere.name}** to make your vc ♡\n(delete that channel and run /setup again if you want a fresh one.)`,
      });
    }
    storage.clearGuildConfig(guild.id); // stored hub was deleted — rebuild below
  }

  let category, hub;
  try {
    category = await guild.channels.create({ name: CATEGORY_NAME, type: ChannelType.GuildCategory, reason: 'AirLock setup' });
    hub = await guild.channels.create({ name: HUB_NAME, type: ChannelType.GuildVoice, parent: category.id, reason: 'AirLock hub' });
  } catch (err) {
    console.error('[setup] failed to create channels:', err.message);
    return interaction.editReply({
      content: "i couldn't create the channels ｡ﾟ — make sure i have the **Manage Channels** permission and my role is high enough.",
    });
  }
  storage.setGuildConfig(guild.id, hub.id, category.id);
  console.log(`[setup] guild ${guild.id}: hub ${hub.id}, category ${category.id}`);

  const embed = new EmbedBuilder()
    .setTitle('✧ AirLock is ready! ✧')
    .setDescription(
      `join **${hub.name}** and i'll spin up your own private voice channel + a control panel ♡\n\n` +
      '**owner controls:** lock · limit · rename · status · permit · reject · claim\n' +
      '**`/allow @user`** — let someone into your locked vc (from the vc chat)\n' +
      '**`/block @user`** — admins: voice-ban someone\n')
    .setColor(EMBED_COLOR)
    .setImage('attachment://banner.png')
    .setFooter({ text: '꒰ঌ AirLock ໒꒱' });
  const file = await bannerAttachment('AirLock', '* join to create *');
  await interaction.editReply({ embeds: [embed], files: [file] });
}

async function cmdAllow(interaction) {
  const cid = interaction.channelId;
  if (!storage.isTemp(cid)) {
    return interaction.reply({ content: "use this **inside your own AirLock channel's chat** ♡", ephemeral: true });
  }
  if (!isOwner(cid, interaction.user.id)) {
    return interaction.reply({ content: 'only the channel owner can permit people ♡', ephemeral: true });
  }
  const user = interaction.options.getUser('user');
  await interaction.channel.permissionOverwrites.edit(user.id, { Connect: true, ViewChannel: true });
  return interaction.reply({ content: `➕ <@${user.id}> can now join this vc ♡` });
}

async function cmdBlock(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'only **admins / the server owner** can use this ♡', ephemeral: true });
  }
  const user = interaction.options.getUser('user');
  storage.addBlock(interaction.guild.id, user.id);
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (member?.voice?.channel) { try { await member.voice.disconnect('voice-banned via /block'); } catch {} }
  return interaction.reply({
    content: `⚠ <@${user.id}> is voice-banned. they'll be disconnected whenever they try to join a voice channel, until \`/unblock\`. ♡`,
    ephemeral: true,
  });
}

async function cmdUnblock(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: 'only **admins / the server owner** can use this ♡', ephemeral: true });
  }
  const user = interaction.options.getUser('user');
  storage.removeBlock(interaction.guild.id, user.id);
  return interaction.reply({ content: `♡ <@${user.id}> can join voice channels again.`, ephemeral: true });
}

async function cmdKick(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.KickMembers)) {
    return interaction.reply({ content: 'you need **Kick Members** to do that ♡', ephemeral: true });
  }
  const target = interaction.options.getMember('user');
  const reason = interaction.options.getString('reason');
  if (!target) return interaction.reply({ content: "that user isn't in the server ♡", ephemeral: true });
  if (target.roles.highest.position >= interaction.member.roles.highest.position && !isAdmin(interaction)) {
    return interaction.reply({ content: "you can't kick someone with an equal/higher role ♡", ephemeral: true });
  }
  try {
    await target.kick(`by ${interaction.user.tag}: ${reason || 'no reason'}`);
  } catch {
    return interaction.reply({ content: "i don't have permission to kick them (check my role position) ｡ﾟ", ephemeral: true });
  }
  return interaction.reply({ content: `🥾 kicked <@${target.id}> ♡\n**reason:** ${reason || 'no reason given'}` });
}

async function cmdBan(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) {
    return interaction.reply({ content: 'you need **Ban Members** to do that ♡', ephemeral: true });
  }
  const user = interaction.options.getUser('user');
  const target = interaction.options.getMember('user');
  const reason = interaction.options.getString('reason');
  const days = interaction.options.getInteger('delete_days') || 0;
  if (target && target.roles.highest.position >= interaction.member.roles.highest.position && !isAdmin(interaction)) {
    return interaction.reply({ content: "you can't ban someone with an equal/higher role ♡", ephemeral: true });
  }
  try {
    await interaction.guild.members.ban(user.id, {
      reason: `by ${interaction.user.tag}: ${reason || 'no reason'}`,
      deleteMessageSeconds: days * 24 * 60 * 60,
    });
  } catch {
    return interaction.reply({ content: "i don't have permission to ban them (check my role position) ｡ﾟ", ephemeral: true });
  }
  return interaction.reply({ content: `🔨 banned <@${user.id}> ♡\n**reason:** ${reason || 'no reason given'}` });
}

async function ensureQuarantineRole(guild) {
  const roleId = storage.getQuarantineRole(guild.id);
  let role = roleId ? guild.roles.cache.get(roleId) : null;
  if (role) return role;
  try {
    role = await guild.roles.create({ name: QUARANTINE_ROLE_NAME, reason: 'AirLock quarantine role' });
  } catch { return null; }
  storage.setQuarantineRole(guild.id, role.id);
  const deny = {
    ViewChannel: false, SendMessages: false, Connect: false,
    Speak: false, AddReactions: false,
  };
  for (const ch of guild.channels.cache.values()) {
    try { await ch.permissionOverwrites.edit(role, deny, { reason: 'quarantine lockdown' }); } catch {}
  }
  return role;
}

async function cmdQuarantine(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: 'you need **Manage Roles** to do that ♡', ephemeral: true });
  }
  const target = interaction.options.getMember('user');
  const reason = interaction.options.getString('reason');
  if (!target) return interaction.reply({ content: "that user isn't in the server ♡", ephemeral: true });
  if (storage.isQuarantined(interaction.guild.id, target.id)) {
    return interaction.reply({ content: `<@${target.id}> is already quarantined ♡`, ephemeral: true });
  }
  await interaction.deferReply();
  const role = await ensureQuarantineRole(interaction.guild);
  if (!role) {
    return interaction.editReply({ content: 'i couldn\'t create the quarantine role (give me **Manage Roles** & move my role up) ｡ﾟ' });
  }
  const me = interaction.guild.members.me;
  const removable = target.roles.cache.filter(
    (r) => r.id !== interaction.guild.id && !r.managed && r.position < me.roles.highest.position,
  );
  storage.stashRoles(interaction.guild.id, target.id, [...removable.keys()]);
  try {
    if (removable.size) await target.roles.remove(removable, 'quarantined');
    await target.roles.add(role, `quarantined by ${interaction.user.tag}`);
    if (target.voice?.channel) await target.voice.disconnect('quarantined');
  } catch {
    return interaction.editReply({ content: "i don't have permission to change their roles (move my role above theirs) ｡ﾟ" });
  }
  return interaction.editReply({
    content: `🚧 <@${target.id}> is quarantined — they can't see channels or talk until \`/unquarantine\`.\n**reason:** ${reason || 'no reason given'}`,
  });
}

async function cmdUnquarantine(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: 'you need **Manage Roles** to do that ♡', ephemeral: true });
  }
  const target = interaction.options.getMember('user');
  if (!target || !storage.isQuarantined(interaction.guild.id, target.id)) {
    return interaction.reply({ content: "that user isn't quarantined ♡", ephemeral: true });
  }
  await interaction.deferReply();
  const roleId = storage.getQuarantineRole(interaction.guild.id);
  const role = roleId ? interaction.guild.roles.cache.get(roleId) : null;
  const saved = storage.popRoles(interaction.guild.id, target.id);
  const restore = saved.map((rid) => interaction.guild.roles.cache.get(rid)).filter(Boolean);
  try {
    if (role && target.roles.cache.has(role.id)) await target.roles.remove(role, 'unquarantined');
    if (restore.length) await target.roles.add(restore, 'unquarantined — roles restored');
  } catch {
    return interaction.editReply({ content: "i couldn't restore their roles (check my permissions) ｡ﾟ" });
  }
  return interaction.editReply({ content: `♡ <@${target.id}> has been released from quarantine.` });
}

async function cmdHelp(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('✧ AirLock · help ✧')
    .setDescription('everything i can do, all in one cozy place ♡\n​')
    .setColor(EMBED_COLOR)
    .addFields(
      {
        name: '🎀 voice channels',
        value:
          '`/setup` · build the join-to-create hub *(admin)*\n' +
          'join the hub · get your own vc + control panel\n' +
          '`/allow @user` · let a friend into your vc *(owner)*\n' +
          '**panel:** lock · limit · rename · status · permit · reject · claim · delete',
      },
      {
        name: '🛡️ moderation',
        value:
          '`/kick @user [reason]` · *(Kick Members)*\n' +
          '`/ban @user [reason] [delete_days]` · *(Ban Members)*\n' +
          '`/quarantine @user [reason]` · isolate someone *(Manage Roles)*\n' +
          '`/unquarantine @user` · release them\n' +
          '`/block @user` · voice-ban · `/unblock @user` · lift it *(admin)*',
      },
      {
        name: '🔔 extras',
        value:
          'auto **bump reminders** — i ping the bumper 2h after each DISBOARD bump\n' +
          '`/help` · this menu',
      },
    )
    .setImage('attachment://banner.png')
    .setFooter({ text: '꒰ঌ AirLock ໒꒱ · be kind, stay cozy' });
  const file = await bannerAttachment('AirLock', '* help menu *');
  return interaction.reply({ embeds: [embed], files: [file] });
}

// ---- panel buttons ----
async function panelGuard(interaction) {
  const cid = interaction.channelId;
  if (!storage.isTemp(cid)) {
    await interaction.reply({ content: "this isn't an active AirLock channel anymore ♡", ephemeral: true });
    return false;
  }
  if (!isOwner(cid, interaction.user.id)) {
    await interaction.reply({ content: 'only the channel owner can use this ｡ﾟ(ﾟ´ω`ﾟ)ﾟ｡ (ask them, or 👑 claim if they left)', ephemeral: true });
    return false;
  }
  return true;
}

async function onButton(interaction) {
  const id = interaction.customId;
  const ch = interaction.channel;

  if (id === 'vc:claim') {
    if (!storage.isTemp(ch.id)) return interaction.reply({ content: "this isn't an active AirLock channel ♡", ephemeral: true });
    const members = ch.members;
    const current = storage.getTemp(ch.id).owner;
    if (members.has(String(current))) return interaction.reply({ content: "the owner is still here — you can't claim it ♡", ephemeral: true });
    if (!members.has(interaction.user.id)) return interaction.reply({ content: 'you need to be in the channel to claim it ♡', ephemeral: true });
    storage.setOwner(ch.id, interaction.user.id);
    return interaction.reply({ content: `👑 <@${interaction.user.id}> is the new owner! ♡` });
  }

  if (!(await panelGuard(interaction))) return;

  if (id === 'vc:lock') {
    const rec = storage.getTemp(ch.id);
    const newlyLocked = !(rec && rec.locked);
    await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: newlyLocked ? false : null });
    storage.setLocked(ch.id, newlyLocked);
    return interaction.reply({
      content: newlyLocked ? '🔒 locked — only permitted people can join now ♡' : '🔓 unlocked — anyone can join again ♡',
      ephemeral: true,
    });
  }
  if (id === 'vc:limit') {
    const modal = new ModalBuilder().setCustomId('modal:limit').setTitle('set user limit ♡')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('value').setLabel('how many people? (0 = no limit)')
          .setPlaceholder('e.g. 5').setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(true)));
    return interaction.showModal(modal);
  }
  if (id === 'vc:rename') {
    const modal = new ModalBuilder().setCustomId('modal:rename').setTitle('rename your vc ♡')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('value').setLabel('new name')
          .setPlaceholder('꒰ঌ moon lounge ໒꒱').setStyle(TextInputStyle.Short).setMaxLength(90).setRequired(true)));
    return interaction.showModal(modal);
  }
  if (id === 'vc:status') {
    const modal = new ModalBuilder().setCustomId('modal:status').setTitle('set channel status ♡')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('value').setLabel('status text')
          .setPlaceholder('chilling ~ come vibe').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(false)));
    return interaction.showModal(modal);
  }
  if (id === 'vc:permit') {
    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder().setCustomId('select:permit').setPlaceholder('pick a friend to let in ♡').setMinValues(1).setMaxValues(5));
    return interaction.reply({ content: 'who should be let in? ♡', components: [row], ephemeral: true });
  }
  if (id === 'vc:reject') {
    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder().setCustomId('select:reject').setPlaceholder('pick who to remove ♡').setMinValues(1).setMaxValues(5));
    return interaction.reply({ content: 'who should be removed & kept out?', components: [row], ephemeral: true });
  }
  if (id === 'vc:delete') {
    await interaction.reply({ content: 'closing your channel… ♡', ephemeral: true });
    storage.removeTemp(ch.id);
    try { await ch.delete('owner closed their AirLock channel'); } catch {}
  }
}

// ---- modals ----
async function onModal(interaction) {
  const ch = interaction.channel;
  if (!storage.isTemp(ch.id) || !isOwner(ch.id, interaction.user.id)) {
    return interaction.reply({ content: 'only the channel owner can do that ♡', ephemeral: true });
  }
  const value = interaction.fields.getTextInputValue('value');

  if (interaction.customId === 'modal:limit') {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return interaction.reply({ content: 'numbers only ♡', ephemeral: true });
    const clamped = Math.max(0, Math.min(99, n));
    await ch.setUserLimit(clamped);
    return interaction.reply({ content: `👥 limit set to **${clamped || '∞'}** ♡`, ephemeral: true });
  }
  if (interaction.customId === 'modal:rename') {
    const name = value.trim().slice(0, 90);
    await ch.setName(name);
    return interaction.reply({ content: `✏️ renamed to **${name}** ♡`, ephemeral: true });
  }
  if (interaction.customId === 'modal:status') {
    const text = value.trim().slice(0, 100) || null;
    try {
      await setVoiceStatus(ch.id, text);
      return interaction.reply({ content: text ? `💬 status set to *${text}* ♡` : '💬 status cleared ♡', ephemeral: true });
    } catch {
      return interaction.reply({ content: 'couldn\'t set the status (check my perms) ｡ﾟ', ephemeral: true });
    }
  }
}

// ---- user-select menus ----
async function onSelect(interaction) {
  const ch = interaction.channel;
  if (!storage.isTemp(ch.id) || !isOwner(ch.id, interaction.user.id)) {
    return interaction.update({ content: 'only the channel owner can do that ♡', components: [] });
  }
  if (interaction.customId === 'select:permit') {
    const names = [];
    for (const user of interaction.users.values()) {
      await ch.permissionOverwrites.edit(user.id, { Connect: true, ViewChannel: true });
      names.push(`<@${user.id}>`);
    }
    return interaction.update({ content: `➕ let in: ${names.join(', ')} ♡`, components: [] });
  }
  if (interaction.customId === 'select:reject') {
    const names = [];
    for (const user of interaction.users.values()) {
      if (isOwner(ch.id, user.id)) continue;
      await ch.permissionOverwrites.edit(user.id, { Connect: false });
      const m = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (m?.voice?.channel?.id === ch.id) { try { await m.voice.disconnect('rejected from AirLock channel'); } catch {} }
      names.push(`<@${user.id}>`);
    }
    return interaction.update({ content: `➖ removed & blocked from this vc: ${names.join(', ') || 'nobody'} ♡`, components: [] });
  }
}

// ───────────────────────────────────────────── bump reminders ──
client.on(Events.MessageCreate, (message) => {
  if (message.author.id !== DISBOARD_ID || !message.embeds.length) return;
  const desc = (message.embeds[0].description || '').toLowerCase();
  if (!desc.includes('bump done') && !desc.includes('👍')) return;
  const bumper = message.interactionMetadata?.user || message.interaction?.user || null;
  storage.setBump(message.guild.id, message.channel.id, bumper ? bumper.id : 0, Date.now() + BUMP_COOLDOWN);
});

async function runBumpReminders() {
  for (const [guildId, rec] of storage.dueBumps(Date.now())) {
    storage.markBumpDone(guildId);
    const channel = client.channels.cache.get(rec.channel) || await client.channels.fetch(rec.channel).catch(() => null);
    if (!channel) continue;
    const who = rec.user ? `<@${rec.user}>` : '@here';
    const embed = new EmbedBuilder()
      .setTitle('🔔 bump time! ♡')
      .setDescription(`${who} it's been 2 hours — the server can be bumped again ✧\nrun **/bump** to keep us climbing the list ~`)
      .setColor(EMBED_COLOR)
      .setFooter({ text: '꒰ঌ AirLock ໒꒱' });
    try { await channel.send({ content: who, embeds: [embed] }); } catch {}
  }
}

// ───────────────────────────────────────────── thank-you on join ──
client.on(Events.GuildCreate, async (guild) => {
  updatePresence(); // new server -> refresh the member count
  let channel = guild.systemChannel;
  if (!channel || !channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)) {
    channel = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages));
  }
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setTitle('✧ thank you for adding AirLock! ✧')
    .setDescription(
      "hi hi~ i'm your soft little voice + moderation helper ♡\n\n" +
      '**to get started:** an admin runs **/setup** to build the join-to-create hub, then everyone can hop in and make their own vc ✧\n\n' +
      'type **/help** any time to see everything i can do ~')
    .setColor(EMBED_COLOR)
    .setImage('attachment://banner.png')
    .setFooter({ text: '꒰ঌ AirLock ໒꒱ · be kind, stay cozy' });
  const file = await bannerAttachment('thank you', '* for adding me *');
  try { await channel.send({ embeds: [embed], files: [file] }); } catch {}
});

// removed from a server -> refresh the member count
client.on(Events.GuildDelete, () => updatePresence());

// ───────────────────────────────────────────── run ──
if (!TOKEN) {
  console.error('Set DISCORD_TOKEN in .env (see .env.example / README).');
  process.exit(1);
}


client.login(TOKEN);
