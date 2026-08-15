const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js')
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice')
const fetch = require('node-fetch')
const config = require('./config.json')
config.token = process.env.TOKEN || config.token
config.ownerId = config.ownerId || []

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
})

const BANNED_WORDS = [
  'nigger', 'nigga', 'n1gger', 'n1gga', 'nig3r', 'nigg3r', 'niqqa',
  'kike', 'spic', 'chink', 'gook', 'wetback', 'beaner', 'coon', 'darkie'
]

const warnings = new Map()
const BAN_GIF = 'https://static2.klipy.com/ii/4493325008d34b7bf8cd6813cd5c1619/1e/71/dvNCD0tKdZUYAUPtRv25.gif'
const PING_GIF = 'https://static2.klipy.com/ii/4e7bea9f7a3371424e6c16ebc93252fe/21/75/3SSjenP2r2gAlOnXn.gif'

let chatRoleId = null
const BOT_ID = '1536894184303362148'
let botPaused = false

const GENERAL_CHANNEL_ID = '1536525463407829042'
const ASK_TO_DM_CHANNEL = '1536849317619302491'

const userMsgHistory = new Map()

const ALLOWED_GUILD_ID = '1535720344776609955'

async function notifyOwners(guild, msg) {
  for (const ownerId of config.ownerId) {
    const owner = await guild.members.fetch(ownerId).catch(() => null)
    if (owner) await owner.send(msg).catch(() => {})
  }
}

client.on(Events.GuildCreate, async (guild) => {
  if (guild.id !== ALLOWED_GUILD_ID) {
    console.log(`Added to unknown server: ${guild.name} (${guild.id}), leaving...`)
    await guild.leave()
  }
})

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const pendingRole = member.guild.roles.cache.find(r => r.name === 'Pending')
    if (pendingRole) {
      await member.roles.add(pendingRole.id, 'Unverified - pending verification')
      console.log(`Assigned Pending role to ${member.user.tag}`)
    }
    // Welcome message
    const welcomeChan = member.guild.channels.cache.get('1536439310973411420')
    if (welcomeChan) {
      const memberCount = member.guild.memberCount
      await welcomeChan.send(`👋 Welcome ${member} to Midnight Lounge! We are so glad you joined us. You are our ${memberCount}th member! Make sure to check out the rules and enjoy your stay. 🎉`)
    }
  } catch (e) {
    console.error('Failed to assign Pending role:', e.message)
  }
})

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    const welcomeChan = member.guild.channels.cache.get('1536439310973411420')
    if (welcomeChan) {
      const memberCount = member.guild.memberCount
      await welcomeChan.send(`👋 **${member.user.username}** left Midnight Lounge. We are now **${memberCount}** members. 😔`)
    }
  } catch (e) {
    console.error('Goodbye message error:', e.message)
  }
})

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return
  if (message.channel.id === VERIFY_CHANNEL) return

  const content = message.content.toLowerCase()
  const userId = message.author.id
  const isBotPing = content.includes(`<@${BOT_ID}>`) || content.includes(`<@!${BOT_ID}>`)

  // Kill switch: anyone above moderator pings @Weeping + "stop" -> bot pauses
  if (isBotPing && content.includes('stop')) {
    const guild = message.guild
    const memberRoles = message.member.roles.cache
    const modRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'moderator' || r.name.toLowerCase() === 'mod' || r.permissions.has('ModerateMembers'))
    const hasHigherRole = modRole && memberRoles.some(r => r.position > modRole.position)
    const isAdmin = message.member.permissions.has('Administrator')

    if (hasHigherRole || isAdmin) {
      botPaused = true
      await message.channel.send({
        content: 'Shutting Down',
        files: ['https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExbml5N2puZG90ZTE0cGl0MmR4b3R5MHkwdDNjZXBwd3h6ODVlejdqayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/AHP7Svoc9ma8MJEnlI/giphy.gif']
      })
      console.log(`Bot paused by ${message.author.tag}`)
      return
    }
  }

  // Owner only: ping @Weeping + "start" -> bot resumes
  if (isBotPing && content.includes('start') && config.ownerId.includes(userId)) {
    botPaused = false
    await message.channel.send({ content: 'Starting Up', files: [{ attachment: 'https://static2.klipy.com/ii/d6b0ce929193df3c242ac34b5654d2ce/ae/32/ok0Bjf3w.gif', name: 'start.gif' }] })
    console.log(`Bot resumed by ${message.author.tag}`)
    return
  }

  // Owner only: ping @Weeping + "update" -> post site update announcement
  if (isBotPing && content.includes('update') && config.ownerId.includes(userId)) {
    const fixesRaw = message.content.replace(/<@!?\d+>/g, '').replace(/update/i, '').trim()
    if (!fixesRaw) return
    const fixes = fixesRaw.split('\n').filter(f => f.trim())
    const formatted = fixes.map((f, i) => {
      const prefix = i === fixes.length - 1 ? '└──' : '├──'
      return `${prefix} ${f.trim()}`
    }).join('\n')
    const announceChan = client.channels.cache.get('1536938737093709874')
    if (announceChan) {
      const announceMsg = await announceChan.send(`✨ **Site Updated** ✨\n\n@everyone\n\n📝 **Changes:**\n${formatted}\n\n🔗 **Check it out:** https://booru-search.vercel.app`)
      await announceChan.send({
        files: ['https://static2.klipy.com/ii/f87f46a2c5aeaeed4c68910815f73eaf/49/5e/NCYawwmE.gif']
      })
      console.log(`Site update announced by ${message.author.tag}`)
    }
    return
  }

  // Owner only: ping @Weeping + "giveaway" + link -> post giveaway announcement
  if (isBotPing && content.includes('giveaway') && userId === '1130704176909930516') {
    const link = message.content.replace(/<@!?\d+>/g, '').replace(/giveaway/i, '').trim()
    const announceChan = client.channels.cache.get('1536938737093709874')
    if (announceChan) {
      const giveawayMsg = link
        ? `🎁 **GIVEAWAY** 🎁\n\n@everyone\n\nClick the link below to enter!\n\n${link}`
        : `🎁 **GIVEAWAY** 🎁\n\n@everyone\n\nClick the link below to enter!`
      await announceChan.send({
        content: giveawayMsg,
        files: ['https://static2.klipy.com/ii/4493325008d34b7bf8cd6813cd5c1619/70/00/Sykpgdnp6DHh4Rp22W.gif']
      })
      console.log(`Giveaway announced by ${message.author.tag}`)
    }
    return
  }

  // Owner only: reply to someone + "cease" -> 3 min timeout
  if (content === 'cease' && message.reference && userId === '1130704176909930516') {
    try {
      const replied = await message.channel.messages.fetch(message.reference.messageId)
      if (replied && replied.member?.moderatable) {
        await replied.member.timeout(3 * 60 * 1000, 'Owner said cease')
        await message.channel.send({
          content: `${replied.author}, Is Gone For Now.`,
          files: [BAN_GIF]
        })
        await notifyOwners(message.guild, `🔇 **${replied.author.username}** timed out for **3 min**\nReason: Owner said cease\nChannel: <#${message.channel.id}>\nMessage: ||${replied.content}||`)
        console.log(`Timed out ${replied.author.tag} for 3min (cease) in #${message.channel.name}`)
      }
    } catch (e) {
      console.error('Cease error:', e.message)
    }
    return
  }

  // Everything else blocked when paused
  if (botPaused) return

  if (!message.member?.moderatable) return

  // Pinging Weeping bot -> 10 min timeout every time
  if (isBotPing) {
    try {
      await message.delete()
      await message.member.timeout(10 * 60 * 1000, 'Pinged Weeping bot')
      await notifyOwners(message.guild, `🔇 **${message.author.username}** timed out for **10 min**\nReason: Pinged Weeping bot\nChannel: <#${message.channel.id}>\nMessage: ||${message.content}||`)
      const warnMsg = await message.channel.send({
        content: `${message.author}, Is Gone For Now. Don't ping Weeping.`,
        files: [PING_GIF]
      })
      setTimeout(() => warnMsg.delete().catch(() => {}), 8000)
      console.log(`Muted ${message.author.tag} for 10min (pinged bot) in #${message.channel.name}`)
    } catch (e) {
      console.error('Bot ping moderation error:', e.message)
    }
    return
  }

  // Racist slurs -> 3 strikes then timeout
  if (BANNED_WORDS.some(w => content.includes(w))) {
    try {
      await message.delete()

      const count = (warnings.get(userId) || 0) + 1
      warnings.set(userId, count)

      if (count >= 3) {
        await message.member.timeout(60 * 60 * 1000, 'Racist slurs - 3 strikes')
        await message.author.send(`You have been timed out for **1 hour** in **Midnight Lounge**.\n\n**Reason:** Racist slurs (3 strikes)\n**Channel:** <#${message.channel.id}>\n**Message:** ||${message.content}||`).catch(() => {})
        await message.channel.send({
          content: `${message.author}, Is Gone For Now.`,
          files: [BAN_GIF]
        })
        await notifyOwners(message.guild, `🔇 **${message.author.username}** timed out for **1 hour**\nReason: Racist slurs (3 strikes)\nChannel: <#${message.channel.id}>\nMessage: ||${message.content}||`)
        warnings.delete(userId)
        console.log(`Timed out ${message.author.tag} for 1hr in #${message.channel.name} (3 strikes)`)
      } else {
        const warnMsg = await message.channel.send(`${message.author}, strike ${count}/3. Keep it up and you're timed out.`)
        await message.author.send(`You received strike **${count}/3** in **Midnight Lounge** for racist slurs. 3 strikes = 1 hour timeout.`).catch(() => {})
        setTimeout(() => warnMsg.delete().catch(() => {}), 5000)
        console.log(`Warning ${count}/3 for ${message.author.tag} in #${message.channel.name}`)
      }
    } catch (e) {
      console.error('Moderation error:', e.message)
    }
    return
  }

  // Spam detection: mass links or repeated messages
  const urlCount = (content.match(/https?:\/\//g) || []).length
  const mentionCount = (content.match(/<@!?\d+>/g) || []).length
  const now = Date.now()

  if (!userMsgHistory.has(userId)) userMsgHistory.set(userId, [])
  const history = userMsgHistory.get(userId)
  history.push({ content, time: now })
  while (history.length > 10) history.shift()

  const recentMsgs = history.filter(m => now - m.time < 5000)
  const recentUrls = recentMsgs.reduce((acc, m) => acc + (m.content.match(/https?:\/\//g) || []).length, 0)

  const isSpam = urlCount >= 4 || recentUrls >= 5 || mentionCount >= 4
  const isRepeated = recentMsgs.length >= 4 && recentMsgs.every(m => m.content === recentMsgs[0].content)

  if (isSpam || isRepeated) {
    try {
      await message.delete()
      await message.member.timeout(10 * 60 * 1000, 'Spam / mass links / mass pings')
      await notifyOwners(message.guild, `🔇 **${message.author.username}** timed out for **10 min**\nReason: Spam / mass links / mass pings\nChannel: <#${message.channel.id}>\nMessage: ||${message.content}||`)
      const warnMsg = await message.channel.send({
        content: `${message.author}, Is Gone For Now`,
        files: [BAN_GIF]
      })
      setTimeout(() => warnMsg.delete().catch(() => {}), 8000)
      console.log(`Muted ${message.author.tag} for 10min (spam) in #${message.channel.name}`)
      history.length = 0
    } catch (e) {
      console.error('Spam moderation error:', e.message)
    }
    return
  }

  // Ask to DM channel: selling/hiring/spam -> 5 min timeout
  if (message.channel.id === ASK_TO_DM_CHANNEL) {
    const dmSpam = /\b(selling|selling?d|hiring|hired|whatsapp|telegram|snapchat|cashapp|paypal|venmo|price|prices|cheap|discount|offer|services?)\b/i.test(content)
    if (dmSpam) {
      try {
        await message.delete()
        await message.member.timeout(5 * 60 * 1000, 'Selling/hiring spam in ask-to-dm')
        await message.author.send(`You have been timed out for **5 minutes** in **Midnight Lounge**.\n\n**Reason:** Selling/hiring/spam in #ask-to-dm\n**Channel:** <#${message.channel.id}>`).catch(() => {})
        const warnMsg = await message.channel.send({
          content: `${message.author}, Is Gone For Now.`,
          files: [BAN_GIF]
        })
        setTimeout(() => warnMsg.delete().catch(() => {}), 8000)
        console.log(`Timed out ${message.author.tag} for 5min (selling/hiring) in #${message.channel.name}`)
      } catch (e) {
        console.error('Ask-to-DM moderation error:', e.message)
      }
      return
    }
  }
})

const DISBOARD_ID = '303910943417448449'
const DISBOARD_CHANNEL = '1536426892058689667'

client.on(Events.MessageCreate, async (message) => {
  if (message.author.id !== DISBOARD_ID) return
  if (message.channel.id !== DISBOARD_CHANNEL) return
  if (!message.content.toLowerCase().includes('bump')) return

  const delay = Math.floor(Math.random() * (10 - 2 + 1) + 2) * 60 * 1000
  console.log(`Disboard bump request detected in #${message.channel.name}, waiting ${delay / 60000} minutes...`)

  setTimeout(async () => {
    try {
      await message.channel.send('/bump')
      console.log(`Sent /bump in #${message.channel.name}`)
    } catch (e) {
      console.error('Disboard bump error:', e.message)
    }
  }, delay)
})

const VERIFY_CHANNEL = '1536965689334829257'

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return
  if (message.channel.id !== VERIFY_CHANNEL) return
  const content = message.content.toLowerCase().trim()

  // Wrong spelling — delete and DM them
  if (content !== '/verify' && content !== 'verify') {
    try { await message.delete() } catch (e) {}
    await message.author.send('❌ You spelled it wrong. Type `verify` to verify.').catch(() => {})
    return
  }

  const member = message.member
  if (!member) return

  const pendingRole = member.guild.roles.cache.find(r => r.name === 'Pending')
  if (!pendingRole) return

  const hasPending = member.roles.cache.has(pendingRole.id)
  const hasChat = chatRoleId && member.roles.cache.has(chatRoleId)

  // Already verified
  if (hasChat && !hasPending) {
    try { await message.delete() } catch (e) {}
    return
  }

  try {
    if (!chatRoleId) {
      console.error('Verify error: chatRoleId is null')
      return
    }
    // Delete their verify message
    try { await message.delete() } catch (e) {}
    // Add chat role
    await member.roles.add(chatRoleId, 'Verified')
    // Remove Pending if they have it
    if (hasPending) await member.roles.remove(pendingRole.id, 'Verified')
    // DM them
    await member.send('✅ You\'ve been verified! Welcome to the server.').catch(() => {})
    // DM owner
    for (const ownerId of config.ownerId) {
      const owner = await member.guild.members.fetch(ownerId).catch(() => null)
      if (owner) await owner.send(`✅ **${member.user.username}** just verified!`).catch(() => {})
    }
    // Remove access to verify channel
    const verifyChan = member.guild.channels.cache.get(VERIFY_CHANNEL)
    if (verifyChan) {
      await verifyChan.permissionOverwrites.edit(member.id, { ViewChannel: false }).catch(() => {})
    }
    // Announce in verify channel
    const announceMsg = await message.channel.send(`✅ ${member.user} verified! Welcome!`)
    setTimeout(() => announceMsg.delete().catch(() => {}), 2000)
    console.log(`Verified ${member.user.tag}`)
  } catch (e) {
    console.error('Verify error:', e.message)
  }
})

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return
  const content = message.content.trim()
  if (!content.toLowerCase().startsWith('w.r34')) return

  const tags = content.slice(5).trim()
  if (!tags) {
    await message.reply('Usage: `w.r34 <tags>`')
    return
  }

  const { AttachmentBuilder } = require('discord.js')

  try {
    await message.channel.sendTyping()
    const res = await fetch(`https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${encodeURIComponent(tags)}&limit=20&json=1&api_key=08118c8a498c85ec8daacf95ba116e9e1a1a899b2b2c400448fecf1534dabf50449e074b8dbc3f05bef80220e4e36a891912b93436175f4481f52a6c56bbeb9e&user_id=6356082`)
    if (!res.ok) {
      await message.reply('Failed to fetch from Rule34.')
      return
    }
    const text = await res.text()
    let allPosts = []
    try { allPosts = JSON.parse(text) } catch {}
    if (!Array.isArray(allPosts)) allPosts = []

    const imagePosts = allPosts.filter(p => {
      if (!p.file_url) return false
      const ext = p.file_url.split('.').pop().toLowerCase()
      return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
    }).slice(0, 5)

    const videoPosts = allPosts.filter(p => {
      if (!p.file_url) return false
      const ext = p.file_url.split('.').pop().toLowerCase()
      return ['mp4', 'webm', 'mov'].includes(ext)
    }).slice(0, 5)

    const posts = [...imagePosts, ...videoPosts].slice(0, 5)

    if (posts.length === 0) {
      await message.reply('No results found.')
      return
    }

    const links = posts.map((p, i) => {
      const ext = p.file_url.split('.').pop().toLowerCase()
      const isVideo = ['mp4', 'webm', 'mov'].includes(ext)
      const source = p.source || p.file_url
      return `**Content ${i + 1}** | [Source](${source})`
    }).join('\n')

    const attachments = []
    const files = []
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i]
      const ext = p.file_url.split('.').pop().toLowerCase()
      const isVideo = ['mp4', 'webm', 'mov'].includes(ext)
      if (isVideo) continue
      try {
        const imgRes = await fetch(p.sample_url || p.file_url)
        if (!imgRes.ok) continue
        const buffer = Buffer.from(await imgRes.arrayBuffer())
        const fileName = `r34_${i + 1}.${ext}`
        files.push(new AttachmentBuilder(buffer, { name: fileName }))
      } catch (e) {
        console.error(`Failed to fetch image ${i}:`, e.message)
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0xd4a832)
      .setTitle('18+ Rule34')
      .setDescription(`**Tags:** \`${tags}~\`\n\n${links}`)
      .setFooter({ text: `${allPosts.length} total results • showing ${posts.length}` })
      .setTimestamp()

    await message.reply({ embeds: [embed], files })
  } catch (e) {
    console.error('w.r34 error:', e.message)
    await message.reply('Error searching Rule34.')
  }
})

const fs = require('fs')
const path = require('path')
const CACHE_FILE = path.join(__dirname, 'posted-cache.json')

let postedCache = new Set()
try {
  if (fs.existsSync(CACHE_FILE)) {
    const arr = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
    postedCache = new Set(arr)
    console.log(`Loaded ${postedCache.size} cached video IDs`)
  }
} catch (e) {
  console.error('Failed to load cache:', e.message)
}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify([...postedCache]))
  } catch (e) {
    console.error('Failed to save cache:', e.message)
  }
}

let redgifsToken = null
let redgifsRateLimitUntil = 0

async function getRedgifsToken() {
  try {
    const res = await fetch('https://api.redgifs.com/v2/auth/temporary', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.token || null
  } catch (e) {
    console.error('Error getting Redgifs token:', e.message)
    return null
  }
}

async function rgFetch(url) {
  if (Date.now() < redgifsRateLimitUntil) return null
  if (!redgifsToken) redgifsToken = await getRedgifsToken()
  if (!redgifsToken) return null

  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + redgifsToken, 'User-Agent': 'Mozilla/5.0' }
  })
  if (res.status === 401) {
    redgifsToken = await getRedgifsToken()
    if (!redgifsToken) return null
    return fetch(url, {
      headers: { 'Authorization': 'Bearer ' + redgifsToken, 'User-Agent': 'Mozilla/5.0' }
    })
  }
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}))
    const delay = (body.error?.delay || 300) * 1000
    redgifsRateLimitUntil = Date.now() + delay
    console.log(`Rate limited for ${Math.round(delay / 1000)}s, sleeping until rate limit resets`)
    return null
  }
  return res
}

async function getRandomVideo(query, channelConfig) {
  // Rule34 source
  if (channelConfig.source === 'rule34') {
    try {
      const res = await fetch(`https://rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${encodeURIComponent(query)}&limit=50&json=1`)
      if (!res.ok) return null
      const posts = await res.json()
      if (!posts || posts.length === 0) return null
      const video = posts[Math.floor(Math.random() * posts.length)]
      return { id: String(video.id), url: video.file_url, type: video.type, tags: video.tags.split(' ') }
    } catch (e) {
      console.error('Rule34 error:', e.message)
      return null
    }
  }

  // Redgifs source (default)
  const searchRes = await rgFetch(
    `https://api.redgifs.com/v2/gifs/search?search=${encodeURIComponent(query)}&count=20&type=a`
  )
  if (!searchRes || !searchRes.ok) return null
  const searchData = await searchRes.json()
  if (!searchData.gifs || searchData.gifs.length === 0) return null

  const excludeTags = (channelConfig.excludeTags || []).map(t => t.toLowerCase())
  const channelTags = (channelConfig.tags || []).map(t => t.toLowerCase())
  const videos = searchData.gifs.filter(g => {
    if (!g.urls?.hd && !g.urls?.sd) return false
    const tags = (g.tags || []).map(t => t.toLowerCase())
    if (tags.some(t => ['male', 'dick', 'penis', 'solo male', 'man', 'trans', 'transgender', 'shemale', 'futanari', 'crossdresser', 'gay', 'bisexual', 'boy', 'twink', 'bear', 'muscle', 'blowjob', 'handjob', 'cum', 'cumshot', 'facial', 'fuck', 'fucking', 'sex'].includes(t))) return false
    if (excludeTags.some(et => tags.includes(et))) return false
    const hasChannelTag = channelTags.some(ct => tags.some(t => t.includes(ct) || ct.includes(t)))
    if (!hasChannelTag) return false
    return true
  })
  if (videos.length === 0) return null
  return videos[Math.floor(Math.random() * videos.length)]
}

async function postToChannel(channelId, channelConfig) {
  const channel = client.channels.cache.get(channelId)
  if (!channel) {
    console.error(`Channel ${channelId} not found`)
    return
  }

  // Fetch recent messages to check for duplicates
  let recentUrls = []
  try {
    const messages = await channel.messages.fetch({ limit: 20 })
    recentUrls = messages.map(m => m.content).filter(c => c.includes('redgifs.com')).join(' ')
  } catch (e) {}

  const tagList = Array.isArray(channelConfig.tags) ? channelConfig.tags : [channelConfig.tags]

  for (let attempt = 0; attempt < 2; attempt++) {
    const tags = tagList[Math.floor(Math.random() * tagList.length)]
    const video = await getRandomVideo(tags, channelConfig)

    if (!video) {
      await new Promise(r => setTimeout(r, 10000))
      continue
    }

    if (postedCache.has(video.id)) {
      await new Promise(r => setTimeout(r, 5000))
      continue
    }

    // Check if video was already posted recently
    if (recentUrls.includes(video.id)) {
      postedCache.add(video.id)
      saveCache()
      await new Promise(r => setTimeout(r, 5000))
      continue
    }

    postedCache.add(video.id)
    saveCache()
    if (postedCache.size > 5000) {
      const arr = [...postedCache]
      for (let i = 0; i < 2500; i++) postedCache.delete(arr[i])
      saveCache()
    }

    const videoUrl = video.url || video.urls?.hd || video.urls?.sd || `https://www.redgifs.com/watch/${video.id}`
    const duration = video.duration ? Math.round(video.duration) + 's' : ''

    await channel.send(`${channelConfig.label} | ${duration}\n${videoUrl}`)
    console.log(`Posted to #${channel.name}: ${video.id}`)
    return
  }

  console.error(`No videos found for channel ${channelConfig.label} after 2 attempts`)
}

client.on('ready', async () => {
  console.log(`Bot logged in as ${client.user.tag}`)

  let chatRole = null
  const guild = client.guilds.cache.first()
  if (guild) {
    chatRole = guild.roles.cache.find(r => r.name === 'chat')
    if (!chatRole) {
      chatRole = await guild.roles.create({ name: 'chat', color: '#5865F2', reason: 'Auto role for chat revive pings' })
      console.log('Created "chat" role')
    }
    chatRoleId = chatRole.id
    console.log(`Chat role ID: ${chatRole.id}`)

    // Join voice channel
    const voiceChannel = guild.channels.cache.get('1535720346412650620')
    if (voiceChannel) {
      try {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator
        })
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
            ])
          } catch {
            connection.destroy()
          }
        })
        console.log(`Joined voice channel: ${voiceChannel.name}`)
      } catch (e) {
        console.error('Voice join error:', e.message)
      }
    }
  }

  let posting = false

  async function postCycle() {
    if (posting) return
    posting = true
    for (const [channelId, channelConfig] of Object.entries(config.channels)) {
      await postToChannel(channelId, channelConfig).catch(e => console.error(`Error posting to ${channelId}:`, e.message))
      await new Promise(r => setTimeout(r, 30000))
    }
    posting = false
  }

  postCycle()

  setInterval(async () => {
    if (botPaused) return
    await postCycle()
  }, config.postIntervalSeconds * 1000)

  if (config.generalChannelId && config.reviveIntervalSeconds) {
    const ping = chatRole ? `<@&${chatRole.id}>` : '@everyone'
    const reviveMessages = [
      `${ping} revive`,
      `${ping} wake up`,
      `${ping} stop being dead`,
      `${ping} yall sleeping?`,
      `${ping} hello??`,
      `${ping} anyone alive`,
      `${ping} this chat is dusty af`,
      `${ping} touch grass and come back`,
      `${ping} last one to type is gay`,
      `${ping} say something or im posting cringe`,
      `${ping} bored af someone talk`,
      `${ping} if you dont type in 5 seconds youre gay`,
      `${ping} post pics of ur feet (no homo)`,
      `${ping} whats everyone watching rn`,
      `${ping} what u guys doing`,
      `${ping} drop ur best gif`,
      `${ping} the server is dying do something`,
      `${ping} i dare someone to say something`,
      `${ping} this is awkward`,
      `${ping} say hi if u exist`,
      `${ping} type or im banning everyone`,
      `${ping} prove youre not bots`,
      `${ping} first person to reply gets a cookie`,
      `${ping} tell me a joke`,
      `${ping} i see you lurking 👀`,
      `${ping} <@1130704176909930516> Didn't Make Me For You Guys To Not Talk.`
    ]
    setInterval(() => {
      if (botPaused) return
      const channel = client.channels.cache.get(config.generalChannelId)
      if (channel) {
        const msg = reviveMessages[Math.floor(Math.random() * reviveMessages.length)]
        channel.send(msg).catch(e => console.error('Revive ping error:', e.message))
        console.log(`Sent revive ping to #${channel.name}`)
      }
    }, config.reviveIntervalSeconds * 1000)
  }
})

client.login(config.token)
