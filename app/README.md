# Telebro

Eigen mediabibliotheek op de Mac die direct naar je Sony Bravia (Chromecast built-in) streamt.
Electron-app, zonder bundler of framework: alleen HTML/CSS/JS, dus de UI is volledig zelf aan te passen.

## Wat het is
Je eigen mediahub op de Mac: bibliotheek, series per seizoen, verder kijken, downloaden en streamen naar je tv.

- **Home:** verder kijken, nieuw toegevoegd, series. Kies je tv één keer; hij wordt onthouden.
- **Films en Series:** posters (optioneel via TMDB), series gegroepeerd met seizoenen en afleveringen, sorteren op titel, recent of beoordeling.
- **Detail:** audio kiezen, ondertitels (los bestand of ingebouwd), hervatten waar je gebleven was, markeren als gezien.
- **Series kijken:** na een aflevering start de volgende automatisch, of via de knop ⏭ in de balk.
- **Downloads:** magnet-link plakken of een `.torrent` slepen. Voortgang, snelheid en peers live. Klaar? Dan staat het meteen in je bibliotheek.
- **Ontdekken:** zoek een titel en zie in welke streamingdienst hij in Nederland staat (TMDB), of download gratis films uit het publiek domein via het Internet Archive. Met één klik, via de ingebouwde torrentclient.
- **Status en opruimen:** filter op Nieuw / Bezig / Gezien. Gekeken downloads kunnen na 1, 3, 7, 14 of 30 dagen automatisch naar de prullenbak (zie hieronder).
- **Zoeken** in je bibliotheek met `/`, pauze met de spatiebalk.

## Starten (op de Mac)
```bash
cd app
npm install
npm start          # ontwikkelmodus
npm run dist       # maakt dist/Telebro-*.dmg (arm64 en x64)
```
Klik op **+ Map toevoegen**, kies je tv linksonder bij "Afspelen op" en klik op een titel.
De Mac en de tv moeten op hetzelfde netwerk zitten. Bij de eerste start vraagt macOS toestemming
voor het lokale netwerk: sta dat toe. Vereist Node 22 of nieuwer voor `npm install` (WebTorrent 3).

## Downloaden
Telebro is een gewone BitTorrent-client (WebTorrent). Je geeft zelf een magnet-link of `.torrent`; er is
bewust **geen zoekfunctie** voor torrentsites. Gebruik het alleen voor content waarvoor je de rechten hebt,
zoals je eigen bestanden, publiek domein of open films. Standaardmap: `~/Movies/Telebro` (aanpasbaar bij
Instellingen). Na afloop stopt het delen (seeden); de bestanden blijven staan. Onderbroken downloads
hervatten bij de volgende start.

## Automatisch opruimen
Staat standaard **uit**. Zet je het aan bij Instellingen, dan gaat een gekeken download na N dagen naar de
**prullenbak** (dus terug te halen). Veiligheid:
- alleen bestanden in de downloadmap, nooit je eigen bibliotheekmappen;
- nooit iets wat je met **☆ Bewaren** hebt gemarkeerd;
- de teller begint pas bij "gezien" (na 93% of via Markeer als gezien) en staat als ✓ 2d op de poster en in het detailscherm;
- een lege torrent-map wordt mee opgeruimd. Elk pad wordt nog eens gecontroleerd tegen de downloadmap.

## Zoeken en legaal downloaden
Er is bewust **geen zoekfunctie voor torrentsites**. "Ontdekken" gebruikt TMDB (waar te streamen, vereist de sleutel hieronder)
en het Internet Archive (publiek domein, Creative Commons). Sommige archive-items zijn beveiligd of tijdelijk onbereikbaar;
de app meldt dat en probeert een 503 zelf nog twee keer.

## Posters en omschrijvingen (optioneel)
Maak een gratis account op themoviedb.org, ga naar Instellingen → API en plak je sleutel bij
Instellingen in Telebro. Resultaten worden lokaal bewaard.

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
- `src/main/` mediaserver (`server.js`), Cast (`cast.js`), ffmpeg (`media.js`), bibliotheek (`library.js`), downloads (`torrents.js`), TMDB (`meta.js`)
- `src/renderer/` de UI (`index.html`, `styles.css`, `app.js`) en gedeelde logica (`lib.js`)
- `test/` `npm test`: unit tests, een echte ffmpeg-keten, en een echte torrent-download tussen twee lokale clients

## Status
Getest (`npm test`, 34 tests): bestandsherkenning, afspeelplan, ffmpeg-remux, Range/HLS/VTT-server, series groeperen,
verder kijken, volgende aflevering, TMDB-vertaling, opruimlogica (met een echte map in een tijdelijke map), de Internet Archive-API (ook live gecontroleerd) en een complete torrent-download.
De interface is in headless Chromium doorlopen met een nagebootste backend (geen scriptfouten, flow werkt).

**Nog niet getest:** het draaien in Electron zelf en het echt afspelen op jouw tv. Dat kon in de cloud niet.
Meld wat er misgaat bij de eerste run. Mocht `npm run dist` klagen over `node-datachannel`, dan staat
`npmRebuild` al uit; de native module is N-API en werkt ongewijzigd in Electron.

## Ideeën voor daarna
Tv-afstandsbediening via ADB (volume, Home), AirPlay als tweede route, PGS-ondertitels inbranden,
ondertitels automatisch downloaden, meerdere profielen.
