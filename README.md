# Солана кошелёк - расширение для браузера - с хранением ключей на внешнем ESP32 устройстве

Кроссбраузерный Solana-кошелёк (WebExtension, Manifest V3) на TypeScript.

Проект ориентирован на архитектуру, где хранение и подпись могут быть вынесены на внешнее устройство ESP32.  
Текущая MVP-реализация подписывает локально в расширении (без ESP32), но код уже разделён так, чтобы заменить signer на внешний transport без переписывания провайдера.

## Страница установки и обновления с GitHub

- Публичная страница: `https://ai5590.github.io/ESP32-wallet/`
- Исходник страницы: [docs/index.html](/home/ai/work_agents/codex/ESP-wallet/docs/index.html)
- Папка [docs](/home/ai/work_agents/codex/ESP-wallet/docs) выбрана осознанно:
  - это стандартный режим GitHub Pages (`main` + `/docs`)
  - код проекта и сайт не смешиваются в корне репозитория

Чтобы страница открывалась для всех:
1. Зайди в репозиторий GitHub.
2. `Settings` -> `Pages`.
3. `Source`: `Deploy from a branch`.
4. Branch: `main`, Folder: `/docs`.
5. Сохрани настройки.

После этого сайт установки/обновления доступен прямо с GitHub Pages.

## Полноценный сайт и файлы для установки

Сайт в `docs/` содержит:
- описание тестовой версии
- ручную установку и ручное обновление
- пошаговые инструкции под Chromium/Firefox
- roadmap по переходу к ESP32-режиму
- прямые ссылки на zip-сборки расширения (из `docs/downloads`)

Чтобы обновить сайт и файлы сборок одной командой:

```bash
npm run build:site
```

Эта команда:
1. собирает `dist/chromium` и `dist/firefox`
2. формирует `docs/downloads/esp-wallet-chromium.zip`
3. формирует `docs/downloads/esp-wallet-firefox.zip`
4. обновляет `docs/downloads/files.json` для сайта

После этого закоммить изменения и запушь в `main` — GitHub Pages автоматически отдаст актуальные файлы пользователям.

## Текущий статус

Это тестовый/демо вариант для разработки.  
Установка и обновление сейчас выполняются только вручную через zip-файлы.

## Что уже работает

- Solana Wallet Standard и legacy `window.solana`.
- `connect`, `disconnect`, `signTransaction`, `signMessage`.
- Окно подтверждения подписи.
- Сборки для Chromium и Firefox.

## Что пока упрощено

- Seed phrase, мультиаккаунты, балансы, токены, NFT, стейкинг, история.
- Отправка транзакций в сеть из расширения.
- Полная симуляция всех последствий транзакции.
- Реальный transport до ESP32 (планируется следующим этапом).

## План развития (ESP32)

- Подтверждение подписей будет перенесено на кнопку на внешнем ESP32 устройстве.
- Расширение браузера останется универсальным интерфейсом для любых сайтов с Wallet Standard/legacy коннектором.
- То же устройство сможет использоваться и в другом ПО (например, серверное/десктоп приложение), с тем же хранилищем ключей.
- Это позволит использовать один и тот же ключевой модуль в разных сценариях: dApp, DAO-голосования и другие интеграции.

## Установка зависимостей

```bash
npm install
```

## Сборка

```bash
npm run build
```

Отдельно:

```bash
npm run build:chromium
npm run build:firefox
```

Сборка + публикация файлов для сайта:

```bash
npm run build:site
```

## Установка расширения вручную

Chromium (Chrome/Edge/Opera):
1. Открой `chrome://extensions` (или аналог для браузера).
2. Включи режим разработчика.
3. Нажми `Load unpacked`.
4. Выбери папку `dist/chromium`.

Firefox:
1. Открой `about:debugging#/runtime/this-firefox`.
2. Нажми `Load Temporary Add-on...`.
3. Выбери `dist/firefox/manifest.json`.

## Обновление вручную

1. Скачай новый zip с сайта/релиза.
2. Распакуй в новую папку (или обнови текущую).
3. На странице расширений нажми `Reload` или повторно загрузи папку.

## Краткая структура

```text
manifests/   # базовый manifest + override для chromium/firefox
scripts/     # сборка
src/background  # RPC + очередь подтверждений
src/content     # bridge page <-> extension
src/injected    # Wallet Standard + window.solana
src/signer      # парсинг ключа и подпись
src/storage     # storage
src/ui          # popup + confirm window
docs/           # GitHub Pages страница установки/обновления
docs/downloads/ # zip-файлы сборок и files.json
```
