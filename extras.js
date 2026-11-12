// extras.js - Dean - GROUP vs PERSONAL split
const fs = require("fs");
let db = {};
try { db = JSON.parse(fs.readFileSync('./extras.json')); } catch(e){ db = {}; }
function save(){ try{ fs.writeFileSync('./extras.json', JSON.stringify(db, null, 2)); }catch(e){} }
function getChat(id){
  if(!db[id]) db[id] = { antiviewonce:false, antispam:false, antibug:false, anticall:false, autoreact:false, autorecording:false, autostatusreact:false, autotyping:false, spam:{}, };
  return db[id];
}
const GROUP_CMDS = ["antiviewonce","antispam","antibug"];
const PERSONAL_CMDS = ["anticall","autorecording","autostatusreact","autotyping","autoreact"];

async function handleExtras(ctx){
  const { sock, from, m, cmd, args, isOwner, isGroup, isAdminOrOwner, PREFIX } = ctx;

  // --- PERSONAL / OWNER ONLY ---
  if(PERSONAL_CMDS.includes(cmd)){
    // Must be owner AND must be in DM (not group) - message yourself
    if(!isOwner) return sock.sendMessage(from,{text:"❌ Owner only - only Dean's owner can use this"},{quoted:m});
    if(isGroup) return sock.sendMessage(from,{text:"❌ This is a personal command. Message Dean directly (message yourself) to turn it on, not in a group."},{quoted:m});
    // Use OWNER key so it applies everywhere, not just this DM
    const cfg = getChat("OWNER");
    if((args[0]||"").toLowerCase()==="on"){ cfg[cmd]=true; save(); return sock.sendMessage(from,{text:`✅ .${cmd} ON - Personal (applies everywhere)`},{quoted:m}); }
    if((args[0]||"").toLowerCase()==="off"){ cfg[cmd]=false; save(); return sock.sendMessage(from,{text:`❌ .${cmd} OFF`},{quoted:m}); }
    return sock.sendMessage(from,{text:`${cfg[cmd]?"✅ ON":"❌ OFF"} - Use .${cmd} on / .${cmd} off in DM`},{quoted:m});
  }

  // --- GROUP COMMANDS ---
  if(GROUP_CMDS.includes(cmd)){
    if(!isGroup) return sock.sendMessage(from,{text:"❌ This is a group command. Use it in a group."},{quoted:m});
    if(!isAdminOrOwner && !isOwner) return sock.sendMessage(from,{text:"❌ Admin only"},{quoted:m});
    const cfg = getChat(from);
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
  if(cfg.antispam && isGroup && !m.key.fromMe){
    const sender = m.key.participant || m.key.remoteJid;
    const now = Date.now();
    if(!cfg.spam[sender]) cfg.spam[sender] = [];
    cfg.spam[sender] = cfg.spam[sender].filter(t=>now-t<10000);
    cfg.spam[sender].push(now);
    if(cfg.spam[sender].length >= 6){
      cfg.spam[sender] = [];
      save();
      try{ await sock.sendMessage(from,{delete:m.key}); }catch(e){}
      await sock.sendMessage(from,{text:`⚠️ @${sender.split('@')[0]} Slow down! AntiSpam`, mentions:[sender]});
    }
    save();
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
  // Personal ones now check OWNER config, not group config
  if(ownerCfg.autorecording) try{ await sock.sendPresenceUpdate('recording', from); }catch(e){}
  if(ownerCfg.autotyping) try{ await sock.sendPresenceUpdate('composing', from); }catch(e){}
}
module.exports = { handleExtras, autoFeatures, getChat };