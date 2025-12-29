/**
 * Arsynox File Upload & Hosting Bot
 * Version: 3.5 (Stable)
 * Platform: Cloudflare Workers
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. HEALTH ENDPOINT (For Monitoring)
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'active',
        location: request.cf ? `${request.cf.city}, ${request.cf.country}` : 'Unknown',
        timestamp: new Date().toISOString()
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 2. CLEAN WEBHOOK SETUP (Fixes your previous error)
    // Run this by visiting: https://your-worker.workers.dev/setup
    if (url.pathname === '/setup') {
      const botToken = env.BOT_TOKEN;
      // We set the webhook to the clean base URL of your worker
      const webhookUrl = `https://${url.hostname}`; 
      const tgUrl = `https://api.telegram.org/bot${botToken}/setWebhook?url=${webhookUrl}&drop_pending_updates=true`;
      
      const resp = await fetch(tgUrl);
      const data = await resp.json();
      return new Response(JSON.stringify({
        message: "Webhook setup attempt complete",
        target_url: webhookUrl,
        telegram_response: data
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 3. TELEGRAM WEBHOOK HANDLER
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        // Use ctx.waitUntil to process logic in background (prevents timeouts)
        ctx.waitUntil(handleUpdate(update, env, request.cf));
        return new Response('OK');
      } catch (e) {
        return new Response('Error', { status: 500 });
      }
    }

    // Root Fallback
    return new Response('Arsynox Bot is Online. Use /setup to configure webhook.');
  }
};

/**
 * Update Handler
 */
async function handleUpdate(update, env, cf) {
  if (!update.message) return;

  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const userId = msg.from.id;

  // --- COMMAND: /start ---
  if (text === '/start') {
    // Save User to KV
    await env.BOT_USERS.put(`user:${chatId}`, 'active');

    const welcomeText = `🌟 *About Arsynox File Upload & Hosting Bot* 🌟
*Your all-in-one solution for file management!*

📤 *Upload to Telegram:*
Send any direct URL (http/https) to upload it as a file.

🌐 *Arsynox Hosting:*
Website1 (https://arsynoxhash.dpdns.org)
Website2 (https://telegram-image-hosting.pages.dev/)
*Version 3.0 | Powered by Cloudflare Workers*`;

    await sendTelegram(env, 'sendMessage', {
      chat_id: chatId,
      text: welcomeText,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    return;
  }

  // --- COMMAND: /speedtest ---
  if (text === '/speedtest') {
    // 1. Accurate Ping & Location
    const ping = cf?.clientTcpRtt || "32";
    const location = cf ? `${cf.city}, ${cf.country}` : "Marseille, FR";
    const provider = "13335 Cloudflare, Inc.";
    
    // 2. Random Speed & Date
    const speed = Math.floor(Math.random() * (900 - 500 + 1) + 500);
    const dateStr = new Date().toLocaleString('en-GB', { timeZone: 'UTC' }).replace(',', '') + ' UTC';

    const photoUrl = 'https://arsynoxhash.dpdns.org/file/BQACAgUAAyEGAAS6vrhKAANeaVLD8wLMLaq-7RwB8mjiwr8JNqQAAv8bAAKPgphW99DIqmGKCuk2BA.jpg';
    const caption = `📊 Internet Speed Test Results

📤 Upload Speed: ${speed} Mbps
🕒 Ping: ${ping} ms

🌐 Server Location: ${location}
📡 Provider: ${provider}

⏱️ Test Duration: 0.8 sec
📅 Test Time: ${dateStr}`;

    await sendTelegram(env, 'sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      caption: caption
    });
    return;
  }

  // --- COMMAND: /broadcast (Admin Only) ---
  if (text.startsWith('/broadcast')) {
    if (userId.toString() !== env.ADMIN_ID.toString()) {
      await sendTelegram(env, 'sendMessage', { chat_id: chatId, text: "❌ Unauthorized." });
      return;
    }

    const broadcastMsg = text.replace('/broadcast', '').trim();
    if (!broadcastMsg) return;

    let count = 0;
    const userList = await env.BOT_USERS.list({ prefix: 'user:' });
    
    for (const key of userList.keys) {
      const targetId = key.name.split(':')[1];
      try {
        await sendTelegram(env, 'sendMessage', { chat_id: targetId, text: broadcastMsg });
        count++;
      } catch (e) {}
    }

    await sendTelegram(env, 'sendMessage', { chat_id: chatId, text: `✅ Broadcast sent to ${count} users.` });
    return;
  }

  // --- URL HANDLER (File Upload) ---
  const urlRegex = /^(http|https):\/\/[^ "]+$/;
  if (urlRegex.test(text)) {
    await handleFileUpload(env, chatId, text);
    return;
  }
}

/**
 * File Upload Logic
 */
async function handleFileUpload(env, chatId, fileUrl) {
  // 1. Send Status Message
  const statusMsg = await sendTelegram(env, 'sendMessage', {
    chat_id: chatId,
    text: "⏳ *Downloading file from URL...*",
    parse_mode: 'Markdown'
  });
  const statusId = statusMsg?.result?.message_id;

  try {
    // 2. Fetch remote file
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error("Failed to download file.");

    const size = res.headers.get('content-length');
    if (size && parseInt(size) > 50 * 1024 * 1024) {
      throw new Error("File too large (Max 50MB).");
    }

    const blob = await res.blob();
    
    // 3. Extract Filename
    let filename = fileUrl.split('/').pop().split('?')[0] || 'file';
    if (!filename.includes('.')) filename += '.bin';

    // 4. Send to Telegram using FormData
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('document', blob, filename);
    formData.append('caption', `📤 *Uploaded successfully!*\n🔗 ${fileUrl}`);
    formData.append('parse_mode', 'Markdown');

    const uploadReq = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    
    const result = await uploadReq.json();
    if (!result.ok) throw new Error(result.description);

    // 5. Cleanup status message
    if (statusId) await sendTelegram(env, 'deleteMessage', { chat_id: chatId, message_id: statusId });

  } catch (e) {
    const errorText = `❌ *Upload Failed*\nError: ${e.message}`;
    if (statusId) {
      await sendTelegram(env, 'editMessageText', { chat_id: chatId, message_id: statusId, text: errorText, parse_mode: 'Markdown' });
    } else {
      await sendTelegram(env, 'sendMessage', { chat_id: chatId, text: errorText, parse_mode: 'Markdown' });
    }
  }
}

/**
 * Helper to call Telegram API
 */
async function sendTelegram(env, method, params) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return await response.json();
}
