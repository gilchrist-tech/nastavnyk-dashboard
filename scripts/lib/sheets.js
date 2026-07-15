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
