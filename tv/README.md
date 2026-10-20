# TV opschonen met cleanyourtv (Sony Bravia)

Wordt lokaal op de Mac uitgevoerd, de tv moet op hetzelfde wifi zitten (nu 192.168.1.201).

```bash
git clone https://github.com/Gathin23/cleanyourtv ~/cleanyourtv
cd ~/cleanyourtv
python3 -m venv tools/venv && tools/venv/bin/pip install -r tools/requirements.txt
export TV_HOST=192.168.1.201
tools/venv/bin/python -I tools/tv.py --probe          # test verbinding, bevestig prompt op de tv
tools/venv/bin/python -I tools/tv.py 'pm list packages -d'   # wat staat al uit
```

1. Lees `PROMPT.md` en `tools/disable.sh` zelf even door.
2. Batch 1 staat al uit. Draai `tools/disable.sh <pad>/telebro/tv/debloat.txt` om de opgeslagen
   herstelinformatie (`~/.cleanyourtv/`) aan te maken en batch 2 toe te passen.
3. Check na elke batch: Home, tv kijken, HDMI, Netflix, YouTube.
4. Launcher (`launcher/build-and-install.sh`) is optioneel en komt later, de Mac-app ontwerp je zelf.
   Hiervoor zijn Java 17 en de Android SDK nodig. Zet de stock launcher pas uit nadat de nieuwe werkt.
5. Als je klaar bent: USB/ADB-debugging uit, autorisaties intrekken, tv herstarten en controleren
   met `nc -vz 192.168.1.201 5555` (moet falen).

Terugdraaien: `tools/restore.sh <pad>/telebro/tv/debloat.txt`, of per pakket
`adb shell pm enable <pakket>`.
