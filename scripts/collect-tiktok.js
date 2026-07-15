import { pathToFileURL } from 'node:url';
import { getConfig } from './lib/config.js';
import { getCompletedDateRange, parseCliArgs } from './lib/dates.js';
import { updateEnvFile } from './lib/env-file.js';
import { collectTikTok, refreshTikTokAccessToken } from './lib/tiktok.js';
import { replaceRows, SHEETS } from './lib/sheets.js';

const ENV_PATH = '.env.local';

function tokenExpiryIso(secondsFromNow) {
  if (!secondsFromNow) return '';
  return new Date(Date.now() + Number(secondsFromNow) * 1000).toISOString();
}

async function resolveAccessToken(config) {
  const canRefresh = config.tiktokClientKey && config.tiktokClientSecret && config.tiktokRefreshToken;
  if (!canRefresh) return config.tiktokAccessToken;

  try {
    const token = await refreshTikTokAccessToken({
      clientKey: config.tiktokClientKey,
      clientSecret: config.tiktokClientSecret,
      refreshToken: config.tiktokRefreshToken
    });

    updateEnvFile(ENV_PATH, {
      TIKTOK_ACCESS_TOKEN: token.access_token,
      TIKTOK_REFRESH_TOKEN: token.refresh_token || config.tiktokRefreshToken,
      TIKTOK_OPEN_ID: token.open_id || config.tiktokOpenId,
      TIKTOK_TOKEN_EXPIRES_AT: tokenExpiryIso(token.expires_in),
      TIKTOK_REFRESH_EXPIRES_AT: tokenExpiryIso(token.refresh_expires_in)
    });

    return token.access_token;
  } catch (error) {
    if (config.tiktokAccessToken) {
      console.warn(`Warning: TikTok token refresh failed, trying existing access token. ${error.message}`);
      return config.tiktokAccessToken;
    }
    throw error;
  }
}

export async function runTikTokCollector(argv = process.argv.slice(2)) {
  const cli = parseCliArgs(argv);
  const config = getConfig();

  if (!config.tiktokAccessToken && !config.tiktokRefreshToken) {
    console.log('TikTok collector is not configured yet.');
    console.log('Fill TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI and run TikTok OAuth setup.');
    return { skipped: true };
  }

  const accessToken = await resolveAccessToken(config);
  if (!accessToken) {
    console.log('TikTok collector is not configured yet.');
    console.log('Fill TIKTOK_ACCESS_TOKEN or TIKTOK_REFRESH_TOKEN in .env.local after TikTok OAuth setup.');
    return { skipped: true };
  }

  const fallbackRange = getCompletedDateRange(config.tiktokLookbackDays);
  const startDate = cli.startDate || fallbackRange.startDate;
  const endDate = cli.endDate || fallbackRange.endDate;

  const result = await collectTikTok({
    accessToken,
    userFields: config.tiktokUserFields,
    videoFields: config.tiktokVideoFields,
    videoLimit: config.tiktokVideoLimit,
    startDate,
    endDate
  });

  const profileName = result.profile.username || result.profile.display_name || result.profile.open_id || 'connected account';
  console.log(
    `TikTok rows collected for ${startDate} to ${endDate}: ${result.accountMetricCount} account metrics, ${result.postCount} posts.`
  );
  console.log(`TikTok account: ${profileName}`);
  console.log(`TikTok videos fetched before date filtering: ${result.fetchedVideoCount}`);

  if (cli.dryRun) {
    console.log('Dry run enabled. No rows written to Google Sheets.');
    console.log(JSON.stringify({
      dailyMetricRows: result.dailyMetricRows.slice(0, 6),
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
      1: 'TikTok'
    }
  });

  const postsWrite = await replaceRows({
    credentialsPath: config.googleCredentialsPath,
    spreadsheetId: config.googleSheetsId,
    sheetName: SHEETS.postPerformance,
    values: result.postRows,
    matchColumns: {
      0: endDate,
      1: 'TikTok'
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
  runTikTokCollector().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
