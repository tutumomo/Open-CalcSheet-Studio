"""Controleer het geïnstalleerde Linux-pakket via de lokale API onder Xvfb."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from urllib.error import URLError
from urllib.request import Request, urlopen


def api(route, token, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = Request("http://127.0.0.1:3879/api/v1/" + route, data=data,
                      headers={"Authorization": "Bearer " + token,
                               "Content-Type": "application/json"})
    with urlopen(request, timeout=90) as response:
        return json.load(response)


def controleer(mapnaam):
    env = os.environ.copy()
    for key in ("XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"):
        env[key] = str(mapnaam / key)
    app = subprocess.Popen(["open-calcsheet-studio", "--headless"], env=env)
    try:
        einde = time.monotonic() + 90
        while time.monotonic() < einde:
            if app.poll() is not None:
                raise RuntimeError(f"App gestopt met code {app.returncode}")
            try:
                prefs = next(mapnaam.rglob("preferences.json"))
                token = json.loads(prefs.read_text())["mcpToken"]
                api("info", token)
                break
            except (StopIteration, KeyError, ValueError, URLError):
                time.sleep(0.5)
        else:
            raise RuntimeError("Headless API niet bereikbaar")
        marker = "Linuxproefberekening"
        blad = api("sheets", token, {"name": "Rekenblad", "source": f'"{marker}\na = 2*3\n'})
        api("sheets/" + blad["id"] + "?evaluate=true", token)
        pad = mapnaam / "proef rapport.pdf"
        resultaat = api("report/export/pdf", token, {"path": str(pad)})
        if resultaat["bytes"] != pad.stat().st_size:
            raise RuntimeError("Aantal PDF-bytes wijkt af")
        tekst = subprocess.check_output(["pdftotext", str(pad), "-"], text=True)
        if marker not in tekst:
            raise RuntimeError("Rekenblad ontbreekt in de geëxporteerde PDF")
        print(f"Headless export gecontroleerd ({pad.stat().st_size} bytes)")
    finally:
        app.terminate()
        try:
            app.wait(timeout=5)
        except subprocess.TimeoutExpired:
            app.kill()
            app.wait()


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as werkmap:
        controleer(Path(werkmap))
