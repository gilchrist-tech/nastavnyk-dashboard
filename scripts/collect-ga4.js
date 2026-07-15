import { pathToFileURL } from 'node:url';
import { requireGa4Config } from './lib/config.js';
import { getCompletedDateRange, parseCliArgs } from './lib/dates.js';
import { collectGa4Traffic } from './lib/ga4.js';
import { replaceRows, SHEETS } from './lib/sheets.js';

export async function runGa4Collector(argv = process.argv.slice(2)) {
  const cli = parseCliArgs(argv);
  const config = requireGa4Config();
  const fallbackRange = getCompletedDateRange(config.ga4LookbackDays);
  const startDate = cli.startDate || fallbackRange.startDate;
  const endDate = cli.endDate || fallbackRange.endDate;

  const result = await collectGa4Traffic({
    credentialsPath: config.googleCredentialsPath,
    propertyId: config.ga4PropertyId,
    startDate,
    endDate,
    registrationEventName: config.ga4RegistrationEventName
  });

  console.log(`GA4 rows collected for ${startDate} to ${endDate}: ${result.rowCount}`);

  if (cli.dryRun) {
    console.log('Dry run enabled. No rows written to Google Sheets.');
    console.log(JSON.stringify(result.trafficRows.slice(0, 3), null, 2));
    return;
  }

  const trafficWrite = await replaceRows({
    credentialsPath: config.googleCredentialsPath,
    spreadsheetId: config.googleSheetsId,
    sheetName: SHEETS.trafficGa4,
    values: result.trafficRows,
    matchColumns: {
      0: endDate
    }
  });

  const dailyMetricsWrite = await replaceRows({
    credentialsPath: config.googleCredentialsPath,
    spreadsheetId: config.googleSheetsId,
    sheetName: SHEETS.dailyMetrics,
    values: result.dailyMetricRows,
    matchColumns: {
      0: endDate,
      1: 'GA4'
    }
  });

  console.log(
    `Updated ${SHEETS.trafficGa4}: deleted ${trafficWrite.deletedRowCount}, wrote ${trafficWrite.writtenRowCount}.`
  );
  console.log(
    `Updated ${SHEETS.dailyMetrics}: deleted ${dailyMetricsWrite.deletedRowCount}, wrote ${dailyMetricsWrite.writtenRowCount}.`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runGa4Collector().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
