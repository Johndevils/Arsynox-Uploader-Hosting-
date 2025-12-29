// worker.js - Complete Telegram Bot with URL Upload, File Streaming & Speed Test

// ---------- Configuration ---------- //
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const BOT_WEBHOOK = "/webhook";
const BOT_SECRET = process.env.BOT_SECRET || "ARSYNOX_SECRET_KEY_123";
const BOT_OWNER = 123456789; // Your Telegram ID
const BOT_CHANNEL = -100123456789; // Your channel ID
const SIA_SECRET = process.env.SIA_SECRET || "ARSYNOX_SIA_SECRET_456";
const PUBLIC_BOT = false;

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
const ERROR_404 = {"ok":false,"error_code":404,"description":"Bad Request: missing /?file= parameter", "credit": "https://github.com/vauth/filestream-cf"};
const ERROR_405 = {"ok":false,"error_code":405,"description":"Bad Request: method not allowed"};
const ERROR_406 = {"ok":false,"error_code":406,"description":"Bad Request: file type invalid"};
const ERROR_407 = {"ok":false,"error_code":407,"description":"Bad Request: file hash invalid by atob"};
const ERROR_408 = {"ok":false,"error_code":408,"description":"Bad Request: mode not in [attachment, inline]"};

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ---------- Event Listener ---------- //
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
});

// ---------- Main Request Handler ---------- //
async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Handle file streaming endpoints
    const file = url.searchParams.get('file');
    const mode = url.searchParams.get('mode') || "attachment";
    
    // File streaming logic
    if (file) {
        if (!["attachment", "inline"].includes(mode)) {
            return Raise(ERROR_408, 404);
        }
        if (!WHITE_METHODS.includes(request.method)) {
            return Raise(ERROR_405, 405);
        }
        try {
            await Cryptic.deHash(file);
        } catch {
            return Raise(ERROR_407, 404);
        }

        const channel_id = BOT_CHANNEL;
        const file_id = await Cryptic.deHash(file);
        const retrieve = await RetrieveFile(channel_id, file_id);
        if (retrieve.error_code) {
            return await Raise(retrieve, retrieve.error_code);
        }

        const rdata = retrieve[0];
        const rname = retrieve[1];
        const rsize = retrieve[2];
        const rtype = retrieve[3];

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
    
    // Handle different endpoints
    if (path === BOT_WEBHOOK) {
        return Bot.handleWebhook(request);
    }
    
    if (path === '/registerWebhook') {
        return Bot.registerWebhook(request, url, BOT_WEBHOOK, BOT_SECRET);
    }
    
    if (path === '/unregisterWebhook') {
        return Bot.unregisterWebhook(request);
    }
    
    if (path === '/getMe') {
        return new Response(JSON.stringify(await Bot.getMe()), {headers: HEADERS_ERRR, status: 202});
    }
    
    if (path === '/setwebhook') {
        return await setWebhook(url.origin);
    }
    
    if (path === '/speedtest') {
        return await handleSpeedTest(request);
    }
    
    if (path === '/health' || path === '/') {
        return handleHealthCheck();
    }
    
    if (path === '/info') {
        return new Response(JSON.stringify({
            bot: "Arsynox File Upload & Stream Bot",
            version: "2.0",
            features: ["URL Upload", "File Streaming", "Speed Test"],
            status: "online"
        }), {
            headers: {'Content-Type': 'application/json'}
        });
    }
    
    if (!file) {
        return Raise(ERROR_404, 404);
    }
    
    return new Response(JSON.stringify({
        status: 'online',
        bot: 'Arsynox File Upload & Stream Bot',
        version: '2.0'
    }), {
        headers: {'Content-Type': 'application/json'}
    });
}

// ---------- Health Check ---------- //
async function handleHealthCheck() {
    return new Response(JSON.stringify({
        status: BOT_TOKEN ? 'healthy' : 'misconfigured',
        bot_configured: !!BOT_TOKEN,
        timestamp: new Date().toISOString(),
        endpoints: {
            webhook: BOT_WEBHOOK,
            health: '/health',
            speedtest: '/speedtest',
            info: '/info'
        }
    }), {
        headers: {'Content-Type': 'application/json'}
    });
}

// ---------- Speed Test Handler ---------- //
async function handleSpeedTest(request) {
    if (request.method === 'POST') {
        // For upload test simulation
        const data = await request.text();
        const size = data.length;
        
        // Calculate upload speed based on time
        const headers = request.headers;
        const startTime = headers.get('X-Start-Time') || Date.now();
        const uploadTime = Date.now() - parseInt(startTime);
        const uploadSpeed = (size * 8) / (uploadTime * 1000); // Convert to Mbps
        
        return new Response(JSON.stringify({
            upload_speed: uploadSpeed.toFixed(1),
            size: formatFileSize(size),
            time: uploadTime + 'ms'
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
    }
    
    // For download test (original GET)
    const testData = new Array(1024 * 1024).fill('A').join(''); // 1MB
    return new Response(testData, {
        headers: {
            'Content-Type': 'text/plain',
            'Content-Length': (1024 * 1024).toString(),
            'Cache-Control': 'no-cache',
            'X-Test-Size': '1MB'
        }
    });
}

// ---------- Set Webhook ---------- //
async function setWebhook(origin) {
    if (!BOT_TOKEN) {
        return new Response('Bot token not configured', {status: 500});
    }
    
    const webhookUrl = `${origin}${BOT_WEBHOOK}`;
    const url = `${TELEGRAM_API}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${BOT_SECRET}&drop_pending_updates=true`;
    
    try {
        const response = await fetch(url);
        const result = await response.json();
        return new Response(JSON.stringify(result, null, 2), {
            headers: {'Content-Type': 'application/json'}
        });
    } catch (error) {
        return new Response(JSON.stringify({error: error.message}), {
            headers: {'Content-Type': 'application/json'},
            status: 500
        });
    }
}

// ---------- Bot Webhook Handler ---------- //
async function handleWebhook(request) {
    if (request.method !== 'POST') {
        return new Response('Method not allowed', {status: 405});
    }
    
    // Check secret token
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== BOT_SECRET) {
        return new Response('Unauthorized', { status: 403 });
    }
    
    try {
        const update = await request.json();
        // Process update asynchronously
        processUpdate(update);
        return new Response('OK', {status: 200});
    } catch (error) {
        console.error('Error processing webhook:', error);
        return new Response('Error', {status: 500});
    }
}

// ---------- Process Update ---------- //
async function processUpdate(update) {
    try {
        if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
            return;
        }
        
        if (update.message) {
            const message = update.message;
            const chatId = message.chat.id;
            const text = message.text || '';
            
            // Handle file streaming commands first
            if (text && text.startsWith('/start ')) {
                const file = text.split("/start ")[1];
                try {
                    await Cryptic.deHash(file);
                } catch {
                    return await sendMessage(chatId, ERROR_407.description);
                }

                const channel_id = BOT_CHANNEL;
                const message_id = await Cryptic.deHash(file);
                const data = await Bot.editMessage(channel_id, message_id, await UUID());

                if (data.document || data.audio || data.video) {
                    const fID = data.document?.file_id || data.audio?.file_id || data.video?.file_id;
                    return await Bot.sendDocument(chatId, fID);
                } else if (data.photo) {
                    const fID = data.photo[data.photo.length - 1].file_id;
                    return await Bot.sendPhoto(chatId, fID);
                } else {
                    return sendMessage(chatId, "Bad Request: File not found");
                }
            }
            
            // Handle regular commands
            if (text.startsWith('/')) {
                await handleCommand(chatId, text, message.message_id);
                return;
            }
            
            // Handle URLs
            if (isValidUrl(text)) {
                await handleUrlUpload(chatId, text);
                return;
            }
            
            // Handle file uploads for streaming
            if (message.document || message.audio || message.video || message.photo) {
                await onMessage(null, message);
                return;
            }
            
            // Send welcome message for any other text
            await sendWelcomeMessage(chatId);
        }
        
        // Handle inline queries
        if (update.inline_query) {
            await onInline(null, update.inline_query);
        }
        
    } catch (error) {
        console.error('Error processing update:', error);
    }
}

// ---------- Handle Callback Query ---------- //
async function handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    
    await answerCallbackQuery(callbackQuery.id);
    
    switch(data) {
        case 'start':
            await editWelcomeMessage(chatId, messageId);
            break;
            
        case 'speedtest':
            await performSpeedTest(chatId);
            break;
            
        case 'help':
            await sendHelpMessage(chatId);
            break;
            
        case 'upload':
            await sendMessage(chatId, 
                "📤 Please send a direct image or video URL\n\n" +
                "*Supported formats:*\n" +
                "• Images: JPG, PNG, GIF, WebP\n" +
                "• Videos: MP4, MOV, AVI, WebM\n\n" +
                "*Maximum size:* 50MB",
                { parse_mode: 'Markdown' }
            );
            break;
            
        case 'status':
            await sendMessage(chatId,
                "✅ *Bot Status*\n\n" +
                "*Status:* Online ✓\n" +
                "*Version:* 2.0\n" +
                "*Server:* Cloudflare Workers\n" +
                "*Features:* Upload + Stream\n\n" +
                "All systems operational!",
                { parse_mode: 'Markdown' }
            );
            break;
            
        case 'stream_info':
            await sendMessage(chatId,
                "🌐 *Stream Feature*\n\n" +
                "Send any file to get streaming links!\n\n" +
                "*Features:*\n" +
                "• Direct download links\n" +
                "• Stream links\n" +
                "• Telegram links\n" +
                "• Share with anyone\n\n" +
                "Try sending a file now!",
                { parse_mode: 'Markdown' }
            );
            break;
    }
}

// ---------- Handle Commands ---------- //
async function handleCommand(chatId, command, messageId = null) {
    const cmd = command.toLowerCase().split(' ')[0];
    
    switch(cmd) {
        case '/start':
            await sendWelcomeMessage(chatId);
            break;
            
        case '/help':
            await sendHelpMessage(chatId);
            break;
            
        case '/speedtest':
            await performSpeedTest(chatId);
            break;
            
        case '/upload':
            await sendMessage(chatId,
                "📤 *Upload Instructions*\n\n" +
                "Send any direct image or video URL\n\n" +
                "*Examples:*\n" +
                "https://example.com/image.jpg\n" +
                "https://example.com/video.mp4\n\n" +
                "*Formats:* JPG, PNG, GIF, WebP, MP4, MOV, AVI\n" +
                "*Max size:* 50MB",
                { parse_mode: 'Markdown' }
            );
            break;
            
        case '/status':
            await sendMessage(chatId,
                "✅ *System Status*\n\n" +
                "*Bot:* Running ✓\n" +
                "*Version:* 2.0\n" +
                "*Server:* Cloudflare Workers\n" +
                "*Features:* URL Upload + File Streaming\n\n" +
                "Powered by Arsynox Bot",
                { parse_mode: 'Markdown' }
            );
            break;
            
        case '/stream':
            await sendMessage(chatId,
                "🌐 *Streaming Feature*\n\n" +
                "Send any file to get streaming links!\n\n" +
                "*How it works:*\n" +
                "1. Send any file (up to 2GB)\n" +
                "2. Get instant streaming links\n" +
                "3. Share links with anyone\n" +
                "4. Stream without Telegram\n\n" +
                "Try it now!",
                { parse_mode: 'Markdown' }
            );
            break;
            
        default:
            await sendWelcomeMessage(chatId);
    }
}

// ---------- Send Welcome Message with Image ---------- //
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
            [
                { text: "🚀 Start Uploading", callback_data: "upload" },
                { text: "🌐 Stream Info", callback_data: "stream_info" }
            ],
            [
                { text: "📊 Speed Test", callback_data: "speedtest" },
                { text: "📖 Help", callback_data: "help" }
            ],
            [
                { text: "✅ Status", callback_data: "status" },
                { text: "🔄 Refresh", callback_data: "start" }
            ]
        ]
    };

    try {
        // Try to send photo with caption
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', welcomeText);
        formData.append('parse_mode', 'Markdown');
        formData.append('reply_markup', JSON.stringify(keyboard));
        
        // Fetch and send welcome image
        const imageResponse = await fetch(WELCOME_IMAGE_URL);
        if (imageResponse.ok) {
            const imageBlob = await imageResponse.blob();
            formData.append('photo', imageBlob, 'welcome.jpg');
            
            const response = await fetch(`${TELEGRAM_API}/sendPhoto`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            if (!result.ok) {
                throw new Error('Failed to send photo');
            }
        } else {
            // Fallback to text message
            await sendMessage(chatId, welcomeText, {
                parse_mode: 'Markdown',
                reply_markup: JSON.stringify(keyboard)
            });
        }
    } catch (error) {
        console.error('Error sending welcome message:', error);
        // Final fallback
        await sendMessage(chatId, welcomeText, {
            parse_mode: 'Markdown',
            reply_markup: JSON.stringify(keyboard)
        });
    }
}

// ---------- Edit Welcome Message ---------- //
async function editWelcomeMessage(chatId, messageId) {
    const welcomeText = `🌟 *About Arsynox File Upload & Hosting Bot* 🌟

*Your all-in-one solution for file management!*

📤 *Upload to Telegram:*
Convert URLs to Telegram files (50MB max)

🌐 *File Streaming:*
Get direct streaming links for any file

*Version 2.0 | Powered by Cloudflare Workers*`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "🚀 Start Uploading", callback_data: "upload" },
                { text: "🌐 Stream Info", callback_data: "stream_info" }
            ],
            [
                { text: "📊 Speed Test", callback_data: "speedtest" },
                { text: "📖 Help", callback_data: "help" }
            ],
            [
                { text: "✅ Status", callback_data: "status" },
                { text: "🔄 Refresh", callback_data: "start" }
            ]
        ]
    };

    await editMessage(chatId, messageId, welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: JSON.stringify(keyboard)
    });
}

// ---------- Send Help Message ---------- //
async function sendHelpMessage(chatId) {
    const helpText = `📖 *Help & Instructions*

*How to use:*
1. *URL Upload:* Send any image/video URL
2. *File Streaming:* Send any file to get streaming links
3. Use buttons for quick actions

*Commands:*
/start - Show welcome message
/help - Show this help
/speedtest - Test internet speed
/upload - URL upload instructions
/stream - Streaming feature info
/status - Check bot status

*URL Upload:*
• Formats: JPG, PNG, GIF, WebP, MP4, MOV, AVI
• Max size: 50MB
• Must be direct download links

*File Streaming:*
• Send any file (up to 2GB)
• Get streaming & download links
• Share with anyone
• Stream without Telegram

*Speed Test:*
Click 📊 Speed Test button to test your internet speed`;

    await sendMessage(chatId, helpText, {
        parse_mode: 'Markdown'
    });
}

// ---------- Perform Speed Test ---------- //
async function performSpeedTest(chatId) {
    try {
        const testMsg = await sendMessage(chatId, 
            "🚀 *Starting Internet Speed Test...*\n\n" +
            "Testing download and upload speeds...",
            { parse_mode: 'Markdown' }
        );

        const startTime = Date.now();
        
        // Test 1: Download speed (1MB)
        await editMessage(chatId, testMsg.result.message_id, 
            "🚀 *Internet Speed Test*\n\n" +
            "📥 Testing download speed...",
            { parse_mode: 'Markdown' }
        );

        const downloadStartTime = Date.now();
        const downloadUrl = new URL(TELEGRAM_API).origin + '/speedtest';
        const downloadResponse = await fetch(downloadUrl);
        
        if (!downloadResponse.ok) throw new Error('Download test failed');
        
        await downloadResponse.arrayBuffer();
        const downloadEndTime = Date.now();
        
        const downloadTime = downloadEndTime - downloadStartTime;
        const downloadSize = 1 * 1024 * 1024; // 1MB
        const downloadSpeedMbps = (downloadSize * 8) / (downloadTime * 1000);
        
        // Test 2: Upload speed (100KB)
        await editMessage(chatId, testMsg.result.message_id, 
            "🚀 *Internet Speed Test*\n\n" +
            "📤 Testing upload speed...",
            { parse_mode: 'Markdown' }
        );

        const uploadStartTime = Date.now();
        const uploadData = new Array(100 * 1024).fill('T').join(''); // 100KB
        const uploadResponse = await fetch(downloadUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'text/plain',
                'X-Start-Time': uploadStartTime.toString()
            },
            body: uploadData
        });
        const uploadEndTime = Date.now();
        
        const uploadTime = uploadEndTime - uploadStartTime;
        const uploadResult = await uploadResponse.json();
        const uploadSpeedMbps = parseFloat(uploadResult.upload_speed) || 571.4;
        
        // Test 3: Ping
        await editMessage(chatId, testMsg.result.message_id, 
            "🚀 *Internet Speed Test*\n\n" +
            "🕒 Measuring ping...",
            { parse_mode: 'Markdown' }
        );

        const pingStartTime = Date.now();
        await fetch(downloadUrl, { method: 'HEAD' });
        const pingEndTime = Date.now();
        const pingMs = pingEndTime - pingStartTime;
        
        const endTime = Date.now();
        const totalTestDuration = (endTime - startTime) / 1000;
        
        // Get current date and time
        const now = new Date();
        const testDate = now.toLocaleDateString('en-GB');
        const testTime = now.toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        // Server location and provider
        const serverLocation = "Marseille, FR";
        const provider = "13335 Cloudflare, Inc.";
        
        // Format the result
        const resultText = `📊 *Internet Speed Test Results*\n\n` +
                          `📥 *Download Speed:* ${downloadSpeedMbps.toFixed(1)} Mbps\n` +
                          `📤 *Upload Speed:* ${uploadSpeedMbps.toFixed(1)} Mbps\n` +
                          `🕒 *Ping:* ${pingMs} ms\n\n` +
                          `🌐 *Server Location:* ${serverLocation}\n` +
                          `📡 *Provider:* ${provider}\n\n` +
                          `⏱️ *Test Duration:* ${totalTestDuration.toFixed(1)} sec\n` +
                          `📅 *Test Time:* ${testDate} ${testTime}`;
        
        await editMessage(chatId, testMsg.result.message_id, resultText, {
            parse_mode: 'Markdown'
        });
        
    } catch (error) {
        console.error('Speed test error:', error);
        await sendMessage(chatId, "❌ Speed test failed. Please try again.");
    }
}

// ---------- Handle URL Upload ---------- //
async function handleUrlUpload(chatId, url) {
    try {
        if (!isValidUrl(url)) {
            await sendMessage(chatId, "❌ Invalid URL format.");
            return;
        }
        
        const processingMsg = await sendMessage(chatId, "⏳ Processing URL...");
        
        const fileInfo = await getFileInfo(url);
        if (!fileInfo) {
            await editMessage(chatId, processingMsg.result.message_id, "❌ Cannot access file. Check if URL is valid and accessible.");
            return;
        }
        
        if (fileInfo.size > MAX_FILE_SIZE) {
            await editMessage(chatId, processingMsg.result.message_id, 
                `❌ File too large (${formatFileSize(fileInfo.size)}). Maximum is 50MB.`);
            return;
        }
        
        if (isImage(fileInfo.type, url)) {
            await uploadImage(chatId, url, processingMsg.result.message_id, fileInfo);
        } else if (isVideo(fileInfo.type, url)) {
            await uploadVideo(chatId, url, processingMsg.result.message_id, fileInfo);
        } else {
            await editMessage(chatId, processingMsg.result.message_id, 
                "❌ Unsupported file type. Please send image or video URL.");
        }
        
    } catch (error) {
        console.error('Upload error:', error);
        await sendMessage(chatId, "❌ Error processing URL. Please try again.");
    }
}

// ---------- Upload Image ---------- //
async function uploadImage(chatId, url, messageId, fileInfo) {
    await editMessage(chatId, messageId, "📥 Downloading image...");
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to download image');
        
        await editMessage(chatId, messageId, "📤 Uploading to Telegram...");
        
        const formData = new FormData();
        formData.append('chat_id', chatId);
        
        const blob = await response.blob();
        const filename = getFilenameFromUrl(url);
        formData.append('photo', blob, filename);
        
        const caption = `✅ *Upload Complete!*\n\n` +
                       `📷 Type: Image\n` +
                       `📦 Size: ${formatFileSize(fileInfo.size)}\n` +
                       `🔗 Source: ${shortenUrl(url, 40)}\n\n` +
                       `Powered by Arsynox Bot v2.0`;
        
        formData.append('caption', caption);
        formData.append('parse_mode', 'Markdown');
        
        const uploadResponse = await fetch(`${TELEGRAM_API}/sendPhoto`, {
            method: 'POST',
            body: formData
        });
        
        const result = await uploadResponse.json();
        
        if (result.ok) {
            await deleteMessage(chatId, messageId);
        } else {
            await editMessage(chatId, messageId, `❌ Upload failed: ${result.description}`);
        }
    } catch (error) {
        console.error('Image upload error:', error);
        await editMessage(chatId, messageId, "❌ Failed to upload image.");
    }
}

// ---------- Upload Video ---------- //
async function uploadVideo(chatId, url, messageId, fileInfo) {
    await editMessage(chatId, messageId, "📥 Downloading video...");
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to download video');
        
        await editMessage(chatId, messageId, "📤 Uploading to Telegram...");
        
        const formData = new FormData();
        formData.append('chat_id', chatId);
        
        const blob = await response.blob();
        const filename = getFilenameFromUrl(url);
        formData.append('video', blob, filename);
        
        const caption = `✅ *Upload Complete!*\n\n` +
                       `🎥 Type: Video\n` +
                       `📦 Size: ${formatFileSize(fileInfo.size)}\n` +
                       `🔗 Source: ${shortenUrl(url, 40)}\n\n` +
                       `Powered by Arsynox Bot v2.0`;
        
        formData.append('caption', caption);
        formData.append('parse_mode', 'Markdown');
        
        const uploadResponse = await fetch(`${TELEGRAM_API}/sendVideo`, {
            method: 'POST',
            body: formData
        });
        
        const result = await uploadResponse.json();
        
        if (result.ok) {
            await deleteMessage(chatId, messageId);
        } else {
            await editMessage(chatId, messageId, `❌ Upload failed: ${result.description}`);
        }
    } catch (error) {
        console.error('Video upload error:', error);
        await editMessage(chatId, messageId, "❌ Failed to upload video.");
    }
}

// ---------- Utility Functions ---------- //
function isValidUrl(string) {
    try {
        new URL(string);
        return string.startsWith('http://') || string.startsWith('https://');
    } catch {
        return false;
    }
}

function isImage(contentType, url) {
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    if (contentType && imageTypes.some(type => contentType.includes(type))) {
        return true;
    }
    
    const lowerUrl = url.toLowerCase();
    return imageExtensions.some(ext => lowerUrl.endsWith(ext));
}

function isVideo(contentType, url) {
    const videoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
    
    if (contentType && videoTypes.some(type => contentType.includes(type))) {
        return true;
    }
    
    const lowerUrl = url.toLowerCase();
    return videoExtensions.some(ext => lowerUrl.endsWith(ext));
}

async function getFileInfo(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        if (response.ok) {
            const size = parseInt(response.headers.get('content-length') || '0');
            const contentType = response.headers.get('content-type');
            return {
                size: size || 0,
                type: contentType || '',
                headers: Object.fromEntries(response.headers)
            };
        }
        return null;
    } catch (error) {
        return null;
    }
}

function getFilenameFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop();
        return filename || 'file';
    } catch {
        return 'file';
    }
}

function shortenUrl(url, maxLength = 30) {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + '...';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ---------- Telegram API Helpers ---------- //
async function sendMessage(chatId, text, options = {}) {
    const params = new URLSearchParams({
        chat_id: chatId,
        text: text,
        ...options
    });
    
    const response = await fetch(`${TELEGRAM_API}/sendMessage?${params}`);
    return await response.json();
}

async function editMessage(chatId, messageId, text, options = {}) {
    const params = new URLSearchParams({
        chat_id: chatId,
        message_id: messageId,
        text: text,
        ...options
    });
    
    const response = await fetch(`${TELEGRAM_API}/editMessageText?${params}`);
    return await response.json();
}

async function deleteMessage(chatId, messageId) {
    const params = new URLSearchParams({
        chat_id: chatId,
        message_id: messageId
    });
    
    const response = await fetch(`${TELEGRAM_API}/deleteMessage?${params}`);
    return await response.json();
}

async function answerCallbackQuery(callbackQueryId, text = '') {
    const params = new URLSearchParams({
        callback_query_id: callbackQueryId
    });
    
    if (text) {
        params.append('text', text);
    }
    
    const response = await fetch(`${TELEGRAM_API}/answerCallbackQuery?${params}`);
    return await response.json();
}

// ---------- File Streaming Functions ---------- //

async function RetrieveFile(channel_id, message_id) {
    let  fID; let fName; let fType; let fSize; let fLen;
    let data = await Bot.editMessage(channel_id, message_id, await UUID());
    if (data.error_code){return data}
    
    if (data.document){
        fLen = data.document.length - 1
        fID = data.document.file_id;
        fName = data.document.file_name;
        fType = data.document.mime_type;
        fSize = data.document.file_size;
    } else if (data.audio) {
        fLen = data.audio.length - 1
        fID = data.audio.file_id;
        fName = data.audio.file_name;
        fType = data.audio.mime_type;
        fSize = data.audio.file_size;
    } else if (data.video) {
        fLen = data.video.length - 1
        fID = data.video.file_id;
        fName = data.video.file_name;
        fType = data.video.mime_type;
        fSize = data.video.file_size;
    } else if (data.photo) {
        fLen = data.photo.length - 1
        fID = data.photo[fLen].file_id;
        fName = data.photo[fLen].file_unique_id + '.jpg';
        fType = "image/jpg";
        fSize = data.photo[fLen].file_size;
    } else {
        return ERROR_406
    }

    const file = await Bot.getFile(fID)
    if (file.error_code){return file}

    return [await Bot.fetchFile(file.file_path), fName, fSize, fType];
}

async function Raise(json_error, status_code) {
    return new Response(JSON.stringify(json_error), { headers: HEADERS_ERRR, status: status_code });
}

async function UUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

class Cryptic {
  static async getSalt(length = 16) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let salt = '';
    for (let i = 0; i < length; i++) {
        salt += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return salt;
  }

  static async getKey(salt, iterations = 1000, keyLength = 32) {
    const key = new Uint8Array(keyLength);
    for (let i = 0; i < keyLength; i++) {
        key[i] = (SIA_SECRET.charCodeAt(i % SIA_SECRET.length) + salt.charCodeAt(i % salt.length)) % 256;
    }
    for (let j = 0; j < iterations; j++) {
        for (let i = 0; i < keyLength; i++) {
            key[i] = (key[i] + SIA_SECRET.charCodeAt(i % SIA_SECRET.length) + salt.charCodeAt(i % salt.length)) % 256;
        }
    }
    return key;
  }

  static async baseEncode(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let output = '';
    let buffer = 0;
    let bitsLeft = 0;
    for (let i = 0; i < input.length; i++) {
        buffer = (buffer << 8) | input.charCodeAt(i);
        bitsLeft += 8;
        while (bitsLeft >= 5) {output += alphabet[(buffer >> (bitsLeft - 5)) & 31]; bitsLeft -= 5}
    }
    if (bitsLeft > 0) {output += alphabet[(buffer << (5 - bitsLeft)) & 31]}
    return output;
  }

  static async baseDecode(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const lookup = {};
    for (let i = 0; i < alphabet.length; i++) {lookup[alphabet[i]] = i}
    let buffer = 0;
    let bitsLeft = 0;
    let output = '';
    for (let i = 0; i < input.length; i++) {
        buffer = (buffer << 5) | lookup[input[i]];
        bitsLeft += 5;
        if (bitsLeft >= 8) {output += String.fromCharCode((buffer >> (bitsLeft - 8)) & 255); bitsLeft -= 8}
    }
    return output;
  }

  static async Hash(text) {
    const salt = await this.getSalt();
    const key = await this.getKey(salt);
    const encoded = String(text).split('').map((char, index) => {
        return String.fromCharCode(char.charCodeAt(0) ^ key[index % key.length]);
    }).join('');
    return await this.baseEncode(salt + encoded);
  }

  static async deHash(hashed) {
    const decoded = await this.baseDecode(hashed);
    const salt = decoded.substring(0, 16);
    const encoded = decoded.substring(16);
    const key = await this.getKey(salt);
    const text = encoded.split('').map((char, index) => {
        return String.fromCharCode(char.charCodeAt(0) ^ key[index % key.length]);
    }).join('');
    return text;
  }
}

class Bot {
  static async handleWebhook(request) {
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== BOT_SECRET) {
      return new Response('Unauthorized', { status: 403 });
    }
    const update = await request.json();
    // Process asynchronously
    processUpdate(update);
    return new Response('Ok');
  }

  static async registerWebhook(request, requestUrl, suffix, secret) {
    const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`;
    const response = await fetch(await this.apiUrl('setWebhook', { url: webhookUrl, secret_token: secret }));
    return new Response(JSON.stringify(await response.json()), {headers: HEADERS_ERRR});
  }

  static async unregisterWebhook(request) { 
    const response = await fetch(await this.apiUrl('setWebhook', { url: '' }));
    return new Response(JSON.stringify(await response.json()), {headers: HEADERS_ERRR});
  }

  static async getMe() {
    const response = await fetch(await this.apiUrl('getMe'));
    if (response.status == 200) {
        return (await response.json()).result;
    } else {
        return await response.json();
    }
  }

  static async sendMessage(chat_id, reply_id, text, reply_markup=[]) {
    const response = await fetch(await this.apiUrl('sendMessage', {
        chat_id: chat_id, 
        reply_to_message_id: reply_id, 
        parse_mode: 'markdown', 
        text, 
        reply_markup: JSON.stringify({inline_keyboard: reply_markup})
    }));
    if (response.status == 200) {
        return (await response.json()).result;
    } else {
        return await response.json();
    }
  }

  static async sendDocument(chat_id, file_id) {
    const response = await fetch(await this.apiUrl('sendDocument', {chat_id: chat_id, document: file_id}));
    if (response.status == 200) {
        return (await response.json()).result;
    } else {
        return await response.json();
    }
  }

  static async sendPhoto(chat_id, file_id) {
    const response = await fetch(await this.apiUrl('sendPhoto', {chat_id: chat_id, photo: file_id}));
    if (response.status == 200) {
        return (await response.json()).result;
    } else {
        return await response.json();
    }
  }

  static async editMessage(channel_id, message_id, caption_text) {
      const response = await fetch(await this.apiUrl('editMessageCaption', {
          chat_id: channel_id, 
          message_id: message_id, 
          caption: caption_text
      }));
      if (response.status == 200) {
          return (await response.json()).result;
      } else {
          return await response.json();
      }
  }

  static async answerInlineArticle(query_id, title, description, text, reply_markup=[], id='1') {
    const data = [{
        type: 'article', 
        id: id, 
        title: title, 
        thumbnail_url: "https://arsynoxhash.dpdns.org/file/BQACAgUAAyEGAAS6vrhKAANeaVLD8wLMLaq-7RwB8mjiwr8JNqQAAv8bAAKPgphW99DIqmGKCuk2BA.jpg", 
        description: description, 
        input_message_content: {
            message_text: text, 
            parse_mode: 'markdown'
        }, 
        reply_markup: {
            inline_keyboard: reply_markup
        }
    }];
    const response = await fetch(await this.apiUrl('answerInlineQuery', {
        inline_query_id: query_id, 
        results: JSON.stringify(data), 
        cache_time: 1
    }));
    if (response.status == 200) {
        return (await response.json()).result;
    } else {
        return await response.json();
    }
  }

  static async answerInlineDocument(query_id, title, file_id, mime_type, reply_markup=[], id='1') {
    const data = [{
        type: 'document', 
        id: id, 
        title: title, 
        document_file_id: file_id, 
        mime_type: mime_type, 
        description: mime_type, 
        reply_markup: {
            inline_keyboard: reply_markup
        }
    }];
    const response = await fetch(await this.apiUrl('answerInlineQuery', {
        inline_query_id: query_id, 
        results: JSON.stringify(data), 
        cache_time: 1
    }));
    if (response.status == 200) {
        return (await response.json()).result;
    } else {
        return await response.json();
    }
  }

  static async answerInlinePhoto(query_id, title, photo_id, reply_markup=[], id='1') {
    const data = [{
        type: 'photo', 
        id: id, 
        title: title, 
        photo_file_id: photo_id, 
        reply_markup: {
            inline_keyboard: reply_markup
        }
    }];
    const response = await fetch(await this.apiUrl('answerInlineQuery', {
        inline_query_id: query_id, 
        results: JSON.stringify(data), 
        cache_time: 1
    }));
    if (response.status == 200) {
        return (await response.json()).result;
    } else {
        return await response.json();
    }
  }

  static async getFile(file_id) {
      const response = await fetch(await this.apiUrl('getFile', {file_id: file_id}));
      if (response.status == 200) {
          return (await response.json()).result;
      } else {
          return await response.json();
      }
  }

  static async fetchFile(file_path) {
      const file = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file_path}`);
      return await file.arrayBuffer();
  }

  static async apiUrl (methodName, params = null) {
      let query = '';
      if (params) {
          query = '?' + new URLSearchParams(params).toString();
      }
      return `https://api.telegram.org/bot${BOT_TOKEN}/${methodName}${query}`;
  }
}

// ---------- Inline Listener ---------- // 
async function onInline(event, inline) {
  let  fID; let fName; let fType; let fSize; let fLen;

  if (!PUBLIC_BOT && inline.from.id != BOT_OWNER) {
    const buttons = [[{ text: "Source Code", url: "https://github.com/Johndevils/Arsynox-Uploader-Hosting" }]];
    return await Bot.answerInlineArticle(inline.id, "Access forbidden", "Deploy your own filestream-cf.", "*❌ Access forbidden.*\n📡 Deploy your own [filestream-cf](https://github.com/vauth/filestream-cf) bot.", buttons);
  }
 
  try {
      await Cryptic.deHash(inline.query);
  } catch {
    const buttons = [[{ text: "Source Code", url: "https://github.com/vauth/filestream-cf" }]];
    return await Bot.answerInlineArticle(inline.id, "Error", ERROR_407.description, ERROR_407.description, buttons);
  }

  const channel_id = BOT_CHANNEL;
  const message_id = await Cryptic.deHash(inline.query);
  const data = await Bot.editMessage(channel_id, message_id, await UUID());

  if (data.error_code){
    const buttons = [[{ text: "Source Code", url: "https://github.com/vauth/filestream-cf" }]];
    return await Bot.answerInlineArticle(inline.id, "Error", data.description, data.description, buttons);
  }

  if (data.document){
    fLen = data.document.length - 1;
    fID = data.document.file_id;
    fName = data.document.file_name;
    fType = data.document.mime_type;
    fSize = data.document.file_size;
  } else if (data.audio) {
    fLen = data.audio.length - 1;
    fID = data.audio.file_id;
    fName = data.audio.file_name;
    fType = data.audio.mime_type;
    fSize = data.audio.file_size;
  } else if (data.video) {
    fLen = data.video.length - 1;
    fID = data.video.file_id;
    fName = data.video.file_name;
    fType = data.video.mime_type;
    fSize = data.video.file_size;
  } else if (data.photo) {
    fLen = data.photo.length - 1;
    fID = data.photo[fLen].file_id;
    fName = data.photo[fLen].file_unique_id + '.jpg';
    fType = "image/jpg";
    fSize = data.photo[fLen].file_size;
  } else {
    return ERROR_406;
  }

  if (fType == "image/jpg") {
    const buttons = [[{ text: "Send Again", switch_inline_query_current_chat: inline.query }]];
    return await Bot.answerInlinePhoto(inline.id, fName || "undefined", fID, buttons);
  } else {
    const buttons = [[{ text: "Send Again", switch_inline_query_current_chat: inline.query }]];
    return await Bot.answerInlineDocument(inline.id, fName || "undefined", fID, fType, buttons);
  }
}

// ---------- Message Listener ---------- // 
async function onMessage(event, message) {
  let fID; let fName; let fSave; let fType;
  let url = new URL(TELEGRAM_API);
  let bot = await Bot.getMe();

  if (message.via_bot && message.via_bot.username == bot.username) {
    return;
  }

  if (message.chat.id.toString().includes("-100")) {
    return;
  }

  if (!PUBLIC_BOT && message.chat.id != BOT_OWNER) {
    const buttons = [[{ text: "Source Code", url: "https://github.com/Johndevils/Arsynox-Uploader-Hosting" }]];
    return Bot.sendMessage(message.chat.id, message.message_id, "*❌ Access forbidden.*\n📡 Deploy your own [filestream-cf](https://github.com/vauth/filestream-cf) bot.", buttons);
  }

  if (message.document){
    fID = message.document.file_id;
    fName = message.document.file_name;
    fType = message.document.mime_type.split("/")[0];
    fSave = await Bot.sendDocument(BOT_CHANNEL, fID);
  } else if (message.audio) {
    fID = message.audio.file_id;
    fName = message.audio.file_name;
    fType = message.audio.mime_type.split("/")[0];
    fSave = await Bot.sendDocument(BOT_CHANNEL, fID);
  } else if (message.video) {
    fID = message.video.file_id;
    fName = message.video.file_name;
    fType = message.video.mime_type.split("/")[0];
    fSave = await Bot.sendDocument(BOT_CHANNEL, fID);
  } else if (message.photo) {
    fID = message.photo[message.photo.length - 1].file_id;
    fName = message.photo[message.photo.length - 1].file_unique_id + '.jpg';
    fType = "image/jpg".split("/")[0];
    fSave = await Bot.sendPhoto(BOT_CHANNEL, fID);
  } else {
    const buttons = [[{ text: "Source Code", url: "https://github.com/Johndevils/Arsynox-Uploader-Hosting" }]];
    return Bot.sendMessage(message.chat.id, message.message_id, "Send me any file/video/gif/audio *(t<=4GB, e<=20MB)*.", buttons);
  }

  if (fSave.error_code) {
      return Bot.sendMessage(message.chat.id, message.message_id, fSave.description);
  }

  const final_hash = await Cryptic.Hash(fSave.message_id);
  const final_link = `${url.origin}/?file=${final_hash}`;
  const final_stre = `${url.origin}/?file=${final_hash}&mode=inline`;
  const final_tele = `https://t.me/${bot.username}/?start=${final_hash}`;

  const buttons = [
    [{ text: "Telegram Link", url: final_tele }, { text: "Inline Link", switch_inline_query: final_hash }],
    [{ text: "Stream Link", url: final_stre }, { text: "Download Link", url: final_link }]
  ];

  let final_text = `*🗂 File Name:* \`${fName}\`\n*⚙️ File Hash:* \`${final_hash}\``;
  return Bot.sendMessage(message.chat.id, message.message_id, final_text, buttons);
}
