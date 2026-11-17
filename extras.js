// extras.js - Dean - GROUP vs PERSONAL split - ANTISPAM FIXED - 1 NOTIFICATION ONLY
const fs = require("fs");
let db = {};
try { db = JSON.parse(fs.readFileSync('./extras.json')); } catch(e){ db = {}; }
function save(){ try{ fs.writeFileSync('./extras.json', JSON.stringify(db, null, 2)); }catch(e){} }
function getChat(id){
  if(!db[id]) db[id] = { antiviewonce:false, antispam:false, antibug:false, anticall:false, autoreact:false, autorecording:false, autostatusreact:false, autotyping:false, spam:{}, };
  if(!db[id].spam) db[id].spam = {};
  return db[id];
}
const GROUP_CMDS = ["antiviewonce","antispam","antibug"];
const PERSONAL_CMDS = ["anticall","autorecording","autostatusreact","autotyping","autoreact"];

// Silent-delete lock - in memory only, not saved to file
// Once a sender is actioned, all their next spam is deleted silently, no notification
const silentUntil = new Map();

function getRepeatHash(msg, text){
  const mtype = msg ? Object.keys(msg)[0] : "";
  const inner = msg?.[mtype] || {};
  if(mtype === 'contactMessage' || mtype === 'contactsArrayMessage'){
    const phones = JSON.stringify(msg).match(/\+?\d{10,15}/g);
    if(phones) return 'CONTACT:' + phones[0].replace(/\D/g,'');
    return 'CONTACT:UNKNOWN';
  }
  if(['stickerMessage','imageMessage','videoMessage','audioMessage','documentMessage'].includes(mtype)){
    const caption = (inner.caption || '').toLowerCase().trim();
    const fileId = inner.fileSha256 ? Buffer.from(inner.fileSha256).toString('hex') : (inner.fileId || inner.id || '');
    if(caption) return mtype + ':CAP:' + caption.replace(/[\s.,!?:;_*\-\n\r]+/g,'');
    if(fileId) return mtype + ':FILE:' + fileId;
  }
  const links = (text || '').match(/https?:\/\/[^\s]+|www\.[^\s]+/gi);
  if(links) return 'LINK:' + links[0].toLowerCase().replace(/\/$/,'').split('?')[0].split('#')[0];
  let t = (text || '').toLowerCase().replace(/[\s.,!?:;_*\-\n\r]+/g,'').trim();
  if(!t) return null;
  return 'TEXT:' + t;
}

async function handleExtras(ctx){
  const { sock, from, m, cmd, args, isOwner, isGroup, isAdminOrOwner, PREFIX } = ctx;
  if(PERSONAL_CMDS.includes(cmd)){
    if(!isOwner) return sock.sendMessage(from,{text:"❌ Owner only - only Dean's owner can use this"},{quoted:m});
    if(isGroup) return sock.sendMessage(from,{text:"❌ This is a personal command. Message Dean directly (message yourself) to turn it on, not in a group."},{quoted:m});
    const cfg = getChat("OWNER");
    if((args[0]||"").toLowerCase()==="on"){ cfg[cmd]=true; save(); return sock.sendMessage(from,{text:`✅ .${cmd} ON - Personal (applies everywhere)`},{quoted:m}); }
    if((args[0]||"").toLowerCase()==="off"){ cfg[cmd]=false; save(); return sock.sendMessage(from,{text:`❌ .${cmd} OFF`},{quoted:m}); }
    return sock.sendMessage(from,{text:`${cfg[cmd]?"✅ ON":"❌ OFF"} - Use .${cmd} on / .${cmd} off in DM`},{quoted:m});
  }
  if(GROUP_CMDS.includes(cmd)){
    if(!isGroup) return sock.sendMessage(from,{text:"❌ This is a group command. Use it in a group."},{quoted:m});
    if(!isAdminOrOwner && !isOwner) return sock.sendMessage(from,{text:"❌ Admin only"},{quoted:m});
    const cfg = getChat(from);
    if(cmd === "antispam"){
      const a1 = (args[0]||"").toLowerCase();
      const a2 = (args[1]||"").toLowerCase();
      if(["warn","kick","delete"].includes(a1)){ cfg.antispam = true; cfg.antispamAction = a1; save(); return sock.sendMessage(from,{text:`✅ .antispam ON - Group - Action: ${a1.toUpperCase()}\n\nSame message 3x = action (1 notification only)\nDifferent messages = allowed`},{quoted:m}); }
      if(a1 === "on" && ["warn","kick","delete"].includes(a2)){ cfg.antispam = true; cfg.antispamAction = a2; save(); return sock.sendMessage(from,{text:`✅ .antispam ON - Group - Action: ${a2.toUpperCase()}`},{quoted:m}); }
      if(a1 === "on"){ cfg.antispam = true; save(); return sock.sendMessage(from,{text:`✅ .antispam ON - Group - Action: ${(cfg.antispamAction||'delete').toUpperCase()}`},{quoted:m}); }
      if(a1 === "off"){ cfg.antispam = false; save(); return sock.sendMessage(from,{text:`❌ .antispam OFF`},{quoted:m}); }
      return sock.sendMessage(from,{text:`${cfg.antispam?"✅ ON":"❌ OFF"} - Action: ${(cfg.antispamAction||'delete').toUpperCase()}\nUse .antispam on / off / warn / kick / delete`},{quoted:m});
    }
    if((args[0]||"").toLowerCase()==="on"){ cfg[cmd]=true; save(); return sock.sendMessage(from,{text:`✅ .${cmd} ON - Group`},{quoted:m}); }
    if((args[0]||"").toLowerCase()==="off"){ cfg[cmd]=false; save(); return sock.sendMessage(from,{text:`❌ .${cmd} OFF`},{quoted:m}); }
    return sock.sendMessage(from,{text:`${cfg[cmd]?"✅ ON":"❌ OFF"} - Use .${cmd} on / .${cmd} off`},{quoted:m});
  }
  if(cmd==="leave"){
    if(!isOwner) return sock.sendMessage(from,{text:"❌ Owner only"},{quoted:m});
    await sock.sendMessage(from,{text:"👋 Leaving... Bye!"},{quoted:m});
    if(isGroup) await sock.groupLeave(from);
    return true;
  }
  return false;
}

async function autoFeatures(sock, m, from, isGroup){
  const cfg = getChat(from);
  const ownerCfg = getChat("OWNER");
  try{
    const msg = m.message;
    const vo = msg?.viewOnceMessage || msg?.viewOnceMessageV2 || msg?.viewOnceMessageV2Extension;
    if(cfg.antiviewonce && vo){
      const sender = m.key.participant || m.key.remoteJid;
      await sock.sendMessage(from, { text: `👁️ *AntiViewOnce* - @${sender.split('@')[0]} sent viewonce`, mentions:[sender] }, {quoted:m});
    }
  }catch(e){}

  // === ANTISPAM - 1 NOTIFICATION ONLY, LIKE XMD ===
  if(cfg.antispam && isGroup && !m.key.fromMe){
    try{
      const sender = m.key.participant || m.key.remoteJid;
      let isAdmin = false;
      try{
        const meta = await sock.groupMetadata(from);
        const p = meta.participants.find(x=>x.id===sender);
        if(p && (p.admin==='admin' || p.admin==='superadmin')) isAdmin = true;
      }catch(e){}
      if(!isAdmin){
        const body = m.message?.conversation || m.message?.extendedTextMessage?.text || m.message?.imageMessage?.caption || m.message?.videoMessage?.caption || "";
        if(!body.startsWith('.') && !body.startsWith('!') && !body.startsWith('+')){
          const hash = getRepeatHash(m.message, body);
          if(hash){
            const now = Date.now();
            if(!cfg.spam) cfg.spam = {};
            let entry = cfg.spam[sender];
            if(Array.isArray(entry)) entry = null;
            if(!entry || entry.hash !== hash || (now - entry.firstTime) > 60000){
              cfg.spam[sender] = { hash, count: 1, firstTime: now, warns: 0, notified: false };
              save();
            } else {
              entry.count++;
              const action = cfg.antispamAction || 'delete';
              save();

              // === SILENT MODE: already notified/kicked in last 60s ===
              // Delete this message, send NOTHING. This is what fixes the 15 notifications.
              const silentKey = from + '_' + sender;
              if(silentUntil.has(silentKey) && Date.now() < silentUntil.get(silentKey)){
                try{ await sock.sendMessage(from,{delete:m.key}); }catch(e){}
                return;
              }

              if(entry.count === 2){
                try{ await sock.sendMessage(from,{delete:m.key}); }catch(e){}
                return;
              }

              if(entry.count >= 3){
                try{ await sock.sendMessage(from,{delete:m.key}); }catch(e){}

                if(action === 'delete'){
                  // Delete only, 1 notification max, then silent for 60s
                  if(!entry.notified){
                    entry.notified = true; save();
                    silentUntil.set(silentKey, Date.now() + 60000);
                    await sock.sendMessage(from,{text:`🗑️ @${sender.split('@')[0]} Repeated message deleted.`, mentions:[sender]});
                  }
                  return;
                }

                if(action === 'warn'){
                  entry.warns = (entry.warns || 0) + 1;
                  save();
                  if(entry.warns >= 3){
                    // Lock silent mode BEFORE removing, so the other 12 messages in the burst don't trigger again
                    silentUntil.set(silentKey, Date.now() + 60000);
                    try{ await sock.groupParticipantsUpdate(from,[sender],"remove"); }catch(e){}
                    await sock.sendMessage(from,{text:`🚫 @${sender.split('@')[0]} Removed after 3 warnings for repeating same message.`, mentions:[sender]});
                    cfg.spam[sender] = { hash, count: 0, firstTime: now, warns: 0, notified: true };
                    save();
                  } else {
                    // Warn 1/3 and 2/3 - notify once per warn, then silent until next warn
                    // But if they spam 15x in a burst, we don't want 15 warns - so lock after this warn
                    silentUntil.set(silentKey, Date.now() + 60000);
                    await sock.sendMessage(from,{text:`⚠️ Warning ${entry.warns}/3\n\n@${sender.split('@')[0]} Stop repeating the same message.`, mentions:[sender]});
                    // Reset count so next burst starts fresh, warns stay
                    entry.count = 0; save();
                  }
                  return;
                }

                if(action === 'kick'){
                  // Lock silent mode FIRST, then kick, then 1 notification
                  silentUntil.set(silentKey, Date.now() + 60000);
                  try{ await sock.groupParticipantsUpdate(from,[sender],"remove"); }catch(e){}
                  await sock.sendMessage(from,{text:`🚫 @${sender.split('@')[0]} Removed for repeating same message.`, mentions:[sender]});
                  cfg.spam[sender] = { hash, count: 0, firstTime: now, warns: 0, notified: true };
                  save();
                  return;
                }
              }
            }
          }
        }
      }
    }catch(e){ console.log('ANTISPAM err:', e.message); }
  }

  if(cfg.antibug && !m.key.fromMe){
    const body = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
    if(body.length > 5000){
      try{ await sock.sendMessage(from,{delete:m.key}); }catch(e){}
      await sock.sendMessage(from,{text:`🛡️ Antibug: Crash message deleted`});
    }
  }
  if(ownerCfg.autoreact && !m.key.fromMe){
    try{ await sock.sendMessage(from,{react:{text:"❤️", key:m.key}}); }catch(e){}
  }
  if(ownerCfg.autorecording) try{ await sock.sendPresenceUpdate('recording', from); }catch(e){}
  if(ownerCfg.autotyping) try{ await sock.sendPresenceUpdate('composing', from); }catch(e){}
}
module.exports = { handleExtras, autoFeatures, getChat };