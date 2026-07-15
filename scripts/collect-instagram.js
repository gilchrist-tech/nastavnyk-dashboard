import { getConfig } from './lib/config.js';

async function main() {
  const config = getConfig();

  if (!config.metaAccessToken || !config.metaIgUserId) {
    console.log('Instagram collector is not configured yet.');
    console.log('Fill META_ACCESS_TOKEN and META_IG_USER_ID in .env.local after Meta API setup.');
    return;
  }

  const metricNames = config.metaInsightMetrics
    .split(',')
    .map((metric) => metric.trim())
    .filter(Boolean);

  const url = new URL(`https://graph.facebook.com/${config.metaGraphVersion}/${config.metaIgUserId}/insights`);
  url.searchParams.set('metric', metricNames.join(','));
  url.searchParams.set('period', 'day');
  url.searchParams.set('access_token', config.metaAccessToken);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Meta API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
  console.log('Next step: map Instagram insights into Ukrainian Google Sheets tabs.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
