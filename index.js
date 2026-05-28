const express = require('express');
const nodemailer = require('nodemailer');
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// --- הגדרות (מגיעות מ-Environment Variables) ---
const {
  GMAIL_USER,        // המייל שלך: yourname@gmail.com
  GMAIL_APP_PASSWORD, // App Password של גוגל (לא הסיסמה הרגילה)
  MY_EMAIL,          // המייל שאליו תגיעו ההודעות (בד"כ זהה ל-GMAIL_USER)
} = process.env;

// יצירת transporter לשליחת מייל
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

// ---- Webhook - מקבל הודעות מ-WhatsApp ----
app.post('/webhook', async (req, res) => {
  try {
    const from = req.body.From || 'לא ידוע';      // מי שלח (מספר WhatsApp)
    const body = req.body.Body || '';               // תוכן ההודעה
    const profileName = req.body.ProfileName || ''; // שם השולח

    console.log(`📩 הודעה נכנסת מ-${from}: ${body}`);

    // שליחת מייל
    await transporter.sendMail({
      from: `"WhatsApp Gateway" <${GMAIL_USER}>`,
      to: MY_EMAIL,
      subject: `💬 הודעה חדשה מ-${profileName || from}`,
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

    console.log('✅ מייל נשלח בהצלחה');

    // תגובה ריקה ל-Twilio (ללא הודעה חזרה ל-WhatsApp)
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');

  } catch (err) {
    console.error('❌ שגיאה:', err.message);
    res.status(500).send('Error');
  }
});

// ---- בדיקת תקינות ----
app.get('/', (req, res) => {
  res.send('✅ WhatsApp → Gmail Gateway פועל!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 שרת פועל על פורט ${PORT}`);
});
