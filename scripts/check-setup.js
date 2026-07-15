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

if (config.googleCredentialsPath) {
  console.log(
    `${fs.existsSync(config.googleCredentialsPath) ? 'OK' : 'MISSING'} credentials file: ${config.googleCredentialsPath}`
  );
}

if (!checks.every(([, ok]) => ok)) {
  console.log('\nFill .env.local before running collectors.');
  process.exitCode = 1;
}
