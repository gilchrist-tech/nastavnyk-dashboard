import { getConfig } from './lib/config.js';
import { updateEnvFile } from './lib/env-file.js';
import { buildTikTokAuthUrl } from './lib/tiktok.js';

const config = getConfig();

if (!config.tiktokClientKey || !config.tiktokRedirectUri) {
  console.error('Fill TIKTOK_CLIENT_KEY and TIKTOK_REDIRECT_URI in .env.local first.');
  process.exit(1);
}

const authUrl = buildTikTokAuthUrl({
  clientKey: config.tiktokClientKey,
  redirectUri: config.tiktokRedirectUri,
  scopes: config.tiktokScopes
});
const state = authUrl.searchParams.get('state');

updateEnvFile('.env.local', {
  TIKTOK_OAUTH_STATE: state
});

console.log('Open this TikTok authorization URL:');
console.log(authUrl.toString());
console.log('');
console.log(`Saved TIKTOK_OAUTH_STATE=${state} to .env.local for callback verification.`);
