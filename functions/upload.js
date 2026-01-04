export async function onRequestPost({ request, env }) {

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    // Preflight
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    // Env check
    if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) {
        return new Response(
            JSON.stringify({ error: "TG_BOT_TOKEN or TG_CHAT_ID missing" }),
            { status: 500, headers: corsHeaders }
        );
    }

    // Parse form
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
        return new Response(
            JSON.stringify({ error: "No file uploaded" }),
            { status: 400, headers: corsHeaders }
        );
    }

    // Send as DOCUMENT (important)
    const tgForm = new FormData();
    tgForm.append("chat_id", env.TG_CHAT_ID);
    tgForm.append("document", file);

    const tgRes = await fetch(
        `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendDocument`,
        { method: "POST", body: tgForm }
    );

    const tgData = await tgRes.json();

    if (!tgData.ok) {
        return new Response(
            JSON.stringify({ error: tgData.description }),
            { status: 500, headers: corsHeaders }
        );
    }

    const fileId = tgData.result.document.file_id;
    const baseUrl = new URL(request.url).origin;

    return new Response(
        JSON.stringify({
            success: true,
            url: `${baseUrl}/file/${fileId}`
        }),
        {
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json"
            }
        }
    );
}
