# 📱➡️📧 WhatsApp → Gmail Gateway

שרת שמקבל הודעות WhatsApp ומעביר אותן למייל.

---

## שלבי הגדרה

### 1. הכנת Gmail – App Password

כדי שהשרת ישלח מיילים בשמך, גוגל דורשת "App Password":

1. היכנסי ל-[myaccount.google.com](https://myaccount.google.com)
2. **Security** → **2-Step Verification** (חייב להיות פעיל)
3. חפשי **App Passwords** (בתחתית עמוד ה-Security)
4. בחרי **Other (Custom name)** → כתבי "WhatsApp Gateway"
5. לחצי **Generate** → תקבלי קוד של 16 תווים כמו: `xxxx xxxx xxxx xxxx`
6. **שמרי את הקוד!** תצטרכי אותו בשלב הבא

---

### 2. העלאה ל-GitHub

```bash
git init
git add .
git commit -m "WhatsApp to Email gateway"
git remote add origin https://github.com/YOUR_USERNAME/whatsapp-to-email.git
git push -u origin main
```

---

### 3. Deploy ל-Render (חינם)

1. היכנסי ל-[render.com](https://render.com) → **New Web Service**
2. חברי את ה-GitHub repository
3. הגדרות:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. תחת **Environment Variables** הוסיפי:

| Key | Value |
|-----|-------|
| `GMAIL_USER` | yourname@gmail.com |
| `GMAIL_APP_PASSWORD` | xxxx xxxx xxxx xxxx |
| `MY_EMAIL` | yourname@gmail.com |

5. לחצי **Create Web Service** – תקבלי URL כמו `https://whatsapp-gateway-xxxx.onrender.com`

---

### 4. הגדרת Twilio Sandbox

1. היכנסי ל-[console.twilio.com](https://console.twilio.com)
2. **Messaging → Try it out → Send a WhatsApp message**
3. עקבי אחרי ההוראות לחיבור ה-Sandbox (שלחי "join [קוד]" מהטלפון שלך)
4. תחת **Sandbox Settings** → **When a message comes in:**
   - הכניסי: `https://YOUR-RENDER-URL.onrender.com/webhook`
   - Method: **HTTP POST**
5. לחצי **Save**

---

### 5. בדיקה

שלחי הודעה ל-Sandbox מהטלפון שלך → תוך שניות תגיע הודעת מייל ל-Gmail! 🎉

---

## הערות חשובות

- **Sandbox מוגבל** – רק מספרים שאישרת יכולים לשלוח
- לשימוש פתוח לכולם צריך לשדרג ל-WhatsApp Business API (דרך Meta)
- הקוד **לא מעלה** את ה-.env לGitHub (מוגן ע"י .gitignore)
