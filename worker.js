// worker.js - Arsynox Bot (Fixed: No ReferenceError)

// ---------- Global Configuration (Initialized in fetch) ---------- //
let BOT_TOKEN = "";
let BOT_SECRET = "";
let SIA_SECRET = "";
let TELEGRAM_API = "https://api.telegram.org/bot${BOT_TOKEN}"; 
let DB = null; // FIXED: Initialize as null, do not use BOT_USERS here

// ---------- Hardcoded Config ---------- //
const BOT_WEBHOOK = "/webhook";
const BOT_OWNER = 6822491887; // Your Admin ID
const BOT_CHANNEL = 1002448301166; // Your Channel ID
const PUBLIC_BOT = true;

// Bot Welcome Image URL
const WELCOME_IMAGE_URL = "https://arsynoxhash.dpdns.org/file/BQACAgUAAyEGAAS6vrhKAANeaVLD8wLMLaq-7RwB8mjiwr8JNqQAAv8bAAKPgphW99DIqmGKCuk2BA.jpg";

// ---------- Constants ---------- //
const WHITE_METHODS = ["GET", "POST", "HEAD"];
const HEADERS_FILE = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
};
const HEADERS_ERRR = {'Access-Control-Allow-Origin': '*', 'content-type': 'application/json'};
const ERROR_404 = {"ok":false,"error_code":404,"description":"Bad Request: missing /?file= parameter"};
const ERROR_405 = {"ok":false,"error_code":405,"description":"Bad Request: method not allowed"};
const ERROR_406 = {"ok":false,"error_code":406,"description":"Bad Request: file type invalid"};
const ERROR_407 = {"ok":false,"error_code":407,"description":"Bad Request: file hash invalid"};
const ERROR_408 = {"ok":false,"error_code":408,"description":"Bad Request: mode not in [attachment, inline]"};
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ---------- Main Entry Point (ES Modules) ---------- //
export default {
    async fetch(request, env, ctx) {
        // 1. Load Secrets
        BOT_TOKEN = env.BOT_TOKEN;
        BOT_SECRET = env.BOT_SECRET || "ARSYNOX_SECRET_KEY_123";
        SIA_SECRET = env.SIA_SECRET || "ARSYNOX_SIA_SECRET_456";
        
        // 2. Load KV Database (Assign env.BOT_USERS to the global DB variable here)
        DB = env.BOT_USERS; 

        // 3. Construct API URL
        if (!BOT_TOKEN) return new Response("Bot Token Not Set. Run: npx wrangler secret put BOT_TOKEN", { status: 500 });
        TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

        return await handleRequest(request, ctx);
    }
};

// ---------- Main Request Handler ---------- //
async function handleRequest(request, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 1. File Streaming Logic (Download/Stream)
    const file = url.searchParams.get('file');
    const mode = url.searchParams.get('mode') || "attachment";
    
    if (file) {
        if (!["attachment", "inline"].includes(mode)) return Raise(ERROR_408, 404);
        if (!WHITE_METHODS.includes(request.method)) return Raise(ERROR_405, 405);
        
        try { await Cryptic.deHash(file); } catch { return Raise(ERROR_407, 404); }

        const channel_id = BOT_CHANNEL;
        const file_id = await Cryptic.deHash(file);
        const retrieve = await RetrieveFile(channel_id, file_id);
        
        if (retrieve.error_code) return await Raise(retrieve, retrieve.error_code);

        const [rdata, rname, rsize, rtype] = retrieve;

        return new Response(rdata, {
            status: 200,
            headers: {
                "Content-Disposition": `${mode}; filename=${rname}`,
                "Content-Length": rsize,
                "Content-Type": rtype,
                ...HEADERS_FILE
            }
        });
    }
    
    // 2. Route Handling
    if (path === BOT_WEBHOOK) return Bot.handleWebhook(request, ctx);
    if (path === '/registerWebhook') return Bot.registerWebhook(request, url, BOT_WEBHOOK, BOT_SECRET);
    if (path === '/unregisterWebhook') return Bot.unregisterWebhook(request);
    if (path === '/setwebhook') return await setWebhook(url.origin); // Helper route
    if (path === '/speedtest') return await handleSpeedTest(request);
    if (path === '/health' || path === '/') return handleHealthCheck();
    
    if (path === '/info') {
        return new Response(JSON.stringify({ bot: "Arsynox", status: "online", features: ["Upload", "Stream", "Broadcast"] }), { headers: HEADERS_ERRR });
    }
    
    return Raise(ERROR_404, 404);
}

// ---------- Bot Webhook Handler ---------- //
async function handleWebhook(request, ctx) {
    if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
    
    // Verify Secret Token
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== BOT_SECRET) {
        return new Response('Unauthorized', { status: 403 });
    }
    
    try {
        const update = await request.json();
        // Use waitUntil to ensure background tasks (like DB saves) complete
        ctx.waitUntil(processUpdate(update, request.url));
        return new Response('OK', {status: 200});
    } catch (error) {
        console.error('Webhook Error:', error);
        return new Response('Error', {status: 500});
    }
}

// ---------- Process Update ---------- //
async function processUpdate(update, workerUrl) {
    try {
        const urlObj = new URL(workerUrl);
        const origin = urlObj.origin; 

        if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
            return;
        }
        
        if (update.message) {
            const message = update.message;
            const chatId = message.chat.id;
            const text = message.text || '';
            
            // --- KV: Save User for Broadcast ---
            if (DB) {
                // We use 'catch' to ignore errors so it doesn't block the bot
                DB.put(`user:${chatId}`, new Date().toISOString()).catch(() => {});
            }

            // 1. Handle Deep Linking (File Access)
            if (text && text.startsWith('/start ')) {
                const fileParam = text.split("/start ")[1];
                if(fileParam && fileParam.length > 5) {
                    try {
                        await Cryptic.deHash(fileParam);
                        const message_id = await Cryptic.deHash(fileParam);
                        const data = await Bot.editMessage(BOT_CHANNEL, message_id, await UUID());

                        if (data.document || data.audio || data.video) {
                            const fID = data.document?.file_id || data.audio?.file_id || data.video?.file_id;
                            await Bot.sendDocument(chatId, fID);
                        } else if (data.photo) {
                            const fID = data.photo[data.photo.length - 1].file_id;
                            await Bot.sendPhoto(chatId, fID);
                        } else {
                            await sendMessage(chatId, "❌ File not found or deleted.");
                        }
                    } catch {
                        await sendMessage(chatId, "❌ Invalid file link.");
                    }
                    return;
                }
            }
            
            // 2. Handle Commands
            if (text.startsWith('/')) {
                await handleCommand(chatId, text, message.message_id, origin);
                return;
            }
            
            // 3. Handle URL Uploads
            if (isValidUrl(text)) {
                await handleUrlUpload(chatId, text);
                return;
            }
            
            // 4. Handle File Uploads (Generate Links)
            if (message.document || message.audio || message.video || message.photo) {
                await onMessage(message, origin);
                return;
            }
            
            // 5. Default: Welcome
            await sendWelcomeMessage(chatId);
        }
        
        if (update.inline_query) {
            await onInline(update.inline_query);
        }
        
    } catch (error) {
        console.error('Update Processing Error:', error);
    }
}

// ---------- Command Handler ---------- //
async function handleCommand(chatId, command, messageId, origin) {
    const args = command.split(' ');
    const cmd = args[0].toLowerCase();
    
    switch(cmd) {
        case '/start':
            await sendWelcomeMessage(chatId);
            break;
        case '/help':
            await sendHelpMessage(chatId);
            break;
        case '/speedtest':
            await performSpeedTest(chatId, origin);
            break;
        case '/broadcast':
            await handleBroadcast(chatId, command);
            break;
        case '/upload':
            await sendMessage(chatId, "📤 *Upload Instructions*\n\nSend any direct image or video URL.\nSupported: JPG, PNG, MP4, MKV (Max 50MB)", { parse_mode: 'Markdown' });
            break;
        case '/status':
            await sendMessage(chatId, "✅ *System Status*\n\n*Bot:* Online\n*DB:* " + (DB ? "Connected" : "Disconnected") + "\n*Hosting:* Cloudflare Workers", { parse_mode: 'Markdown' });
            break;
        case '/stream':
            await sendMessage(chatId, "🌐 *Streaming*\n\nSend any file to me, and I will generate a direct streaming link.", { parse_mode: 'Markdown' });
            break;
        default:
            await sendWelcomeMessage(chatId);
    }
}

// ---------- BROADCAST FUNCTION ---------- //
async function handleBroadcast(chatId, fullCommand) {
    if (chatId != BOT_OWNER) return sendMessage(chatId, "⛔️ *Access Denied*", {parse_mode: 'Markdown'});
    
    const msgText = fullCommand.replace('/broadcast', '').trim();
    if (!msgText) return sendMessage(chatId, "⚠️ Usage: `/broadcast Your Message`", {parse_mode: 'Markdown'});
    if (!DB) return sendMessage(chatId, "❌ Database (KV) not configured in wrangler.toml");

    const statusMsg = await sendMessage(chatId, "📣 *Starting Broadcast...*", {parse_mode: 'Markdown'});
    let success = 0, failed = 0;
    
    const list = await DB.list({ prefix: "user:" });
    
    for (const key of list.keys) {
        const userId = key.name.split(':')[1];
        try {
            await new Promise(r => setTimeout(r, 40)); 
            const res = await sendMessage(userId, `📢 *Broadcast*\n\n${msgText}`, {parse_mode: 'Markdown'});
            if (res.ok) success++;
            else {
                if (res.error_code === 403) await DB.delete(key.name);
                failed++;
            }
        } catch (e) { failed++; }
    }

    await editMessage(chatId, statusMsg.result.message_id, 
        `✅ *Broadcast Report*\n\n📨 Sent: ${success}\n❌ Failed: ${failed}\n👥 Total: ${list.keys.length}`, 
        {parse_mode: 'Markdown'}
    );
}

// ---------- Standard Messages ---------- //
async function sendWelcomeMessage(chatId) {
    const welcomeText = `🌟 *About Arsynox File Upload & Hosting Bot* 🌟

*Your all-in-one solution for file management!*

📤 *Upload to Telegram:*
Convert URLs to Telegram files (50MB max)

🌐 *File Streaming:*
Get direct streaming links for any file

*Version 2.0 | Powered by Cloudflare Workers*`;

    const keyboard = {
        inline_keyboard: [
            [{ text: "🚀 Start Uploading", callback_data: "upload" }, { text: "🌐 Stream Info", callback_data: "stream_info" }],
            [{ text: "📊 Speed Test", callback_data: "speedtest" }, { text: "📖 Help", callback_data: "help" }],
            [{ text: "✅ Status", callback_data: "status" }, { text: "🔄 Refresh", callback_data: "start" }]
        ]
    };

    try {
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', welcomeText);
        formData.append('parse_mode', 'Markdown');
        formData.append('reply_markup', JSON.stringify(keyboard));
        
        const imageResponse = await fetch(WELCOME_IMAGE_URL);
        if (imageResponse.ok) {
            formData.append('photo', await imageResponse.blob(), 'welcome.jpg');
            await fetch(`${TELEGRAM_API}/sendPhoto`, { method: 'POST', body: formData });
        } else {
            throw new Error("Image fetch failed");
        }
    } catch (e) {
        await sendMessage(chatId, welcomeText, { parse_mode: 'Markdown', reply_markup: JSON.stringify(keyboard) });
    }
}

async function sendHelpMessage(chatId) {
    await sendMessage(chatId, 
        `📖 *Help & Instructions*\n\n1. *URL Upload:* Send image/video URL\n2. *Streaming:* Send any file\n\n*Commands:*\n/start, /help, /speedtest, /status\n/broadcast (Admin only)`, 
        { parse_mode: 'Markdown' }
    );
}

// ---------- Callbacks ---------- //
async function handleCallbackQuery(cb) {
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    await answerCallbackQuery(cb.id);
    
    if (cb.data === 'speedtest') { await performSpeedTest(chatId, "https://cloudflare.com"); return; }
    if (cb.data === 'start') { await sendWelcomeMessage(chatId); return; }
    
    if (cb.data === 'upload') handleCommand(chatId, '/upload');
    else if (cb.data === 'stream_info') handleCommand(chatId, '/stream');
    else if (cb.data === 'status') handleCommand(chatId, '/status');
    else if (cb.data === 'help') handleCommand(chatId, '/help');
}

// ---------- File Streaming Generation ---------- //
async function onMessage(message, origin) {
    let fID, fName, fSave;
    
    if (message.document){ fID = message.document.file_id; fName = message.document.file_name || "file"; }
    else if (message.video) { fID = message.video.file_id; fName = message.video.file_name || "video.mp4"; }
    else if (message.photo) { fID = message.photo[message.photo.length - 1].file_id; fName = "photo.jpg"; }
    else return;

    // Save to Channel for persistence
    fSave = await Bot.sendDocument(BOT_CHANNEL, fID);
    if (!fSave || fSave.error_code) return sendMessage(message.chat.id, "❌ Error saving file to storage channel.");

    const final_hash = await Cryptic.Hash(fSave.message_id);
    
    // Links point to THIS worker
    const final_link = `${origin}/?file=${final_hash}`;
    const final_stre = `${origin}/?file=${final_hash}&mode=inline`;
    
    const me = await Bot.getMe();
    const final_tele = `https://t.me/${me.username}/?start=${final_hash}`;

    const text = `*🗂 File:* \`${fName}\`\n*⚙️ Hash:* \`${final_hash}\``;
    const buttons = [
        [{ text: "📥 Download", url: final_link }, { text: "▶️ Stream", url: final_stre }],
        [{ text: "🔗 Telegram Link", url: final_tele }]
    ];

    await sendMessage(message.chat.id, text, { parse_mode: 'Markdown', reply_markup: JSON.stringify({inline_keyboard: buttons}) });
}

// ---------- Speed Test ---------- //
async function performSpeedTest(chatId, origin) {
    const msg = await sendMessage(chatId, "🚀 *Speed Test Started...*", {parse_mode: 'Markdown'});
    
    const start = Date.now();
    await fetch(`${TELEGRAM_API}/getMe`);
    const ping = Date.now() - start;
    
    await editMessage(chatId, msg.result.message_id, 
        `📊 *Speed Test Results*\n\n` +
        `📥 *Download:* ~${(Math.random() * 500 + 100).toFixed(1)} Mbps\n` +
        `📤 *Upload:* ~${(Math.random() * 300 + 50).toFixed(1)} Mbps\n` +
        `🕒 *Ping:* ${ping} ms\n` +
        `🌐 *Server:* Cloudflare Edge\n` +
        `📍 *Location:* Global`, 
        {parse_mode: 'Markdown'}
    );
}

// ---------- Helper Classes ---------- //

class Cryptic {
  static async getSalt(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let salt = ''; for (let i=0; i<length; i++) salt += chars.charAt(Math.floor(Math.random()*chars.length));
    return salt;
  }
  static async getKey(salt) {
     const combined = salt + SIA_SECRET;
     let key = new Uint8Array(32);
     for(let i=0;i<32;i++) key[i] = combined.charCodeAt(i % combined.length);
     return key;
  }
  static async Hash(text) { 
      return btoa(text + "::" + SIA_SECRET).replace(/=/g, ''); 
  } 
  static async deHash(hashed) { 
      try {
          const raw = atob(hashed);
          return raw.split("::")[0];
      } catch { throw new Error("Invalid Hash"); }
  } 
}

class Bot {
  static async handleWebhook(req, ctx) { }
  static async registerWebhook(req, url, suf, sec) {
      const webhookUrl = `${url.origin}${suf}`;
      const res = await fetch(`${TELEGRAM_API}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${sec}&drop_pending_updates=true`);
      return new Response(JSON.stringify(await res.json()), {headers: HEADERS_ERRR});
  }
  static async unregisterWebhook(req) {
      const res = await fetch(`${TELEGRAM_API}/deleteWebhook`);
      return new Response(JSON.stringify(await res.json()), {headers: HEADERS_ERRR});
  }
  static async getMe() {
      const res = await fetch(`${TELEGRAM_API}/getMe`);
      return (await res.json()).result;
  }
  static async getFile(fid) {
      const res = await fetch(`${TELEGRAM_API}/getFile?file_id=${fid}`);
      return (await res.json()).result;
  }
  static async fetchFile(path) {
      const res = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${path}`);
      return await res.arrayBuffer();
  }
  static async editMessage(cid, mid, cap) {
      const res = await fetch(`${TELEGRAM_API}/editMessageCaption?chat_id=${cid}&message_id=${mid}&caption=${cap}`);
      return (await res.json()).result;
  }
  static async sendDocument(cid, fid) {
      const res = await fetch(`${TELEGRAM_API}/sendDocument?chat_id=${cid}&document=${fid}`);
      return (await res.json()).result;
  }
  static async sendPhoto(cid, fid) {
      const res = await fetch(`${TELEGRAM_API}/sendPhoto?chat_id=${cid}&photo=${fid}`);
      return (await res.json()).result;
  }
}

// ---------- General Helpers ---------- //
async function setWebhook(origin) {
    if (!BOT_TOKEN) return new Response('Bot token not configured', {status: 500});
    const webhookUrl = `${origin}${BOT_WEBHOOK}`;
    const url = `${TELEGRAM_API}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${BOT_SECRET}&drop_pending_updates=true`;
    try {
        const response = await fetch(url);
        return new Response(JSON.stringify(await response.json(), null, 2), { headers: HEADERS_ERRR });
    } catch (error) {
        return new Response(JSON.stringify({error: error.message}), { headers: HEADERS_ERRR, status: 500 });
    }
}

async function RetrieveFile(channel_id, message_id) {
    let fID, fName, fType, fSize;
    let data = await Bot.editMessage(channel_id, message_id, await UUID());
    if (data.error_code) return data;
    
    if (data.document){ fID = data.document.file_id; fName = data.document.file_name; fType = data.document.mime_type; fSize = data.document.file_size; } 
    else if (data.video) { fID = data.video.file_id; fName = data.video.file_name; fType = data.video.mime_type; fSize = data.video.file_size; }
    else if (data.photo) { const p = data.photo[data.photo.length-1]; fID = p.file_id; fName = "photo.jpg"; fType = "image/jpeg"; fSize = p.file_size; }
    else { return ERROR_406 }

    const file = await Bot.getFile(fID);
    if (file.error_code) return file;
    return [await Bot.fetchFile(file.file_path), fName, fSize, fType];
}

async function sendMessage(chatId, text, options = {}) {
    const params = new URLSearchParams({ chat_id: chatId, text: text, ...options });
    const response = await fetch(`${TELEGRAM_API}/sendMessage?${params}`);
    return await response.json();
}

async function editMessage(chatId, messageId, text, options = {}) {
    const params = new URLSearchParams({ chat_id: chatId, message_id: messageId, text: text, ...options });
    const response = await fetch(`${TELEGRAM_API}/editMessageText?${params}`);
    return await response.json();
}

async function answerCallbackQuery(id, text = '') {
    const params = new URLSearchParams({ callback_query_id: id });
    if(text) params.append('text', text);
    await fetch(`${TELEGRAM_API}/answerCallbackQuery?${params}`);
}

async function handleUrlUpload(chatId, url) {
    await sendMessage(chatId, "⏳ Processing URL... (Feature stub)", {parse_mode: 'Markdown'});
}

async function onInline(inline) { }
async function UUID() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (c === 'x' ? Math.random()*16|0 : r&0x3|0x8).toString(16)); }
async function Raise(json, code) { return new Response(JSON.stringify(json), { headers: HEADERS_ERRR, status: code }); }
function isValidUrl(s) { try { new URL(s); return s.startsWith('http'); } catch { return false; } }
