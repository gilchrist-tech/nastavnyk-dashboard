import { pathToFileURL } from 'node:url';
import { getConfig } from './lib/config.js';
import { getCompletedDateRange, parseCliArgs } from './lib/dates.js';
import { collectInstagram } from './lib/instagram.js';
import { replaceRows, SHEETS } from './lib/sheets.js';

export async function runInstagramCollector(argv = process.argv.slice(2)) {
  const cli = parseCliArgs(argv);
  const config = getConfig();

  if (!config.metaAccessToken) {
    console.log('Instagram collector is not configured yet.');
    console.log('Fill META_ACCESS_TOKEN and META_IG_USER_ID or META_PAGE_ID in .env.local after Meta API setup.');
    return { skipped: true };
  }

  const fallbackRange = getCompletedDateRange(config.metaLookbackDays);
  const startDate = cli.startDate || fallbackRange.startDate;
  const endDate = cli.endDate || fallbackRange.endDate;

  const result = await collectInstagram({
    graphVersion: config.metaGraphVersion,
    accessToken: config.metaAccessToken,
    igUserId: config.metaIgUserId,
    pageId: config.metaPageId,
    accountInsightMetrics: config.metaAccountInsightMetrics,
    mediaInsightMetrics: config.metaMediaInsightMetrics,
    mediaLimit: config.metaMediaLimit,
    startDate,
    endDate
  });

  console.log(
    `Instagram rows collected for ${startDate} to ${endDate}: ${result.accountMetricCount} account metrics, ${result.postCount} posts.`
  );
  if (result.profile?.username) {
    console.log(`Instagram account: @${result.profile.username}`);
  }
  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  if (cli.dryRun) {
    console.log('Dry run enabled. No rows written to Google Sheets.');
    console.log(JSON.stringify({
      dailyMetricRows: result.dailyMetricRows.slice(0, 5),
      postRows: result.postRows.slice(0, 3)
    }, null, 2));
    return result;
  }

  const dailyMetricsWrite = await replaceRows({
    credentialsPath: config.googleCredentialsPath,
    spreadsheetId: config.googleSheetsId,
    sheetName: SHEETS.dailyMetrics,
    values: result.dailyMetricRows,
    matchColumns: {
      0: endDate,
      1: 'Instagram'
    }
  });

  const postsWrite = await replaceRows({
    credentialsPath: config.googleCredentialsPath,
    spreadsheetId: config.googleSheetsId,
    sheetName: SHEETS.postPerformance,
    values: result.postRows,
    matchColumns: {
      0: endDate,
      1: 'Instagram'
    }
  });

  console.log(
    `Updated ${SHEETS.dailyMetrics}: deleted ${dailyMetricsWrite.deletedRowCount}, wrote ${dailyMetricsWrite.writtenRowCount}.`
  );
  console.log(
    `Updated ${SHEETS.postPerformance}: deleted ${postsWrite.deletedRowCount}, wrote ${postsWrite.writtenRowCount}.`
  );

  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runInstagramCollector().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
