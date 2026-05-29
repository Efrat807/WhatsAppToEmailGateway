const express = require('express');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// --- משתני סביבה ---
const {
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  MY_EMAIL,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM,  // למשל: whatsapp:+14155238886
} = process.env;

// --- Nodemailer לשליחת מייל ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

// --- Twilio לשליחת WhatsApp ---
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

    await transporter.sendMail({
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

    console.log('✅ מייל נשלח');
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  } catch (err) {
    console.error('❌ שגיאה ב-webhook:', err.message);
    res.status(500).send('Error');
  }
});

// =====================================================
// 2. GMAIL POLLER – מייל יוצא → WhatsApp
//    פורמט נושא: WA:0501234567: תיאור כלשהו
//    גוף המייל = ההודעה לשליחה
// =====================================================

// אימות Gmail עם App Password דרך IMAP (imap library)
const Imap = require('imap');
const { simpleParser } = require('mailparser');

function startGmailPoller() {
  const imap = new Imap({
    user: GMAIL_USER,
    password: GMAIL_APP_PASSWORD,
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  });

  function openInbox(cb) {
    imap.openBox('INBOX', false, cb);
  }

  async function sendWhatsApp(to, message) {
    // נרמול מספר: מוריד 0 מהתחלה ומוסיף +972 אם ישראלי
    let normalized = to.replace(/\D/g, '');
    if (normalized.startsWith('0')) {
      normalized = '972' + normalized.slice(1);
    }
    const whatsappTo = `whatsapp:+${normalized}`;

    console.log(`📤 שולח WhatsApp ל-${whatsappTo}: ${message}`);

    await twilio.messages.create({
      from: TWILIO_WHATSAPP_FROM,
      to: whatsappTo,
      body: message,
    });

    console.log('✅ WhatsApp נשלח!');
  }

  function checkNewMails() {
    openInbox((err) => {
      if (err) { console.error('IMAP inbox error:', err); return; }

      // חיפוש מיילים שלא נקראו עם WA: בנושא
      imap.search(['UNSEEN', ['SUBJECT', 'WA:']], (err, results) => {
        if (err || !results || results.length === 0) return;

        console.log(`📬 נמצאו ${results.length} מיילים לשליחה`);

        const fetch = imap.fetch(results, { bodies: '' });

        fetch.on('message', (msg) => {
          msg.on('body', (stream) => {
            simpleParser(stream, async (err, parsed) => {
              if (err) { console.error('Parse error:', err); return; }

              const subject = parsed.subject || '';
              // חילוץ מספר מהנושא: WA:0501234567:
              const match = subject.match(/WA:(\+?[\d]+):/i);
              if (!match) return;

              const phoneNumber = match[1];
              const messageBody = parsed.text?.trim() || parsed.html?.replace(/<[^>]+>/g, '').trim() || '';

              if (!messageBody) {
                console.log('⚠️ גוף מייל ריק, מדלג');
                return;
              }

              try {
                await sendWhatsApp(phoneNumber, messageBody);
              } catch (e) {
                console.error('❌ שגיאה בשליחת WhatsApp:', e.message);
              }
            });
          });
        });

        // סמן כנקרא אחרי עיבוד
        fetch.once('end', () => {
          imap.setFlags(results, ['\\Seen'], (err) => {
            if (err) console.error('Flag error:', err);
          });
        });
      });
    });
  }

  imap.once('ready', () => {
    console.log('📧 Gmail IMAP מחובר – מאזין למיילים חדשים');
    checkNewMails();
    // בדיקה כל 30 שניות
    setInterval(checkNewMails, 30000);
  });

  imap.once('error', (err) => {
    console.error('IMAP error:', err.message);
    setTimeout(startGmailPoller, 10000); // נסה שוב אחרי 10 שניות
  });

  imap.connect();
}

// =====================================================
// 3. בדיקת תקינות + הפעלה
// =====================================================
app.get('/', (req, res) => {
  res.send(`
    <div dir="rtl" style="font-family:Arial;padding:30px">
      <h2>✅ WhatsApp ↔ Gmail Gateway פועל!</h2>
      <p>📩 <strong>קבלת הודעות:</strong> WhatsApp → Gmail אוטומטי</p>
      <p>📤 <strong>שליחת הודעות:</strong> שלח מייל עם נושא: <code>WA:0501234567: תיאור</code></p>
    </div>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 שרת פועל על פורט ${PORT}`);
  startGmailPoller();
});
