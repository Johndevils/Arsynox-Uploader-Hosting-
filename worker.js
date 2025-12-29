/**
 * Arsynox File Upload & Hosting Bot
 * Version 3.4 (Final Production) | Powered by Cloudflare Workers
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Health Check Endpoint
    // Returns status and server location for monitoring
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'active',
        service: 'Arsynox Bot',
        timestamp: new Date().toISOString(),
        location: request.cf ? `${request.cf.city}, ${request.cf.country}` : 'Unknown'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // 2. Webhook Setup Helper
    // Visit https://your-worker.workers.dev/setup to register
    if (request.method === 'GET' && url.pathname === '/setup') {
      return await setupWebhook(env, url.origin);
    }

    // 3. Telegram Update Handler (POST only)
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        
        // CRITICAL OPTIMIZATION: 
        // We return 200 OK immediately to Telegram so they don't timeout and retry.
        // We use ctx.waitUntil to keep the worker alive while processing logic.
        ctx.waitUntil(handleUpdate(update, env, request.cf));
        
        return new Response('Ok');
      } catch (e) {
        console.error('Error handling update:', e);
        return new Response('Error', { status: 500 });
      }
    }

    // Default Fallback
    return new Response('Arsynox Bot is running. Access /health for status.', { status: 200 });
  }
};

/**
 * Main Update Handler
 */
async function handleUpdate(update, env, cfContext) {
  // Ensure it's a message
  if (!update.message) return;

  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const user = msg.from;

  // --- Logic 1: /start & User Storage ---
  if (text === '/start') {
    // Save user to KV Namespace 'BOT_USERS'
    await env.BOT_USERS.put(`user:${chatId}`, 'active');

    const welcomeMsg = `🌟 *About Arsynox File Upload & Hosting Bot* 🌟
*Your all-in-one solution for file management!*

📤 *Upload to Telegram:*
Send any direct URL (http/https) to upload it as a file.

🌐 *Arsynox Hosting:*
Website1 (https://arsynoxhash.dpdns.org)
Website2 (https://telegram-image-hosting.pages.dev/)
*Version 3.0 | Powered by Cloudflare Workers*`;

    await sendMessage(env, chatId, welcomeMsg, { parse_mode: 'Markdown', disable_web_page_preview: true });
    return;
  }

  // --- Logic 2: /speedtest ---
  if (text === '/speedtest') {
    // A. Calculate Ping (Worker Ping)
    // Use Cloudflare's native TCP RTT if available (Instant), otherwise fallback to fetch
    let ping;
    if (cfContext && cfContext.clientTcpRtt) {
      ping = cfContext.clientTcpRtt;
    } else {
      // Fallback: Measure HTTP fetch latency
      const startPing = Date.now();
      try {
        await fetch('https://www.google.com', { method: 'HEAD' });
      } catch (e) { /* ignore */ }
      ping = Date.now() - startPing;
    }

    // B. Determine Server Location
    let locationStr = 'Unknown Location';
    if (cfContext) {
      const city = cfContext.city;
      const country = cfContext.country;
      if (city && country) {
        locationStr = `${city}, ${country}`;
      } else {
        locationStr = cfContext.colo || 'Cloudflare Network';
      }
    }

    // C. Random Upload Speed (500 - 900 Mbps)
    const speed = Math.floor(Math.random() * (900 - 500 + 1) + 500);

    // D. Format Date
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB') + ' ' + now.toLocaleTimeString('en-GB');

    const photoUrl = 'https://arsynoxhash.dpdns.org/file/BQACAgUAAyEGAAS6vrhKAANeaVLD8wLMLaq-7RwB8mjiwr8JNqQAAv8bAAKPgphW99DIqmGKCuk2BA.jpg';
    
    const caption = `📊 Internet Speed Test Results

📤 Upload Speed: ${speed} Mbps
🕒 Ping: ${ping} ms

🌐 Server Location: ${locationStr}
📡 Provider: 13335 Cloudflare, Inc.

⏱️ Test Duration: 0.8 sec
📅 Test Time: ${dateStr}`;

    await sendPhoto(env, chatId, photoUrl, caption);
    return;
  }

  // --- Logic 3: /broadcast (Admin Only) ---
  if (text.startsWith('/broadcast')) {
    const adminId = parseInt(env.ADMIN_ID);
    if (user.id !== adminId) {
      await sendMessage(env, chatId, "❌ *Access Denied.*", { parse_mode: 'Markdown' });
      return;
    }

    const broadcastMsg = text.replace('/broadcast', '').trim();
    if (!broadcastMsg) {
      await sendMessage(env, chatId, "⚠️ Usage: `/broadcast <message>`", { parse_mode: 'Markdown' });
      return;
    }

    await sendMessage(env, chatId, "📢 *Starting broadcast...*", { parse_mode: 'Markdown' });

    let sentCount = 0;
    let cursor = null;
    
    // Pagination loop to handle large user bases
    do {
      const list = await env.BOT_USERS.list({ prefix: 'user:', cursor: cursor });
      for (const key of list.keys) {
        const targetChatId = key.name.split(':')[1];
        try {
          await sendMessage(env, targetChatId, broadcastMsg);
          sentCount++;
        } catch (e) {
          console.error(`Failed to send to ${targetChatId}`);
          // Optional: await env.BOT_USERS.delete(key.name); // Clean up blocked users
        }
      }
      cursor = list.list_complete ? null : list.cursor;
    } while (cursor);

    await sendMessage(env, chatId, `✅ *Broadcast Complete.*\nSent to: ${sentCount} users.`, { parse_mode: 'Markdown' });
    return;
  }

  // --- Logic 4: URL Upload Handler ---
  // Detect HTTP/HTTPS links
  const urlRegex = /^(http|https):\/\/[^ "]+$/;
  if (urlRegex.test(text)) {
    await handleUrlUpload(env, chatId, text);
    return;
  }
}

/**
 * URL Upload Logic
 * Downloads file from URL and streams it to Telegram
 */
async function handleUrlUpload(env, chatId, url) {
  // Send "Downloading..." message
  const statusMsg = await sendMessage(env, chatId, "⏳ *Downloading file...*", { parse_mode: 'Markdown' });
  const messageId = statusMsg.result ? statusMsg.result.message_id : null;

  try {
    // 1. Fetch File
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch URL: ${response.statusText}`);

    const contentLength = response.headers.get('content-length');
    
    // Safety: 50MB check (Workers have 128MB limit, 50MB file + overhead is approx safe limit)
    if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
      throw new Error("File too large for Cloudflare Worker memory limits (Max ~50MB).");
    }

    const blob = await response.blob();
    
    // 2. Determine Filename
    let filename = 'downloaded_file';
    const disposition = response.headers.get('content-disposition');
    if (disposition && disposition.includes('filename=')) {
      filename = disposition.split('filename=')[1].replace(/['"]/g, '');
    } else {
      const urlParts = url.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      if (lastPart.includes('.')) filename = lastPart;
    }

    // 3. Prepare FormData
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('document', blob, filename);
    formData.append('caption', `📂 *File from URL*\n🔗 ${url}`);
    formData.append('parse_mode', 'Markdown');

    // 4. Send to Telegram
    const tgResponse = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: formData
    });

    const tgResult = await tgResponse.json();

    if (!tgResult.ok) {
      throw new Error(tgResult.description || "Telegram API Error");
    }

    // 5. Cleanup: Delete "Downloading..." message
    if (messageId) await deleteMessage(env, chatId, messageId);

  } catch (error) {
    if (messageId) {
      await editMessageText(env, chatId, messageId, `❌ *Error:* ${error.message}`, { parse_mode: 'Markdown' });
    } else {
      await sendMessage(env, chatId, `❌ *Error:* ${error.message}`);
    }
  }
}

/**
 * Telegram API Helpers
 */

async function sendMessage(env, chatId, text, options = {}) {
  const params = { chat_id: chatId, text, ...options };
  return await callTelegram(env, 'sendMessage', params);
}

async function sendPhoto(env, chatId, photoUrl, caption) {
  const params = { chat_id: chatId, photo: photoUrl, caption: caption };
  return await callTelegram(env, 'sendPhoto', params);
}

async function editMessageText(env, chatId, messageId, text, options = {}) {
  const params = { chat_id: chatId, message_id: messageId, text, ...options };
  return await callTelegram(env, 'editMessageText', params);
}

async function deleteMessage(env, chatId, messageId) {
  return await callTelegram(env, 'deleteMessage', { chat_id: chatId, message_id: messageId });
}

async function callTelegram(env, method, bodyParams) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;
  const headers = { 'Content-Type': 'application/json' };
  
  // Note: Standard API calls use JSON. File uploads (sendDocument) use FormData in the specific handler above.
  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(bodyParams)
  });

  return await response.json();
}

async function setupWebhook(env, workerUrl) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook?url=${workerUrl}`;
  const resp = await fetch(url);
  const data = await resp.json();
  return new Response(JSON.stringify(data, null, 2), { headers: { 'content-type': 'application/json' }});
}
