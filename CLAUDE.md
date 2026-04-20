# Shadow Signal Bot — CLAUDE.md

## Что это за проект
Telegram-бот для трейдеров. Мониторит монеты на Binance Futures и отправляет алерт когда обнаруживает признаки накопления позиции крупным игроком — за 30-60 секунд до вероятного движения цены.

## Стек
- Node.js
- Grammy (Telegram bot)
- Railway (деплой)
- Binance Futures WebSocket (публичный, без API ключа)

## Структура проекта
shadow-signal-bot/
├── src/
│   ├── websocket.js   # подключение к Binance, слушаем ticker + kline 1m
│   ├── detector.js    # логика срабатывания сигнала
│   ├── bot.js         # отправка алертов в Telegram
│   └── config.js      # список монет, пороги, токены
├── index.js           # точка входа, запускает всё
├── CLAUDE.md
├── README.md
├── .env               # секреты (не коммитить)
└── package.json

## Логика Shadow Signal (detector.js)
Сигнал срабатывает когда одновременно:
- Объём за последние 2 минуты вырос на 300%+ относительно среднего за 10 минут
- Цена изменилась менее чем на 0.5% за тот же период

Интерпретация: крупный игрок набирает позицию, цена ещё не двинулась.

Алерт в Telegram:
🔦 SHADOW SIGNAL
Монета: BTCUSDT
Объём: +340% за 2 мин
Цена: +0.2% (тихо)
Confidence: 74%
⚠️ Направление не определено — объём мог быть от продавца. Проверь стакан.
⏱ Вероятное движение через 30-60 сек

## Правила работы с кодом (важно)
- Один файл — одна задача. Никогда не трогать несколько файлов за раз
- После каждого изменения — проверка и коммит перед следующим шагом
- Не усложнять. Если можно сделать проще — делать проще
- Не добавлять Redis, базы данных, очереди — это v2
- Не добавлять Mini App, Heatmap — это v2

## Что НЕ делать в v1
- Funding rate
- OI (Open Interest)
- Iceberg detection
- Order Book Analyzer
- Pattern recognition
- Bybit
- Mini App
- Redis / PostgreSQL / BullMQ

## Монеты для мониторинга
Для теста: BTCUSDT
После теста заменить на альткоины: 1000PEPEUSDT, WIFUSDT, MEMEUSDT, 1000BONKUSDT

## Переменные окружения (.env)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

## Roadmap

### v1 — сейчас
- [ ] WebSocket подключение к Binance Futures
- [ ] Базовый расчёт объёма и цены
- [ ] Shadow Signal логика
- [ ] Telegram алерт с предупреждением о направлении
- [ ] Деплой на Railway

### v2 — после проверки концепции
- [ ] Funding rate
- [ ] OI (Open Interest)
- [ ] Confidence Score
- [ ] Больше монет (до 50)
- [ ] Trailing signal
- [ ] Bybit

### v3 — если концепция работает
- [ ] Mini App с Feed
- [ ] Cluster Heatmap
- [ ] Логирование точности сигналов
- [ ] Монетизация (Telegram Stars)
