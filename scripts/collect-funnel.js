import { pathToFileURL } from 'node:url';
import { google } from 'googleapis';
import { requireGa4Config } from './lib/config.js';
import { createGoogleAuth } from './lib/google-auth.js';
import { createSheetsClient, quoteSheetName } from './lib/sheets.js';

// Заповнює «Воронка AARRR» з GA4 по завершених тижнях: Відвідувачі (C), Реєстр. учнів (D),
// Реєстр. вчит. (E), Конверсія (H). Пише ЛИШЕ в порожні клітинки — ручні значення з
// адмін-панелі мають пріоритет і ніколи не перезаписуються. «1-е заняття» і «Повторне» — ручні.
// Реєстрації = унікальні користувачі події ads_conversion_Sign_Up_1 на /register;
// роль: role=teacher / type=tutor / become_tutor → вчителі, інакше — учні. Це GA4-оцінка,
// точне джерело — адмін-панель.

const REGISTRATION_EVENT = 'ads_conversion_Sign_Up_1';
const TEACHER_RE = /role=teacher|type=tutor|become_tutor/i;
const VALID_HOST = 'nastavnyk.com.ua';

function parseWeekDates(label) {
  const m = String(label).match(/(\d{2})\.(\d{2})\s*—\s*(\d{2})\.(\d{2})/);
  if (!m) return null;
  const year = (mm) => (Number(mm) < 4 ? 2027 : 2026);
  return {
    start: `${year(m[2])}-${m[2]}-${m[1]}`,
    end: `${year(m[4])}-${m[4]}-${m[3]}`
  };
}

export async function runFunnelCollector() {
  const config = requireGa4Config();
  const auth = createGoogleAuth(config.googleCredentialsPath);
  const analytics = google.analyticsdata({ version: 'v1beta', auth });
  const sheets = await createSheetsClient(config.googleCredentialsPath);
  const property = `properties/${config.ga4PropertyId}`;

  const rows = (await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheetsId,
    range: `${quoteSheetName('Воронка AARRR')}!A1:H60`
  })).data.values || [];

  const today = new Date().toISOString().slice(0, 10);
  const updates = [];
  let filled = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    if (!/^Тиждень \d+/.test(row[0] || '')) continue;
    const dates = parseWeekDates(row[1]);
    if (!dates || dates.end >= today) continue; // лише завершені тижні
    const hasVisitors = String(row[2] ?? '').trim() !== '';
    const hasStudents = String(row[3] ?? '').trim() !== '';
    const hasTeachers = String(row[4] ?? '').trim() !== '';
    const hasConversion = String(row[7] ?? '').trim() !== '' && String(row[7]).trim() !== '-';
    if (hasVisitors && hasStudents && hasTeachers && hasConversion) continue;

    const usersReport = await analytics.properties.runReport({
      property,
      requestBody: { dateRanges: [{ startDate: dates.start, endDate: dates.end }], metrics: [{ name: 'totalUsers' }] }
    });
    const visitors = Number(usersReport.data.rows?.[0]?.metricValues?.[0]?.value || 0);

    const regReport = await analytics.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate: dates.start, endDate: dates.end }],
        dimensions: [{ name: 'pageLocation' }],
        metrics: [{ name: 'totalUsers' }],
        dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: REGISTRATION_EVENT } } },
        limit: 250
      }
    });
    let students = 0;
    let teachers = 0;
    for (const r of regReport.data.rows || []) {
      const url = r.dimensionValues[0].value || '';
      if (!url.includes(VALID_HOST)) continue; // відсікти localhost і тестові IP
      const users = Number(r.metricValues[0].value || 0);
      if (TEACHER_RE.test(url)) teachers += users;
      else students += users;
    }

    const rowN = i + 1;
    const conversion = visitors ? (((students + teachers) / visitors) * 100).toFixed(1).replace('.', ',') + '%' : '-';
    if (!hasVisitors) updates.push({ range: `${quoteSheetName('Воронка AARRR')}!C${rowN}`, values: [[visitors]] });
    if (!hasStudents) updates.push({ range: `${quoteSheetName('Воронка AARRR')}!D${rowN}`, values: [[students]] });
    if (!hasTeachers) updates.push({ range: `${quoteSheetName('Воронка AARRR')}!E${rowN}`, values: [[teachers]] });
    if (!hasConversion) updates.push({ range: `${quoteSheetName('Воронка AARRR')}!H${rowN}`, values: [[conversion]] });
    filled++;
    console.log(`${row[0]} (${row[1]}): відвідувачі ${visitors}, учні ${students}, вчителі ${teachers}, конверсія ${conversion}`);
  }

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.googleSheetsId,
      requestBody: { valueInputOption: 'RAW', data: updates }
    });
  }
  console.log(`Оброблено тижнів: ${filled}, оновлено клітинок: ${updates.length}. Ручні значення не чіпались.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFunnelCollector().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
