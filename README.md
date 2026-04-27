# Flammen — Fire Demo

Демо огня на основе [Photons2](https://github.com/mkkellogg/Photons2) (система частиц для Three.js).

В сцене — каменный пьедестал с чашей углей, над которой горит трёхслойный огонь:

1. **Embers** — мерцающие искры, поднимающиеся вверх (аддитивный блендинг).
2. **Base flame** — основное пламя из 18-кадровой текстурной анимации.
3. **Bright flame** — яркое центральное ядро из 16-кадровой анимации.
4. **FlickerLight** — точечный источник света, мерцающий в такт с пламенем.

Управление: левая кнопка мыши — орбита, колесо — зум.

## Локальный запуск

```bash
npm install
npm start
```

Открыть http://localhost:3000

## Деплой на Render

В репозитории уже есть `render.yaml` (Blueprint).

1. Зайти в [Render Dashboard](https://dashboard.render.com/) → **New +** → **Blueprint**.
2. Подключить этот GitHub-репозиторий.
3. Render автоматически прочитает `render.yaml` и развернёт сервис на бесплатном тарифе.

Альтернативно, вручную как **Web Service**:
- Environment: `Node`
- Build Command: `npm install`
- Start Command: `npm start`

## Структура

```
.
├── public/                    # статика, отдаваемая Express
│   ├── index.html
│   ├── js/
│   │   ├── main.js            # сцена + три системы частиц
│   │   └── OrbitControls.js
│   ├── lib/
│   │   ├── photons.module.js  # собранная Photons2
│   │   └── three.module.js
│   └── assets/textures/       # текстуры огня и искр
├── server.js                  # минимальный Express-сервер
├── package.json
└── render.yaml                # Render Blueprint
```

## Лицензия

Photons2 и текстуры — MIT © Mark Kellogg.
