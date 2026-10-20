# Telebro

Eigen mediabibliotheek op de Mac die direct naar je Sony Bravia (Chromecast built-in) streamt.
Electron-app, zonder bundler of framework: alleen HTML/CSS/JS, dus de UI is volledig zelf aan te passen.

## Starten (op de Mac)
```bash
cd app
npm install
npm start          # ontwikkelmodus
npm run dist       # maakt dist/Telebro-*.dmg (arm64 en x64)
```
Klik rechtsboven op **+ Map**, kies je film-/seriemap, kies je tv in de lijst en klik op een titel.
De Mac en de tv moeten op hetzelfde netwerk zitten. Bij de eerste start vraagt macOS toestemming
voor het lokale netwerk: sta dat toe.

## Hoe het lag voorkomt
De tv decodeert zelf; de Mac stuurt zo weinig mogelijk bewerkte data.

| Bestand | Wat er gebeurt | CPU op de Mac |
|---|---|---|
| mp4 met h264/hevc en aac/ac3 | wordt rechtstreeks geserveerd (HTTP Range, vrij spoelen) | geen |
| mkv met h264/hevc | alleen opnieuw ingepakt als HLS (`-c:v copy`) | verwaarloosbaar |
| audio dts/truehd/flac | alleen audio naar AAC 5.1, video blijft ongewijzigd | laag |
| oude codecs (mpeg4, vc1) | video wordt hercodeerd met VideoToolbox (hardware) | middel, laatste redmiddel |

Tips: gebruik 5 GHz wifi of liever ethernet, vooral voor 4K-remuxen met hoge bitrate.

## Ondertitels
Los `.srt`/`.vtt` naast de film (`Film.2020.nl.srt`) en ingebouwde tekstondertitels (srt, ass, mov_text)
worden naar WebVTT omgezet en als tekstspoor naar de tv gestuurd. Wisselen kan tijdens het kijken.
Afbeeldingsondertitels (PGS/VobSub) worden nog niet ondersteund.

## Structuur
- `src/main/` mediaserver (`server.js`), Cast (`cast.js`), ffmpeg-logica (`media.js`), bibliotheek (`library.js`)
- `src/renderer/` de UI (`index.html`, `styles.css`, `app.js`)
- `test/` `npm test` draait unit tests en een echte ffmpeg-keten (probe, remux, Range-server)

## Status
Getest: bestandsherkenning, afspeelplan, ffmpeg-remux, Range/HLS/VTT-server (12 tests).
**Nog niet getest:** de Electron-UI en het echt afspelen op jouw tv. Dat kon in de cloud niet.
Meld wat er misgaat bij de eerste run, dan fixen we het.

## Ideeën voor daarna
Posters en beschrijvingen via TMDB, "verder kijken", tv-afstandsbediening via ADB (volume, Home),
AirPlay als tweede route, PGS-ondertitels inbranden.
