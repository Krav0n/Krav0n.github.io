/* ════════════════════════════════════════════════════════════════════════
   Krav0n — הגדרות האתר

   apiBase: הכתובת של שרת הנתונים (ה-Worker מהתיקייה kick-api-worker),
   בלי לוכסן בסוף. לדוגמה:
     apiBase: 'https://krav0n-api.your-name.workers.dev'

   כל עוד השדה ריק, טבלאות ה-LEADERBOARD מוצגות ריקות עם ההודעה
   "ממתין לחיבור ל-Kick", ותגית ה-LIVE בודקת את Kick ישירות כמו קודם.

   apiBase: address of the Krav0n API (Cloudflare Worker), no trailing slash.
   ════════════════════════════════════════════════════════════════════════ */
window.KRAV0N_CONFIG = {
  apiBase: ''
};
