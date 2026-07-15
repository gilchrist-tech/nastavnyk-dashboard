import crypto from 'node:crypto';
import { getWarsawTimestamp, nextIsoDate } from './dates.js';

const API_BASE_URL = 'https://open.tiktokapis.com';
const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const DEFAULT_SCOPES = 'user.info.basic,user.info.profile,user.info.stats,video.list';

const PROFILE_METRIC_LABELS = {
  follower_count: 'Підписники всього',
  following_count: 'Підписок всього',
  likes_count: 'Лайки всього',
  video_count: 'Відео всього'
};

class TikTokApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TikTokApiError';
    this.details = details;
  }
}

function parseCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formBody(params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      body.set(key, value);
    }
  }
  return body;
}

function assertTikTokOk(data, context) {
  const error = data.error;
  if (!error) return;

  const code = error.code ?? error.error_code;
  if (code === undefined || code === 0 || code === 'ok') return;

  throw new TikTokApiError(`${context}: ${error.message || error.description || code}`, { error });
}

async function tiktokFetch(url, options, context) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error_description || data.error?.message || response.statusText;
    throw new TikTokApiError(`${context}: TikTok API error ${response.status}: ${message}`, {
      status: response.status,
      error: data.error
    });
  }

  assertTikTokOk(data, context);
  return data;
}

export function buildTikTokAuthUrl({ clientKey, redirectUri, scopes = DEFAULT_SCOPES, state }) {
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_key', clientKey);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state || crypto.randomBytes(18).toString('hex'));
  return url;
}

export async function exchangeTikTokCode({ clientKey, clientSecret, redirectUri, code }) {
  return tiktokFetch(
    `${API_BASE_URL}/v2/oauth/token/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      },
      body: formBody({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    },
    'TikTok authorization code exchange'
  );
}

export async function refreshTikTokAccessToken({ clientKey, clientSecret, refreshToken }) {
  return tiktokFetch(
    `${API_BASE_URL}/v2/oauth/token/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      },
      body: formBody({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    },
    'TikTok token refresh'
  );
}

async function getUserInfo({ accessToken, fields }) {
  const url = new URL(`${API_BASE_URL}/v2/user/info/`);
  url.searchParams.set('fields', fields);

  const response = await tiktokFetch(
    url,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    'TikTok user info'
  );

  return response.data?.user || {};
}

async function getVideoPage({ accessToken, fields, cursor, maxCount }) {
  const url = new URL(`${API_BASE_URL}/v2/video/list/`);
  url.searchParams.set('fields', fields);

  const response = await tiktokFetch(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        max_count: maxCount,
        ...(cursor ? { cursor } : {})
      })
    },
    'TikTok video list'
  );

  return response.data || {};
}

function isoDateFromCreateTime(createTime) {
  if (!createTime) return '';
  return new Date(Number(createTime) * 1000).toISOString().slice(0, 10);
}

function inDateRange(video, startDate, endDateExclusive) {
  const videoDate = isoDateFromCreateTime(video.create_time);
  return videoDate >= startDate && videoDate < endDateExclusive;
}

function topicFromVideo(video) {
  const text = video.title || video.video_description || '';
  const hashtags = text.match(/#[\p{L}\p{N}_]+/gu);
  if (hashtags?.length) return hashtags.slice(0, 4).join(' ');
  return text.split('\n').map((line) => line.trim()).find(Boolean)?.slice(0, 90) || '';
}

function sumMetric(videos, field) {
  return videos.reduce((total, video) => total + Number(video[field] || 0), 0);
}

export async function collectTikTok({
  accessToken,
  userFields,
  videoFields,
  videoLimit,
  startDate,
  endDate
}) {
  const updatedAt = getWarsawTimestamp();
  const endDateExclusive = nextIsoDate(endDate);
  const profile = await getUserInfo({
    accessToken,
    fields: userFields
  });

  const requestedVideoLimit = Math.max(1, Number(videoLimit) || 20);
  const pages = Math.ceil(requestedVideoLimit / 20);
  const videos = [];
  let cursor = undefined;
  let hasMore = true;

  for (let page = 0; page < pages && hasMore; page += 1) {
    const maxCount = Math.max(1, Math.min(20, requestedVideoLimit - videos.length));
    const data = await getVideoPage({
      accessToken,
      fields: videoFields,
      cursor,
      maxCount
    });
    videos.push(...(data.videos || []));
    cursor = data.cursor;
    hasMore = Boolean(data.has_more);
  }

  const videosInRange = videos.filter((video) => inDateRange(video, startDate, endDateExclusive));
  const dailyMetricRows = [
    ...Object.entries(PROFILE_METRIC_LABELS)
      .filter(([field]) => profile[field] !== undefined && profile[field] !== null)
      .map(([field, label]) => [
        endDate,
        'TikTok',
        label,
        profile[field],
        'TikTok Display API',
        updatedAt,
        'знімок',
        'сирі'
      ]),
    [endDate, 'TikTok', 'Відео за період', videosInRange.length, 'TikTok Display API', updatedAt, 'органічні', 'сирі'],
    [endDate, 'TikTok', 'Перегляди відео', sumMetric(videosInRange, 'view_count'), 'TikTok Display API', updatedAt, 'органічні', 'сирі'],
    [endDate, 'TikTok', 'Лайки відео', sumMetric(videosInRange, 'like_count'), 'TikTok Display API', updatedAt, 'органічні', 'сирі'],
    [endDate, 'TikTok', 'Коментарі відео', sumMetric(videosInRange, 'comment_count'), 'TikTok Display API', updatedAt, 'органічні', 'сирі'],
    [endDate, 'TikTok', 'Поширення відео', sumMetric(videosInRange, 'share_count'), 'TikTok Display API', updatedAt, 'органічні', 'сирі']
  ];

  const postRows = videosInRange.map((video) => [
    isoDateFromCreateTime(video.create_time),
    'TikTok',
    video.share_url || video.embed_link || '',
    'Video',
    topicFromVideo(video),
    '',
    video.view_count || '',
    video.like_count || '',
    video.comment_count || '',
    '',
    video.share_count || '',
    '',
    '',
    [
      `video_id=${video.id || ''}`,
      profile.username ? `username=${profile.username}` : '',
      video.duration ? `duration=${video.duration}` : ''
    ].filter(Boolean).join('; ')
  ]);

  return {
    dailyMetricRows,
    postRows,
    profile,
    fetchedVideoCount: videos.length,
    postCount: postRows.length,
    accountMetricCount: dailyMetricRows.length,
    rowCount: dailyMetricRows.length + postRows.length,
    scopes: parseCsv(DEFAULT_SCOPES)
  };
}
