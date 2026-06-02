const express = require('express');
const nodemailer = require('nodemailer');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
 
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
 
const {
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  MY_EMAIL,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM,
} = process.env;
 
// --- בדיקת משתני סביבה ---
console.log('🔧 בדיקת הגדרות:');
console.log('  GMAIL_USER:', GMAIL_USER ? '✅' : '❌ חסר');
console.log('  GMAIL_APP_PASSWORD:', GMAIL_APP_PASSWORD ? '✅' : '❌ חסר');
console.log('  MY_EMAIL:', MY_EMAIL ? '✅' : '❌ חסר');
console.log('  TWILIO_ACCOUNT_SID:', TWILIO_ACCOUNT_SID ? '✅' : '❌ חסר');
console.log('  TWILIO_AUTH_TOKEN:', TWILIO_AUTH_TOKEN ? '✅' : '❌ חסר');
console.log('  TWILIO_WHATSAPP_FROM:', TWILIO_WHATSAPP_FROM || '❌ חסר');
 
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});
 
const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
 
// =====================================================
// 1. WEBHOOK – WhatsApp נכנס → מייל
// =====================================================
app.post('/webhook', async (req, res) => {
  try {
    const from        = req.body.From || 'לא ידוע';
    const body        = req.body.Body || '';
    const profileName = req.body.ProfileName || '';
 
    console.log(`📩 הודעה נכנסת מ-${from}: ${body}`);
    console.log(`📧 שולח מייל ל-${MY_EMAIL}...`);
 
    const result = await transporter.sendMail({
      from: `"WhatsApp Gateway" <${GMAIL_USER}>`,
      to: MY_EMAIL,
      subject: `💬 הודעה חדשה מ-${profileName || from.replace('whatsapp:', '')}`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #25D366; padding: 20px; border-radius: 10px 10px 0 0;">
            <h2 style="color: white; margin: 0;">💬 הודעת WhatsApp חדשה</h2>
          </div>
          <div style="background: #f0f0f0; padding: 20px; border-radius: 0 0 10px 10px;">
            <p><strong>מאת:</strong> ${profileName || 'לא ידוע'}</p>
            <p><strong>מספר:</strong> ${from.replace('whatsapp:', '')}</p>
            <p><strong>זמן:</strong> ${new Date().toLocaleString('he-IL')}</p>
            <hr style="border: 1px solid #ddd;" />
            <div style="background: white; padding: 15px; border-radius: 8px; font-size: 16px;">
              ${body.replace(/\n/g, '<br>')}
            </div>
          </div>
        </div>
      `,
    });
 
    console.log('✅ מייל נשלח! messageId:', result.messageId);
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  } catch (err) {
    console.error('❌ שגיאה בשליחת מייל:', err.message);
    console.error('❌ פרטי שגיאה:', JSON.stringify(err, null, 2));
    res.status(500).send('Error');
  }
});
 
// =====================================================
// 2. GMAIL POLLER – מייל יוצא → WhatsApp
//    פורמט נושא: WA:0501234567 או WA:0501234567: טקסט
// =====================================================
async function sendWhatsApp(to, message) {
  let normalized = to.replace(/\D/g, '');
  if (normalized.startsWith('0')) {
    normalized = '972' + normalized.slice(1);
  }
  const whatsappTo = `whatsapp:+${normalized}`;
  console.log(`📤 שולח WhatsApp ל-${whatsappTo}`);
  console.log(`📝 תוכן: ${message.substring(0, 100)}`);
 
  const result = await twilio.messages.create({
    from: TWILIO_WHATSAPP_FROM,
    to: whatsappTo,
    body: message,
  });
 
  console.log('✅ WhatsApp נשלח! SID:', result.sid, 'Status:', result.status);
  return result;
}
 
function startGmailPoller() {
  const imap = new Imap({
    user: GMAIL_USER,
    password: GMAIL_APP_PASSWORD,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  });
 
  function checkNewMails() {
    imap.openBox('INBOX', false, (err) => {
      if (err) { console.error('IMAP openBox error:', err.message); return; }
 
      imap.search(['UNSEEN', ['SUBJECT', 'WA:']], (err, results) => {
        if (err) { console.error('IMAP search error:', err.message); return; }
        if (!results || results.length === 0) return;
 
        console.log(`📬 נמצאו ${results.length} מיילים לשליחה`);
 
        const fetch = imap.fetch(results, { bodies: '' });
 
        fetch.on('message', (msg) => {
          msg.on('body', (stream) => {
            simpleParser(stream, async (err, parsed) => {
              if (err) { console.error('Parse error:', err.message); return; }
 
              const subject = parsed.subject || '';
              console.log(`📋 נושא: "${subject}"`);
 
              // תואם: WA:0501234567 או WA:0501234567: או WA:0501234567: טקסט
              const match = subject.match(/WA:(\+?[\d]+):?/i);
              if (!match) {
                console.log('⚠️ לא נמצא מספר בנושא');
                return;
              }
 
              const phoneNumber = match[1];
              console.log(`📱 מספר: ${phoneNumber}`);
 
              const messageBody = parsed.text?.trim() || 
                parsed.html?.replace(/<[^>]+>/g, '').trim() || '';
 
              if (!messageBody) {
                console.log('⚠️ גוף מייל ריק');
                return;
              }
 
              try {
                await sendWhatsApp(phoneNumber, messageBody);
              } catch (e) {
                console.error('❌ שגיאה בשליחת WhatsApp:', e.message);
                if (e.code) console.error('❌ קוד שגיאה:', e.code);
                if (e.status) console.error('❌ HTTP status:', e.status);
              }
            });
          });
        });
 
        fetch.once('end', () => {
          imap.setFlags(results, ['\\Seen'], (err) => {
            if (err) console.error('Flag error:', err.message);
            else console.log('✅ מיילים סומנו כנקראו');
          });
        });
      });
    });
  }
 
  imap.once('ready', () => {
    console.log('📧 Gmail IMAP מחובר – מאזין למיילים חדשים');
    checkNewMails();
    setInterval(checkNewMails, 30000);
  });
 
  imap.once('error', (err) => {
    console.error('IMAP connection error:', err.message);
    setTimeout(startGmailPoller, 10000);
  });
 
  imap.connect();
}
 
// =====================================================
// 3. בדיקת תקינות
// =====================================================
app.get('/', (req, res) => {
  res.send(`
    <div dir="rtl" style="font-family:Arial;padding:30px">
      <h2>✅ WhatsApp ↔ Gmail Gateway פועל!</h2>
      <p>📩 <strong>קבלת הודעות:</strong> WhatsApp → Gmail אוטומטי</p>
      <p>📤 <strong>שליחת הודעות:</strong> שלח מייל עם נושא: <code>WA:0501234567</code></p>
    </div>
  `);
});
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 שרת פועל על פורט ${PORT}`);
  startGmailPoller();
});