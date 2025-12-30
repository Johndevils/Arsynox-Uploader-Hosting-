export async function onRequestGet(context) {
    const { params, env, request } = context;
    let fileId = params.id;

    // 1. Strip extensions if present (e.g. abc.jpg -> abc)
    fileId = fileId.replace(/\.(jpg|jpeg|png|gif|webp)$/i, "");

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=31536000, immutable",
    };

    try {
        if (!env.TG_BOT_TOKEN) return new Response("Bot Token Missing", { status: 500 });

        // 2. Fetch File Path from Telegram
        const getFile = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getFile?file_id=${fileId}`);
        const pathData = await getFile.json();

        if (!pathData.ok) return new Response("File Not Found", { status: 404 });

        const filePath = pathData.result.file_path;

        // 3. Download from Telegram
        const imageRes = await fetch(`https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${filePath}`);
        
        const responseHeaders = new Headers(corsHeaders);
        responseHeaders.set("Content-Type", imageRes.headers.get("Content-Type") || "image/jpeg");

        // 4. Handle Preview flag
        const { searchParams } = new URL(request.url);
        if (searchParams.get("preview") === "true") {
            responseHeaders.set("Content-Disposition", "inline");
        }

        return new Response(imageRes.body, {
            status: 200,
            headers: responseHeaders
        });

    } catch (err) {
        return new Response("Internal Error: " + err.message, { status: 500 });
    }
}
