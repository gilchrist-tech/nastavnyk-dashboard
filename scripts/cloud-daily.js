import { runGa4Collector } from './collect-ga4.js';
import { runInstagramCollector } from './collect-instagram.js';
import { runTikTokCollector } from './collect-tiktok.js';
import { runFunnelCollector } from './collect-funnel.js';
import { runBonusCalc } from './calc-bonus.js';
import { getConfig } from './lib/config.js';
import { createSheetsClient, quoteSheetName } from './lib/sheets.js';
import { getWarsawTimestamp } from './lib/dates.js';

// Єдиний хмарний прохід (GitHub Actions, щодня о 07:00 Europe/Warsaw).
// Stateless: усі секрети з env; TikTok access-токен оновлюється з refresh у межах запуску.
// Пише рядок у Automation Log і перевіряє свіжість дашборда.

async function step(name, fn, log) {
  try {
    await fn();
    log.ok.push(name);
  } catch (error) {
    log.errors.push(`${name}: ${error.message}`);
    console.error(`[${name}] ПОМИЛКА: ${error.message}`);
  }
}

async function checkDashboard(log) {
  const url = process.env.DASHBOARD_URL || 'https://nastavnyk-dashboard.vercel.app';
  const key = process.env.DASHBOARD_KEY;
  if (!key) { log.dashboard = 'пропущено (немає DASHBOARD_KEY)'; return; }
  try {
    const res = await fetch(`${url}/api/data?key=${encodeURIComponent(key)}&cb=${getWarsawTimestamp()}`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const dates = [...new Set((data.dailyMetrics || []).slice(1).map((r) => r[0]).filter(Boolean))].sort();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    log.dashboard = dates.at(-1) >= yesterday ? `свіжий (${dates.at(-1)})` : `ЗАСТАРІЛИЙ (остання дата ${dates.at(-1)})`;
    if (dates.at(-1) < yesterday) log.errors.push('Дашборд застарілий');
  } catch (error) {
    log.dashboard = `помилка перевірки: ${error.message}`;
    log.errors.push(`Дашборд: ${error.message}`);
  }
}

async function writeLog(log) {
  const config = getConfig();
  const sheets = await createSheetsClient(config.googleCredentialsPath);
  const status = log.errors.length ? (log.ok.length ? 'PARTIAL' : 'FAILED') : 'COMPLETE';
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetsId,
    range: `${quoteSheetName('Automation Log')}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        `cloud-${log.start.slice(0, 10)}`, log.start, getWarsawTimestamp(), '',
        log.ok.join(', '), `${log.ok.length} кроків`, String(log.errors.length),
        '', '', '', '', '', status,
        [`Дашборд: ${log.dashboard || '—'}`, ...log.errors].join(' | ')
      ]]
    }
  });
  console.log(`\n=== ${status} === кроки: ${log.ok.join(', ')} | дашборд: ${log.dashboard} | помилки: ${log.errors.length}`);
  if (status === 'FAILED') process.exit(1);
}

const log = { start: getWarsawTimestamp(), ok: [], errors: [], dashboard: '' };
await step('GA4', () => runGa4Collector([]), log);
await step('Instagram', () => runInstagramCollector([]), log);
await step('TikTok', () => runTikTokCollector([]), log);
await step('Воронка', () => runFunnelCollector(), log);
await step('Бонус', () => runBonusCalc(), log);
await checkDashboard(log);
await writeLog(log);
