import { google } from 'googleapis';

const RANGES = [
  "'Щоденні метрики соцмереж'!A1:H3000",
  "'Ефективність публікацій'!A1:N500",
  "'Сигнали та попередження'!A1:L200",
  "'Завдання менеджера'!A1:K300",
  "'Колоборації'!A1:I100",
  "'Automation Log'!A1:N200",
  "'Моніторинг конкурентів'!A1:N200"
];

const KEYS = ['dailyMetrics', 'posts', 'alerts', 'tasks', 'collabs', 'automationLog', 'competitors'];

export default async function handler(req, res) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      ranges: RANGES
    });

    const data = { generatedAt: new Date().toISOString() };
    response.data.valueRanges.forEach((valueRange, index) => {
      data[KEYS[index]] = valueRange.values || [];
    });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Не вдалося прочитати дані з Google Sheets' });
  }
}
