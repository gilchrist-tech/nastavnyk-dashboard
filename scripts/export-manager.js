import { pathToFileURL } from 'node:url';
import { getEnv, getConfig } from './lib/config.js';
import { getWarsawTimestamp } from './lib/dates.js';
import { createSheetsClient, quoteSheetName } from './lib/sheets.js';

// Односторонній masked-експорт MASTER → NASTAVNYK_MARKETING_MANAGER за Access Matrix.
// Для аркушів з pull менеджерські правки статусних колонок повертаються в MASTER перед експортом.
// Аркуші OWNER_ONLY (INTERNAL Бонус, Воронка AARRR, Конфіг, Automation Log, Access *) не експортуються ніколи.

const EXPORT_SHEETS = [
  { name: 'Щоденні метрики соцмереж', maskRows: (rows) => rows.filter((r, i) => i === 0 || r[2] !== 'Дохід') },
  { name: 'Трафік GA4', maskColumns: [10, 11] }, // Реєстрації, Дохід — OWNER_ONLY
  { name: 'Ефективність публікацій' },
  { name: 'Ефективність контенту' },
  { name: 'Контент-план' },
  { name: 'Тижневий трекінг' },
  { name: 'KPI менеджера' },
  { name: 'Колоборації' },
  { name: 'Сигнали та попередження', pull: { keyColumns: [0, 3], editableColumns: [10, 11] } },
  { name: 'Завдання менеджера', pull: { keyColumns: [0, 3], editableColumns: [8, 9, 10] } },
  { name: 'Ідеї контенту', pull: { keyColumns: [0, 2], editableColumns: [7] } },
  { name: 'War Room' },
  { name: 'Конкурентні удари' },
  { name: 'Моніторинг конкурентів' },
  { name: 'Brand Voice' },
  { name: 'UTM система та GA4 ' }
];

const COLUMN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

async function getValues(sheets, spreadsheetId, sheetName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheetName(sheetName)}!A1:Z3000`
  });
  return response.data.values || [];
}

async function ensureSheets(sheets, spreadsheetId, names) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(title))' });
  const existing = meta.data.sheets.map((s) => s.properties.title);
  const missing = names.filter((n) => !existing.includes(n));
  if (missing.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }
    });
  }
}

function rowKey(row, keyColumns) {
  return keyColumns.map((c) => String(row[c] ?? '').trim()).join('|');
}

async function pullManagerEdits({ sheets, masterId, managerId, sheet }) {
  const { keyColumns, editableColumns } = sheet.pull;
  const managerRows = await getValues(sheets, managerId, sheet.name).catch(() => []);
  if (!managerRows.length) return 0;

  const managerByKey = new Map(
    managerRows.slice(1).filter((r) => rowKey(r, keyColumns)).map((r) => [rowKey(r, keyColumns), r])
  );
  const masterRows = await getValues(sheets, masterId, sheet.name);
  const updates = [];

  masterRows.forEach((row, index) => {
    if (index === 0) return;
    const managerRow = managerByKey.get(rowKey(row, keyColumns));
    if (!managerRow) return;
    for (const col of editableColumns) {
      const managerValue = String(managerRow[col] ?? '').trim();
      const masterValue = String(row[col] ?? '').trim();
      if (managerValue && managerValue !== masterValue) {
        updates.push({
          range: `${quoteSheetName(sheet.name)}!${COLUMN_LETTERS[col]}${index + 1}`,
          values: [[managerValue]]
        });
      }
    }
  });

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: masterId,
      requestBody: { valueInputOption: 'RAW', data: updates }
    });
  }
  return updates.length;
}

export async function runManagerExport(runId = `export-${Date.now()}`) {
  const config = getConfig();
  const managerId = getEnv('MANAGER_SHEETS_ID');
  const sheets = await createSheetsClient(config.googleCredentialsPath);
  const startedAt = getWarsawTimestamp();

  if (!managerId) {
    console.log('MANAGER_SHEETS_ID не задано — експорт у менеджерський файл пропущено.');
    return { skipped: true };
  }

  await ensureSheets(sheets, managerId, EXPORT_SHEETS.map((s) => s.name));

  let exportedRows = 0;
  let excludedFields = 0;
  let pulledEdits = 0;
  const errors = [];

  for (const sheet of EXPORT_SHEETS) {
    try {
      if (sheet.pull) {
        pulledEdits += await pullManagerEdits({ sheets, masterId: config.googleSheetsId, managerId, sheet });
      }

      let rows = await getValues(sheets, config.googleSheetsId, sheet.name);
      if (sheet.maskRows) {
        const before = rows.length;
        rows = sheet.maskRows(rows);
        excludedFields += before - rows.length;
      }
      if (sheet.maskColumns) {
        rows = rows.map((r) => r.filter((_, i) => !sheet.maskColumns.includes(i)));
        excludedFields += sheet.maskColumns.length;
      }

      await sheets.spreadsheets.values.clear({
        spreadsheetId: managerId,
        range: `${quoteSheetName(sheet.name)}!A1:Z3000`
      });
      if (rows.length) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: managerId,
          range: `${quoteSheetName(sheet.name)}!A1`,
          valueInputOption: 'USER_ENTERED', // числа мають бути числами — інакше формули дашборда не рахують
          requestBody: { values: rows }
        });
      }
      exportedRows += rows.length;
      console.log(`${sheet.name}: експортовано ${rows.length} рядків`);
    } catch (error) {
      errors.push(`${sheet.name}: ${error.message}`);
      console.error(`${sheet.name}: ПОМИЛКА — ${error.message}`);
    }
  }

  const status = errors.length ? (exportedRows ? 'PARTIAL' : 'FAILED') : 'COMPLETE';
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.googleSheetsId,
    range: `${quoteSheetName('Access Export Log')}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        startedAt, runId, 'NASTAVNYK_COMMAND_CENTER_MASTER', 'NASTAVNYK_MARKETING_MANAGER',
        exportedRows, excludedFields, status, errors.join('; ')
      ]]
    }
  });

  console.log(`Експорт ${status}: ${exportedRows} рядків, виключено конфіденційних полів: ${excludedFields}, повернуто правок менеджера: ${pulledEdits}.`);
  return { exportedRows, excludedFields, pulledEdits, status };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runManagerExport(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
