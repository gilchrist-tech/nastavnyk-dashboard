import fs from 'node:fs';
import { getConfig } from './lib/config.js';

const config = getConfig();

const checks = [
  ['GOOGLE_APPLICATION_CREDENTIALS', Boolean(config.googleCredentialsPath)],
  ['GOOGLE_SHEETS_ID', Boolean(config.googleSheetsId)],
  ['GA4_PROPERTY_ID', Boolean(config.ga4PropertyId)]
];

for (const [name, ok] of checks) {
  console.log(`${ok ? 'OK' : 'MISSING'} ${name}`);
}

console.log('\nOptional Instagram / Meta setup:');
console.log(`${config.metaAccessToken ? 'OK' : 'MISSING'} META_ACCESS_TOKEN`);
console.log(`${config.metaIgUserId || config.metaPageId ? 'OK' : 'MISSING'} META_IG_USER_ID or META_PAGE_ID`);

console.log('\nOptional TikTok setup:');
console.log(`${config.tiktokClientKey ? 'OK' : 'MISSING'} TIKTOK_CLIENT_KEY`);
console.log(`${config.tiktokClientSecret ? 'OK' : 'MISSING'} TIKTOK_CLIENT_SECRET`);
console.log(`${config.tiktokRedirectUri ? 'OK' : 'MISSING'} TIKTOK_REDIRECT_URI`);
console.log(`${config.tiktokAccessToken || config.tiktokRefreshToken ? 'OK' : 'MISSING'} TikTok access or refresh token`);

if (config.googleCredentialsPath) {
  console.log(
    `${fs.existsSync(config.googleCredentialsPath) ? 'OK' : 'MISSING'} credentials file: ${config.googleCredentialsPath}`
  );
}

if (!checks.every(([, ok]) => ok)) {
  console.log('\nFill .env.local before running collectors.');
  process.exitCode = 1;
}
