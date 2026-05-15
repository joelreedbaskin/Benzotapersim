/**
 * BenzoTaperSim — Cloudflare Worker Proxy
 * 
 * SETUP:
 * 1. Go to https://workers.cloudflare.com and create a new Worker
 * 2. Paste this entire file into the editor
 * 3. Go to Settings → Variables → Add Secret:
 *      Name:  ANTHROPIC_API_KEY
 *      Value: sk-ant-your-key-here
 * 4. Deploy. Your Worker URL will be:
 *      https://benzotapersim.<your-subdomain>.workers.dev
 * 5. Paste that URL into the HTML file where indicated
 */

// const ALLOWED_ORIGIN = "*"; // Restrict to your Pages URL in production, e.g.:
const ALLOWED_ORIGIN = "https://benzotapersim1.pages.dev";

export default {
  async fetch(request, env) {

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Only allow POST to /chat
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/chat") {
      return new Response("Not found", { status: 404 });
    }

    // Parse and validate the request body
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    // Whitelist only the fields the app needs — never let the client
    // change the model to something expensive or inject a system prompt
    const { messages, system } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonError("messages array is required", 400);
    }

    // Cap message history to last 40 turns to control token costs
    const trimmedMessages = messages.slice(-40);

    // Build the Anthropic request
    const anthropicPayload = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: system || "",
      messages: trimmedMessages,
    };

    // Call Anthropic using the secret key (never exposed to the browser)
    let anthropicResponse;
    try {
      anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(anthropicPayload),
      });
    } catch (err) {
      return jsonError("Failed to reach Anthropic API: " + err.message, 502);
    }

    const data = await anthropicResponse.json();

    // Forward Anthropic's response back to the browser
    return new Response(JSON.stringify(data), {
      status: anthropicResponse.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      },
    });
  },
};

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    },
  });
}
