const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, downloadContentFromMessage } = require("@whiskeysockets/baileys");
const P = require("pino");
const yts = require("yt-search");
const axios = require("axios");
const path = require("path");
const os = require("os");
const readline = require("readline");
const FormData = require("form-data");
const { exec } = require("child_process");
const fs = require('fs');
const SENT_FILE = './connection_sent.txt';
const util = require("util");
const execAsync = util.promisify(exec);
const { handleExtras, autoFeatures } = require('./extras.js');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
// --- GLOBAL FONT SYSTEM - 5 FONTS ---
let currentFont = 'normal';
function stylize(text){
  if(!text || currentFont === 'normal') return text;
  return text.split('').map(c=>{
    let code = c.charCodeAt(0);
    if(currentFont === 'bold'){
      if(c>='A' && c<='Z') return String.fromCodePoint(0x1D400 + code-65);
      if(c>='a' && c<='z') return String.fromCodePoint(0x1D41A + code-97);
      if(c>='0' && c<='9') return String.fromCodePoint(0x1D7CE + code-48);
    }
    if(currentFont === 'italic'){
      if(c>='A' && c<='Z') return String.fromCodePoint(0x1D434 + code-65);
      if(c>='a' && c<='z') return String.fromCodePoint(0x1D44E + code-97);
    }
    if(currentFont === 'mono'){
      if(c>='A' && c<='Z') return String.fromCodePoint(0x1D670 + code-65);
      if(c>='a' && c<='z') return String.fromCodePoint(0x1D68A + code-97);
      if(c>='0' && c<='9') return String.fromCodePoint(0x1D7F6 + code-48);
    }
    if(currentFont === 'wide'){
      if(c>='A' && c<='Z') return String.fromCodePoint(0xFF21 + code-65);
      if(c>='a' && c<='z') return String.fromCodePoint(0xFF41 + code-97);
      if(c>='0' && c<='9') return String.fromCodePoint(0xFF10 + code-48);
      if(c===' ') return '　';
    }
    return c;
  }).join('');
}
let antiDB = {};
try{ antiDB = JSON.parse(fs.readFileSync('./anti.json')); }catch(e){ antiDB = {}; }
function saveAnti(){ fs.writeFileSync('./anti.json', JSON.stringify(antiDB, null, 2)); }
// === JUNE-STYLE DB MAINTENANCE - does NOT affect admin check ===
function cleanAntiDB(){
  try{
    let removed = 0;
    for(let gid of Object.keys(antiDB)){
      let cfg = antiDB[gid];
      if(!cfg) continue;
      if(!cfg.antilink && !cfg.antisticker && !cfg.antiimage){
        delete antiDB[gid];
        removed++;
      }
    }
    if(removed > 0){
      saveAnti();
      console.log(`[DB] Maintenance removed ${removed} expired/excess antidelete record(s).`);
    } else {
      console.log(`[DB] Maintenance removed 0 expired/excess antidelete record(s).`);
    }
  }catch(e){ console.log('[DB] Maintenance error:', e.message); }
}
setTimeout(cleanAntiDB, 10000);
setInterval(cleanAntiDB, 60 * 60 * 1000);
// === AUTO CLEAN v2 - FIXES ENOSPC ===
function cleanTmp(){
  try{
    const fs2 = require('fs');
    const path2 = require('path');
    const os2 = require('os');
    let cleaned = 0;
    let dirs = [os2.tmpdir(), '/tmp', './tmp', './temp', './'];
    for(let dir of dirs){
      let files = [];
      try{ files = fs2.readdirSync(dir); }catch(e){ continue; }
      for(let f of files){
        // Dean's temp files + any stray media
        if(f.startsWith('in_') || f.startsWith('out_') || f.startsWith('find_') || f.endsWith('.tmp') || f.startsWith('pair-temp-')){
          try{
            let fp = path2.join(dir, f);
            let stat = fs2.statSync(fp);
            let isOld = Date.now() - stat.mtimeMs > 2 * 60 * 1000; // 2 min old
            if(isOld){
              if(stat.isDirectory()) fs2.rmSync(fp, {recursive:true, force:true});
              else fs2.unlinkSync(fp);
              cleaned++;
            }
          }catch(e){}
        }
      }
    }
    // ALWAYS log so you know it ran
    try{
      let s = fs2.statfsSync('/tmp');
      let freeMB = Math.round((s.bavail * s.bsize) / 1024 / 1024);
      console.log(`[CLEAN] Ran - removed ${cleaned} files - Free space in /tmp: ${freeMB} MB`);
    }catch(e){
      console.log(`[CLEAN] Ran - removed ${cleaned} files`);
    }
  }catch(e){ console.log('[CLEAN] error:', e.message); }
}
setTimeout(cleanTmp, 15000);
setInterval(cleanTmp, 30 * 60 * 1000);
// === NO MIXTAPES RULE ===
function isMixtape(title, durationSec){
  let t = (title || '').toLowerCase();
  // Name check - only real mixtape words, NOT "remix"
  if(t.includes('mixtape') || t.includes('mix tape') || t.includes('dj mix') || t.includes('full album') || t.includes('full mixtape') || t.includes('compilation') || t.includes('hour mix') || t.includes('hour mixtape')) return 'name';
  // Length check - anything over 15 mins is a mix / album, not a single
  if(durationSec && durationSec > 15 * 60) return 'long';
  return null;
}
function getAnti(groupId){
  if(!antiDB[groupId]) antiDB[groupId] = {
    antilink:{on:false, action:'delete'},
    antisticker:{on:false, action:'delete'},
   anticontact:{on:false, action:'delete'},
    antigroupmention:{on:false, action:'delete'},
    antistatusmention:{on:false, action:'delete'},
    antiaudio:{on:false, action:'delete'},
    antivoicenote:{on:false, action:'delete'},
    antiimage:{on:false, action:'delete'},
    antivideo:{on:false, action:'delete'},
    warns:{}
  };
  return antiDB[groupId];
}
async function doAntiAction(sock, from, sender, msgKey, type, groupId){
  const cfg = getAnti(groupId);
  const action = cfg[type].action;
  const niceNames = {
    antilink: "links",
    antiimage: "images",
    anticontact: "contacts",
    antivideo: "videos",
    antisticker: "stickers",
    antiaudio: "audio files",
    antivoicenote: "voice notes",
    antigroupmention: "group mentions",
    antistatusmention: "status mentions"
  };
  const nice = niceNames[type] || type;
  try{ await sock.sendMessage(from,{delete: msgKey}); }catch(e){}

  // === 1 NOTIFICATION ONLY ===
  // If we already warned/kicked this sender in last 60s, delete silently, send NOTHING
  const silentKey = from + '_' + sender + '_' + type;
  if(antiSilentUntil.has(silentKey) && Date.now() < antiSilentUntil.get(silentKey)){
    return;
  }

  if(action === 'delete') return;
  if(action === 'warn'){
    cfg.warns[sender] = (cfg.warns[sender]||0)+1;
    saveAnti();
    // Lock BEFORE sending, so the other 14 messages in the burst don't trigger again
    antiSilentUntil.set(silentKey, Date.now() + 60000);
    if(cfg.warns[sender] >= 3){
      delete cfg.warns[sender]; saveAnti();
      try{ await sock.groupParticipantsUpdate(from,[sender],"remove"); }catch(e){}
      return await sock.sendMessage(from,{text:`*Group Security*\n\n@${sender.split('@')[0]} has been removed after 3 warnings for sharing ${nice}.`, mentions:[sender]});
    } else {
      return await sock.sendMessage(from,{text:`*Warning ${cfg.warns[sender]}/3*\n\n@${sender.split('@')[0]} Please do not share ${nice} here.`, mentions:[sender]});
    }
  }
  if(action === 'kick'){
    // Lock BEFORE kicking, so burst doesn't send 15x Removed
    antiSilentUntil.set(silentKey, Date.now() + 60000);
    try{ await sock.groupParticipantsUpdate(from,[sender],"remove"); }catch(e){}
    return await sock.sendMessage(from,{text:`*Group Security*\n\n@${sender.split('@')[0]} has been removed.\n\n*Reason:* Sharing ${nice} is not allowed in this group.`, mentions:[sender]});
  }
}
const ask = (q) => new Promise(res => rl.question(q, res));
const APIX_BASE = "https://apis.xwolf.space";
const APIX_KEY = 'wxa_f_44197651a6';
const WOLFX_KEY = APIX_KEY;
const CURIOUS_KEY = "ct_oma6J0YaDDwjjQgr2NEWgJfbo6Im7tu6bgf2ZzN59I4";
const CURIOUS_BASE = "https://curiousapis.name.ng";
const CURIOUS_AIO_URL = 'https://curiousapis.name.ng/yt_download_aiov2/download/aiov2';
const ELITE_BASE = 'https://eliteprotech-apis.vercel.app';
let PREFIX = ".";
try{ let _s=JSON.parse(fs.readFileSync('./data/settings.json','utf8')); if(_s.prefix) PREFIX=_s.prefix; }catch(e){}
let MODE = "Public";
let BOTNAME = 'Bot';
let OWNERNAME = 'Owner';
let OWNERNUMBER = '26700000000';
try{ let _s2=JSON.parse(fs.readFileSync('./data/settings.json','utf8')); if(_s2.botname) BOTNAME=_s2.botname; if(_s2.ownername) OWNERNAME=_s2.ownername; if(_s2.ownernumber) OWNERNUMBER=_s2.ownernumber; }catch(e){}
let MENUIMAGE = null; try { MENUIMAGE = fs.readFileSync('./menu.jpg'); } catch(e) {}
const OWNER_NUMBERS = ['26777763889@s.whatsapp.net'];
let START = Date.now();
let READY = false;
let antiSilentUntil = new Map(); // 1 notification only - like XMD
let cooldown = new Map();
let processedCache = new Set();
let botFont = 'normal';
try{ botFont = JSON.parse(fs.readFileSync('./font.json')).font; }catch{}
global.botFont = botFont;
function ram(){
  const used=process.memoryUsage().heapUsed/1024/1024;
  const total=os.totalmem()/1024/1024/1024;
  const p=Math.floor((used/(total*1024))*100);
  return { bar: "█".repeat(Math.floor(p/10))+"░".repeat(10-Math.floor(p/10)), p, used:used.toFixed(1), total:total.toFixed(2) };
}
// === DEAN-ULTRA V1 SHORT-ID PATCH - FIXED V5 ===
async function importSessionId(sid) {
  let trimmed = (sid || "").trim();
  if (!trimmed) throw new Error("Empty Session ID");
  
  // Handle both DEAN-ULTRA-xxxx and DEAN-ULTRA~xxxx
  let code = null;
  if (trimmed.includes('~')) {
    code = trimmed.split('~').pop().trim();
  } else if (trimmed.includes('-')) {
    const parts = trimmed.split('-');
    const last = parts.pop().trim();
    if (last.length < 25) code = last;
  }

  if (code) {
    console.log(`[DEAN] Short ID detected (${code}), fetching full session...`);
    const { data } = await axios.get(`http://5.189.177.12:3002/session/${code}`);
    const bundle = data.bundle || data;
    const files = bundle.files || bundle;
    if (!fs.existsSync('./session')) fs.mkdirSync('./session', {recursive:true});
    for (const [name, content] of Object.entries(files)) {
      const fp = `./session/${name}`;
      fs.mkdirSync(path.dirname(fp), {recursive:true});
      fs.writeFileSync(fp, content, 'utf8');
    }
    console.log(`[DEAN] Short session restored: ${code}`);
    return;
  }

  // Long session fallback
  const b64 = trimmed.replace('DEAN-ULTRA~','').replace('DEAN-ULTRA-','');
  const jsonStr = Buffer.from(b64, 'base64url').toString();
  const bundle = JSON.parse(jsonStr);
  if (!fs.existsSync('./session')) fs.mkdirSync('./session', {recursive:true});
  for (const [name, content] of Object.entries(bundle.files)) {
    const fp = `./session/${name}`;
    fs.mkdirSync(path.dirname(fp), {recursive:true});
    fs.writeFileSync(fp, content, 'utf8');
  }
}
async function startBot(){
let phoneNumber=null;
let p='session/creds.json';
if(!fs.existsSync(p)){
try{
let envSid=process.env.SESSION_ID||"";
if(!envSid&&fs.existsSync('session.txt'))envSid=fs.readFileSync('session.txt','utf8').trim();
if(envSid){
console.log("[DEAN-ULTRA] Importing...");
await importSessionId(envSid);
}
}catch(e){console.log(e.message);}
}
  if(!fs.existsSync('./session/creds.json')){
    let choice = await ask("Your choice (1 or 2): ");
    if(choice=="1"){
      let sid = await ask("Enter your Session ID: ");
      await importSessionId(sid); // keep your import function
    }else{
      phoneNumber = (await ask("Enter Phone Number with country code: ")).replace(/[^0-9]/g,'');
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion().catch(()=>({version:null}));
  
  const sock = makeWASocket({
    auth: state, 
    logger: P({ level: 'silent' }), 
    version: version,
    browser: Browsers.ubuntu("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false
  });
  
  sock.ev.on('creds.update', saveCreds);
  
  if(!state.creds.registered && phoneNumber){
    try{
      await new Promise(r=>setTimeout(r,2000));
      const code = await sock.requestPairingCode(phoneNumber);
      console.log(`\n🔑 YOUR CODE FOR ${phoneNumber}: ${code}\n`);
    }catch(e){ console.log("Pairing error:",e.message) }
  }
// ANTICALL + STATUS REACT - checks OWNER config
sock.ev.on('call', async (calls) => {
  try{
    for(let c of calls){
      if(c.status !== 'offer') continue;
      let db2 = {};
      try{ db2 = JSON.parse(require('fs').readFileSync('./extras.json')); }catch(e){}
      if(!db2["OWNER"]?.anticall) continue;
      await sock.rejectCall(c.id, c.from);
      await sock.sendMessage(c.from, { text: "📵 *Anticall:* Calls are not allowed. Message instead." });
    }
  }catch(e){}
});
// MAKE ALL BOT MESSAGES USE FONT
const _origSend = sock.sendMessage.bind(sock);
sock.sendMessage = async (jid, content, options) => {
  try{
    if(content && content.text) content.text = stylize(content.text);
    if(content && content.caption) content.caption = stylize(content.caption);
  }catch(e){}
  return _origSend(jid, content, options);
};
    sock.ev.on('messages.upsert', async ({messages}) => {
  try{
    let m2 = messages[0];
    if(!m2 || m2.key.remoteJid !== 'status@broadcast') return;
    let db2 = {};
    try{ db2 = JSON.parse(require('fs').readFileSync('./extras.json')); }catch(e){}
    if(!db2["OWNER"]?.autostatusreact) return;
    await sock.sendMessage('status@broadcast', { react: { text: "❤️", key: m2.key } });
  }catch(e){}
});
 sock.ev.on('connection.update', async (u)=>{
    if(u.connection==='open'){
        setTimeout(()=>{ READY = true; console.log('Bot READY - now accepting commands'); }, 15000);
  if(fs.existsSync(SENT_FILE)){
    console.log('Skipping connection message - already sent');
  } else {
    fs.writeFileSync(SENT_FILE, 'sent');
    console.log("╔════════════════════════════════════╗\n║ ✅ DEAN-ULTRA V1 CONNECTED SUCCESSFULLY ||\n╚════════════════════════════════════╝");
    try {
      setTimeout(() => {
        sock.sendMessage(sock.user.id, { text: `✅ *DEAN-ULTRA V1 CONNECTED SUCCESSFULLY* ||\n\n🤖 Bot is now online and ready.\n🕒 Time: ${new Date().toLocaleString('en-GB', { timeZone: 'Africa/Gaborone' })}\n\nType *.menu* to get started.` });
      }, 5000);
    } catch(e) { console.log("Failed to send connect msg:", e.message); }
  }
}
if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut) startBot();
  });
       sock.ev.on('messages.upsert', async ({type, messages})=>{
    if(type !== "notify") return;
if(!READY) return;
//if(messages[0]?.message?.senderKeyDistributionMessage) return;
if(messages[0]?.messageTimestamp && (messages[0].messageTimestamp * 1000 < START)) return;   
           const m=messages[0];
    if(!m) return;
    if(!m.message) return;
           const from = m.key.remoteJid;
const reply = async (txt) => await sock.sendMessage(m.key.remoteJid, {text: stylize(txt)}, {quoted: m});
    const bodyCheck = m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||m.message.buttonsResponseMessage?.selectedButtonId||m.message.listResponseMessage?.singleSelectReply?.selectedRowId||"";
    // === LOOP FIX - blocks bot replying to its own output ===
    if(m.key.fromMe && (bodyCheck.startsWith("*ADMINS -") || bodyCheck.startsWith("ℹ️ GROUP STAFF") || bodyCheck.startsWith("📢 Attention") || bodyCheck.startsWith("ADMINS - My accounts"))) return;
    if(processedCache.has(m.key.id)) return;
    processedCache.add(m.key.id);
    setTimeout(()=> processedCache.delete(m.key.id), 8000);
       const senderId = m.key.senderPn || m.key.participantAlt || m.key.participant || m.key.remoteJid;
    const isGroup = from.endsWith('@g.us');

// One identity resolver is shared by every automatic anti-feature.
// Keep the JID domain when matching IDs; also compare phone digits only against
// explicit phone-number aliases supplied by Baileys (never against arbitrary LIDs).
const normalizeJid = (value) => {
  if(!value || typeof value !== 'string') return '';
  const clean = value.trim().split(':')[0];
  const at = clean.indexOf('@');
  return at < 0 ? clean : clean.slice(0, at) + '@' + clean.slice(at + 1).toLowerCase();
};
const senderCandidates = [...new Set([
  m.key.senderPn, m.key.participantAlt, m.key.participant,
  m.key.participantPn, m.sender, senderId
].filter(Boolean).map(normalizeJid))];
const ownerJids = OWNER_NUMBERS.map(normalizeJid);
const ownerDigits = ownerJids.map(x => x.split('@')[0].replace(/\D/g,''));
const isOwner = !!m.key.fromMe || senderCandidates.some(x => ownerJids.includes(x) || (x.endsWith('@s.whatsapp.net') && ownerDigits.includes(x.split('@')[0].replace(/\D/g,''))));
let isGroupAdmin = false;
let groupRoleKnown = !isGroup;
if(isGroup){
  try{
    const _md = await sock.groupMetadata(from);
    const _parts = Array.isArray(_md?.participants) ? _md.participants : [];
    const _me = _parts.find(participant => {
      const aliases = [participant.id, participant.lid, participant.phoneNumber, participant.jid]
        .filter(Boolean).map(normalizeJid);
      if(aliases.some(alias => senderCandidates.includes(alias))) return true;
      const senderPhoneDigits = senderCandidates.filter(x => x.endsWith('@s.whatsapp.net')).map(x => x.split('@')[0].replace(/\D/g,''));
      const participantPhoneDigits = [participant.phoneNumber]
        .filter(Boolean).map(x => String(x).split('@')[0].split(':')[0].replace(/\D/g,''));
      return senderPhoneDigits.some(d => d && participantPhoneDigits.includes(d));
    });
    if(_me){
      groupRoleKnown = true;
      isGroupAdmin = _me.admin === 'admin' || _me.admin === 'superadmin';
    }
  }catch(e){ groupRoleKnown = false; }
}
const isAdminOrOwner = isOwner || isGroupAdmin;
// If the group role cannot be positively resolved, fail safe: do not punish.
const canSafelyPunish = !isGroup || (groupRoleKnown && !isAdminOrOwner);
await sock.readMessages([m.key]).catch(()=>{});
let body=m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||m.message.buttonsResponseMessage?.selectedButtonId||m.message.listResponseMessage?.singleSelectReply?.selectedRowId||"";
        // ===== ANTI DETECTOR - Block 3 FIXED =====
if(isGroup && !m.key.fromMe && canSafelyPunish){
  const cfgAnti = getAnti(from);
  const senderAnti = senderId;
  const msgAnti = m.message;
  const mtypeAnti = msgAnti ? Object.keys(msgAnti)[0] : "";
  let ctxAnti = {};
  for(let k of Object.keys(msgAnti || {})){
    if(msgAnti[k] && msgAnti[k].contextInfo){ ctxAnti = msgAnti[k].contextInfo; break; 
  }
  }
  // Role was already resolved once above; only confirmed ordinary members reach this block.
    if(cfgAnti.antisticker.on && mtypeAnti === 'stickerMessage'){
      await doAntiAction(sock, from, senderAnti, m.key, 'antisticker', from); return;
    }
    if(cfgAnti.antiimage.on && mtypeAnti === 'imageMessage'){
      await doAntiAction(sock, from, senderAnti, m.key, 'antiimage', from); return;
    }
    if(cfgAnti.antivideo.on && (mtypeAnti === 'videoMessage' || mtypeAnti === 'ptvMessage')){
      await doAntiAction(sock, from, senderAnti, m.key, 'antivideo', from); return;
    }
    if(cfgAnti.antivoicenote.on && mtypeAnti === 'audioMessage' && msgAnti.audioMessage?.ptt === true){
      await doAntiAction(sock, from, senderAnti, m.key, 'antivoicenote', from); return;
    }
    if(cfgAnti.antiaudio.on && mtypeAnti === 'audioMessage' && msgAnti.audioMessage?.ptt === false){
      await doAntiAction(sock, from, senderAnti, m.key, 'antiaudio', from); return;
    }
// FIX: anticontact was missing
if(cfgAnti.anticontact.on && (mtypeAnti === 'contactMessage' || mtypeAnti === 'contactsArrayMessage')){
  await doAntiAction(sock, from, senderAnti, m.key, 'anticontact', from); return;
}
    const groupMentionsAnti = ctxAnti.groupMentions || [];
    const mentionedAnti = ctxAnti.mentionedJid || [];
    const statusMentionsAnti = ctxAnti.statusMentions || [];

    // FIX 2: group mention = any @tag OR group tag, not mentionedJid == group JID
    const hasGroupMentionAnti = groupMentionsAnti.length > 0 || mentionedAnti.length > 0;
    if(cfgAnti.antigroupmention.on && hasGroupMentionAnti){
      await doAntiAction(sock, from, senderAnti, m.key, 'antigroupmention', from); return;
    }

    // FIX 3: status mention = statusMentions array only
    const hasStatusMentionAnti = statusMentionsAnti.length > 0;
    if(cfgAnti.antistatusmention.on && hasStatusMentionAnti){
      await doAntiAction(sock, from, senderAnti, m.key, 'antistatusmention', from); return;
    }

    const textAnti = body || msgAnti?.imageMessage?.caption || msgAnti?.videoMessage?.caption || "";
    if(cfgAnti.antilink.on && /(https?:\/\/|www\.|chat\.whatsapp\.com\/)/i.test(textAnti)){
      await doAntiAction(sock, from, senderAnti, m.key, 'antilink', from); return;
  }
}
// ===== END ANTI DETECTOR =====   
const _time = new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Gaborone', hour12: false }) + ' SAST';
const _date = new Date().toLocaleDateString('en-GB');
const _isG = from.endsWith('@g.us');
const _senderName = m.pushName || 'Unknown';
const _msgType = Object.keys(m.message || {})[0] || 'unknown';
let _groupName = '';
if(_isG){ try{ const meta = await sock.groupMetadata(from); _groupName = meta.subject; }catch{ _groupName = 'Unknown Group'; } }

console.log(`\x1b[38;2;0;200;255m┏━━━━『 \x1b[1m\x1b[38;2;255;255;255mDEAN ULTRA\x1b[0m\x1b[38;2;0;200;255m 』━━━━┓\x1b[0m`);
console.log(`\x1b[38;2;0;200;255m┃\x1b[0m \x1b[38;2;0;255;136m»\x1b[0m Sent Time: \x1b[37m${_time}\x1b[0m`);
console.log(`\x1b[38;2;0;200;255m┃\x1b[0m \x1b[38;2;0;255;136m»\x1b[0m Date: \x1b[37m${_date}\x1b[0m`);
console.log(`\x1b[38;2;0;200;255m┃\x1b[0m \x1b[38;2;0;255;136m»\x1b[0m Message Type: \x1b[90m${_msgType}\x1b[0m`);
console.log(`\x1b[38;2;0;200;255m┃\x1b[0m \x1b[38;2;0;255;136m»\x1b[0m Sender Name: \x1b[1m\x1b[97m${_senderName}\x1b[0m`);
console.log(`\x1b[38;2;0;200;255m┃\x1b[0m \x1b[38;2;0;255;136m»\x1b[0m Chat ID: \x1b[90m${from}\x1b[0m`);
if(_isG){
  console.log(`\x1b[38;2;0;200;255m┃\x1b[0m \x1b[38;2;0;255;136m»\x1b[0m Group: \x1b[38;2;0;255;136m${_groupName}\x1b[0m`);
  console.log(`\x1b[38;2;0;200;255m┃\x1b[0m \x1b[38;2;0;255;136m»\x1b[0m Group JID: \x1b[90m${from}\x1b[0m`);
}
console.log(`\x1b[38;2;0;200;255m┃\x1b[0m \x1b[38;2;0;255;136m»\x1b[0m Message: \x1b[1m\x1b[37m${body.slice(0,100)}\x1b[0m`);
console.log(`\x1b[38;2;0;200;255m┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\x1b[0m\n`);
// Run message-level extras for ordinary chat messages as well as commands.
await autoFeatures(sock, m, from, isGroup, { isOwner, isAdminOrOwner, canSafelyPunish, senderId });
    const lm = String(MODE||"public").toLowerCase();
    if(lm === "group") { if(!isGroup) return; }
    if(lm === "private") { if(isGroup) return; }
   let isButtonTap = body.startsWith("play3doc ") || body.startsWith("play3audio ") || body === "1" || body === "2";
if(isButtonTap && (body === "1" || body === "2")){
  let savedQ = globalThis.pendingPlay3?.[from];
  if(!savedQ) { await sock.sendMessage(from, { text: '❌ First send: +play3 <song name>' }, { quoted: m }); return; }
  body = (body === "1" ? "play3doc " : "play3audio ") + savedQ;
}
if(!isButtonTap && !body.startsWith(PREFIX)) return;
const args = isButtonTap ? body.trim().split(/ +/) : body.slice(PREFIX.length).trim().split(/ +/);
const cmd=args.shift().toLowerCase();
    const query=args.join(" ");
    const hrstart = process.hrtime();
           // NEW EXTRAS FILE
let handled = await handleExtras({sock, from, m, cmd, args, query, isOwner, isGroup, isAdminOrOwner, senderId, PREFIX});
if(handled) return;
                 if(cmd==="menu"){
      try{
        const more = String.fromCharCode(8206).repeat(4001);
        let platform = "Panel";
        if(process.env.DYNO) platform = "Heroku";
        if(process.env.RENDER) platform = "Render";
        const elapsed = process.hrtime(hrstart);
        const speedMs = (elapsed[0]*1000 + elapsed[1]/1e6).toFixed(3);
        const ms = Date.now() - START;
        const s = Math.floor(ms/1000);
        const h = Math.floor(s/3600);
        const m2 = Math.floor((s%3600)/60);
        const sec = s%60;
        let up = "";
        if(h>0) up += `${h}h `;
        if(m2>0) up += `${m2}m `;
        up += `${sec}s`;
        if(s<60) up = `${s}s`;
        const memUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        const memTotal = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const r = ram();
                  // AUTO COUNT - counts ALL files, ALL styles
function countCmds(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    // counts if(cmd===, if(cmd==, if(cmd ===, cmd==="x" || cmd==="y"
    const a = (txt.match(/if\s*\(\s*cmd\s*===?\s*["']/g) || []).length;
    const b = (txt.match(/cmd\s*===?\s*["'][^"']+["']/g) || []).length;
    const c = (txt.match(/\.includes\(cmd\)/g) || []).length;
    return a + b + c;
  } catch(e){ return 0; }
}
const totalCmds = getAllCmdNames().length;
          // AUTO LIST - extracts every command name by itself
function getAllCmdNames() {
  let names = new Set();
  const files = [__filename, './extras.js'];
  for (const f of files) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      // matches cmd==="ping" , cmd=='ping' , cmd=="ping" || cmd=="pong"
      const re1 = /cmd\s*===?\s*["']([^"']+)["']/g;
      let m;
      while ((m = re1.exec(txt)) !== null) names.add(m[1]);
      // matches ["approveall","approve"].includes(cmd)
      const re2 = /\[([^\]]+)\]\.includes\(cmd\)/g;
      while ((m = re2.exec(txt)) !== null) {
        const inside = m[1];
        const parts = inside.match(/["']([^"']+)["']/g) || [];
        parts.forEach(p => names.add(p.replace(/["']/g, '')));
      }
    } catch(e){}
  }
  return [...names].filter(n => n.length > 1).sort();
}
const allCmdsList = getAllCmdNames();
const autoListText = allCmdsList.map(c => `│ •.${c}`).join('\n');
              let text = `┌◇ DEAN-ULTRA ◇┐
│ PREFIX: [ ${PREFIX} ]
│ OWNER: Theo
│ MODE: 🌐 ${MODE}
│ PLATFORM: 💻 ${platform}
│ SPEED: 🛜 ${speedMs} ms
│ UPTIME: ⌚ ${up.trim()}
│ VERSION: v1.0.0
│ USE: 🧠 ${memUsed} MB of ${memTotal} GB
│ RAM: [${r.bar}] ${r.p}%
│ │ COMMANDS: ${totalCmds}
└◇...${more}

╭──「 OWNER 」──
│ •.ping
│ •.uptime
│ •.setprefix
│ •.mode
╰──────
╭──「 DOWNLOADER 」──
│ •.play
│ •.song
│ •.video
│ •.fb
│ •.tt
│ •.yts
│ •.shazam
╰──────
╭──「 GROUP 」──
│ •.antilink
│ •.kick
│ •.close
│ •.open
│ •.link
│ •.approveall
│ •.promote
│ •.demote
│ •.tagall
│ •.listadmins
│ . approveall
│ . rejectall  
│ . tagall
╰──────

╭──「 ALL COMMANDS - AUTO 」──
${autoListText}
╰──────

_By DEAN-ULTRA_ 👑`;
        if (typeof MENUIMAGE !== 'undefined' && MENUIMAGE) await sock.sendMessage(from, {image: MENUIMAGE, caption: text}, {quoted: m});
else await sock.sendMessage(from, {text: text}, {quoted: m});
      }catch(e){ console.log("Menu error", e.message); }
    } 
         // ===== SETFONT =====
if(cmd === 'setfont'){
  const fonts = ['normal','bold','italic','mono','wide'];
  const choice = (args[0] || '').toLowerCase();
  if(!fonts.includes(choice)){
    return reply(`Usage: .setfont ${fonts.join(' / ')}\nExample: .setfont italic`);
  }
  currentFont = choice;
  return reply(`✅ Font set to ${choice}`);
}

// ===== SETTIMEZONE =====
if(cmd === 'settimezone'){
  let tz = args[0];
  if(!tz) return reply(`*SETTIMEZONE*\nUsage: .settimezone Africa/Gaborone\nExample: Africa/Johannesburg, Europe/London, America/New_York`);
  try{ Intl.DateTimeFormat(undefined,{timeZone:tz}); }catch{ return reply('❌ Invalid timezone'); }
  global.botTZ = tz;
  fs.writeFileSync('./timezone.json', JSON.stringify({tz}));
  return reply(`✅ Timezone set to *${tz}*\nTime now: ${new Date().toLocaleString('en-GB',{timeZone:tz})}`);
}

// ===== GETJID =====
if(cmd === 'getjid'){
  return reply(`*GETJID*\n\nChat JID:\n${m.key.remoteJid}\n\nYour JID:\n${m.key.participant || m.key.remoteJid}`);
}

// ===== RESTART =====
if(cmd === 'restart'){
  await reply('♻️ Restarting bot...');
  setTimeout(()=> process.exit(1), 1000);
  return;
}

// ===== CREATEGROUP =====

if(cmd === "creategroup" || cmd === "newgroup"){
  if(!isOwner) return reply(`❌ Only owner can use this.`);
  if(!args[0]) return reply(`Usage: .creategroup Group Name @user / 26771234567\n\nExample:\n.creategroup DEAN FANS 26771234567`);

  let participants = [];
  if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid){
    participants.push(...msg.message.extendedTextMessage.contextInfo.mentionedJid);
  }
  let numbers = args.join(" ").match(/\d{10,15}/g) || [];
  for(let n of numbers){
    n = n.replace(/[^0-9]/g, "");
    if(n.length >= 10) participants.push(n + "@s.whatsapp.net");
  }
  participants = [...new Set(participants)].filter(j => j !== sock.user.id.split(":")[0] + "@s.whatsapp.net");

  let groupName = args.join(" ").replace(/\d{10,15}/g, "").replace(/@/g, "").trim();
  if(!groupName) return reply(`❌ Give a group name.\nExample: .creategroup DEAN FANS 26771234567`);

  try{
    reply(`⏳ Creating group "${groupName}"...`);
    const group = await sock.groupCreate(groupName, participants);
    let invite = "";
    try{ invite = await sock.groupInviteCode(group.id); }catch(e){}
    reply(`✅ Group created!\n\n*Name:* ${groupName}\n*ID:* ${group.id}\n*Members added:* ${participants.length}\n${invite ? `*Invite link:* https://chat.whatsapp.com/${invite}` : ""}`);
  }catch(e){
    reply(`❌ Failed to create group: ${e.message}`);
  }
  return;
}
// ===== VCF =====

if(cmd === 'vcf'){
  const isGroup = m.key.remoteJid?.endsWith('@g.us');
  if(!isGroup) return reply('❌ Use in a group');

  try{
    await reply('⏳ Making VCF...');
    const metadata = await sock.groupMetadata(m.key.remoteJid);
    const participants = metadata.participants || [];

    let vcf = '';
    participants.forEach((p, i)=>{
      const num = p.id.split('@')[0];
      const name = p.notify || `Contact ${i+1}`;
      vcf += `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;TYPE=CELL:${num}\nEND:VCARD\n`;
    });

    const fs = require('fs');
    const path = `/tmp/${metadata.subject || 'group'}_${Date.now()}.vcf`;
    fs.writeFileSync(path, vcf);

    await sock.sendMessage(m.key.remoteJid, {
      document: fs.readFileSync(path),
      mimetype: 'text/vcard',
      fileName: `${metadata.subject || 'group'}.vcf`,
      caption: `✅ Done - ${participants.length} contacts saved`
    }, { quoted: m });

    fs.unlinkSync(path);
  }catch(e){
    console.log('vcf error:', e);
    return reply('❌ Failed to make VCF.');
  }
  return;
}
// ===== PAIR =====

if(cmd === "pair"){
  if(!args[0]) return reply(`Usage: .pair 26777777778\nExample: .pair 26771234567`);
  let num = args[0].replace(/[^0-9]/g, "");
  if(num.length < 10 || num.length > 15) return reply(`❌ Invalid number: ${args[0]}`);
  reply(`⏳ Generating pairing code for +${num}...\nDon't touch the bot, this is a separate session.`);

  try{
    const { default: makeWASocket2, useMultiFileAuthState: useAuth2, fetchLatestBaileysVersion: fetchVer2 } = require("@whiskeysockets/baileys");
    const fsPair = require("fs");
    const pathPair = `./pair-temp-${num}`;
    if(fsPair.existsSync(pathPair)) fsPair.rmSync(pathPair, {recursive:true, force:true});

    const { state, saveCreds } = await useAuth2(pathPair);
    const { version } = await fetchVer2();
    const pairSock = makeWASocket2({ version, auth: state, printQRInTerminal: false, browser: ["DEAN-PAIR", "Chrome", "1.0"] });
    pairSock.ev.on("creds.update", saveCreds);

    // Keep socket alive - don't let it die
    pairSock.ev.on("connection.update", (u) => {
      if(u.connection === "open"){
        reply(`✅ +${num} linked successfully!`);
      }
    });

    // ASK IMMEDIATELY - do NOT wait for connection.update, do NOT use setTimeout
    let code = null;
    try{
      code = await pairSock.requestPairingCode(num);
    }catch(e){
      // One retry - sometimes first try hits before handshake
      await new Promise(r => setTimeout(r, 2000));
      code = await pairSock.requestPairingCode(num);
    }

    reply(`✅ PAIR CODE FOR +${num}\n\n*Code:* ${code}\n\n1. Open WhatsApp on +${num} phone\n2. Linked Devices > Link a Device\n3. Tap "Link with phone number instead"\n4. Enter this code - you have 60 seconds\n\n⚠️ Your main bot is still connected. This did NOT unlink it.`);

    setTimeout(() => { try{ pairSock.end(); }catch(e){} }, 70000);
  }catch(e){
    reply(`❌ Pair error: ${e.message}`);
  }
  return;
}
// ===== TOMP3 =====
         if(cmd === 'tomp3'){
  let ctx = m.message?.extendedTextMessage?.contextInfo;
  let quoted = ctx?.quotedMessage;
  let quotedMsg = null;
  if(quoted?.videoMessage){ quotedMsg = quoted.videoMessage; }
  else if(quoted?.audioMessage){ quotedMsg = quoted.audioMessage; }
  else if(m.quoted?.videoMessage){ quotedMsg = m.quoted.videoMessage; }
  else if(m.quoted?.audioMessage){ quotedMsg = m.quoted.audioMessage; }

  if(!quotedMsg) return reply('Reply to a video / audio with .tomp3');

  try{
    await reply('⏳ Converting to mp3...');
    let qmsg = {
      key: { remoteJid: m.key.remoteJid, id: ctx?.stanzaId || m.key.id, participant: ctx?.participant },
      message: quoted
    };
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
    let stream = await downloadContentFromMessage(quotedMsg, quoted?.videoMessage ? 'video' : 'audio');
    let chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    if(!buffer) return reply('❌ Failed to download video');
    await sock.sendMessage(m.key.remoteJid, { audio: buffer, mimetype: 'audio/mp4', fileName: 'audio.mp3', ptt: false }, { quoted: m });
  }catch(e){
    console.log('tomp3 error:', e);
    return reply('❌ Failed to convert.');
  }
  return;
} 

// ===== TOVIDEO ====
           
if(cmd === 'tovideo'){
  let ctx = m.message?.extendedTextMessage?.contextInfo;
  let quoted = ctx?.quotedMessage;
  let quotedMsg = null;
  let quotedType = null;
  if(quoted?.imageMessage){ quotedMsg = quoted.imageMessage; quotedType = 'image'; }
  else if(quoted?.stickerMessage){ quotedMsg = quoted.stickerMessage; quotedType = 'sticker'; }
  else if(m.quoted?.imageMessage){ quotedMsg = m.quoted.imageMessage; quotedType = 'image'; }
  else if(m.quoted?.stickerMessage){ quotedMsg = m.quoted.stickerMessage; quotedType = 'sticker'; }

  if(!quotedMsg) return reply('Reply to an image / sticker with .tovideo');

  try{
    await reply('⏳ Converting to video...');
    const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
    let stream = await downloadContentFromMessage(quotedMsg, quotedType);
    let chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    if(!buffer) return reply('❌ Failed to download image');

    // Try ffmpeg to make a real mp4 from image
    const fs = require('fs');
    const { exec } = require('child_process');
    const input = `/tmp/in_${Date.now()}.jpg`;
    const output = `/tmp/out_${Date.now()}.mp4`;
    fs.writeFileSync(input, buffer);

    try{
      await new Promise((res, rej)=>{
        exec(`ffmpeg -y -loop 1 -i "${input}" -t 3 -vf "scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:(ow-iw)/2:(oh-ih)/2" -pix_fmt yuv420p "${output}"`, (err)=> err ? rej(err) : res());
      });
      const video = fs.readFileSync(output);
      await sock.sendMessage(m.key.remoteJid, { video: video, mimetype: 'video/mp4', caption: '✅ Done' }, { quoted: m });
      fs.unlinkSync(input); fs.unlinkSync(output);
    }catch(e){
      // No ffmpeg - send as video anyway, WhatsApp will play it as image-video
      console.log('ffmpeg missing for tovideo, fallback');
      await sock.sendMessage(m.key.remoteJid, { video: buffer, mimetype: 'video/mp4', gifPlayback: false, caption: '✅ Done' }, { quoted: m });
      try{ fs.unlinkSync(input); }catch{}
    }
  }catch(e){
    console.log('tovideo error:', e);
    return reply('❌ Failed to convert to video.');
  }
  return;
}
// ===== TOPDF =====
if(cmd === 'topdf'){
  let text = args.join(' ') || 'Hello';
  text = text.replace(/\(/g,'[').replace(/\)/g,']').replace(/\n/g,' ');
  let content = `BT /F1 14 Tf 50 750 Td (${text}) Tj ET`;
  let pdf = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj\n5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\ntrailer << /Size 6 /Root 1 0 R >>\n%%EOF`;
  await sock.sendMessage(m.key.remoteJid, {document: Buffer.from(pdf), mimetype: 'application/pdf', fileName: 'topdf.pdf'}, {quoted: m});
  return;
}
    if(cmd === 'ping'){
  const start = Date.now();
  const sent = await sock.sendMessage(m.key.remoteJid, {text: stylize('🏓 Pinging...')}, {quoted: m});
  const latency = Date.now() - start;
  await sock.sendMessage(m.key.remoteJid, {text: stylize(`🚀 DEAN ULTRA SPEED: ${latency} ms`), edit: sent.key});
  return;
}
    if(cmd==="uptime" || cmd==="runtime"){
      const ms = Date.now() - START;
      const s = Math.floor(ms/1000);
      const h = Math.floor(s/3600);
      const m2 = Math.floor((s%3600)/60);
      const sec = s%60;
      let up = "";
      if(h>0) up += `${h}h `;
      if(m2>0) up += `${m2}m `;
      up += `${sec}s`;
      if(s<60) up = `${s}s`;
      const r = ram();
      const used = r.used || (process.memoryUsage().heapUsed/1024/1024).toFixed(1);
      const startStr = new Date(START).toLocaleString();
      const text = `DEAN-ULTRA UPTIME\n\n⏱️ ${up.trim()}\nRAM: ${used} MB\nStarted: ${startStr}`;
      return await sock.sendMessage(from,{text:text},{quoted:m});
    }
    if(cmd==="facebook" || cmd==="fb" || cmd==="fbdl"){
    if(!query) return await sock.sendMessage(from,{text:"*Give FB link*!"},{quoted:m});
    try{
       await sock.sendMessage(from, { react: { text: "🎥", key: m.key } });
        const res = await axios.get('https://apis.xwolf.space/api/download/facebook', { params: { url: query }, headers: { "x-api-key": WOLFX_KEY } });
        const data = res.data?.data || res.data;
        const videoUrl = data?.hdUrl || data?.sdUrl || data?.hd || data?.sd || data?.url;
        console.log("FB API DATA:", JSON.stringify(data).slice(0,300));
        if(!videoUrl) throw new Error("No URL found");
        const vid = await axios.get(videoUrl, { responseType: "arraybuffer", headers: { "User-Agent": "Mozilla/5.0" } });
        await sock.sendMessage(from, {video: Buffer.from(vid.data), caption: "*" + (data?.title || "DEAN-ULTRA") + "*\n\n> _Powered by Dean-Ultra_ ✅", mimetype: "video/mp4"}, {quoted:m});
    }catch(e){
        console.log("FB ERROR:", e.message);
        await sock.sendMessage(from,{text:"*FB Error:* " + e.message.slice(0,200)},{quoted:m});
    }
    return;
}
    if(cmd=="tt" || cmd=="tiktok" || cmd=="tik"){
  try{
    let id = m.sender + m.chat;
    if(cooldown.has(id)) return;
    cooldown.set(id, true);
    setTimeout(()=>cooldown.delete(id), 3000);

    if(!query) return await sock.sendMessage(from, {text:`_Example: ${PREFIX}tt <link>_`}, {quoted:m});
    let url = query.trim().split(" ")[0];
    if(!url.includes("tiktok.com")) throw new Error("Invalid TikTok link");
    
    await sock.sendMessage(from, { react: { text: "📥", key: m.key } });
    
  let videoUrl = null;
const APIX_KEY = "wxa_f_44197651a6"; // YOUR FULL UNLIMITED KEY HERE

// 1. Try Tikwm first
try{
  let res = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 15000 });
  if(res.data?.data?.play) videoUrl = res.data.data.play;
}catch(e){ console.log("Tikwm failed:", e.message); }

// 2. If Tikwm gives 502, try WolfXapis
if(!videoUrl){
  try{
    let apix = await axios.get(`https://apis.xwolf.space/api/download/tiktok?url=${encodeURIComponent(url)}`, { 
      headers: { 
        "User-Agent": "Mozilla/5.0",
        "x-api-key": APIX_KEY,
        "apikey": APIX_KEY,
        "Authorization": `Bearer ${APIX_KEY}`
      }, 
      timeout: 20000 
    });
    console.log("Apix response:", JSON.stringify(apix.data).slice(0,500));
    // THIS LINE IS THE FIX - Apix uses videoUrl, not video
    videoUrl = apix.data?.videoUrlNoWatermark || apix.data?.videoUrl || apix.data?.result?.videoUrlNoWatermark || apix.data?.result?.videoUrl || apix.data?.result?.video || apix.data?.data?.play;
    console.log("Picked videoUrl:", videoUrl ? videoUrl.slice(0,80) : "NONE");
  }catch(e){ console.log("Apix failed:", e.message); }
}

if(!videoUrl) throw new Error("Both APIs down, try again later");

await sock.sendMessage(from, {video:{url:videoUrl}, caption:`Powered by Dean-Ultra ✅`, mimetype:"video/mp4"}, {quoted:m}); 
       }catch(e){
    await sock.sendMessage(from,{text:`TT Failed: ${e.message}`},{quoted:m});
  }
  return;
}
        if(cmd=="ai" || cmd=="ask" || cmd=="gpt"){
  try{
    if(!query) return await sock.sendMessage(from, {text:`Example: ${PREFIX}ai Who is Dean Lewis?`}, {quoted:m});
    await sock.sendMessage(from, { react: { text: "🤖", key: m.key } });

    // Try GPT first, then Gemini, then DeepSeek - all on Apix
    const endpoints = ["gpt", "gemini", "deepseek"];
    let reply = "";
    let lastErr = "";

    for(let ep of endpoints){
      try{
        const url = `${APIX_BASE}/api/ai/${ep}?q=${encodeURIComponent(query)}&apikey=${APIX_KEY}`;
        const res = await axios.get(url, { headers: { "x-api-key": APIX_KEY }, timeout: 30000 });
        const d = res.data;
        // Apix returns different fields - grab whatever it gives
        reply = d?.result || d?.response || d?.reply || d?.answer || d?.data?.result || d?.data || "";
        if(typeof reply !== "string") reply = JSON.stringify(reply);
        if(reply && reply.length > 2) break;
      }catch(e){
        lastErr = e.response?.data?.message || e.response?.data?.error || e.message;
        continue;
      }
    }

    if(!reply) throw new Error(lastErr || "Apix busy, try again");
    await sock.sendMessage(from, {text: `${reply}\n\n> Powered by DEAN-ULTRA ✅`}, {quoted:m});
  }catch(e){
    await sock.sendMessage(from, {text:`AI Failed: ${e.message}`}, {quoted:m});
  }
  return;
}  
          if(cmd=="img" || cmd=="image" || cmd=="ghibli" || cmd=="anime" || cmd=="realistic" || cmd=="portrait"){
  try{
    if(!query) return await sock.sendMessage(from, {text:`Example:\n${PREFIX}img a cat in space\n${PREFIX}ghibli a boy with a dragon`}, {quoted:m});
    await sock.sendMessage(from, { react: { text: "🎨", key: m.key } });
    await sock.sendMessage(from, {text:`Generating your image... please wait 🎨`}, {quoted:m});

    let ep = "generate";
    if(cmd=="ghibli") ep = "ghibli";
    if(cmd=="anime") ep = "anime";
    if(cmd=="realistic") ep = "realistic";
    if(cmd=="portrait") ep = "portrait";

    let imgBuffer = null;
    let imgUrl = "";
    let lastErr = "";

    // Try 3 different ways Apix accepts it
    const attempts = [
      // 1. POST with {q}
      async () => {
        const r = await axios.post(`${APIX_BASE}/api/ai/tools/${ep}`, { q: query }, { headers: { "x-api-key": APIX_KEY, "Content-Type": "application/json" }, timeout: 60000, responseType: "arraybuffer" });
        return r;
      },
      // 2. GET with ?prompt=
      async () => {
        const r = await axios.get(`${APIX_BASE}/api/ai/tools/${ep}?prompt=${encodeURIComponent(query)}&apikey=${APIX_KEY}`, { headers: { "x-api-key": APIX_KEY }, timeout: 60000, responseType: "arraybuffer" });
        return r;
      },
      // 3. GET with ?q= (your original)
      async () => {
        const r = await axios.get(`${APIX_BASE}/api/ai/tools/${ep}?q=${encodeURIComponent(query)}&apikey=${APIX_KEY}`, { headers: { "x-api-key": APIX_KEY }, timeout: 60000, responseType: "arraybuffer" });
        return r;
      },
    ];

    for(let tryFn of attempts){
      try{
        const res = await tryFn();
        const ct = res.headers["content-type"] || "";
        if(ct.includes("image")){
          imgBuffer = Buffer.from(res.data);
          break;
        } else {
          let text = Buffer.from(res.data).toString();
          let d = {};
          try{ d = JSON.parse(text); }catch{}
          let u = d?.url || d?.image || d?.imageUrl || d?.result || d?.data?.url || d?.data?.image || "";
          if(typeof u === "string" && u.startsWith("http")){ imgUrl = u; break; }
          if(typeof u === "string" && u.startsWith("data:image")){ imgBuffer = Buffer.from(u.split(",")[1] || u, "base64"); break; }
          lastErr = text.slice(0,300);
        }
      }catch(e){
        // decode Apix error message
        let msg = "";
        if(e.response?.data) msg = Buffer.from(e.response.data).toString().slice(0,300);
        lastErr = msg || e.message;
        continue;
      }
    }

    if(imgBuffer){
      await sock.sendMessage(from, { image: imgBuffer, caption: `Here you go ✅\nPrompt: ${query}\n\n> Powered by DEAN-ULTRA 🎨` }, {quoted:m});
    } else if(imgUrl){
      await sock.sendMessage(from, { image: { url: imgUrl }, caption: `Here you go ✅\nPrompt: ${query}\n\n> Powered by DEAN-ULTRA 🎨` }, {quoted:m});
    } else {
      throw new Error(lastErr || "No image returned");
    }
  }catch(e){
    await sock.sendMessage(from, {text:`Image Failed: ${e.message}`}, {quoted:m});
  }
  return;
} 
  if(cmd=="yts"){
  try{
    let id2 = m.sender + "_yts_" + m.chat;
    if(cooldown.has(id2)) return;
    cooldown.set(id2, true);
    setTimeout(()=>cooldown.delete(id2), 3000);

    if(!query) return await sock.sendMessage(from, {text:`Example: ${PREFIX}yts delvins acoustic`}, {quoted:m});
    
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&gl=US`;
const { data: html } = await axios.get(searchUrl, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" } });
    let match = html.match(/var ytInitialData = (.*?);<\/script>/);
    if(!match) throw new Error("YouTube blocked");
    const ytData = JSON.parse(match[1]);
    const contents = ytData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
    let results = [];
    let num = 0;
    for(let c of contents){
      let v = c.videoRenderer;
      if(!v) continue;
      num++;
      let title = v.title?.runs?.[0]?.text || 'Unknown';
      let link = `https://youtube.com/watch?v=${v.videoId}`;
      let duration = v.lengthText?.simpleText || 'LIVE';
      let views = v.viewCountText?.simpleText || 'N/A';
      let uploaded = v.publishedTimeText?.simpleText || 'N/A';

      results.push(`• ${String(num).padStart(2,'0')}. ${title}\n◇ ${link}\n◇ Duration : ${duration}\n◇ Views     : ${views}\n◇ Uploaded : ${uploaded}`);
      if(results.length>=5) break;
    }
    if(!results.length) throw new Error("No results");
    let txt = `📋 *RESULTS*\n◇ Query » ${query}\n\n${results.join("\n. . . . . . . . . . .\n")}\n\n> Powered by DEAN-ULTRA ✅`;
    await sock.sendMessage(from, {text: txt}, {quoted:m});
  }catch(e){
    await sock.sendMessage(from, {text:`YTS Failed: ${e.message}`}, {quoted:m});
  }
  return;
} 
     if(cmd=="find" || cmd=="shazam"){
  try{
    const contextInfo = m.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = contextInfo?.quotedMessage;
    if(!quotedMsg) return await sock.sendMessage(from, {text:"*Reply to a video/song with .shazam* - e.g reply to Lizzy's video"},{quoted:m});

    const quotedType = Object.keys(quotedMsg)[0];
    const mediaMsg = quotedMsg[quotedType];
    const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
    const stream = await downloadContentFromMessage(mediaMsg, quotedType.replace('Message',''));
    let chunks = []; for await (const c of stream) chunks.push(c);
    let buffer = Buffer.concat(chunks);
    if(!buffer.length) return await sock.sendMessage(from, {text:"_Failed to download video - resend it_"},{quoted:m});

    const tmpIn = path.join(os.tmpdir(), `find_in_${Date.now()}.mp4`);
    fs.writeFileSync(tmpIn, buffer);

    await sock.sendMessage(from, {text:"_Listening... 🔍_"},{quoted:m});

    // --- 5 sec, 16kHz, mono = ~200KB - fits WolfX limit ---
    const { execSync } = require('child_process');
    const tmpRaw = path.join(os.tmpdir(), `find_raw_${Date.now()}.raw`);
    try{
      execSync(`ffmpeg -y -i "${tmpIn}" -t 5 -vn -ac 1 -ar 16000 -f s16le "${tmpRaw}"`, {timeout:15000});
    }catch(e){
      return await sock.sendMessage(from, {text:"_ffmpeg failed - video too short?_"},{quoted:m});
    }
    if(!fs.existsSync(tmpRaw)) return await sock.sendMessage(from, {text:"_Failed to convert audio_"},{quoted:m});

    let pcmBuffer = fs.readFileSync(tmpRaw);
    let base64Audio = pcmBuffer.toString('base64');

    try{ fs.unlinkSync(tmpIn); fs.unlinkSync(tmpRaw); }catch(e){}

    const res = await axios.post('https://apis.xwolf.space/api/shazam/recognize', {
      audio: base64Audio
    }, {
      headers: { "x-api-key": APIX_KEY, "Content-Type": "application/json" },
      timeout: 30000
    });

    const d = res.data?.data || res.data?.result || res.data?.track || res.data;
    const track = d?.track || d;
    let title = track?.title || track?.name || d?.title || "";
    let artist = track?.subtitle || track?.artist || d?.artist || d?.subtitle || "";
    let cover = track?.images?.coverart || track?.image || track?.cover || d?.image || d?.cover || "";

    if(!title) return await sock.sendMessage(from, {text:"_Couldn't find that song, try a clearer part / louder video_"},{quoted:m});

    // --- OLD STYLE FORMAT ---
    let msg = `🎧 FOUND!\n\n*Title:* ${title}\n*Artist:* ${artist || "Unknown Artist"}\n\n_Use .play ${artist || ""} ${title}_\n\n> Powered by DEAN-ULTRA ✅`;
    if(cover) {
      await sock.sendMessage(from, {image:{url:cover}, caption:msg},{quoted:m});
    } else {
      await sock.sendMessage(from, {text:msg},{quoted:m});
    }

  }catch(e){
    console.log("Shazam fail", e.response?.data || e.message);
    await sock.sendMessage(from, {text:"_Couldn't find that song, try a clearer part / louder video_\n\n> Powered by DEAN-ULTRA ✅"},{quoted:m});
  }
}
       if(cmd==="setprefix"){ 
  if(!isOwner) return await sock.sendMessage(from,{text:"❌ Owner command only"},{quoted:m});
  if(!query || query.trim().length !== 1) return await sock.sendMessage(from,{text:"❌ Usage: .setprefix <1 character> e.g. .setprefix !"},{quoted:m});
  PREFIX = query.trim();
try{ fs.mkdirSync('./data', {recursive:true}); let s={}; try{ s=JSON.parse(fs.readFileSync('./data/settings.json','utf8')); }catch(e){} s.prefix=PREFIX; fs.writeFileSync('./data/settings.json', JSON.stringify(s, null, 2)); }catch(e){}
  return await sock.sendMessage(from,{text:`✅ Prefix: [ ${PREFIX} ] - Saved, will survive restart`},{quoted:m}); 
}
  if(cmd==="setbotname"){
if(!isOwner) return await sock.sendMessage(from,{text:"❌ Owner command only"},{quoted:m});
if(!query) return await sock.sendMessage(from,{text:"Usage: .setbotname <name>"},{quoted:m});
BOTNAME = query.trim();
try{ fs.mkdirSync('./data',{recursive:true}); let s={}; try{ s=JSON.parse(fs.readFileSync('./data/settings.json','utf8')); }catch(e){} s.botname=BOTNAME; fs.writeFileSync('./data/settings.json', JSON.stringify(s, null, 2)); }catch(e){}
return await sock.sendMessage(from,{text:`✅ Bot Name: [ ${BOTNAME} ] - Saved`},{quoted:m});
}
if(cmd==="setownername"){
if(!isOwner) return await sock.sendMessage(from,{text:"❌ Owner command only"},{quoted:m});
if(!query) return await sock.sendMessage(from,{text:"Usage: .setownername <name>"},{quoted:m});
OWNERNAME = query.trim();
try{ fs.mkdirSync('./data',{recursive:true}); let s={}; try{ s=JSON.parse(fs.readFileSync('./data/settings.json','utf8')); }catch(e){} s.ownername=OWNERNAME; fs.writeFileSync('./data/settings.json', JSON.stringify(s, null, 2)); }catch(e){}
return await sock.sendMessage(from,{text:`✅ Owner Name: [ ${OWNERNAME} ] - Saved`},{quoted:m});
}
if(cmd==="setownernumber"){
if(!isOwner) return await sock.sendMessage(from,{text:"❌ Owner command only"},{quoted:m});
if(!query) return await sock.sendMessage(from,{text:"Usage: .setownernumber <number> e.g. 26770000000"},{quoted:m});
let num = query.trim().replace(/[^0-9]/g,'');
if(num.length < 9 || num.length > 15) return await sock.sendMessage(from,{text:"❌ Invalid number. Use full number e.g. 26770000000"},{quoted:m});
OWNERNUMBER = num;
try{ fs.mkdirSync('./data',{recursive:true}); let s={}; try{ s=JSON.parse(fs.readFileSync('./data/settings.json','utf8')); }catch(e){} s.ownernumber=OWNERNUMBER; fs.writeFileSync('./data/settings.json', JSON.stringify(s, null, 2)); }catch(e){}
return await sock.sendMessage(from,{text:`⚠️ Owner Number saved as [ ${OWNERNUMBER} ]\n\nNote: This is for display only. The real owner control is still 26777763889 in the code until you change OWNER_NUMBERS line. Restart bot to apply display.`},{quoted:m});
}
if(cmd==="setmenuimage"){
if(!isOwner) return await sock.sendMessage(from,{text:"❌ Owner command only"},{quoted:m});
let quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
if(quotedMsg?.viewOnceMessage) quotedMsg = quotedMsg.viewOnceMessage.message;
let targetMsg = quotedMsg || m.message;
let mime = targetMsg?.imageMessage?.mimetype || '';
if(!mime.includes('image')) return await sock.sendMessage(from,{text:"Reply to an image with .setmenuimage"},{quoted:m});
try{
let stream = await downloadContentFromMessage(targetMsg.imageMessage, 'image');
let buffer = Buffer.from([]);
for await(const chunk of stream){ buffer = Buffer.concat([buffer, chunk]); }
MENUIMAGE = buffer;
    try { fs.writeFileSync('./menu.jpg', MENUIMAGE); } catch(e) {}
return await sock.sendMessage(from,{text:"✅ Menu image updated"},{quoted:m});
    }catch(e){ console.log("SETMENU ERROR:", e); return await sock.sendMessage(from,{text:"❌ Failed: " + (e.message || e)},{quoted:m}); }
    }
    if(cmd==="mode"){if(!isOwner) return await sock.sendMessage(from,{text:"❌ Owner command only"},{quoted:m});
      if(!query){ return await sock.sendMessage(from,{text:`Current: ${MODE}`},{quoted:m}); }
      MODE = query.trim().toLowerCase();
      try{ fs.mkdirSync('./data',{recursive:true}); let s={}; try{ s=JSON.parse(fs.readFileSync('./data/settings.json','utf8')); }catch(e){} s.mode=MODE; fs.writeFileSync('./data/settings.json', JSON.stringify(s, null, 2)); }catch(e){}
      return await sock.sendMessage(from,{text:`✅ Mode: ${MODE}`},{quoted:m});
    }
  if(cmd=="antiall"){
     if(!isAdminOrOwner) return sock.sendMessage(from,{text:'❌ Admin only'},{quoted:m});
  if(!isGroup) return sock.sendMessage(from,{text:'Group only command'});
  const cfg = getAnti(from);
  let arg1 = (args[0]||"").toLowerCase();
  let arg2 = (args[1]||"").toLowerCase();
  // Fix for ".antiall on kick"
  if(arg1==='on' && arg2) arg1 = arg2;
  const allTypes = ["antilink","anticontact","antisticker","antigroupmention","antistatusmention","antiaudio","antivoicenote","antiimage","antivideo"];
  if(!arg1 || arg1==="status"){
    let txt = `🛡️ *ANTIALL STATUS*\n\n`;
    for(let k of allTypes){ txt += `${cfg[k].on ? "✅" : "❌"} ${k} : ${cfg[k].on ? cfg[k].action.toUpperCase() : "OFF"}\n`; }
    return sock.sendMessage(from,{text:txt});
  }
  if(arg1==="on"){ for(let k of allTypes) cfg[k].on = true; saveAnti(); return sock.sendMessage(from,{text:`✅ ANTIALL ON\nAll 8 antis activated.`}); }
  if(arg1==="off"){ for(let k of allTypes) cfg[k].on = false; saveAnti(); return sock.sendMessage(from,{text:`❌ ANTIALL OFF\nAll 8 antis deactivated.`}); }
  if(["kick","warn","delete"].includes(arg1)){ for(let k of allTypes){ cfg[k].action = arg1; cfg[k].on = true; } saveAnti(); return sock.sendMessage(from,{text:`✅ ANTIALL set to ${arg1.toUpperCase()}\n\n✅ antilink\n✅ antisticker\n✅ antigroupmention\n✅ anticontact \n✅ antistatusmention\n✅ antiaudio\n✅ antivoicenote\n✅ antiimage\n✅ antivideo\n\nAll ON - Action: ${arg1.toUpperCase()}`}); }
}
if(["antilink","anticontact","antisticker","antigroupmention","antistatusmention","antiaudio","antivoicenote","antiimage","antivideo"].includes(cmd)){
    if(!isAdminOrOwner) return sock.sendMessage(from,{text:'❌ Admin only'},{quoted:m});
  if(!isGroup) return sock.sendMessage(from,{text:'Group only command'});
  const cfg = getAnti(from);
  let arg1 = (args[0]||"").toLowerCase();
  let arg2 = (args[1]||"").toLowerCase();
  // Fix for ".antilink on kick" - your old code had this
  if(arg1==='on' && arg2) arg1 = arg2;
  if(!arg1 || arg1==="status"){
    let txt = `🛡️ *ANTI SETTINGS*\n\n`;
    for(let k of ["antilink","antisticker","anticontact","antigroupmention","antistatusmention","antiaudio","antivoicenote","antiimage","antivideo"]){ txt += `${cfg[k].on ? "✅" : "❌"} .${k} : ${cfg[k].on ? "ON ("+cfg[k].action+")" : "OFF"}\n`; }
    return sock.sendMessage(from,{text:txt});
  }
  if(arg1==="on"){ cfg[cmd].on = true; saveAnti(); return sock.sendMessage(from,{text:`✅ .${cmd} ON - Action: ${cfg[cmd].action}`}); }
  if(arg1==="off"){ cfg[cmd].on = false; saveAnti(); return sock.sendMessage(from,{text:`❌ .${cmd} OFF`}); }
  if(["kick","warn","delete"].includes(arg1)){ cfg[cmd].action = arg1; cfg[cmd].on = true; saveAnti(); return sock.sendMessage(from,{text:`✅ .${cmd} set to ${arg1.toUpperCase()} + ON`}); }
} 
    if(cmd==="close"){
       if(!isAdminOrOwner) return sock.sendMessage(from,{text:'❌ Admin only'},{quoted:m});
        try{ await sock.groupSettingUpdate(from, 'announcement'); return await sock.sendMessage(from,{text:`🔒 Closed`},{quoted:m}); }catch(e){ return await sock.sendMessage(from,{text:`Need admin`},{quoted:m}); } }
    if(cmd==="open"){ 
        if(!isAdminOrOwner) return sock.sendMessage(from,{text:'❌ Admin only'},{quoted:m});
        try{ await sock.groupSettingUpdate(from, 'not_announcement'); return await sock.sendMessage(from,{text:`🔓 Opened`},{quoted:m}); }catch(e){ return await sock.sendMessage(from,{text:`Need admin`},{quoted:m}); } }
    if(cmd=="kick" || cmd=="remove"){
        if(!isAdminOrOwner) return sock.sendMessage(from,{text:'❌ Admin only'},{quoted:m});
      try{
        if(!from.endsWith('@g.us')) return await sock.sendMessage(from,{text:'❌ Group only'},{quoted:m});
        let context = m.msg?.contextInfo || m.message?.extendedTextMessage?.contextInfo || {};
        let target = m.quoted?.sender || context.participant;
        if(!target) return await sock.sendMessage(from,{text:'❌ Reply to user'},{quoted:m});
        await sock.groupParticipantsUpdate(from, [target], 'remove');
        return await sock.sendMessage(from,{text:`✅ Removed @${target.split('@')[0]}`, mentions:[target]},{quoted:m});
      }catch(e){ return await sock.sendMessage(from,{text:`❌ Need admin`},{quoted:m}); }
    }
             if(cmd==="listadmins" || cmd==="admins" || cmd==="admin"){
      if(!from.endsWith('@g.us')) return await sock.sendMessage(from,{text:'❌ Group only'},{quoted:m});
      try{
        const md = await sock.groupMetadata(from);
        const admins = md.participants.filter(p=>p.admin);
        let txt = `*ADMINS - ${md.subject}*\n\n`;
        admins.forEach((a,i)=>{ txt += `${i+1}. @${a.id.split('@')[0]} ${a.admin==='superadmin'?'👑':''}\n`; });
        await sock.sendMessage(from,{text:txt, mentions:admins.map(a=>a.id)},{quoted:m});
        return;
      }catch(e){ await sock.sendMessage(from,{text:`❌ ${e.message}`},{quoted:m}); return; }
    }
if(cmd==="link" || cmd==="grouplink" || cmd==="invite"){
   if(!isAdminOrOwner) return sock.sendMessage(from,{text:'❌ Admin only'},{quoted:m}); 
  try{
    if(!from.endsWith('@g.us')) return await sock.sendMessage(from,{text:'❌ Group only'},{quoted:m});
    const gmeta = await sock.groupMetadata(from);
    const sender = m.key.participant || from;
    const isBotAdmin = gmeta.participants.find(p=>p.id===sock.user.id)?.admin;
    const isSenderAdmin = gmeta.participants.find(p=>p.id===sender)?.admin;
    if(!isSenderAdmin && !isOwner) return await sock.sendMessage(from,{text:'❌ Admin only command'},{quoted:m});
    if(!isBotAdmin) return await sock.sendMessage(from,{text:'❌ Bot needs to be admin'},{quoted:m});
    const code = await sock.groupInviteCode(from);
    const gname = gmeta.subject;
    return await sock.sendMessage(from,{text:`🔗 *GROUP INVITE LINK*\n\n📱 Group: ${gname}\n🔗 Link: https://chat.whatsapp.com/${code}`},{quoted:m});
  }catch(e){
    return await sock.sendMessage(from,{text:`❌ Failed: ${e.message}`},{quoted:m});
  }
}

   // approveall + rejectall - PROFESSIONAL - slots check + blocked codes
if(["approveall","approve","rejectall","reject","rall","aall"].includes(cmd)){
    if(!isAdminOrOwner) return sock.sendMessage(from,{text:'❌ Admin only'},{quoted:m});
  const BLOCKED_CODES = ['233','234','265','255','258','260','229','256','91','92','63'];
  const GROUP_LIMIT = 1025; // WhatsApp max - change to 934 if your group is 934
  const isRejectAll = (cmd.includes("reject") || cmd === "rall");
  try{
    if(!isGroup) return sock.sendMessage(from,{text:"❌ Group only"},{quoted:m});

    // 1. Check SILENTLY
    const pending = await sock.groupRequestParticipantsList(from);
    if(!pending || pending.length===0){
      return await sock.sendMessage(from,{text:`✅ No pending requests.`},{quoted:m});
    }

    // 2. REJECTALL - no slots check needed
    if(isRejectAll){
      await sock.sendMessage(from,{text:`Found ${pending.length} pending, rejecting...`},{quoted:m});
      let rejected = 0;
      for(let p of pending){
        try{
          const jid = p.jid || p.participant;
          await sock.groupRequestParticipantsUpdate(from,[jid],"reject");
          rejected++;
        }catch(e){ console.log("Fail reject:", e.message); }
        await new Promise(r=>setTimeout(r,500));
      }
      return await sock.sendMessage(from,{text:`🗑️ Done: Rejected ${rejected}/${pending.length}`},{quoted:m});
    }

    // 3. APPROVEALL - check slots first
    const gmeta = await sock.groupMetadata(from);
    const currentSize = gmeta.participants.length;
    const slotsLeft = GROUP_LIMIT - currentSize;

    if(slotsLeft <= 0){
      return await sock.sendMessage(from,{text:`❌ Group is full (${currentSize}/${GROUP_LIMIT}). Cannot approve anyone.\n\n📥 ${pending.length} still pending.`},{quoted:m});
    }

    // Filter blocked first, so blocked don't waste slots
    let toApprove = [];
    let blockedList = [];
    for(let p of pending){
      const jid = p.jid || p.participant;
      const number = jid.split('@')[0];
      const isBlocked = BLOCKED_CODES.some(code => number.startsWith(code));
      if(isBlocked) blockedList.push({jid, number});
      else toApprove.push({jid, number});
    }

    // Only take what fits
    const canApprove = toApprove.slice(0, slotsLeft);
    const leftOver = toApprove.length - canApprove.length; // valid but no slot
    const delay = pending.length > 20 ? 800 : 500;

    await sock.sendMessage(from,{text:`📥 Found ${pending.length} pending | Group: ${currentSize}/${GROUP_LIMIT} | Slots left: ${slotsLeft}\nApproving ${canApprove.length}...`},{quoted:m});

    let approved = 0;
    let rejected = 0;
    let rejectedList = [];
    let groupFull = false;

    // Reject blocked first (doesn't use slots)
    for(let b of blockedList){
      try{
        await sock.groupRequestParticipantsUpdate(from,[b.jid],"reject");
        rejected++;
        rejectedList.push(`+${b.number}`);
      }catch(e){ console.log("Fail blocked:", e.message); }
      await new Promise(r=>setTimeout(r,delay));
    }

    // Approve only what fits
    for(let item of canApprove){
      try{
        await sock.groupRequestParticipantsUpdate(from,[item.jid],"approve");
        approved++;
      }catch(e){
        console.log("Fail approve:", e.message);
        // If WhatsApp says full mid-way, STOP - don't keep trying
        if(e.message.toLowerCase().includes("full") || e.message.includes("403") || e.message.includes("not-authorized")){
          groupFull = true;
          break;
        }
      }
      await new Promise(r=>setTimeout(r,delay));
    }

    // 4. Final professional report
    let finalText = `✅ Done: Approved ${approved}/${canApprove.length}`;
    if(rejected > 0) finalText += `, Rejected ${rejected} (blocked)`;
    if(leftOver > 0) finalText += `\n\n⚠️ ${leftOver} valid requests still pending - group full (${currentSize + approved}/${GROUP_LIMIT})`;
    if(groupFull) finalText += `\n\n⚠️ Stopped early - group became full.`;
    if(rejected > 0) finalText += `\n\n❌ Rejected:\n${rejectedList.join('\n')}`;

    await sock.sendMessage(from,{text:finalText},{quoted:m});

  }catch(e){
    await sock.sendMessage(from,{text:`❌ Error: ${e.message}`},{quoted:m});
  }
}
     if(cmd==="promote"){
         if(!isAdminOrOwner) return sock.sendMessage(from,{text:'❌ Admin only'},{quoted:m});
 try{
  if(!isGroup) return;
  let target = null;
  // reply check - 3 ways
  if(m.quoted) target = m.quoted.sender;
  else if(m.message?.extendedTextMessage?.contextInfo?.participant) target = m.message.extendedTextMessage.contextInfo.participant;
  else if(m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) target = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
  else if(args[0]){
   let num = args[0].replace(/[^0-9]/g,"");
   if(num){
     let meta = await sock.groupMetadata(from);
     let found = meta.participants.find(p=>p.id.includes(num));
     target = found ? found.id : num+"@s.whatsapp.net";
   }
  }
  if(!target) return sock.sendMessage(from,{text:"❌ Reply to user's message with .promote"});
  await sock.groupParticipantsUpdate(from,[target],"promote");
  await sock.sendMessage(from,{text:"✅ Promoted"});
 }catch(e){ await sock.sendMessage(from,{text:"❌ "+e.message}); }
}

if(cmd==="demote"){
    if(!isAdminOrOwner) return sock.sendMessage(from,{text:'❌ Admin only'},{quoted:m});
 try{
  if(!isGroup) return;
  let target = null;
  if(m.quoted) target = m.quoted.sender;
  else if(m.message?.extendedTextMessage?.contextInfo?.participant) target = m.message.extendedTextMessage.contextInfo.participant;
  else if(m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) target = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
  else if(args[0]){
   let num = args[0].replace(/[^0-9]/g,"");
   if(num){
     let meta = await sock.groupMetadata(from);
     let found = meta.participants.find(p=>p.id.includes(num));
     target = found ? found.id : num+"@s.whatsapp.net";
   }
  }
  if(!target) return sock.sendMessage(from,{text:"❌ Reply to user's message with .demote"});
  await sock.groupParticipantsUpdate(from,[target],"demote");
  await sock.sendMessage(from,{text:"✅ Demoted"});
 }catch(e){ await sock.sendMessage(from,{text:"❌ "+e.message}); }
}
      if(cmd==="tagall" || cmd==="tag" || cmd==="all"){
          if(!isAdminOrOwner) return sock.sendMessage(from,{text:'❌ Admin only'},{quoted:m});
 try{
  if(!isGroup) return;
  const metadata = await sock.groupMetadata(from);
  const participants = metadata.participants.map(p=>p.id);
  let message = args.join(" ") || "📢 Attention everyone";
  
  let text = `${message}\n\n`;
  let count = 0;
  for(let mem of participants){
    // pretty tag list
    text += `▫️ @${mem.split("@")[0]}\n`;
    count++;
  }
  
  await sock.sendMessage(from, {text: text, mentions: participants});
 }catch(e){
  await sock.sendMessage(from,{text:"❌ Failed tagall: "+e.message});
 }
}
    const MUSIC_API_BASE = "https://apis.xwolf.space";
const MUSIC_API_KEY = "wxa_f_44197651a6";

async function wolfxGet(q){
  // Your docs say ?q= or ?url= — we use ?q= directly
  let url = `${MUSIC_API_BASE}/download/mp3?key=${MUSIC_API_KEY}&q=${encodeURIComponent(q)}`;
  let {data} = await axios.get(url, {
    headers: {
      "x-api-key": MUSIC_API_KEY,
      "apikey": MUSIC_API_KEY,
      "Authorization": `Bearer ${MUSIC_API_KEY}`
    },
    timeout: 30000
  });
  // Response is usually data.data.url or data.download_url or data.result
  let dl = data?.data?.url || data?.data?.download_url || data?.data?.dl || data?.url || data?.download_url || data?.result?.url;
  let title = data?.data?.title || data?.title || q;
  if(!dl) throw new Error("No url in response");
  return {dl, title};
}             

   
 // DEAN-ULTRA MUSIC - +play = document, +song = audio
          async function compressTo128(url) {
  let lastErr = null;
  for(let attempt = 1; attempt <= 3; attempt++){
    try{
      console.log(`DOWNLOAD ATTEMPT ${attempt}/3:`, url.slice(0,80));
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxRedirects: 5,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'audio/*,*/*' },
        validateStatus: s => s >= 200 && s < 300
      });
      if(!res.data || res.data.length < 10000) throw new Error('Downloaded file too small / empty - bad link');
      const input = `/tmp/in_${Date.now()}_${attempt}.mp3`;
      const output = `/tmp/out_${Date.now()}_${attempt}.mp3`;
      fs.writeFileSync(input, Buffer.from(res.data));
      try { await execAsync(`ffmpeg -y -i "${input}" -b:a 128k -ar 44100 "${output}"`); } catch(e) { console.log('ffmpeg fallback, sending original'); return fs.readFileSync(input); }
      const buf = fs.readFileSync(output);
      try { fs.unlinkSync(input); } catch(e) {}
      try { fs.unlinkSync(output); } catch(e) {}
      return buf;
    }catch(e){
      lastErr = e;
      console.log(`DOWNLOAD ATTEMPT ${attempt} FAILED:`, e.message);
      if(attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt)); // wait 2s, then 4s
    }
  }
  throw lastErr;
} 

async function getMusic(query) {
   let dlUrl = null, title = query, source = '';
let thumbnail = null, duration = null, channel = null, views = null, artist = null, releaseDate = null;
   // Block mixtapes - BEFORE Apix / Curious - saves API quota
  if(isMixtape(query, 0)){
    console.log('BLOCKED MIXTAPE:', query);
    return { dlUrl: null, title: query, source: 'blocked-mixtape', thumbnail: null, duration: null, channel: null, views: null, artist: null, releaseDate: null };
  } 

    // TRY 1: Apix PREMIUM - Unlimited - PRIMARY
    try {
        const res = await axios.get(`${APIX_BASE}/download/mp3`, {
            params: { q: query },
            headers: { 'x-api-key': APIX_KEY },
            timeout: 30000
        });
        const d = res.data;
        dlUrl = d?.downloadUrl || d?.url || d?.result?.downloadUrl || d?.result?.url || d?.data?.url;
        if (d?.thumbnail) thumbnail = d.thumbnail;
if (d?.duration) duration = d.duration;
if (d?.channel) channel = d.channel;
if (d?.artist) artist = d.artist;
if (d?.views) views = d.views;
if (d?.releaseDate || d?.publishedAt) releaseDate = d?.releaseDate || d?.publishedAt;
if (d?.result?.thumbnail) thumbnail = d.result.thumbnail;
if (d?.result?.duration) duration = d.result.duration;
if (d?.result?.channel) channel = d.result.channel;
if (d?.result?.views) views = d.result.views;
        if (dlUrl) source = 'Apix Premium';
        console.log('TRYING APIX PREMIUM:', query, '->', source ? 'FOUND' : 'NOT FOUND');
    } catch (e) { console.log('APIX FAILED:', e.message); }

    // TRY 2: Curious FREE - 250 limit - BACKUP ONLY
    if (!dlUrl) {
        try {
            const cRes = await axios.get(`${CURIOUS_BASE}/yt_music_audio/yt_music_audio`, {
                params: { q: query },
                headers: { 'x-api-key': CURIOUS_KEY },
                timeout: 20000
            });
            const d = cRes.data?.data || cRes.data;
            dlUrl = d?.audioUrl || d?.audio_url || d?.url || d?.downloadUrl;
            if (d?.title) title = d.title;
            if (dlUrl) source = 'Curious';
            console.log('TRYING CURIOUS BACKUP:', query, '->', source ? 'FOUND' : 'NOT FOUND');
        } catch (e) { console.log('CURIOUS FAILED:', e.message); }
    }
    return { dlUrl, title, source, thumbnail, duration, channel, views, artist, releaseDate };
}

if (cmd === 'play') {
    if (!query) {
        await sock.sendMessage(from, { text: '❌ Usage: +play <song name>' }, { quoted: m });
        return;
    }
    try {
        // React only - no downloading message
        await sock.sendMessage(from, { react: { text: '🚀', key: m.key } });
        const { dlUrl, title, source } = await getMusic(query);
  // Block mixtapes - Owner rule
let blockReason = isMixtape(title, 0) || isMixtape(query, 0);
if(blockReason){
  await sock.sendMessage(from, { text: blockReason === 'name' ? '❌ Mixtapes not authorized by owner.\nSend a single song only.' : '❌ Too long.\nMixtapes / long mixes not authorized.' }, { quoted: m });
  return;
}     
        if (!dlUrl) {
            await sock.sendMessage(from, { text: `❌ Not found: ${query}` }, { quoted: m });
            return;
        }
        // DOCUMENT format
        await sock.sendMessage(from, {
            document: await compressTo128(dlUrl),
mimetype: 'audio/mpeg',
            mimetype: 'audio/mpeg',
            fileName: `${title}.mp3`,
           caption: `> _Powered by Dean-Ultra_ ✅`
        }, { quoted: m });
    } catch (e) {
     await sock.sendMessage(from, { text: `❌ Download failed after 3 tries: ${e.message}\nTry again in 1 min, or try .song ${query}` }, { quoted: m });  
    }
    return;
}

if (cmd === 'song') {
    if (!query) {
        await sock.sendMessage(from, { text: '❌ Usage: +song <song name>' }, { quoted: m });
        return;
    }
    try {
        // React only - no downloading message
        await sock.sendMessage(from, { react: { text: '⚡', key: m.key } });
        const { dlUrl, title, source } = await getMusic(query);
 // Block mixtapes - Owner rule - .song
if(source === 'blocked-mixtape' || isMixtape(query, 0)){
  await sock.sendMessage(from, { text: '❌ Mixtapes not authorized by owner.\nSend a single song only.' }, { quoted: m });
  return;
}      
        if (!dlUrl) {
            await sock.sendMessage(from, { text: `❌ Not found: ${query}` }, { quoted: m });
            return;
        }
        // AUDIO format
        await sock.sendMessage(from, {
            audio: await compressTo128(dlUrl),
mimetype: 'audio/mpeg',
            mimetype: 'audio/mpeg',
            fileName: `${title}.mp3`
        }, { quoted: m });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: m });
    }
    return;
    }
           // ===== PLAY2 - Audio + Document, silent, reaction only =====
if (cmd === 'play2') {
    if (!query) {
        await sock.sendMessage(from, { text: '❌ Usage: +play2 <song name>' }, { quoted: m });
        return;
    }
    try {
        await sock.sendMessage(from, { react: { text: '🚀', key: m.key } });
        const { dlUrl, title, source } = await getMusic(query);
        let blockReason = isMixtape(title, 0) || isMixtape(query, 0);
        if(blockReason){
          await sock.sendMessage(from, { text: blockReason === 'name' ? '❌ Mixtapes not authorized by owner.\nSend a single song only.' : '❌ Too long.\nMixtapes / long mixes not authorized.' }, { quoted: m });
          return;
        }
        if (!dlUrl) {
            await sock.sendMessage(from, { text: `❌ Not found: ${query}` }, { quoted: m });
            return;
        }
        const buf = await compressTo128(dlUrl);
        // 1. Audio - top in your screenshot
        await sock.sendMessage(from, { audio: buf, mimetype: 'audio/mpeg', fileName: `${title}.mp3` }, { quoted: m });
        // 2. Document - bottom in your screenshot
        await sock.sendMessage(from, { document: buf, mimetype: 'audio/mpeg', fileName: `${title}.mp3`, caption: `> _Powered by Dean-Ultra_ ✅` }, { quoted: m });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: m });
    }
    return;
}

// ===== PLAY3 - Buttons choice Document / Audio =====
if (cmd === 'play3') {
    if (!query) {
        await sock.sendMessage(from, { text: '❌ Usage: +play3 <song name>' }, { quoted: m });
        return;
    }
    try {
        await sock.sendMessage(from, { react: { text: '🚀', key: m.key } });
        const { dlUrl, title, source } = await getMusic(query);
        let blockReason = isMixtape(title, 0) || isMixtape(query, 0);
        if(blockReason){
          await sock.sendMessage(from, { text: '❌ Mixtapes not authorized by owner.\nSend a single song only.' }, { quoted: m });
          return;
        }
        if (!dlUrl) {
            await sock.sendMessage(from, { text: `❌ Not found: ${query}` }, { quoted: m });
            return;
        }
        // Save this song for this chat so Reply 1 / 2 works
        globalThis.pendingPlay3 = globalThis.pendingPlay3 || {};
        globalThis.pendingPlay3[from] = query;
        await sock.sendMessage(from, {
            text: `🎵 *Choose format for:*\n${title}\n\nReply with:\n*1* - 📄 Document\n*2* - 🎵 Audio`
        }, { quoted: m });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: m });
    }
    return;
}

// ===== PLAY3 button handlers - Document / Audio =====
if (cmd === 'play3doc' || cmd === 'play3audio') {
    if (!query) return;
    try {
        await sock.sendMessage(from, { react: { text: '🚀', key: m.key } });
        const { dlUrl, title } = await getMusic(query);
        if (!dlUrl) { await sock.sendMessage(from, { text: `❌ Not found: ${query}` }, { quoted: m }); return; }
        const buf = await compressTo128(dlUrl);
        if (cmd === 'play3doc') {
            await sock.sendMessage(from, { document: buf, mimetype: 'audio/mpeg', fileName: `${title}.mp3`, caption: `> _Powered by Dean-Ultra_ ✅` }, { quoted: m });
        } else {
            await sock.sendMessage(from, { audio: buf, mimetype: 'audio/mpeg', fileName: `${title}.mp3` }, { quoted: m });
        }
    } catch (e) { await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: m }); }
    return;
}

// ===== SONG2 - Audio + Info Card like your screenshot =====
if (cmd === 'song2') {
    if (!query) {
        await sock.sendMessage(from, { text: '❌ Usage: +song2 <song name>' }, { quoted: m });
        return;
    }
    try {
        await sock.sendMessage(from, { react: { text: '⚡', key: m.key } });
        const { dlUrl, title, source, thumbnail, duration, channel, views, artist, releaseDate } = await getMusic(query);
        let blockReason = isMixtape(title, 0) || isMixtape(query, 0);
        if(blockReason){
          await sock.sendMessage(from, { text: '❌ Mixtapes not authorized by owner.\nSend a single song only.' }, { quoted: m });
          return;
        }
        if (!dlUrl) {
            await sock.sendMessage(from, { text: `❌ Not found: ${query}` }, { quoted: m });
            return;
        }
        const info = `🎶 *YouTube Audio Found*\n\n📖 *Title:* ${title}\n👤 *Artist:* ${artist || channel || 'Unknown'}\n📅 *Released:* ${releaseDate || 'Unknown'}\n⏱️ *Duration:* ${duration || 'Unknown'}\n👁️ *Views:* ${views || 'Unknown'}\n\n📥 Downloading audio...`;
        if (thumbnail) {
            await sock.sendMessage(from, { image: { url: thumbnail }, caption: info }, { quoted: m });
        } else {
            await sock.sendMessage(from, { text: info }, { quoted: m });
        }
        await sock.sendMessage(from, { audio: await compressTo128(dlUrl), mimetype: 'audio/mpeg', fileName: `${title}.mp3` }, { quoted: m });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: m });
    }
    return;
}

// ===== GROUPINFO =====
if (cmd === 'groupinfo' || cmd === 'ginfo') {
    try {
 if (!isAdminOrOwner) { await sock.sendMessage(from, { text: '❌ Admins only' }, { quoted: m }); return; }      
        if (!isGroup) { await sock.sendMessage(from, { text: '❌ Group only' }, { quoted: m }); return; }
        const md = await sock.groupMetadata(from);
        const admins = md.participants.filter(p => p.admin);
        const created = md.creation ? new Date(md.creation * 1000).toLocaleDateString('en-GB') : 'Unknown';
        let txt = `👥 *GROUP INFO*\n\n📛 *Name:* ${md.subject}\n🆔 *ID:* ${from}\n👥 *Members:* ${md.participants.length}\n👑 *Admins:* ${admins.length}\n📅 *Created:* ${created}\n\n📝 *Desc:*\n${md.desc || 'No description'}`;
        await sock.sendMessage(from, { text: txt }, { quoted: m });
    } catch (e) { await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: m }); }
    return;
}

// ===== MYGROUPS =====
if (cmd === 'mygroups' || cmd === 'groups') {
    try {
        if (!isOwner) { await sock.sendMessage(from, { text: '❌ Owner only' }, { quoted: m }); return; }
        const groups = await sock.groupFetchAllParticipating();
        const list = Object.values(groups);
        if (!list.length) { await sock.sendMessage(from, { text: '❌ Bot is in no groups.' }, { quoted: m }); return; }
        let txt = `📋 *MY GROUPS - ${list.length}*\n\n`;
        list.forEach((g, i) => { txt += `${i+1}. ${g.subject}\n   👥 ${g.participants.length} members | 🆔 ${g.id}\n\n`; });
        await sock.sendMessage(from, { text: txt }, { quoted: m });
    } catch (e) { await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: m }); }
    return;
}
           if(cmd==="movie"){
  try{
    var q = args.join(" ").trim();
    if(!q) return await sock.sendMessage(from,{text:"Usage: .movie vikings"},{quoted:m});

    // 1. Search TVmaze (no key needed)
    var sr = await axios.get("https://api.tvmaze.com/search/shows?q="+encodeURIComponent(q));
    if(!sr.data || !sr.data.length) return await sock.sendMessage(from,{text:"No show/movie found for: "+q},{quoted:m});

    var show = sr.data[0].show;
    var genres = (show.genres||[]).join(", ") || "N/A";
    var rating = show.rating && show.rating.average ? show.rating.average+"/10" : "N/A";
    var status = show.status || "N/A";
    var premiered = show.premiered || "N/A";
    var summary = (show.summary||"").replace(/<[^>]*>/g,"").trim().slice(0,400);
    var poster = show.image ? (show.image.original || show.image.medium) : null;

    var txt = "🎬 *"+show.name+"*\n\n"
      + "⭐ Rating: "+rating+"\n"
      + "🎭 Genre: "+genres+"\n"
      + "📺 Status: "+status+"\n"
      + "📅 Premiered: "+premiered+"\n"
      + "🌐 Language: "+(show.language||"N/A")+"\n"
      + "⏱️ Runtime: "+(show.runtime||"?")+" min / ep\n\n"
      + summary+"\n\n"
      + "➡️ Next: .eps "+show.name+" 1  (episodes for Season 1)\n"
      + "➡️ Or: .eps "+show.name+" 2  (Season 2)";

    if(poster){
      await sock.sendMessage(from,{image:{url:poster}, caption:txt},{quoted:m});
    } else {
      await sock.sendMessage(from,{text:txt},{quoted:m});
    }
    return;
  }catch(e){ await sock.sendMessage(from,{text:"ERR: "+e.message},{quoted:m}); return; }
}

if(cmd==="eps"){
  try{
    // Usage: .eps vikings 1  -> Season 1
    // Usage: .eps vikings 1 5 -> Season 1 Episode 5 detail
    var seasonNum = parseInt(args[args.length-1]);
    var isSeasonOnly = !isNaN(seasonNum) && args.length>=2;
    var q = isSeasonOnly ? args.slice(0,-1).join(" ") : args.join(" ");
    if(!q) return await sock.sendMessage(from,{text:"Usage: .eps vikings 1"},{quoted:m});

    var sr = await axios.get("https://api.tvmaze.com/search/shows?q="+encodeURIComponent(q));
    if(!sr.data || !sr.data.length) return await sock.sendMessage(from,{text:"Show not found: "+q},{quoted:m});
    var show = sr.data[0].show;

    var er = await axios.get("https://api.tvmaze.com/shows/"+show.id+"/episodes");
    var eps = er.data || [];
    var targetSeason = isSeasonOnly ? seasonNum : 1;
    var filtered = eps.filter(e=>e.season===targetSeason);

    if(!filtered.length) return await sock.sendMessage(from,{text:"No episodes for "+show.name+" Season "+targetSeason},{quoted:m});

    var out = "📺 *"+show.name+" - Season "+targetSeason+"*\n";
    out += "Total episodes: "+filtered.length+"\n\n";
    for(var i=0;i<filtered.length;i++){
      var e = filtered[i];
      out += "S"+e.season+"E"+e.number+" - "+e.name+" ("+(e.runtime||"?")+" min) - "+(e.airdate||"")+"\n";
    }
    out += "\nFor detail: .ep "+show.name+" "+targetSeason+" 1";
    await sock.sendMessage(from,{text:out.slice(0,3800)},{quoted:m});
    return;
  }catch(e){ await sock.sendMessage(from,{text:"ERR: "+e.message},{quoted:m}); return; }
}

if(cmd==="ep"){
  try{
    // Usage: .ep vikings 1 1 -> S1E1 detail
    var epNum = parseInt(args[args.length-1]);
    var seasonNum = parseInt(args[args.length-2]);
    var q = args.slice(0,-2).join(" ");
    if(!q || isNaN(seasonNum) || isNaN(epNum)) return await sock.sendMessage(from,{text:"Usage: .ep vikings 1 1"},{quoted:m});

    var sr = await axios.get("https://api.tvmaze.com/search/shows?q="+encodeURIComponent(q));
    if(!sr.data || !sr.data.length) return await sock.sendMessage(from,{text:"Show not found"},{quoted:m});
    var show = sr.data[0].show;

    var er = await axios.get("https://api.tvmaze.com/shows/"+show.id+"/episodes");
    var ep = (er.data||[]).find(e=>e.season===seasonNum && e.number===epNum);
    if(!ep) return await sock.sendMessage(from,{text:"Episode not found"},{quoted:m});

    var summary = (ep.summary||"").replace(/<[^>]*>/g,"").trim().slice(0,500);
    var txt = "🎬 *"+show.name+" S"+seasonNum+"E"+epNum+" - "+ep.name+"*\n\n"
      + "📅 Airdate: "+(ep.airdate||"N/A")+"\n"
      + "⏱️ Runtime: "+(ep.runtime||"?")+" min\n"
      + "⭐ Rating: "+(ep.rating && ep.rating.average ? ep.rating.average : "N/A")+"\n\n"
      + summary;
    if(ep.image && ep.image.original){
      await sock.sendMessage(from,{image:{url:ep.image.original}, caption:txt},{quoted:m});
    } else {
      await sock.sendMessage(from,{text:txt},{quoted:m});
    }
    return;
  }catch(e){ await sock.sendMessage(from,{text:"ERR: "+e.message},{quoted:m}); return; }
}
       // +video - FINAL - EliteProTech YTMP4 - No key, no Apix download, no Curious
//if (cmd === 'video') {
    //if (!query) return await sock.sendMessage(from, {text: '❌ Usage: +video <song / video name>'}, {quoted: m});
   // try {
        //await sock.sendMessage(from, { react: { text: "🎬", key: m.key } });
        //await sock.sendMessage(from, {text: '⏳ Downloading video... please wait'}, {quoted: m});

        //let ytUrl = null;
        //let title = query;

        // STEP 1: Get YouTube URL - Apix ONLY for search (to get ID), NOT for download - so no 502
        //try {
            //const r = await axios.get(`${APIX_BASE}/download/ytmp4`, { params: { q: query }, headers: { 'x-api-key': APIX_KEY }, timeout: 60000 });
           // const d = r.data;
           // const vid = d?.videoId || d?.result?.videoId || d?.data?.videoId;
            //const yurl = d?.youtubeUrl || d?.result?.youtubeUrl;
            //if (yurl) ytUrl = yurl;
            //else if (vid) ytUrl = `https://www.youtube.com/watch?v=${vid}`;
            //if (d?.title || d?.result?.title) title = d.title || d.result.title;
        //} catch(e) { await sock.sendMessage(from, {text: `🔍 Apix search failed: ${e.message.slice(0,80)}`}, {quoted: m}); }

        //if (!ytUrl) return await sock.sendMessage(from, {text: '❌ Could not find that video.'}, {quoted: m});
       // await sock.sendMessage(from, {text: `🔍 Found:\n${ytUrl}`}, {quoted: m});//

        // STEP 2: Elite YTMP4 - GET /download/ytmp4?url=
        // Response format from site: { status, result } - result holds the link
        //let dlUrl = null;
       // try {
           // const ELITE = (typeof ELITE_BASE !== 'undefined' ? ELITE_BASE : 'https://eliteprotech-apis.vercel.app');
            //await sock.sendMessage(from, {text: '🔄 Trying Elite YTMP4...'}, {quoted: m});
           // const r = await axios.get(`${ELITE}/download/ytmp4`, { params: { url: ytUrl }, timeout: 120000 });
           // await sock.sendMessage(from, {text: `📦 Elite replied:\n${JSON.stringify(r.data).slice(0,500)}`}, {quoted: m});

           // const d = r.data;
           // const res = d?.result || d?.data || d;
            // Handle all possible shapes: result is object with url, or result is string URL
           // dlUrl = res?.downloadUrl || res?.download_url || res?.url || res?.link || res?.mp4 || res?.videoUrl || res?.video_url
                // || d?.downloadUrl || d?.url
                // || (typeof res === 'string' && res.startsWith('http') ? res : null);
           // if (res?.title) title = res.title;
           // if (dlUrl) await sock.sendMessage(from, {text: `✅ Elite gave link, sending...`}, {quoted: m});
      //  } catch(e) {
          //  await sock.sendMessage(from, {text: `❌ Elite failed: ${e.response?.status || ''} ${e.message.slice(0,100)}`}, {quoted: m});
      //  }

       // if (!dlUrl) return await sock.sendMessage(from, {text: '❌ Elite gave NO link. Screenshot the Elite replied message above.'}, {quoted: m});

        // STEP 3: Send - WhatsApp URL fetch first (bypasses server 502), Buffer second
       // let sent = false;
       // let lastErr = '';
       // try {
           // await sock.sendMessage(from, {
               // video: { url: dlUrl },
               // mimetype: 'video/mp4',
               // fileName: `${title}.mp4`,
                //caption: `🎬 *${title}*\n> _Powered by Dean-Ultra_ ✅`
           // }, { quoted: m });
           // sent = true;
      //  } catch(e) { lastErr = e.message; }

       // if (!sent) {
           // try {
               // const file = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.youtube.com/' } });
               // if (!file.data || file.data.length < 50000) throw new Error('File too small');
               // await sock.sendMessage(from, {
                 //   video: Buffer.from(file.data),
                   // mimetype: 'video/mp4',
                   // fileName: `${title}.mp4`,
                  //  caption: `🎬 *${title}*\n> _Powered by Dean-Ultra_ ✅`
             //   }, { quoted: m });
               // sent = true;
         //   } catch(e) { lastErr = e.message; }
    //    }

     //   if (!sent) return await sock.sendMessage(from, {text: `❌ Send failed: ${lastErr.slice(0,150)}`}, {quoted: m});

  //  } catch (e) {
      //  await sock.sendMessage(from, {text: `❌ Video failed: ${e.message.slice(0,150)}`}, {quoted: m});
  //  }
   // return;
//}//
         // +video - FINAL - NO APIX AT ALL - Apix is dead (500 search + 502 download)
// Search = Invidious (free, no key), Download = Elite YTMP4 (free, no key)
//if (cmd === 'video') {
   // if (!query) return await sock.sendMessage(from, {text: '❌ Usage: +video <song / video name>'}, {quoted: m});
  //  try {
       // await sock.sendMessage(from, { react: { text: "🎬", key: m.key } });
      //  await sock.sendMessage(from, {text: '⏳ Downloading video... please wait'}, {quoted: m});

       // let ytUrl = null;
      //  let title = query;

        // STEP 1: Find YouTube URL - WITHOUT Apix, WITHOUT yt-search
        // Use Invidious public API - same YouTube data, no key
      //  const searchApis = [
            //`https://yt.lemnoslife.com/api/v1/search?q=${encodeURIComponent(query)}`,
            //`https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(query)}`,
            //`https://invidious.privacyredirect.com/api/v1/search?q=${encodeURIComponent(query)}`
    //    ];

       // for (let api of searchApis) {
          //  if (ytUrl) break;
          //  try {
                //const r = await axios.get(api, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
               // const list = Array.isArray(r.data) ? r.data : [];
               // const firstVideo = list.find(v => v.type === 'video' || v.videoId);
            //    if (firstVideo?.videoId) {
            //        ytUrl = `https://www.youtube.com/watch?v=${firstVideo.videoId}`;
            //        title = firstVideo.title || title;
           //         await sock.sendMessage(from, {text: `🔍 Found via Invidious:\n${ytUrl}`}, {quoted: m});
             //       break;
           //     }
         //   } catch(e) { continue; }
      //  }

        // STEP 1B: Fallback - try yt-search IF it happens to be installed (don't fail if not)
     //   if (!ytUrl) {
        //    try {
        //        const yts = require('yt-search');
         //       const s = await yts(query);
           //     if (s.videos[0]) { ytUrl = s.videos[0].url; title = s.videos[0].title; }
       //     } catch(e) { /* ignore - yt-search not installed */ }
     //   }

        // STEP 1C: Last fallback - Elite itself - some Elite endpoints accept a search term as url
        // If Invidious fails, we try Elite YTMP4 with the raw query - if Elite can search, this works
     //   if (!ytUrl) {
        //    await sock.sendMessage(from, {text: '🔍 Invidious search failed, trying Elite with search term...'}, {quoted: m});
            // We will let STEP 2 handle it - set ytUrl = query as a test
            // If Elite needs a real URL, STEP 2 will tell us in WhatsApp
         //   ytUrl = query;
    //    }

      //  await sock.sendMessage(from, {text: `🔍 Using:\n${ytUrl}`}, {quoted: m});

        // STEP 2: Elite YTMP4 - GET /download/ytmp4?url=
    //    let dlUrl = null;
     //   try {
      //      const ELITE = (typeof ELITE_BASE !== 'undefined' ? ELITE_BASE : 'https://eliteprotech-apis.vercel.app');
         //   await sock.sendMessage(from, {text: '🔄 Trying Elite YTMP4...'}, {quoted: m});
         //   const r = await axios.get(`${ELITE}/download/ytmp4`, { params: { url: ytUrl }, timeout: 120000 });
        //    await sock.sendMessage(from, {text: `📦 Elite replied:\n${JSON.stringify(r.data).slice(0,500)}`}, {quoted: m});

         //   const d = r.data;
        //    const res = d?.result || d?.data || d;
      //      dlUrl = res?.downloadUrl || res?.download_url || res?.url || res?.link || res?.mp4 || res?.videoUrl || res?.video_url
       //          || d?.downloadUrl || d?.url
      //           || (typeof res === 'string' && res.startsWith('http') ? res : null);
        //    if (res?.title) title = res.title;
      //      if (dlUrl) await sock.sendMessage(from, {text: `✅ Elite gave link, sending...`}, {quoted: m});
     //   } catch(e) {
      //      await sock.sendMessage(from, {text: `❌ Elite failed: ${e.response?.status || ''} ${e.message.slice(0,100)}`}, {quoted: m});
    //    }

     //   if (!dlUrl) return await sock.sendMessage(from, {text: '❌ Elite gave NO link. Screenshot the Elite replied message above.'}, {quoted: m});

        // STEP 3: Send - WhatsApp URL fetch first, Buffer second
     //   let sent = false;
    //    let lastErr = '';
     //   try {
       //     await sock.sendMessage(from, {
           //     video: { url: dlUrl },
        //        mimetype: 'video/mp4',
       //         fileName: `${title}.mp4`,
     //           caption: `🎬 *${title}*\n> _Powered by Dean-Ultra_ ✅`
      //      }, { quoted: m });
      //      sent = true;
    //    } catch(e) { lastErr = e.message; }

     //   if (!sent) {
      //      try {
      //          const file = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.youtube.com/' } });
        //        if (!file.data || file.data.length < 50000) throw new Error('File too small');
             // await sock.sendMessage(from, {
                 //   video: Buffer.from(file.data),
                  //  mimetype: 'video/mp4',
                 //   fileName: `${title}.mp4`,
                  //  caption: `🎬 *${title}*\n> _Powered by Dean-Ultra_ ✅`
              //  }, { quoted: m });
               // sent = true;
           // } catch(e) { lastErr = e.message; }
     //   }

       // if (!sent) return await sock.sendMessage(from, {text: `❌ Send failed: ${lastErr.slice(0,150)}`}, {quoted: m});

   // } catch (e) {
       // await sock.sendMessage(from, {text: `❌ Video failed: ${e.message.slice(0,150)}`}, {quoted: m});
  //  }
  //  return;/
              // +video - NO APIX - Search = Invidious (works), Download = Try ALL Elite endpoints + Curious backup
//if (cmd === 'video') {
   // if (!query) return await sock.sendMessage(from, {text: '❌ Usage: +video <song / video name>'}, {quoted: m});
   // try {//
       // await sock.sendMessage(from, { react: { text: "🎬", key: m.key } });
      //  await sock.sendMessage(from, {text: '⏳ Downloading video... please wait'}, {quoted: m});//

      //  let ytUrl = null;
      //  let title = query;//

        // STEP 1: Search - Invidious - THIS WORKS, we saw it find cgwq_RPLmBU
      //  const searchApis = [//
           // `https://yt.lemnoslife.com/api/v1/search?q=${encodeURIComponent(query)}`,
            //`https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(query)}`//
       
               // const r = await axios.get(api, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.//
       // if (!ytUrl) {
           // try {//
               // const yts = require('yt-search');//
              //  const s = await yts(query);//
                //if (s.videos[0]) { ytUrl = s.videos[0].url; title = s.videos[0].title; }
           // } catch(e) {}//
      
      //  if (!ytUrl) return await sock.sendMessage(from, {text: '❌ Could not find that video.'}, {quoted: m});//
       // await sock.sendMessage(from, {text: `🔍 Found:\n${ytUrl}`}, {quoted: m};//

        // STEP 2: Try EVERY Elite endpoint - ytdown, ytmp4, aio3 - with ?url=
        // From your screenshot: 01 YouTube /download/ytdown, 02 YTMP3 /download/ytmp3, 03 YTMP4 /download/ytmp4, 05 All in One /download/aio3
        
               // (typeof res === 'string' && res.startsWith('http') ? res : null)//
           // for(let u of cands){ if(typeof u === 'string' && u.startsWith('http')) return u; }
         //   return null;//

      //  for (let endpoint of ['/download/ytdown', '/download/ytmp4', '/download/aio3']) {//
           // if (dlUrl) break;
           // try {//
              //  await sock.sendMessage(from, {text: `🔄 Trying Elite ${endpoint}...`}, {quoted: m});//
               // const r = await axios.get(`${ELITE}${endpoint}`, { params: { url: ytUrl }, timeout: 120000 });//
              //  await sock.sendMessage(from, {text: `📦 Elite ${endpoint} replied:\n${JSON.stringify(r.data).slice(0,450)}`}, {quoted: m});
                //const link = getLink(r.data);//
               // if (link) {
                   // dlUrl = link;
                   // if (r.data?.result?.title) title = r.data.result.title;//
                    //await sock.sendMessage(from, {text: `✅ Elite WORKED: ${endpoint}`}, {quoted: m});//
               // tried.push(`${endpoint}: ${e.response?.status || ''} ${e.message.slice(0,50)}`);
               // await sock.sendMessage(from, {text: `❌ Elite ${endpoint} failed: ${e.response?.status || ''} ${e.message.slice(0,70)}`}, {quoted: m})//

        // STEP 3: Backup - Curious AIO v2 - if ALL Elite endpoints fail
     
               // await sock.sendMessage(from, {text: '🔄 All Elite failed, trying Curious AIO v2...'}, {quoted: m});//
                //const aioUrl = (typeof CURIOUS_AIO_URL !== 'undefined' ? CURIOUS_AIO_URL : 'https://curiousapis.name.ng/yt_download_aiov2/download/aiov2');//
                //const r = await axios.get(aioUrl, { params: { url: ytUrl }, timeout: 120000 ;//
                //await sock.sendMessage(from, {text: `📦 Curious replied:\n${JSON.stringify(r.data).slice(0,450)}`}, {quoted: m});//
               // dlUrl = r.data?.videoUrl || r.data?.result?.videoUrl || r.data?.downloadUrl || r.data?.url || null;//
                //if (dlUrl) await sock.sendMessage(from, {text: `✅ Curious worked as backup`}, {quoted: m});//
              //  await sock.sendMessage(from, {text: `❌ Curious failed: ${e.response?.status || ''} ${e.message.slice(0,80)}`}, {quoted: m});//
                // Retry Curious WITH key
                
                   // const aioUrl = (typeof CURIOUS_AIO_URL !== 'undefined' ? CURIOUS_AIO_URL : 'https://curiousapis.name.ng/yt_download_aiov2/download/aiov2');//
                    //const r2 = await axios.get(aioUrl, { params: { url: ytUrl }, headers: { 'x-api-key': CURIOUS_KEY }, timeout: 120000 });//
                  //  dlUrl = r2.data?.videoUrl || r2.data?.result?.videoUrl || r2.data?.downloadUrl || null;//
                   // if (dlUrl) await sock.sendMessage(from, {text: `✅ Curious with-key worked`}, {quoted: m});//
              // } catch(e2) { await sock.sendMessage(from, {text: `❌ Curious with-key failed: ${e2.message.slice(0,80)}`}, {quoted: m}); }//

        //if (!dlUrl) return await sock.sendMessage(from, {text: `❌ All providers failed.\nTried:\n${tried.join('\n')}\n\nScreenshot the Elite replies above.`}, {quoted: m});//

        // STEP 4: Send - WhatsApp URL fetch first, Buffer second
        
                //const file = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.youtube.com/' } });
               // if (!file.data || file.data.length < 50000) throw new Error('File too sma//
                    //caption: `🎬 *${title}*\n> _Powered by Dean-Ultra_ ✅`//

       // if (!sent) return await sock.sendMessage(from, {text: `❌ Send failed: ${lastErr.slice(0,150)}`}, {quoted: m});//
           // +video - Mirrors WORKING +play music code EXACTLY - same header, same parsing
//if (cmd === 'video') {//
  //  if (!query) return await sock.sendMessage(from, {text: '❌ Usage: +video <song / video name>'}, {quoted: m});
   // try {//
       // await sock.sendMessage(from, { react: { text: "🎬", key: m.key } });//
       // await sock.sendMessage(from, {text: '⏳ Downloading video... please wait'}, {quoted: //

        // STEP 1: Search - Invidious - WORKS, found cgwq_RPLmBU before
       // const searchApis = [//
            //`https://yt.lemnoslife.com/api/v1/search?q=${encodeURIComponent(query)}`,//
           // `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(query)}`//
      //  ];//
        
              //  const r = await axios.get(api, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });//
       // if (!ytUrl) return await sock.sendMessage(from, {text: '❌ Could not find that video.'}, {quoted: m});//
       // await sock.sendMessage(from, {text: `🔍 Found:\n${ytUrl}`}, {quoted: m})//

        // SAME PARSING AS MUSIC: const d = res.data?.data || res.data
      
          //  const link = d?.videoUrl || d?.video_url || d?.url || d?.downloadUrl || d?.download_url || d?.mp//

        // STEP 2: Curious video - SAME header style as music, try AIO v2 + other Curious video endpoints
        // Music: /yt_music_audio/yt_music_audio - Video likely: /yt_download_aiov2/download/aiov2 OR similar
        //const videoEndpoints = [
            //{ name: 'AIO v2 GET ?url=', method: 'GET', url: `${CURIOUS_BASE}/yt_download_aiov2/download/aiov2`, params: { url: ytUrl } },//
           // { name: 'AIO v2 POST', method: 'POST', url: `${CURIOUS_BASE}/yt_download_aiov2/download/aiov2`, params: { url: ytUrl } },//
            //{ name: 'AIO v2 GET ?q=', method: 'GET', url: `${CURIOUS_BASE}/yt_download_aiov2/download/aiov2`, params: { q: ytUrl } }//
                //await sock.sendMessage(from, {te: ` Trying Curious ${ep.name}...`}, {quoted: m});//
                   // r = await axios.post(ep.url, ep.params, { headers: { 'x-api-key': CURIOUS_KEY }, timeout: 120000 })//
                  //  r = await axios.get(ep.url, { params: ep.params, headers: { 'x-api-key': CURIOUS_KEY }, timeout: 120000 })//
               // await sock.sendMessage(from, {tex ` Curious ${ep.name} replied:\n${JSON.stringify(r.data).slice(0,450)}`}, {quoted: m});//
                   // await sock.sendMessage(from, {text `Curious WORKED with: ${ep.name}`}, {quoted: m});//
               // await sock.sendMessage(from, {text: ` Curious ${ep.name} failed: ${e.response?.status || ''} ${e.message.slice(0,70)}`}, {quoted: m})//

        //if (!dlUrl) return await sock.sendMessage(from, {text: 'Curious video failed. Screenshot the Curious replies above - if all say 401, your key works for music but not for AIO v2.'}, {quoted: m});//

        // STEP 3: Send - same as before
      
                //const file = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.youtube.com/' } });//
               // if (!file.data || file.data.length < 50000) throw new Error('File too small')//

       // if (!sent) return await sock.sendMessage(from, {text: ` Send failed: ${lastErr.slice(0,150)}`}, {quoted: m//
       // await sock.sendMessage(from, {text: ` Video failed: ${e.message.slice(0,150)}`}, {quoted: m});//
         // +video - NO Elite (500), NO Apix (500) - Search = Piped/Invidious/YouTube scrape, Download = Invidious formatStreams
if (cmd === 'video') {
    if (!query) return await sock.sendMessage(from, { text: `❌ Usage: ${PREFIX}video <YouTube link or video name>` }, { quoted: m });
    try {
        await sock.sendMessage(from, { react: { text: "🎬", key: m.key } });
        await sock.sendMessage(from, { text: '⏳ Fetching video... please wait' }, { quoted: m });

        const input = query.trim();
        const isUrl = /^https?:\/\//i.test(input);
        let title = input;
        let dlUrl = null;
        let provider = '';
        let lastApixError = '';
        let curiousInputUrl = input;

        // Accept common direct-link fields and nested response structures.
        const extractVideoUrl = (obj, depth = 0) => {
            if (!obj || depth > 5) return null;
            if (typeof obj === 'string') return /^https?:\/\//i.test(obj) ? obj : null;
            if (Array.isArray(obj)) {
                for (const item of obj) { const found = extractVideoUrl(item, depth + 1); if (found) return found; }
                return null;
            }
            if (typeof obj !== 'object') return null;
            const keys = ['video_download','videoDownload','videoUrlNoWatermark','videoUrl','video_url','downloadUrl','download_url','url','link','play','mp4','hdUrl','sdUrl'];
            for (const key of keys) {
                const value = obj[key];
                if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
            }
            for (const key of ['data','result','results','download','video','item']) {
                const found = extractVideoUrl(obj[key], depth + 1);
                if (found) return found;
            }
            return null;
        };
        const extractTitle = (obj, depth = 0) => {
            if (!obj || depth > 4 || typeof obj !== 'object') return null;
            for (const key of ['title','name']) if (typeof obj[key] === 'string' && obj[key].trim()) return obj[key];
            for (const key of ['data','result','results','video','item']) { const found = extractTitle(obj[key], depth + 1); if (found) return found; }
            return null;
        };

        // PRIMARY: Apix. Try the documented HD, standard MP4, and auto-download routes.
        const apixEndpoints = ['/download/hd', '/download/mp4', '/api/download/youtube', '/api/download/youtube/mp4'];
        for (const endpoint of apixEndpoints) {
            if (dlUrl) break;
            try {
                const params = isUrl ? { url: input } : { q: input };
                const r = await axios.get(`${APIX_BASE}${endpoint}`, {
                    params,
                    headers: { 'x-api-key': APIX_KEY, 'User-Agent': 'Mozilla/5.0' },
                    timeout: 60000
                });
                console.log(`VIDEO APIX ${endpoint} RESPONSE:`, JSON.stringify(r.data).slice(0,700));
                dlUrl = extractVideoUrl(r.data);
                title = extractTitle(r.data) || title;
                if (dlUrl) provider = `Apix ${endpoint}`;
            } catch (e) {
                lastApixError = `${endpoint}: ${e.response?.status || e.message}`;
                console.log(`VIDEO APIX ${endpoint} FAILED:`, lastApixError);
            }
        }

        // BACKUP: Curious AIO v2. Its url parameter needs a YouTube video URL,
        // so resolve search text with yt-search first (unless input is already a URL).
        if (!dlUrl) {
            try {
                await sock.sendMessage(from, { text: '🔄 Apix failed; trying Curious backup...' }, { quoted: m });
                let curiousUrl = input;
                if (!isUrl) {
                    const search = await yts(input);
                    const firstVideo = search?.videos?.find(v => v && v.videoId && v.url);
                    if (firstVideo) {
                        curiousUrl = firstVideo.url;
                        title = firstVideo.title || title;
                    }
                }
                if (!/^https?:\/\//i.test(curiousUrl)) throw new Error('Could not resolve search to a YouTube URL');
                curiousInputUrl = curiousUrl;
                console.log('VIDEO CURIOUS INPUT URL:', curiousUrl);
                const r = await axios.get(CURIOUS_AIO_URL, {
                    params: { url: curiousUrl },
                    headers: { 'x-api-key': CURIOUS_KEY, 'User-Agent': 'Mozilla/5.0' },
                    timeout: 120000
                });
                console.log('VIDEO CURIOUS RESPONSE:', JSON.stringify(r.data).slice(0,1500));
                dlUrl = extractVideoUrl(r.data);
                title = extractTitle(r.data) || title;
                if (dlUrl) provider = 'Curious AIO v2';
            } catch (e) {
                console.log('VIDEO CURIOUS FAILED:', e.response?.status || e.message);
            }
        }

        if (!dlUrl) return await sock.sendMessage(from, { text: `❌ Both video APIs failed to return a download link.\nApix last error: ${lastApixError.slice(0,120) || 'No direct link returned'}\nCurious did not return a usable link.` }, { quoted: m });

        // Download stage: Googlevideo links can be short-lived or reject a mismatched
        // request header. Try a small set of browser-like header profiles, then refresh
        // the Curious link once if the first link is denied/expired.
        const downloadVideoBuffer = async (url) => {
            const headerProfiles = [
                { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36', 'Accept': '*/*', 'Referer': 'https://www.youtube.com/', 'Origin': 'https://www.youtube.com' },
                { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': '*/*' },
                { 'User-Agent': 'Mozilla/5.0', 'Accept': 'video/mp4,video/*,*/*' }
            ];
            let lastErr;
            for (let i = 0; i < headerProfiles.length; i++) {
                try {
                    const response = await axios.get(url, {
                        responseType: 'arraybuffer', timeout: 120000, maxRedirects: 5,
                        headers: headerProfiles[i], validateStatus: status => status >= 200 && status < 300
                    });
                    const buffer = Buffer.from(response.data || []);
                    if (buffer.length >= 50000) return buffer;
                    lastErr = new Error(`Video response too small (${buffer.length} bytes)`);
                } catch (err) {
                    lastErr = err;
                    console.log(`VIDEO DOWNLOAD HEADER PROFILE ${i + 1} FAILED:`, err.response?.status || err.message);
                }
            }
            throw lastErr || new Error('Download failed');
        };

        let videoBuffer;
        try {
            videoBuffer = await downloadVideoBuffer(dlUrl);
        } catch (downloadErr) {
            // A fresh Curious signed URL may resolve a 403 caused by a stale link.
            if (provider === 'Curious AIO v2' && /^https?:\/\//i.test(curiousInputUrl)) {
                console.log('VIDEO DOWNLOAD FAILED; refreshing Curious link once:', downloadErr.response?.status || downloadErr.message);
                const refresh = await axios.get(CURIOUS_AIO_URL, {
                    params: { url: curiousInputUrl },
                    headers: { 'x-api-key': CURIOUS_KEY, 'User-Agent': 'Mozilla/5.0' },
                    timeout: 120000
                });
                const refreshedUrl = extractVideoUrl(refresh.data);
                if (!refreshedUrl || refreshedUrl === dlUrl) throw downloadErr;
                dlUrl = refreshedUrl;
                videoBuffer = await downloadVideoBuffer(dlUrl);
            } else {
                throw downloadErr;
            }
        }
        if (videoBuffer.length < 50000) throw new Error(`Downloaded file is too small (${videoBuffer.length} bytes)`);

        await sock.sendMessage(from, {
            video: videoBuffer,
            mimetype: 'video/mp4',
            fileName: `${title.replace(/[\\/:*?"<>|]/g, '_').slice(0,100) || 'video'}.mp4`,
            caption: `🎬 *${title}*\n\n> _Source: ${provider}_\n> _Powered by DEAN-ULTRA_ ✅`
        }, { quoted: m });
        console.log(`VIDEO SENT via ${provider}; size=${videoBuffer.length}`);
    } catch (e) {
        console.log('VIDEO COMMAND ERROR:', e.response?.status || e.message, e.stack || '');
        await sock.sendMessage(from, { text: `❌ Video failed: ${e.response?.status || ''} ${e.message.slice(0,160)}` }, { quoted: m });
    }
    return;
}
});
}
startBot();
