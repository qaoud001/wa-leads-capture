const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fetch = require('node-fetch');

const SHEET_URL = process.env.SHEET_URL;
const seenNumbers = new Set();

async function sendToSheet(phone, datetime) {
  try {
    await fetch(SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, datetime })
    });
    console.log('✅ تم حفظ الرقم:', phone);
  } catch (err) {
    console.error('❌ خطأ في الشيت:', err.message);
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') console.log('✅ واتساب متصل');
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith('@g.us')) continue;
      const phone = jid.replace('@s.whatsapp.net', '');
      if (seenNumbers.has(phone)) continue;
      seenNumbers.add(phone);
      const datetime = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });
      await sendToSheet(phone, datetime);
    }
  });
}

startBot();
