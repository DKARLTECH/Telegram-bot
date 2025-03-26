/* Required dependencies and imports */
// Removed the dynamic import of "serve" from Deno since Cloudflare Workers does not support dynamic require.
// Instead, we use the global fetch event listener available in Cloudflare Workers.

/* Enable logging */
const logger = {
  info: console.log,
  error: console.error,
};

/* Replace with your actual bot token */
const TOKEN = "7712981355:AAFZ_q0oB5tHIPfPnTlGC1kg3FQf2LwI4kA";

/* Bot Admin ID */
const ADMIN_ID = 1767103439;

/* Default IPTV Playlist URL */
const DEFAULT_IPTV_URL = "http://fortv.cc:8080/get.php?username=3RLR5J&password=0D4TinR&type=m3u";

/* Conversation states */
const URL_INPUT = 0, FILE_UPLOAD = 1;

/* Additional state for admin broadcast */
const ADMIN_BROADCAST = "ADMIN_BROADCAST";

/* Define number of channels to display per page */
const CHANNELS_PER_PAGE = 10;

/* Global in-memory storage for user context data */
const userContexts = new Map();

/* Helper function to send requests to Telegram API */
async function telegramRequest(method, data) {
  const url = `https://api.telegram.org/bot${TOKEN}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return response.json();
}

/* Helper function to send a message */
async function sendMessage(chat_id, text, reply_markup = null, parse_mode = "Markdown") {
  const payload = { chat_id, text, parse_mode };
  if (reply_markup) {
    payload.reply_markup = reply_markup;
  }
  await telegramRequest("sendMessage", payload);
}

/* Helper function to edit an existing message */
async function editMessageText(chat_id, message_id, text, reply_markup = null, parse_mode = "Markdown") {
  const payload = { chat_id, message_id, text, parse_mode };
  if (reply_markup) {
    payload.reply_markup = reply_markup;
  }
  await telegramRequest("editMessageText", payload);
}

/* Command: /start */
async function start(update, context) {
  // Extract chat_id from update message
  const chat_id = update.message.chat.id;
  const keyboard = [
    [{ text: "📺 Fetch Channels", callback_data: "fetch_channels" }],
    [{ text: "📂 Upload IPTV File", callback_data: "upload_file" }],
    [
      { text: "ℹ️ About", callback_data: "about" },
      { text: "❓ Help", callback_data: "help" }
    ]
  ];
  const reply_markup = { inline_keyboard: keyboard };

  await sendMessage(chat_id, "Welcome to **IPTV Bot**! 🎬\n\nChoose an option below:", reply_markup);
}

/* Admin Panel Command: /admin */
async function adminPanel(update, context) {
  const chat_id = update.message.chat.id;
  const adminKeyboard = [
    [{ text: "Broadcast", callback_data: "admin_broadcast" }, { text: "Stats", callback_data: "admin_stats" }]
  ];
  const reply_markup = { inline_keyboard: adminKeyboard };

  await sendMessage(chat_id, "Welcome Admin! Please select an action:", reply_markup);
}

/* Helper function to broadcast a message to all subscribers */
async function broadcastMessage(broadcastText) {
  const promises = [];
  for (const chat_id of userContexts.keys()) {
    promises.push(sendMessage(chat_id, `📢 Broadcast:\n\n${broadcastText}`));
  }
  await Promise.all(promises);
}

/* Handle button clicks */
async function button_handler(update, context) {
  const query = update.callback_query;
  // Answer callback query (no visible alert)
  await telegramRequest("answerCallbackQuery", { callback_query_id: query.id });

  const chat_id = query.message.chat.id;

  // Handle admin inline commands if sent by the Admin
  if (chat_id === ADMIN_ID && query.data === "admin_broadcast") {
    await sendMessage(chat_id, "✉️ Please send the message to broadcast to subscribers:");
    context.state = ADMIN_BROADCAST;
    return;
  } else if (chat_id === ADMIN_ID && query.data === "admin_stats") {
    const subscriberCount = userContexts.size;
    await sendMessage(chat_id, `📊 Stats:\n\nSubscribers: ${subscriberCount}`);
    context.state = null;
    return;
  }

  // For the "fetch_channels" button, fetch channels using the default IPTV URL.
  if (query.data === "fetch_channels") {
    const channels = await get_channels(DEFAULT_IPTV_URL);
    if (channels && channels.length > 0) {
      context.user_data.channels = channels;
      // Start at the first page
      await send_channel_page(query, 0, context);
    } else {
      await sendMessage(chat_id, "❌ No channels found or an error occurred.");
    }
    context.state = null;
    return;
  }
  // Removed the "paste_url" button handling as per updated instructions
  // For "upload_file" button, prompt the user to upload an .m3u IPTV file.
  else if (query.data === "upload_file") {
    await sendMessage(chat_id, "📂 Please upload your .m3u IPTV file:");
    context.state = FILE_UPLOAD;
    return;
  }
  else if (query.data === "help") {
    await sendMessage(chat_id, "❓ *Help Menu*\n\nThis bot allows you to:\n" +
      "📺 Fetch channels from a default IPTV URL\n" +
      "🔗 Paste your own IPTV URL\n" +
      "📂 Upload an .m3u IPTV file\n" +
      "🎬 Click on a channel to get a direct streaming link.\n\n" +
      "Admin Commands:\n" +
      "/admin - Access admin panel (broadcast and stats).");
    context.state = null;
    return;
  }
  else if (query.data === "about") {
    await sendMessage(chat_id, "ℹ️ *About*\n\nThis is an IPTV bot that helps you fetch and view IPTV channels.\n" +
      "Developed with ❤️ by Your Name.");
    context.state = null;
    return;
  }
  context.state = null;
}

/* Fetch channels from a given IPTV URL */
async function get_channels(url) {
  try {
    // Added timeout and headers to improve reliability of the request
    const headers = { "User-Agent": "Mozilla/5.0" };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.status === 200) {
      const text = await response.text();
      return parse_m3u(text);
    }
    return [];
  } catch (e) {
    logger.error("Request failed: ", e);
    return [];
  }
}

/* Parse M3U file data and extract channels */
function parse_m3u(m3u_data) {
  const channels = [];
  const lines = m3u_data.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Use trim() to ensure leading/trailing whitespace doesn't affect matching
    if (line.trim().startsWith("#EXTINF:")) {
      try {
        // Extract channel name and URL
        const channel_name = line.trim().split(",").slice(-1)[0].trim();
        if (i + 1 < lines.length) { // Ensure we don't go out of bounds
          const channel_url = lines[i + 1].trim();
          if (channel_url) { // Make sure the URL is not empty
            channels.push([channel_name, channel_url]);
          }
        }
      } catch (e) {
        continue;  // Skip if the next line does not exist
      }
    }
  }
  return channels;
}

/* Send a page of channels as buttons arranged in a visible list format with pagination.
   When a user clicks next/back, this function updates the channel list in-place,
   so that the main menu/dashboard remains stationary.
*/
async function send_channel_page(obj, page_number, context) {
  const channels = context.user_data.channels || [];
  const start_index = page_number * CHANNELS_PER_PAGE;
  const end_index = start_index + CHANNELS_PER_PAGE;
  const page_channels = channels.slice(start_index, end_index);

  // Create buttons for each channel on this page with global indices
  const keyboard = [];
  for (let i = 0; i < page_channels.length; i++) {
    const name = page_channels[i][0];
    keyboard.push([{ text: name, callback_data: `channel_${start_index + i}` }]);
  }

  // Add pagination buttons in a separate row
  const pagination_buttons = [];
  if (start_index > 0) {
    pagination_buttons.push({ text: "← Prev", callback_data: `page_${page_number - 1}` });
  }
  if (end_index < channels.length) {
    pagination_buttons.push({ text: "Next →", callback_data: `page_${page_number + 1}` });
  }
  if (pagination_buttons.length > 0) {
    keyboard.push(pagination_buttons);
  }

  const reply_markup = { inline_keyboard: keyboard };
  const text_message = "📺 *Available Channels:*\n\nClick on a channel to get its stream link.";
  // If this is a callback query, edit the existing message to update the channel list.
  if (obj.message && obj.message.message_id) {
    await editMessageText(obj.message.chat.id, obj.message.message_id, text_message, reply_markup);
  } else {
    await sendMessage(obj.chat.id, text_message, reply_markup);
  }
}

/* Handle page navigation (Next/Previous) */
async function page_navigation(update, context) {
  const query = update.callback_query;
  await telegramRequest("answerCallbackQuery", { callback_query_id: query.id });

  const page_number = parseInt(query.data.split("_")[1], 10);
  await send_channel_page(query, page_number, context);
}

/* Handle channel selection */
async function channel_selected(update, context) {
  const query = update.callback_query;
  await telegramRequest("answerCallbackQuery", { callback_query_id: query.id });

  const index = parseInt(query.data.split("_")[1], 10);
  const channels = context.user_data.channels || [];

  if (index >= 0 && index < channels.length) {
    const channel_name = channels[index][0];
    const channel_url = channels[index][1];
    await sendMessage(query.message.chat.id, `🎬 *${channel_name}*\n\n🔗 Stream Link: \`${channel_url}\``);
  } else {
    await sendMessage(query.message.chat.id, "❌ Channel not found.");
  }
}

/* Handle custom IPTV URL input (used for the "paste_url" option) */
async function handle_url_input(update, context) {
  const chat_id = update.message.chat.id;
  const user_url = update.message.text;
  const channels = await get_channels(user_url);
  context.user_data.channels = channels;

  if (channels && channels.length > 0) {
    await send_channel_page(update.message, 0, context);
  } else {
    await sendMessage(chat_id, "❌ No channels found or an error occurred.");
  }
  context.state = null;
}

/* Handle IPTV file upload (used for the "upload_file" option) */
async function handle_file_upload(update, context) {
  const chat_id = update.message.chat.id;
  const file = update.message.document;
  // In Cloudflare Workers, we do not have a filesystem. Instead, we download the file content directly.
  // Get file information using getFile
  const fileResponse = await telegramRequest("getFile", { file_id: file.file_id });
  if (!fileResponse.ok) {
    await sendMessage(chat_id, "❌ Failed to get the file.");
    context.state = null;
    return;
  }
  const file_path = fileResponse.result.file_path;
  // Download file from Telegram servers
  const fileDownloadUrl = `https://api.telegram.org/file/bot${TOKEN}/${file_path}`;
  const res = await fetch(fileDownloadUrl);
  const m3u_data = await res.text();

  const channels = parse_m3u(m3u_data);
  context.user_data.channels = channels;

  if (channels && channels.length > 0) {
    await send_channel_page(update.message, 0, context);
  } else {
    await sendMessage(chat_id, "❌ No channels found or an error occurred.");
  }
  context.state = null;
}

/* Main function to handle incoming requests */
async function handleRequest(request) {
  try {
    const update = await request.json();

    // Determine chat id and initialize context if necessary
    let chat_id = null;
    if (update.message && update.message.chat) {
      chat_id = update.message.chat.id;
    } else if (update.callback_query && update.callback_query.message && update.callback_query.message.chat) {
      chat_id = update.callback_query.message.chat.id;
    }
    if (chat_id === null) {
      return new Response("No chat id found", { status: 400 });
    }
    // Retrieve or initialize user context
    let user_data = userContexts.get(chat_id) || {};
    const context = { user_data, state: user_data.state || null };

    // Routing based on update type
    if (update.message) {
      // Command: /start
      if (update.message.text && update.message.text.startsWith("/start")) {
        await start(update, context);
      }
      // Command: /admin for admin panel
      else if (update.message.text && update.message.text.startsWith("/admin")) {
        if (chat_id !== ADMIN_ID) {
          await sendMessage(chat_id, "❌ You are not authorized to access admin commands.");
        } else {
          await adminPanel(update, context);
        }
      }
      // Command: /stats for admin to view bot stats
      else if (update.message.text && update.message.text.startsWith("/stats")) {
        if (chat_id !== ADMIN_ID) {
          await sendMessage(chat_id, "❌ You are not authorized to view stats.");
        } else {
          const subscriberCount = userContexts.size;
          await sendMessage(chat_id, `📊 Stats:\n\nSubscribers: ${subscriberCount}`);
        }
      }
      // Handle admin broadcast message when in ADMIN_BROADCAST state
      else if (context.state === ADMIN_BROADCAST && chat_id === ADMIN_ID && update.message.text) {
        await broadcastMessage(update.message.text);
        await sendMessage(chat_id, "✅ Broadcast message sent to all subscribers.");
        context.state = null;
      }
      // Check for custom IPTV URL input (although the button has been removed)
      else if (context.state === URL_INPUT && update.message.text) {
        await handle_url_input(update, context);
      }
      // Check for file upload
      else if (context.state === FILE_UPLOAD && update.message.document) {
        await handle_file_upload(update, context);
      }
    } else if (update.callback_query) {
      const data = update.callback_query.data;
      if (data.startsWith("page_")) {
        await page_navigation(update, context);
      } else if (data.startsWith("channel_")) {
        await channel_selected(update, context);
      } else {
        await button_handler(update, context);
      }
    }

    // Save updated context
    context.user_data.state = context.state;
    userContexts.set(chat_id, context.user_data);

    return new Response("OK", { status: 200 });
  } catch (e) {
    logger.error("Error handling update:", e);
    return new Response("Error", { status: 500 });
  }
}

/* Start the Cloudflare Worker server */
// Instead of using serve(), which causes dynamic require errors in Cloudflare Workers,
// we use the global event listener to handle fetch events.
addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});
  
// For Cloudflare Workers the "main" function is replaced by the event listener using addEventListener(), which starts the server.
  
// This completes the translation of the original code to JavaScript for deployment on Cloudflare Workers with the additional admin functionalities.
  
