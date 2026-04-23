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
│   ├── websocket.js        # подключение к Binance kline 1m WebSocket
│   ├── detector.js         # логика срабатывания сигнала + OI level + direction
│   ├── directionAnalyzer.js # aggTrade WebSocket, buy/sell ratio, direction prediction
│   ├── oiFetcher.js        # Open Interest polling (5-min window)
│   └── bot.js              # отправка алертов в Telegram через Grammy
├── index.js                # точка входа, запускает всё
├── CLAUDE.md
├── .env                    # секреты (не коммитить)
├── .gitignore
└── package.json

## Логика Shadow Signal (detector.js)
Сигнал срабатывает когда одновременно:
- Объём закрытой 1m свечи вырос на 300%+ относительно среднего за 10 свечей
- Цена изменилась менее чем на 0.5% за ту же свечу

Интерпретация: крупный игрок набирает позицию, цена ещё не двинулась.

Алерт в Telegram (актуальный формат):
🔴 STRONG SIGNAL
Монета: 1000PEPEUSDT
Объём: +340% за 1 мин
Цена: +0.12% (тихо)
OI: +2.50% ↑ (new positions opening)
📈 Direction: LONG | confidence 85%
   strong buy pressure (68% buys) + OI rising (new longs opening)
⏱ Вероятное движение через 30-60 сек

## Что уже реализовано в v1
- WebSocket подключение к Binance Futures (kline 1m + aggTrade)
- Volume spike детектор (300% порог, 10 свечей история)
- OI layer (Open Interest polling каждые 60 сек, 5-min window)
- Direction analyzer (aggTrade buy/sell ratio + OI confidence boost)
- Signal levels: STRONG / MEDIUM / NEUTRAL / WEAK
- Cooldown per coin (default 5 min, 1000PEPEUSDT 15 min)
- Price tracking после сигнала (+1m, +5m, +30m)
- Telegram алерты через Grammy
- Structured logging (SIGNAL_LOG: в stdout для Railway)
- Деплой на Railway (auto-deploy из GitHub)

## Правила работы с кодом (важно)
- Один файл — одна задача. Никогда не трогать несколько файлов за раз
- После каждого изменения — проверка и коммит перед следующим шагом
- Не усложнять. Если можно сделать проще — делать проще
- Не добавлять Redis, базы данных, очереди — это v2
- Не добавлять Mini App, Heatmap — это v2

## Что НЕ делать в v1
- Iceberg detection
- Order Book Analyzer
- Pattern recognition
- Bybit
- Mini App
- Redis / PostgreSQL / BullMQ

## Монеты для мониторинга
1000PEPEUSDT, DOGEUSDT, BANANAUSDT, 1000SHIBUSDT, 1000BONKUSDT

## Переменные окружения (.env)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

## Roadmap

### v1 — done
- [x] WebSocket подключение к Binance Futures
- [x] Базовый расчёт объёма и цены
- [x] Shadow Signal логика
- [x] OI layer (Open Interest)
- [x] Direction analyzer (aggTrade buy/sell ratio)
- [x] Telegram алерт с direction и OI
- [x] Price tracking (+1m, +5m, +30m)
- [x] Деплой на Railway

### v2 — после проверки концепции
- [ ] Funding rate
- [ ] Confidence Score (machine learning)
- [ ] Больше монет (до 50)
- [ ] Trailing signal
- [ ] Bybit

### v3 — если концепция работает
- [ ] Mini App с Feed
- [ ] Cluster Heatmap
- [ ] Логирование точности сигналов
- [ ] Монетизация (Telegram Stars)
