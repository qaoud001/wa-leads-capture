const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const express = require('express');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const SHEET_URL = process.env.SHEET_URL;
const seenNumbers = new Set();
let lastQR = null;

app.get('/', async (req, res) => {
  if (!lastQR) {
    return res.send('<h2>جاري الاتصال... انتظر ثم اعد تحميل الصفحة</h2>');
  }
  const qrImage = await QRCode.toDataURL(lastQR);
  res.send(`<html><body style="text-align:center"><h2>امسح الـ QR بواتساب بيزنس</h2><img src="${qrImage}"/></body></html>`);
});

app.listen(PORT, () => console.log('✅ Server running on port', PORT));

function sendToSheet(phone, datetime) {
  const data = JSON.stringify({ phone, datetime });
  const url = new URL(SHEET_URL);
  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
  };
  const req = https.request(options);
  req.on('error', (e) => console.error('❌ Sheet error:', e.message));
  req.write(data);
  req.end();
  console.log('✅ تم حفظ الرقم:', phone);
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) { lastQR = qr; console.log('📱 QR جاهز — افتح الرابط'); }
    if (connection === 'open') { lastQR = null; console.log('✅ واتساب متصل!'); }
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
      sendToSheet(phone, datetime);
    }
  });
}

startBot();
