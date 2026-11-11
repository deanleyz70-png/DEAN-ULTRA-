const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const P = require("pino");
const yts = require("yt-search");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const FormData = require("form-data");
const { exec } = require("child_process");
const util = require("util");
const execAsync = util.promisify(exec);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let antiDB = {};
try{ antiDB = JSON.parse(fs.readFileSync('./anti.json')); }catch(e){ antiDB = {}; }
function saveAnti(){ fs.writeFileSync('./anti.json', JSON.stringify(antiDB, null, 2)); }
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
  if(action === 'delete') return;
  if(action === 'warn'){
    cfg.warns[sender] = (cfg.warns[sender]||0)+1;
    saveAnti();
    if(cfg.warns[sender] >= 3){
      delete cfg.warns[sender]; saveAnti();
      try{ await sock.groupParticipantsUpdate(from,[sender],"remove"); }catch(e){}
      return await sock.sendMessage(from,{text:`*Group Security*\n\n@${sender.split('@')[0]} has been removed after 3 warnings for sharing ${nice}.`, mentions:[sender]});
    } else {
      return await sock.sendMessage(from,{text:`*Warning ${cfg.warns[sender]}/3*\n\n@${sender.split('@')[0]} Please do not share ${nice} here.`, mentions:[sender]});
    }
  }
  if(action === 'kick'){
    try{ await sock.groupParticipantsUpdate(from,[sender],"remove"); }catch(e){}
    return await sock.sendMessage(from,{text:`*Group Security*\n\n@${sender.split('@')[0]} has been removed.\n\n*Reason:* Sharing ${nice} is not allowed in this group.`, mentions:[sender]});
  }
}
const ask = (q) => new Promise(res => rl.question(q, res));
const APIX_BASE = 'https://apix.wolvarex.com';
const APIX_KEY = 'wxa_u_fb1ac38983';
const WOLFX_KEY = APIX_KEY;
const CURIOUS_KEY = "ct_RCt6zqQk-BQhc3EiV2z3S-GV0PGoL348Y7g556E5WYY"; // from API Access page
const CURIOUS_BASE = "https://curiousapis.name.ng";
let PREFIX = ".";
let MODE = "Public";
let BOTNAME = 'Bot';
let OWNERNAME = 'Owner';
let OWNERNUMBER = '26700000000';
let MENUIMAGE = null;
const OWNER_NUMBERS = ['26777763889@s.whatsapp.net'];
let START = Date.now();
let antilinkGroups = new Map();
let warns = new Map();
let cooldown = new Map();
let processedCache = new Set();
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
    const axios = require('axios');
    const fs = require('fs');
    const path = require('path');
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
  const fs = require('fs');
  const path = require('path');
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

  sock.ev.on('connection.update', u=>{
    if(u.connection==='open'){
      console.log("╔════════════════════════════════════╗\n║ ✅ DEAN-ULTRA V1 CONNECTED SUCCESSFULLY ||\n╚════════════════════════════════════╝");
      try {
  setTimeout(() => {
    sock.sendMessage(sock.user.id, { text: `✅ *DEAN-ULTRA V1 CONNECTED SUCCESSFULLY* ||\n\n🤖 Bot is now online and ready.\n🕒 Time: ${new Date().toLocaleString('en-GB', { timeZone: 'Africa/Gaborone' })}\n\nType *.menu* to get started.` });
  }, 5000);
} catch(e) { console.log("Failed to send connect msg:", e.message); } 
    }
    if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut) startBot();
  });
       sock.ev.on('messages.upsert', async ({type, messages})=>{
    if(type !== "notify") return;
    const m=messages[0];
    if(!m) return;
    if(!m.message) return;
    const bodyCheck = m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||"";
    // === LOOP FIX - blocks bot replying to its own output ===
    if(m.key.fromMe && (bodyCheck.startsWith("*ADMINS -") || bodyCheck.startsWith("ℹ️ GROUP STAFF") || bodyCheck.startsWith("📢 Attention") || bodyCheck.startsWith("ADMINS - My accounts"))) return;
    if(processedCache.has(m.key.id)) return;
    processedCache.add(m.key.id);
    setTimeout(()=> processedCache.delete(m.key.id), 8000);
       const senderId = m.key.participant || m.key.remoteJid
    const isOwner = m.key.fromMe || OWNER_NUMBERS.includes(senderId)
await sock.readMessages([m.key]).catch(()=>{});
    const from=m.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
         let isGroupAdmin = false;
if(isGroup){
  try{
    const _md = await sock.groupMetadata(from);
    const _me = _md.participants.find(p=>p.id===senderId);
    if(_me && (_me.admin==='admin' || _me.admin==='superadmin')) isGroupAdmin = true;
  }catch(e){}
}
const isAdminOrOwner = isOwner || isGroupAdmin; 
    const body=m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||"";
        // ===== ANTI DETECTOR - Block 3 FIXED =====
if(isGroup && !m.key.fromMe){
  const cfgAnti = getAnti(from);
  const senderAnti = m.key.participant || m.key.remoteJid;
  const msgAnti = m.message;
  const mtypeAnti = msgAnti ? Object.keys(msgAnti)[0] : "";
console.log("ANTI DEBUG:", mtypeAnti, "keys:", Object.keys(msgAnti || {}), "sender:", senderAnti);
  // FIX: get contextInfo from ANY message type, not just first one
  let ctxAnti = {};
  for(let k of Object.keys(msgAnti || {})){
    if(msgAnti[k] && msgAnti[k].contextInfo){ ctxAnti = msgAnti[k].contextInfo; break; }
  }
  
  let isSenderAdminAnti = false;
  try{
    const metaAnti = await sock.groupMetadata(from);
    const partAnti = metaAnti.participants.find(p=>p.id===senderAnti);
    if(partAnti && (partAnti.admin === 'admin' || partAnti.admin === 'superadmin')) isSenderAdminAnti = true;
  }catch(e){}
  
  if(!isSenderAdminAnti){
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
if(isGroup && antilinkGroups.has(from)){
let b=(body||"").toLowerCase();
if(b.includes("https://")||b.includes("http://")||b.includes("chat.whatsapp.com")||b.includes("www.")){
const mode=antilinkGroups.get(from);
const sender=m.key.participant||from;
try{
const md=await sock.groupMetadata(from);
let adm=md.participants.find(p=>p.id===sender);
if(adm&&(adm.admin||adm.isAdmin)) return;
}catch(e){}
try{
await sock.sendMessage(from,{delete:m.key});
let tag=sender.split("@")[0];
if(mode==="delete"){await sock.sendMessage(from,{text:"@"+tag+" Link deleted!",mentions:[sender]});}
if(mode==="warn"){
let c=(warns.get(sender)||0)+1;warns.set(sender,c);
if(c>=3){await sock.sendMessage(from,{text:"@"+tag+" 3 warnings - kicking!",mentions:[sender]});await sock.groupParticipantsUpdate(from,[sender],"remove");warns.delete(sender);}
else{await sock.sendMessage(from,{text:"@"+tag+" Warned! Links not allowed ("+c+"/3)",mentions:[sender]});}
}
if(mode==="kick"){await sock.sendMessage(from,{text:"@"+tag+" Kicked for link!",mentions:[sender]});await sock.groupParticipantsUpdate(from,[sender],"remove");}
}catch(e){}
}
}
    const lm = String(MODE||"public").toLowerCase();
    if(lm === "group") { if(!isGroup) return; }
    if(lm === "private") { if(isGroup) return; }
    const args=body.slice(PREFIX.length).trim().split(/ +/);
    const cmd=args.shift().toLowerCase();
    const query=args.join(" ");
    const hrstart = process.hrtime();
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
                  const totalCmds = (fs.readFileSync(__filename,'utf8').match(/if\(cmd===/g)||[]).length;
              let text = `┌◇ DEAN-ULTRA ◇┐
│ PREFIX: [ ${PREFIX} ]
│ OWNER: Theo
│ MODE: 🌐 ${MODE}
│ PLATFORM: 💻 ${platform}
│ SPEED: ${speedMs} ms
│ UPTIME: ${up.trim()}
│ VERSION: v1.0.0
│ USAGE: ${memUsed} MB of ${memTotal} GB
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

_By DEAN-ULTRA_ 👑`;  
        await sock.sendMessage(from, {text: text}, {quoted: m});
      }catch(e){ console.log("Menu error", e.message); }
    } 
    if(cmd==="ping"){
      const elapsed = process.hrtime(hrstart);
      const speed = (elapsed[0]*1000 + elapsed[1]/1e6).toFixed(3);
      return await sock.sendMessage(from,{text:`🚀 DEAN ULTRA SPEED: ${speed} ms`},{quoted:m});
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
    
    await sock.sendMessage(from, {text:"_Downloading..._"}, {quoted:m});
    
    let res = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    let data = res.data?.data;
    if(!data || !data.play) throw new Error("Failed to fetch");
    
    await sock.sendMessage(from, {video:{url:data.play}, caption:`Powered by Dean-Ultra ✅`, mimetype:"video/mp4"}, {quoted:m});
  }catch(e){
    await sock.sendMessage(from, {text:`_TT Failed: ${e.message}_`}, {quoted:m});
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
    
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const { data: html } = await axios.get(searchUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    let match = html.match(/var ytInitialData = (.*?);<\/script>/);
    if(!match) throw new Error("YouTube blocked");
    const ytData = JSON.parse(match[1]);
    const contents = ytData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
    let results = [];
    for(let c of contents){
      let v = c.videoRenderer;
      if(v){ results.push(`*${v.title?.runs?.[0]?.text}*\nhttps://youtu.be/${v.videoId}`); }
      if(results.length>=5) break;
    }
    if(!results.length) throw new Error("No results");
    await sock.sendMessage(from, {text:results.join("\n\n")}, {quoted:m});
  }catch(e){
    await sock.sendMessage(from, {text:`YTS Failed: ${e.message}`}, {quoted:m});
  }
  return;
}   
        if(cmd==="find" || cmd==="shazam"){
      try{
        const contextInfo = m.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;
        if(!quotedMsg) return await sock.sendMessage(from,{text:"*Reply to a video/song with .shazam* - e.g reply to Lizzy's video"},{quoted:m});
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const quotedType = Object.keys(quotedMsg)[0];
        const mediaMsg = quotedMsg[quotedType];
        const stream = await downloadContentFromMessage(mediaMsg, quotedType.replace('Message',''));
        let chunks = []; for await (const c of stream) chunks.push(c);
        let buffer = Buffer.concat(chunks);
        if(!buffer.length) return await sock.sendMessage(from,{text:"_Failed to download video - resend it_ "},{quoted:m});
        const tmpIn = path.join(os.tmpdir(), `find_in_${Date.now()}.mp4`);
        fs.writeFileSync(tmpIn, buffer);
        let finalPath = tmpIn;
        try{
          const { execSync } = require('child_process');
          const tmpOut = path.join(os.tmpdir(), `find_out_${Date.now()}.mp3`);
          execSync(`ffmpeg -y -i "${tmpIn}" -t 15 -vn -b:a 128k "${tmpOut}"`, {timeout:15000});
          if(fs.existsSync(tmpOut)) finalPath = tmpOut;
        }catch(e){ console.log("ffmpeg skip:", e.message); }
        let title=null, artist=null, cover=null, found=false;
        try{
          const form = new FormData();
          form.append('audio', fs.createReadStream(finalPath));
          const res = await axios.post('https://apix.wolvarex.com/api/shazam/recognize', form, { headers: {...form.getHeaders(), "x-api-key": WOLFX_KEY }, timeout: 30000 });
          const d = res.data?.data || res.data?.result || res.data?.track || res.data;
          if(d){ title = d.title || d.name; artist = d.artist || d.subtitle; cover = d.image || d.cover || ""; if(title) found=true; console.log("Shazam found:", title); }
        }catch(e){ console.log("APIX fail", e.response?.data || e.message); }
        if(!found && AUDD_KEY){
          try{
            const form2 = new FormData();
            form2.append('file', fs.createReadStream(finalPath));
            form2.append('api_token', AUDD_KEY);
            form2.append('return', 'apple_music,spotify');
            const res2 = await axios.post('https://api.audd.io/', form2, { headers: form2.getHeaders(), timeout: 20000 });
            const r = res2.data?.result;
            if(r?.title){ title=r.title; artist=r.artist; cover=r.spotify?.album?.images?.[0]?.url||""; found=true; }
          }catch(e){ console.log("AUDD fail", e.message); }
        }
        try{ fs.unlinkSync(finalPath); }catch{} 
        try{ if(finalPath!==tmpIn) fs.unlinkSync(tmpIn); }catch{}
        if(!found) return await sock.sendMessage(from,{text:`_Find failed: No match - try clearer audio (15 sec with vocals)_`},{quoted:m});
        let text = `*🎧 FOUND!*\n\n*Title:* ${title}\n*Artist:* ${artist}\n\n_Use .play ${title}_\n\n> _Powered by DEAN-ULTRA ✅_`;
        if(cover){ try{ return await sock.sendMessage(from,{ image: { url: cover }, caption: text },{quoted:m}); } catch{ return await sock.sendMessage(from,{text},{quoted:m}); } } else { return await sock.sendMessage(from,{text},{quoted:m}); }
      }catch(e){ console.log("FIND CRASH", e.message); return await sock.sendMessage(from,{text:`_Find failed: ${e.message.slice(0,80)}_`},{quoted:m}); }
    }
       if(cmd==="setprefix"){ 
      if(!isOwner) return await sock.sendMessage(from,{text:"❌ Owner command only"},{quoted:m});
      PREFIX = query.trim() || PREFIX; 
      return await sock.sendMessage(from,{text:`✅ Prefix: [ ${PREFIX} ]`},{quoted:m}); 
    }
  if(cmd==="setbotname"){
  if(!isOwner) return await sock.sendMessage(from,{text:"❌ Owner command only"},{quoted:m});
  if(!query) return await sock.sendMessage(from,{text:"Usage: .setbotname <name>"},{quoted:m});
  BOTNAME = query.trim();
  return await sock.sendMessage(from,{text:`✅ Bot Name: [ ${BOTNAME} ]`},{quoted:m});
}
if(cmd==="setownername"){
  if(!isOwner) return await sock.sendMessage(from,{text:"❌ Owner command only"},{quoted:m});
  if(!query) return await sock.sendMessage(from,{text:"Usage: .setownername <name>"},{quoted:m});
  OWNERNAME = query.trim();
  return await sock.sendMessage(from,{text:`✅ Owner Name: [ ${OWNERNAME} ]`},{quoted:m});
}
if(cmd==="setownernumber"){
  if(!isOwner) return await sock.sendMessage(from,{text:"❌ Owner command only"},{quoted:m});
  if(!query) return await sock.sendMessage(from,{text:"Usage: .setownernumber <number> e.g. 26770000000"},{quoted:m});
  OWNERNUMBER = query.trim().replace(/[^0-9]/g,'');
  return await sock.sendMessage(from,{text:`✅ Owner Number: [ ${OWNERNUMBER} ]`},{quoted:m});
}
if(cmd==="setmenuimage"){
  if(!isOwner) return await sock.sendMessage(from,{text:"❌ Owner command only"},{quoted:m});
  let q = m.quoted ? m.quoted : m;
  let mime = (q.msg || q.message || {}).mimetype || '';
  if(!mime.includes('image')) return await sock.sendMessage(from,{text:"Reply to an image with .setmenuimage"},{quoted:m});
  try{
    let stream = await downloadContentFromMessage(q.msg || q.message, 'image');
    let buffer = Buffer.from([]);
    for await(const chunk of stream){ buffer = Buffer.concat([buffer, chunk]); }
    MENUIMAGE = buffer;
    return await sock.sendMessage(from,{text:"✅ Menu image updated"},{quoted:m});
  }catch(e){ return await sock.sendMessage(from,{text:"❌ Failed to save image"},{quoted:m}); }
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
const MUSIC_API_KEY = "wxa_u_fb1ac38983";

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
  const input = `/tmp/in_${Date.now()}.mp3`;
  const output = `/tmp/out_${Date.now()}.mp3`;
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(input, Buffer.from(res.data));
  try { await execAsync(`ffmpeg -y -i "${input}" -b:a 128k -ar 44100 "${output}"`); } catch(e) { return fs.readFileSync(input); }
  const buf = fs.readFileSync(output);
  try { fs.unlinkSync(input); } catch(e) {}
  try { fs.unlinkSync(output); } catch(e) {}
  return buf;
}

async function getMusic(query) {
    let dlUrl = null, title = query, source = '';

    // TRY 1: Apix PREMIUM - Unlimited - PRIMARY
    try {
        const res = await axios.get(`${APIX_BASE}/download/mp3`, {
            params: { q: query },
            headers: { 'x-api-key': APIX_KEY },
            timeout: 30000
        });
        const d = res.data;
        dlUrl = d?.downloadUrl || d?.url || d?.result?.downloadUrl || d?.result?.url || d?.data?.url;
        if (d?.title) title = d.title;
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
    return { dlUrl, title, source };
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
        await sock.sendMessage(from, { text: `❌ Failed: ${e.message}` }, { quoted: m });
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
          if(cmd==="watch"){
  var q = args.join(" ").trim();
  if(!q) return await sock.sendMessage(from,{text:"Usage: .watch vikings"},{quoted:m});
  var enc = encodeURIComponent(q);
  var txt = "🔍 *Where to watch: "+q+"*\n\n"
    + "📺 JustWatch: https://www.justwatch.com/bw/search?q="+enc+"\n"
    + "📺 JustWatch ZA: https://www.justwatch.com/za/search?q="+enc+"\n"
    + "🎬 Netflix: https://www.netflix.com/search?q="+enc+"\n"
    + "🎬 YouTube: https://www.youtube.com/results?search_query="+encodeURIComponent(q+" trailer")+"\n"
    + "🎬 Tubi: https://tubitv.com/search/"+enc+"\n\n"
    + "Tip: Search on JustWatch first - it shows Netflix / Prime / Showmax for BW/ZA.";
  await sock.sendMessage(from,{text:txt},{quoted:m});
  return;
} 
     // +video - NEW Wolvrex endpoint
if (cmd === 'video') {
    if (!args) return reply('❌ Usage: +video <song / video name>\nExample: +video Culture Love Bybit');
    try {
        await reply('🎬 Searching & downloading video... please wait');

        const res = await axios.get(`https://apis.xwolf.space/download/mp4`, {
            params: { q: args },
            headers: { 'x-api-key': WOLFX_KEY },
            timeout: 120000
        });

        let dlUrl = res.data?.downloadUrl || res.data?.url || res.data?.result?.downloadUrl || res.data?.result?.url || res.data?.data?.url || res.data?.link;

        if (!dlUrl) {
            // Fallback to alternate provider
            const res2 = await axios.get(`https://apis.xwolf.space/download/ytmp5`, {
                params: { url: args },
                headers: { 'x-api-key': WOLFX_KEY },
                timeout: 120000
            });
            dlUrl = res2.data?.downloadUrl || res2.data?.url || res2.data?.result?.url;
        }

        if (!dlUrl) return reply('❌ Could not get video link. Try +play instead');

        const file = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000 });
        await sock.sendMessage(from, {
            video: Buffer.from(file.data),
            mimetype: 'video/mp4',
            fileName: `${args}.mp4`,
            caption: `🎬 *${args}*\n_Downloaded by DEAN-ULTRA_`
        }, { quoted: msg });

    } catch (e) {
        console.log('VIDEO ERROR:', e.message);
        reply(`❌ Failed: ${e.message}`);
    }
}
});
}
startBot();