# NASTAVNYK Dashboard Automation

Цей репозиторій містить публічний HTML-дашборд і перший каркас автоматизації для `NASTAVNYK_COMMAND_CENTER`.

## Етап 1: Instagram + GA4 + Google Sheets

Поточний код уже готує щоденний збір GA4 у Google Sheets. Instagram-скрипт поки залишений як підготовлений конектор: він перевіряє доступ до Meta Graph API, а мапінг у таблицю буде наступним кроком після отримання токена.

Дані GA4 пишуться в українські аркуші:

- `Трафік GA4`
- `Щоденні метрики соцмереж`

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

Запустити без запису в таблицю:

```bash
npm run collect:ga4 -- --dry-run
```

Запустити за конкретний період:

```bash
npm run collect:ga4 -- --start-date=2026-07-14 --end-date=2026-07-14
```

Запустити всі джерела, які вже підключені:

```bash
npm run collect:daily
```

## Далі

- Додати повний Instagram-колектор: щоденні метрики, ефективність постів, сигнали та попередження.
- Після Instagram підключити TikTok.
- Після TikTok підключити LinkedIn.
