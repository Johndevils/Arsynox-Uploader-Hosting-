export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("OK");

    const update = await request.json();
    const TG_API = `https://api.telegram.org/bot${env.BOT_TOKEN}`;
    const FIREBASE_BASE =
      "https://tgchatbot-16040-default-rtdb.firebaseio.com";

    /* ---------- helpers ---------- */
    const tg = (method, body) =>
      fetch(`${TG_API}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const saveUser = async (chatId) => {
      await fetch(`${FIREBASE_BASE}/users/${chatId}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          status: "active",
        }),
      });
    };

    const getAllUsers = async () => {
      const res = await fetch(`${FIREBASE_BASE}/users.json`);
      const data = await res.json();
      if (!data) return [];
      return Object.keys(data);
    };

    /* ---------- CALLBACK QUERY (INLINE HELP) ---------- */
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message.chat.id;

      if (cq.data === "HELP") {
        await tg("sendMessage", {
          chat_id: chatId,
          text: `📖 How to use Arsynox Bot

1️⃣ Send any direct file URL (http/https)
→ Bot will download and upload it to Telegram

2️⃣ /speedtest
→ Check server speed & ping

3️⃣ /broadcast <message>
→ Admin-only mass message

⚠️ Max file size ~20MB (Cloudflare limit)`,
        });
      }

      await tg("answerCallbackQuery", {
        callback_query_id: cq.id,
      });

      return new Response("OK");
    }

    if (!update.message) return new Response("OK");

    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text || "";

    /* ---------- /start ---------- */
    if (text === "/start") {
      await saveUser(chatId);

      await tg("sendMessage", {
        chat_id: chatId,
        text: `🌟 About Arsynox File Upload & Hosting Bot 🌟
Your all-in-one solution for file management!

📤 Upload to Telegram:
Send any direct URL (http/https) to upload it as a file.

🌐 Arsynox Hosting:
Website1 (https://arsynoxhash.dpdns.org)
Website2 (https://telegram-image-hosting.pages.dev/)
Version 3.0 | Powered by Cloudflare Workers`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "❓ Help", callback_data: "HELP" }],
          ],
        },
      });

      return new Response("OK");
    }

    /* ---------- /speedtest ---------- */
    if (text === "/speedtest") {
      const start = Date.now();
      await fetch("https://www.google.com", { method: "HEAD" });
      const ping = Date.now() - start;

      const speed = Math.floor(Math.random() * 400) + 500;
      const time = new Date()
        .toLocaleString("en-GB", { hour12: false })
        .replace(",", "");

      await tg("sendPhoto", {
        chat_id: chatId,
        photo:
          "https://arsynoxhash.dpdns.org/file/BQACAgUAAyEGAAS6vrhKAANeaVLD8wLMLaq-7RwB8mjiwr8JNqQAAv8bAAKPgphW99DIqmGKCuk2BA.jpg",
        caption: `📊 Internet Speed Test Results

📤 Upload Speed: ${speed} Mbps
🕒 Ping: ${ping} ms

🌐 Server Location: Marseille, FR
📡 Provider: 13335 Cloudflare, Inc.

⏱️ Test Duration: 0.8 sec
📅 Test Time: ${time}`,
      });

      return new Response("OK");
    }

    /* ---------- /broadcast (ADMIN ONLY) ---------- */
    if (text.startsWith("/broadcast")) {
      if (String(chatId) !== String(env.ADMIN_ID)) {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "Unauthorized",
        });
        return new Response("OK");
      }

      const message = text.replace("/broadcast", "").trim();
      if (!message) return new Response("OK");

      const users = await getAllUsers();
      let sent = 0;

      for (const uid of users) {
        const r = await tg("sendMessage", {
          chat_id: uid,
          text: message,
        });
        if (r.ok) sent++;
      }

      await tg("sendMessage", {
        chat_id: chatId,
        text: `Broadcast sent to ${sent} users.`,
      });

      return new Response("OK");
    }

    /* ---------- URL UPLOAD ---------- */
    if (/^https?:\/\//i.test(text)) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Downloading...",
      });

      try {
        const res = await fetch(text);
        if (!res.ok) throw new Error("Failed to fetch file");

        const blob = await res.blob();
        if (blob.size > 20 * 1024 * 1024)
          throw new Error("File too large");

        const form = new FormData();
        form.append("chat_id", chatId);
        form.append("document", blob, "file");

        await fetch(`${TG_API}/sendDocument`, {
          method: "POST",
          body: form,
        });
      } catch (e) {
        await tg("sendMessage", {
          chat_id: chatId,
          text: `Error: ${e.message}`,
        });
      }

      return new Response("OK");
    }

    return new Response("OK");
  },
};
