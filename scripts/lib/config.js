import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const DEFAULT_GOOGLE_SHEETS_ID = '1PzikJ_rpFJx4SHOAroE0w9-X7eclEgA6IpmExSTEs_4';

export function getEnv(name, options = {}) {
  const value = process.env[name];
  if (!value && options.required) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || options.defaultValue || '';
}

export function getConfig() {
  return {
    googleCredentialsPath: getEnv('GOOGLE_APPLICATION_CREDENTIALS'),
    googleSheetsId: getEnv('GOOGLE_SHEETS_ID', {
      defaultValue: DEFAULT_GOOGLE_SHEETS_ID
    }),
    ga4PropertyId: getEnv('GA4_PROPERTY_ID'),
    ga4RegistrationEventName: getEnv('GA4_REGISTRATION_EVENT_NAME', {
      defaultValue: 'sign_up'
    }),
    ga4LookbackDays: Number(getEnv('GA4_LOOKBACK_DAYS', { defaultValue: '1' })),
    metaGraphVersion: getEnv('META_GRAPH_VERSION', { defaultValue: 'v25.0' }),
    metaAccountInsightMetrics: getEnv('META_ACCOUNT_INSIGHT_METRICS', {
      defaultValue: 'reach,views,follower_count,profile_views,website_clicks'
    }),
    metaMediaInsightMetrics: getEnv('META_MEDIA_INSIGHT_METRICS', {
      defaultValue: 'reach,views,likes,comments,saved,shares'
    }),
    metaMediaLimit: Number(getEnv('META_MEDIA_LIMIT', { defaultValue: '25' })),
    metaLookbackDays: Number(getEnv('META_LOOKBACK_DAYS', { defaultValue: '1' })),
    metaAccessToken: getEnv('META_ACCESS_TOKEN'),
    metaIgUserId: getEnv('META_IG_USER_ID'),
    metaPageId: getEnv('META_PAGE_ID'),
    tiktokClientKey: getEnv('TIKTOK_CLIENT_KEY'),
    tiktokClientSecret: getEnv('TIKTOK_CLIENT_SECRET'),
    tiktokRedirectUri: getEnv('TIKTOK_REDIRECT_URI'),
    tiktokScopes: getEnv('TIKTOK_SCOPES', {
      defaultValue: 'user.info.basic,user.info.profile,user.info.stats,video.list'
    }),
    tiktokAccessToken: getEnv('TIKTOK_ACCESS_TOKEN'),
    tiktokRefreshToken: getEnv('TIKTOK_REFRESH_TOKEN'),
    tiktokOpenId: getEnv('TIKTOK_OPEN_ID'),
    tiktokUserFields: getEnv('TIKTOK_USER_FIELDS', {
      defaultValue: 'open_id,union_id,avatar_url,display_name,username,follower_count,following_count,likes_count,video_count'
    }),
    tiktokVideoFields: getEnv('TIKTOK_VIDEO_FIELDS', {
      defaultValue: 'id,create_time,share_url,embed_link,title,video_description,duration,view_count,like_count,comment_count,share_count'
    }),
    tiktokVideoLimit: Number(getEnv('TIKTOK_VIDEO_LIMIT', { defaultValue: '40' })),
    tiktokLookbackDays: Number(getEnv('TIKTOK_LOOKBACK_DAYS', { defaultValue: '1' }))
  };
}

export function requireGoogleConfig() {
  return {
    googleCredentialsPath: getEnv('GOOGLE_APPLICATION_CREDENTIALS', { required: true }),
    googleSheetsId: getEnv('GOOGLE_SHEETS_ID', {
      defaultValue: DEFAULT_GOOGLE_SHEETS_ID
    })
  };
}

export function requireGa4Config() {
  return {
    ...requireGoogleConfig(),
    ga4PropertyId: getEnv('GA4_PROPERTY_ID', { required: true }),
    ga4RegistrationEventName: getEnv('GA4_REGISTRATION_EVENT_NAME', {
      defaultValue: 'sign_up'
    }),
    ga4LookbackDays: Number(getEnv('GA4_LOOKBACK_DAYS', { defaultValue: '1' }))
  };
}
