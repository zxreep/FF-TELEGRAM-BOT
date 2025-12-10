import { URL } from 'url';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || '@zxreep';

if (!TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Set it in Vercel environment variables.');
}

const API_BASE = (token) => `https://api.telegram.org/bot${token}`;

const BT1_TEMPLATE = 'https://freefire-apis.vercel.app/get_player_stats?server=ind&uid={uid}&matchmode=RANKED&gamemode=br';
const BT2_TEMPLATE = 'https://freefire-apis.vercel.app/get_player_personal_show?server=ind&uid={uid}';
const BT3_TEMPLATE = 'https://freefire-apis.vercel.app/get_search_account_by_keyword?server=ind&keyword={keyword}';

const BT1_LABEL = process.env.BT1_LABEL || 'bt1';
const BT2_LABEL = process.env.BT2_LABEL || 'bt2';
const BT3_LABEL = process.env.BT3_LABEL || 'bt3';

async function telegram(method, body) {
  const res = await fetch(`${API_BASE(TELEGRAM_BOT_TOKEN)}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function sendMainMenu(chat_id) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: BT1_LABEL, callback_data: 'btn_bt1' },
        { text: BT2_LABEL, callback_data: 'btn_bt2' },
        { text: BT3_LABEL, callback_data: 'btn_bt3' }
      ]
    ]
  };
  return telegram('sendMessage', { chat_id, text: 'Main menu — choose an option:', reply_markup: keyboard });
}

async function sendWelcome(chat_id) {
  const keyboard = {
    inline_keyboard: [
      [{ text: 'Open channel', url: 'https://t.me/+3jQzaUHhffJlODE1' }],
      [{ text: 'Verify membership', callback_data: 'verify_membership' }]
    ]
  };
  return telegram('sendMessage', { chat_id, text: `Welcome! Please join the channel ${CHANNEL_USERNAME} and press Verify.`, reply_markup: keyboard });
}

async function checkBotAdmin(chatIdentifier) {
  try {
    const me = await telegram('getMe', {});
    if (!me.ok) return { ok: false, reason: 'getMe failed' };
    const botId = me.result.id;
    const res = await telegram('getChatMember', { chat_id: chatIdentifier, user_id: botId });
    if (!res.ok) return { ok: false, reason: res.description || 'getChatMember failed for bot' };
    const status = res.result.status;
    return { ok: status === 'administrator' || status === 'creator', status };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function checkUserIsMember(chatIdentifier, userId) {
  try {
    const res = await telegram('getChatMember', { chat_id: chatIdentifier, user_id: userId });
    if (!res.ok) return { ok: false, reason: res.description || 'getChatMember failed' };
    const status = res.result.status;
    const ok = ['member', 'administrator', 'creator'].includes(status);
    return { ok, status };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

function buildUrl(template, params) {
  let url = template;
  for (const k of Object.keys(params)) {
    url = url.replace(new RegExp(`\\{${k}\\}`, 'g'), encodeURIComponent(params[k]));
  }
  return url;
}

function shortStringify(obj, limit=4000) {
  const s = JSON.stringify(obj, null, 2);
  return s.length > limit ? s.slice(0, limit) + '\n... (truncated)' : s;
}

// We'll use markers to correlate replies (stateless)
const MARKER_BT1 = '__RES_BT1__';
const MARKER_BT2 = '__RES_BT2__';
const MARKER_BT3 = '__RES_BT3__';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok');

  const body = req.body || {};

  try {
    // Handle callback queries (button clicks)
    if (body.callback_query) {
      const cb = body.callback_query;
      const chatId = cb.message.chat.id;
      const fromId = cb.from.id;

      // answer callback to remove loading state
      await telegram('answerCallbackQuery', { callback_query_id: cb.id });

      if (cb.data === 'verify_membership') {
        const chatIdentifier = CHANNEL_USERNAME;
        // check bot admin
        const botAdmin = await checkBotAdmin(chatIdentifier);
        if (!botAdmin.ok) {
          await telegram('sendMessage', { chat_id: chatId, text: `I need to be admin in ${chatIdentifier} to verify membership. Current bot status: ${botAdmin.status || botAdmin.reason}` });
          return res.status(200).json({ ok: true });
        }
        const check = await checkUserIsMember(chatIdentifier, fromId);
        if (check.ok) {
          await telegram('sendMessage', { chat_id: chatId, text: '✅ Verification successful. Showing menu...' });
          await sendMainMenu(chatId);
        } else {
          await telegram('sendMessage', { chat_id: chatId, text: `❌ You are not a member of ${chatIdentifier}. Please join and press Verify again.` });
        }
        return res.status(200).json({ ok: true });
      }

      if (cb.data === 'btn_bt1' || cb.data === 'btn_bt2' || cb.data === 'btn_bt3') {
        // Prompt user for input using force_reply and a marker
        let prompt = '';
        let marker = '';
        if (cb.data === 'btn_bt1') { prompt = `Send UID to query (for ${BT1_LABEL}). Reply to this message.`; marker = MARKER_BT1; }
        if (cb.data === 'btn_bt2') { prompt = `Send UID to query (for ${BT2_LABEL}). Reply to this message.`; marker = MARKER_BT2; }
        if (cb.data === 'btn_bt3') { prompt = `Send keyword to search (for ${BT3_LABEL}). Reply to this message.`; marker = MARKER_BT3; }

        await telegram('sendMessage', {
          chat_id: chatId,
          text: `${marker}\n${prompt}`,
          reply_markup: { force_reply: true, selective: true }
        });
        return res.status(200).json({ ok: true });
      }

      // unknown callback
      return res.status(200).json({ ok: true });
    }

    // Handle messages (including replies to force_reply)
    if (body.message) {
      const msg = body.message;
      const chatId = msg.chat.id;
      const fromId = msg.from.id;

      // start command -> show welcome or menu depending on membership
      if (msg.text && msg.text.startsWith('/start')) {
        const check = await checkUserIsMember(CHANNEL_USERNAME, fromId);
        if (check.ok) {
          await telegram('sendMessage', { chat_id: chatId, text: 'Welcome back — verified. Showing menu:' });
          await sendMainMenu(chatId);
        } else {
          await sendWelcome(chatId);
        }
        return res.status(200).json({ ok: true });
      }

      // Handle replies to our force-reply messages
      if (msg.reply_to_message && msg.text) {
        const replyText = msg.reply_to_message.text || '';
        const userText = msg.text.trim();

        if (replyText.includes(MARKER_BT1)) {
          // Build url for BT1
          const chat_id =
  body.message?.chat.id ||
  body.callback_query?.message.chat.id;
          
          const url = buildUrl(BT1_TEMPLATE, { uid: userText });
          await telegram('sendMessage', { chat_id: chatId, text: '⏳ Sending request...' });
          try {
            const r = await fetch(url);
            const ct = r.headers.get('content-type') || '';
            if (!ct.includes('application/json')) {
              const txt = await r.text();
              await telegram('sendMessage', { chat_id, text: `Non-JSON response:\n${txt}` });
            } else {
              const data = await r.json();
              await telegram('sendMessage', { chat_id, text: `Result:\n\`\`\`${shortStringify(data)}\`\`\``, parse_mode: 'Markdown' });
            }
          } catch (e) {
            await telegram('sendMessage', { chat_id, text: `Request error: ${e.message}` });
          }
          await sendMainMenu(chatId);
          return res.status(200).json({ ok: true });
        }

        if (replyText.includes(MARKER_BT2)){ 
          const chat_id =
  body.message?.chat.id ||
  body.callback_query?.message.chat.id;
          const url = buildUrl(BT2_TEMPLATE, { uid: userText });
          await telegram('sendMessage', { chat_id: chatId, text: '⏳ Sending request...' });
          try {
            const r = await fetch(url);
            const ct = r.headers.get('content-type') || '';
            if (!ct.includes('application/json')) {
              const txt = await r.text();
              await telegram('sendMessage', { chat_id, text: `Non-JSON response:\n${txt}` });
            } else {
              const data = await r.json();
              await telegram('sendMessage', { chat_id, text: `Result:\n\`\`\`${shortStringify(data)}\`\`\``, parse_mode: 'Markdown' });
            }
          } catch (e) {
            await telegram('sendMessage', { chat_id, text: `Request error: ${e.message}` });
          }
          await sendMainMenu(chatId);
          return res.status(200).json({ ok: true });
        }

        if (replyText.includes(MARKER_BT3)) {
          const chat_id =
  body.message?.chat.id ||
  body.callback_query?.message.chat.id;
          const url = buildUrl(BT3_TEMPLATE, { keyword: userText });
          await telegram('sendMessage', { chat_id: chatId, text: '⏳ Sending request...' });
          try {
            const r = await fetch(url);
            const ct = r.headers.get('content-type') || '';
            if (!ct.includes('application/json')) {
              const txt = await r.text();
              await telegram('sendMessage', { chat_id, text: `Non-JSON response:\n${txt}` });
            } else {
              const data = await r.json();
              await telegram('sendMessage', { chat_id, text: `Result:\n\`\`\`${shortStringify(data)}\`\`\``, parse_mode: 'Markdown' });
            }
          } catch (e) {
            await telegram('sendMessage', { chat_id, text: `Request error: ${e.message}` });
          }
          await sendMainMenu(chatId);
          return res.status(200).json({ ok: true });
        }
      }

      // If none of the above, show main menu (or welcome if not member)
      const member = (await checkUserIsMember(CHANNEL_USERNAME, fromId)).ok;
      if (!member) {
        await sendWelcome(chatId);
      } else {
        await sendMainMenu(chatId);
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Handler error', e);
    return res.status(200).send('ok');
  }
}
