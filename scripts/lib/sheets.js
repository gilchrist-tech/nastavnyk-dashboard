import { google } from 'googleapis';
import { createGoogleAuth } from './google-auth.js';

export const SHEETS = {
  dailyMetrics: 'Щоденні метрики соцмереж',
  postPerformance: 'Ефективність публікацій',
  trafficGa4: 'Трафік GA4',
  competitorWatch: 'Моніторинг конкурентів',
  alerts: 'Сигнали та попередження',
  managerTasks: 'Завдання менеджера'
};

export function quoteSheetName(name) {
  return `'${name.replaceAll("'", "''")}'`;
}

export async function createSheetsClient(credentialsPath) {
  const auth = createGoogleAuth(credentialsPath);
  return google.sheets({ version: 'v4', auth });
}

async function getSheetId({ sheets, spreadsheetId, sheetName }) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))'
  });

  const match = response.data.sheets?.find((sheet) => sheet.properties?.title === sheetName);
  if (match?.properties?.sheetId == null) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  return match.properties.sheetId;
}

function rowMatches(row, matchColumns) {
  return Object.entries(matchColumns).every(([columnIndex, expectedValue]) => {
    const actualValue = row[Number(columnIndex)] ?? '';
    return String(actualValue) === String(expectedValue);
  });
}

function contiguousGroups(rowIndexes) {
  const sorted = [...rowIndexes].sort((a, b) => a - b);
  const groups = [];

  for (const rowIndex of sorted) {
    const current = groups.at(-1);
    if (current && rowIndex === current.endIndex) {
      current.endIndex += 1;
    } else {
      groups.push({
        startIndex: rowIndex,
        endIndex: rowIndex + 1
      });
    }
  }

  return groups.reverse();
}

export async function appendRows({ credentialsPath, spreadsheetId, sheetName, values }) {
  if (!values.length) return null;

  const sheets = await createSheetsClient(credentialsPath);
  const range = `${quoteSheetName(sheetName)}!A:Z`;

  return sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values
    }
  });
}

export async function replaceRows({ credentialsPath, spreadsheetId, sheetName, values, matchColumns }) {
  const sheets = await createSheetsClient(credentialsPath);
  const range = `${quoteSheetName(sheetName)}!A:Z`;
  const sheetId = await getSheetId({ sheets, spreadsheetId, sheetName });
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range
  });

  const rows = existing.data.values || [];
  const matchingRowIndexes = rows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ row, rowIndex }) => rowIndex > 0 && rowMatches(row, matchColumns))
    .map(({ rowIndex }) => rowIndex);

  if (matchingRowIndexes.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: contiguousGroups(matchingRowIndexes).map(({ startIndex, endIndex }) => ({
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex,
              endIndex
            }
          }
        }))
      }
    });
  }

  if (values.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values
      }
    });
  }

  return {
    deletedRowCount: matchingRowIndexes.length,
    writtenRowCount: values.length
  };
}
