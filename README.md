# NASTAVNYK Dashboard Automation

Цей репозиторій містить публічний HTML-дашборд і перший каркас автоматизації для `NASTAVNYK_COMMAND_CENTER`.

## Етап 1: Instagram + GA4 + Google Sheets

Поточний код збирає GA4 і Instagram у Google Sheets. TikTok collector підготовлений як наступне джерело: після TikTok OAuth він збиратиме профільні лічильники й performance публічних відео.

Дані GA4 пишуться в українські аркуші:

- `Трафік GA4`
- `Щоденні метрики соцмереж`

Instagram collector пише в українські аркуші:

- `Щоденні метрики соцмереж`
- `Ефективність публікацій`

TikTok collector пише в ті самі аркуші:

- `Щоденні метрики соцмереж`
- `Ефективність публікацій`

## Налаштування

1. Встановіть залежності:

```bash
npm install
```

2. Скопіюйте приклад змінних середовища:

```bash
cp .env.example .env.local
```

3. У Google Cloud створіть service account і JSON-ключ. Реальний JSON-ключ тримайте поза Git.

4. Додайте email service account як редактора у Google Sheet `NASTAVNYK_COMMAND_CENTER`.

5. Додайте той самий email у GA4 property з роллю Viewer або Analyst.

6. Заповніть у `.env.local`:

```env
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
GA4_PROPERTY_ID=123456789
GA4_REGISTRATION_EVENT_NAME=sign_up
```

`GOOGLE_SHEETS_ID` вже має дефолт для `NASTAVNYK_COMMAND_CENTER`, але його можна перевизначити у `.env.local`.

7. Для Instagram додайте Meta access token і ID Instagram professional account або Facebook Page:

```env
META_ACCESS_TOKEN=...
META_IG_USER_ID=1784...
# або
META_PAGE_ID=1234...
```

Для insights потрібен Instagram Business або Creator account, підключений до Facebook Page, і Meta permissions для читання профілю/медіа та insights.

8. Для TikTok створіть app у TikTok Developer Portal і додайте Display API / Login Kit scopes:

```text
user.info.basic
user.info.profile
user.info.stats
video.list
```

9. Заповніть у `.env.local` TikTok app credentials і redirect URI:

```env
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://...
```

Після цього згенеруйте authorization URL:

```bash
npm run tiktok:auth-url
```

Відкрийте URL, авторизуйте акаунт TikTok і скопіюйте `code` з callback URL. Обміняти code на токени можна так:

```bash
npm run tiktok:exchange-code -- --code=...
```

Або скопіюйте тільки `code` у clipboard і запустіть:

```bash
npm run tiktok:exchange-code -- --code-from-clipboard
```

Скрипт запише `TIKTOK_ACCESS_TOKEN`, `TIKTOK_REFRESH_TOKEN`, `TIKTOK_OPEN_ID` і дати закінчення в `.env.local`. Access token TikTok короткий, тому collector автоматично оновлює його через refresh token перед збором.

## Команди

Перевірити локальну конфігурацію без API-викликів:

```bash
npm run check:setup
```

Перевірити синтаксис скриптів:

```bash
npm run check
```

Зібрати GA4 за попередній завершений день і записати в Google Sheets:

```bash
npm run collect:ga4
```

Повторний запуск за ту саму дату оновлює GA4-рядки в таблиці, а не створює дублікати.

Запустити без запису в таблицю:

```bash
npm run collect:ga4 -- --dry-run
```

Запустити за конкретний період:

```bash
npm run collect:ga4 -- --start-date=2026-07-14 --end-date=2026-07-14
```

Зібрати Instagram account insights і пост performance:

```bash
npm run collect:instagram
```

Повторний запуск за ту саму дату оновлює Instagram-рядки в таблиці, а не створює дублікати.

Перевірити Instagram без запису в таблицю:

```bash
npm run collect:instagram -- --dry-run
```

Зібрати TikTok profile stats і video performance:

```bash
npm run collect:tiktok
```

Повторний запуск за ту саму дату оновлює TikTok-рядки в таблиці, а не створює дублікати.

Перевірити TikTok без запису в таблицю:

```bash
npm run collect:tiktok -- --dry-run
```

Запустити всі джерела, які вже підключені:

```bash
npm run collect:daily
```

## Далі

- Додати сигнали та попередження на основі Instagram + GA4.
- Після TikTok підключити LinkedIn.
