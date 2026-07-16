import { pathToFileURL } from 'node:url';
import { google } from 'googleapis';
import { getConfig } from './lib/config.js';
import { createGoogleAuth } from './lib/google-auth.js';
import { createSheetsClient, quoteSheetName } from './lib/sheets.js';

// Розрахунок бонуса менеджера в грн: Мінімум = 0%, Оптимум = 100%, між ними — пропорційно.
// Бонус KPI = вага × MAX_BONUS × виконання. Пише у «KPI менеджера» (факт, %, бонус)
// і в «INTERNAL Бонус» (повний розрахунок + виплата). Ручні значення не перезаписуються:
// автоматика чіпає лише клітинки, порожні або позначені «авто» в коментарі.

const MAX_BONUS = 3000;
const BASE_SALARY = 13000;
const REGISTRATION_EVENT = 'ads_conversion_Sign_Up_1';
const SOCIAL_SOURCE_RE = /instagram|tiktok|facebook|fb\.|linkedin|telegram|threads|linktr/i;
const TEACHER_RE = /role=teacher|type=tutor|become_tutor/i;
const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

const num = (v) => {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.').replace('%', ''));
  return Number.isFinite(n) ? n : null;
};
const fmtUah = (n) => new Intl.NumberFormat('uk-UA').format(Math.round(n));

async function getValues(sheets, spreadsheetId, range) {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return r.data.values || [];
}

// Реєстрації з соцмереж за місяць: GA4-оцінка (подія сторінки /register, унікальні users,
// джерело сесії = соцмережа; localhost/тестові IP відсікаються).
async function socialRegistrations({ credentialsPath, propertyId, startDate, endDate }) {
  const analytics = google.analyticsdata({ version: 'v1beta', auth: createGoogleAuth(credentialsPath) });
  const report = await analytics.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionSource' }, { name: 'pageLocation' }],
      metrics: [{ name: 'totalUsers' }],
      dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: REGISTRATION_EVENT } } },
      limit: 250
    }
  });
  let students = 0;
  let teachers = 0;
  for (const row of report.data.rows || []) {
    const source = row.dimensionValues[0].value || '';
    const url = row.dimensionValues[1].value || '';
    if (!url.includes('nastavnyk.com.ua') || !SOCIAL_SOURCE_RE.test(source)) continue;
    const users = Number(row.metricValues[0].value || 0);
    if (TEACHER_RE.test(url)) teachers += users;
    else students += users;
  }
  return { students, teachers };
}

export async function runBonusCalc() {
  const config = getConfig();
  const sheets = await createSheetsClient(config.googleCredentialsPath);
  const id = config.googleSheetsId;

  const metrics = await getValues(sheets, id, `${quoteSheetName('Щоденні метрики соцмереж')}!A1:H3000`);
  const posts = await getValues(sheets, id, `${quoteSheetName('Ефективність публікацій')}!A1:B1000`);
  const kpiRows = await getValues(sheets, id, `${quoteSheetName('KPI менеджера')}!A1:H200`);
  const bonusRows = await getValues(sheets, id, `${quoteSheetName('INTERNAL Бонус')}!A1:F200`);

  const dates = [...new Set(metrics.slice(1).map((r) => r[0]).filter(Boolean))].sort();
  const lastDate = dates.at(-1);
  if (!lastDate) throw new Error('Немає зібраних метрик.');
  const monthPrefix = lastDate.slice(0, 7);
  const d = new Date(lastDate);
  const monthName = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const dayNote = `день ${d.getDate()}/${daysInMonth}`;

  const mSum = (metric) => {
    const vals = metrics.slice(1)
      .filter((r) => (r[0] || '').startsWith(monthPrefix) && r[1] === 'Instagram' && r[2] === metric)
      .map((r) => num(r[3])).filter((x) => x != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const socialRegs = await socialRegistrations({
    credentialsPath: config.googleCredentialsPath,
    propertyId: config.ga4PropertyId,
    startDate: `${monthPrefix}-01`,
    endDate: lastDate
  });
  const AUTO_FACTS = {
    'Охоплення Instagram (місяць)': () => mSum('Охоплення'),
    'Нові підписники Instagram': () => mSum('Нові підписники'),
    'Переходи на сайт з соцмереж': () => mSum('Кліки на сайт'),
    'Одиниць контенту на місяць': () => posts.slice(1).filter((r) => (r[0] || '').startsWith(monthPrefix)).length || null,
    'Реєстрації учнів (з соцмереж)': () => socialRegs.students || null,
    'Реєстрації вчителів (з соцмереж)': () => socialRegs.teachers || null
  };

  // --- Блок місяця в «KPI менеджера» ---
  const start = kpiRows.findIndex((r) => (r[0] || '').trim() === monthName);
  if (start === -1) throw new Error(`Блок «${monthName}» не знайдено в KPI менеджера.`);
  const items = [];
  for (let i = start + 2; i < kpiRows.length; i++) {
    const r = kpiRows[i] || [];
    if (!r[0] || /^ЗАГАЛЬНА/.test(r[0])) { items.totalRow = /^ЗАГАЛЬНА/.test(r[0] || '') ? i : null; break; }
    items.push({ row: i, name: r[0].trim(), min: num(r[1]), opt: num(r[2]), weight: (num(r[3]) || 0) / 100, manualFact: r[4], comment: r[7] || '' });
  }

  const updates = [];
  let totalScore = 0;
  const internalPerKpi = {};

  for (const k of items) {
    const autoFn = AUTO_FACTS[k.name];
    const isAutoCell = !String(k.manualFact ?? '').trim() || /^авто/.test(k.comment);
    let fact = null;
    let source = 'ручне внесення';
    if (autoFn && isAutoCell) { fact = autoFn(); source = `авто, ${dayNote}`; }
    else if (String(k.manualFact ?? '').trim()) { fact = num(k.manualFact); source = 'внесено вручну'; }

    let score = null;
    if (fact != null && k.min != null && k.opt != null && k.opt > k.min) {
      score = Math.min(1, Math.max(0, (fact - k.min) / (k.opt - k.min)));
      totalScore += score * k.weight;
    }
    internalPerKpi[k.name] = { score, bonus: score != null ? MAX_BONUS * k.weight * score : 0 };

    const rowN = k.row + 1;
    if (autoFn && isAutoCell && fact != null) {
      updates.push({ range: `${quoteSheetName('KPI менеджера')}!E${rowN}:H${rowN}`, values: [[
        fact, score != null ? Math.round(score * 100) + '%' : '',
        fact >= (k.min ?? Infinity) ? 'Так' : 'Ні',
        `авто, ${dayNote}; бонус: ${fmtUah(internalPerKpi[k.name].bonus)} грн з ${fmtUah(MAX_BONUS * k.weight)}`
      ]] });
    } else if (fact != null && score != null) {
      updates.push({ range: `${quoteSheetName('KPI менеджера')}!F${rowN}:H${rowN}`, values: [[
        Math.round(score * 100) + '%', fact >= (k.min ?? Infinity) ? 'Так' : 'Ні',
        `${source}; бонус: ${fmtUah(internalPerKpi[k.name].bonus)} грн з ${fmtUah(MAX_BONUS * k.weight)}`
      ]] });
    }
  }

  const totalBonus = MAX_BONUS * totalScore;
  if (items.totalRow != null) {
    const rowN = items.totalRow + 1;
    updates.push({ range: `${quoteSheetName('KPI менеджера')}!F${rowN}:H${rowN}`, values: [[
      Math.round(totalScore * 100) + '%', '',
      `Бонус: ${fmtUah(totalBonus)} грн із ${fmtUah(MAX_BONUS)} (проміжно, ${dayNote}; фінал — в кінці місяця)`
    ]] });
  }

  // --- Блок місяця в «INTERNAL Бонус» ---
  const bStart = bonusRows.findIndex((r) => (r[0] || '').startsWith(`${monthName} — БОНУСНИЙ`));
  if (bStart !== -1) {
    for (let i = bStart + 2; i < bonusRows.length; i++) {
      const r = bonusRows[i] || [];
      const name = (r[0] || '').trim();
      if (!name) break;
      const rowN = i + 1;
      if (name === 'РАЗОМ') {
        updates.push({ range: `${quoteSheetName('INTERNAL Бонус')}!D${rowN}:E${rowN}`, values: [[Math.round(totalScore * 100) + '%', Math.round(totalBonus)]] });
      } else if (name === 'ВИПЛАТА:') {
        updates.push({ range: `${quoteSheetName('INTERNAL Бонус')}!B${rowN}`, values: [[`${fmtUah(BASE_SALARY + totalBonus)} грн (база ${fmtUah(BASE_SALARY)} + бонус ${fmtUah(totalBonus)}; проміжно, ${dayNote})`]] });
        break;
      } else if (internalPerKpi[name]) {
        const { score, bonus } = internalPerKpi[name];
        updates.push({ range: `${quoteSheetName('INTERNAL Бонус')}!D${rowN}:E${rowN}`, values: [[score != null ? Math.round(score * 100) + '%' : '—', Math.round(bonus)]] });
      }
    }
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: 'RAW', data: updates }
  });

  console.log(`${monthName} (${dayNote}): загальна оцінка ${Math.round(totalScore * 100)}%, бонус ${fmtUah(totalBonus)} грн із ${fmtUah(MAX_BONUS)}, виплата ${fmtUah(BASE_SALARY + totalBonus)} грн. Оновлено клітинок: ${updates.length}.`);
  return { totalScore, totalBonus };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBonusCalc().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
