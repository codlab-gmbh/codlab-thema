#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Colonne «Dimensioni», «Scatto» e «Fotocamera» per le foto, nella vista a
elenco di Nautilus.

Stessa ossatura di colonne-video.py, gia' rodata sul desktop (31.10.2026):
  * niente thread python (il GIL dentro Nautilus li affama: misurato);
  * niente IN_PROGRESS, niente handle (abortiva Nautilus 51 allo spostamento:
    assert extension_info_stop in nautilus-directory-async.c:3807);
  * si calcola dopo, e si chiama invalidate_extension_info();
  * cache LRU persistente su disco, letture ffprobe/exiv2 in subprocess
    Gio.Subprocess (l'attesa e' in C nel main loop);
  * falliti in SOLO memoria: al riavvio si riprova.

Che cosa leggono le colonne (exiv2, 2 ms su un JPEG in cache):
  Dimensioni  WxH secondo EXIF (orientamento APPLICATO, come le vede Loupe:
              un ritratto 4000x6000 dice 4000x6000, non 6000x4000);
  Scatto      Exif.Photo.DateTimeOriginal (la data di scatto, non la modifica);
  Fotocamera  «Make Model» (Canon EOS R5, Nikon Z8, ...).

Perche' per le dimensioni non si usa GdkPixbuf: il pixel buffer non serve a
niente, costa decodificare l'immagine intera, e non dicono nulla dei file
remoti; EXIF e' meta e costa nulla. Se un JPEG non ha EXIF di dimensioni
(rari, esportazioni ripulite) la colonna mostra cio' che ha: niente.

Uso: si installa in ~/.local/share/nautilus-python/extensions/ (o
/usr/local/share/nautilus-python/extensions/ per la copia a livello sistema
del pacchetto integrazione) e si riapre Nautilus.
"""

import json
import os
from collections import OrderedDict, deque

import gi
gi.require_version("Nautilus", "4.1")
from gi.repository import Gio, GObject, GLib, Nautilus  # noqa: E402

CACHE = os.path.join(GLib.get_user_cache_dir(), "nautilus-colonne-foto.json")
ESTENSIONI = {".jpg", ".jpeg", ".jpe", ".jfif", ".jif", ".jfi", ".jxl",
              ".webp", ".heif", ".heic", ".hif", ".avif", ".tif", ".tiff"}
ATTRIBUTI = ("dimensioni_foto", "scatto_foto", "fotocamera_foto")
VUOTO = {a: "" for a in ATTRIBUTI}

MAX_EXIV2 = 2        # letture contemporanee: due, non cento
TIMEOUT = 25         # secondi, poi si ammazza il processo
TETTO_CACHE = 20000  # voci ricordate, poi si buttano le piu' vecchie
RITARDO_SALVA = 5    # secondi di quiete prima di scrivere la cache su disco
ETA_MINIMA = 10      # secondi: sotto, il file sta ancora crescendo
# i prefissi dei tag chiesti a exiv2, TUTTI IN UNA INVOCAZIONE SOLA per file
# (misurato sulla cartella foto del corpus: quattro exiv2 separati per file
# quadruplicano il tempo su centinaia di foto; qui e' uno)
TAGS = [
    "Exif.Photo.PixelXDimension", "Exif.Photo.PixelYDimension",
    "Exif.Image.ImageWidth", "Exif.Image.ImageLength",
    "Exif.Image.Orientation", "Exif.Image.Make", "Exif.Image.Model",
    "Exif.Photo.DateTimeOriginal", "Exif.Image.DateTimeOriginal",
]


class ColonneFoto(GObject.GObject, Nautilus.ColumnProvider, Nautilus.InfoProvider):
    def __init__(self):
        super().__init__()
        # Nessun lock: gira tutto sul thread principale, callback comprese.
        self._cache = OrderedDict()
        self._falliti = set()
        self._in_coda = set()
        self._attesa = deque()
        self._attive = 0
        self._salvataggio = 0
        try:
            with open(CACHE) as f:
                self._cache = OrderedDict(json.load(f))
        except Exception:
            pass

    # ---------------------------------------------------------------- colonne
    def get_columns(self):
        return (
            Nautilus.Column(name="ColonneFoto::dimensioni", attribute="dimensioni_foto",
                            label="Dimensioni", description="Larghezza x altezza della foto (EXIF)"),
            Nautilus.Column(name="ColonneFoto::scatto", attribute="scatto_foto",
                            label="Scatto", description="Data di scatto della foto"),
            Nautilus.Column(name="ColonneFoto::fotocamera", attribute="fotocamera_foto",
                            label="Fotocamera", description="Marca e modello (EXIF)"),
        )

    # ------------------------------------------------------------------ cache
    @staticmethod
    def _chiave(percorso):
        try:
            st = os.stat(percorso)
        except OSError:
            return None
        return f"{percorso}|{st.st_mtime_ns}|{st.st_size}", st

    def _ricorda(self, chiave, dati):
        self._cache[chiave] = dati
        self._cache.move_to_end(chiave)
        while len(self._cache) > TETTO_CACHE:
            self._cache.popitem(last=False)
        if self._salvataggio:
            GLib.source_remove(self._salvataggio)
        self._salvataggio = GLib.timeout_add_seconds(RITARDO_SALVA, self._salva)

    def _salva(self):
        self._salvataggio = 0
        try:
            tmp = CACHE + ".tmp"
            with open(tmp, "w") as f:
                json.dump(self._cache, f)
            os.replace(tmp, CACHE)
        except Exception:
            pass
        return False

    @staticmethod
    def _formatta(dati_exif):
        """I tre campi visibili da un estratto di tag."""
        def num(v):
            try:
                return int(str(v).strip())
            except Exception:
                return None

        # --- dimensioni (con orientamento applicato: un ritratto dice
        #     «larghezza x altezza» come lo vede Loupe, non il sensore)
        x = num(dati_exif.get("PixelXDimension")) or num(dati_exif.get("ImageWidth"))
        y = num(dati_exif.get("PixelYDimension")) or num(dati_exif.get("ImageLength"))
        orient = num(dati_exif.get("Orientation")) or 1
        if x and y and orient in (5, 6, 7, 8):
            x, y = y, x
        dimensioni = f"{x}x{y}" if x and y else ""

        # --- scatto (la data di scatto; se manca, il DateTime EXIF)
        scatto = (dati_exif.get("DateTimeOriginal") or
                  dati_exif.get("DateTime") or "").strip()
        if len(scatto) >= 16 and scatto[4] == ":" and scatto[7] == ":":
            # «2026:03:14 09:15:00» -> «2026-03-14 09:15» (i secondi non
            # ordinano; stesso troncamento della colonna Modificato)
            scatto = scatto[:16].replace(":", "-", 2)
        else:
            scatto = ""

        # --- fotocamera: «Canon» + «EOS R5» -> «Canon EOS R5»
        #     (molti modelli ripetono la marca: «Canon Canon EOS R5» no)
        marca = (dati_exif.get("Make") or "").strip()
        modello = (dati_exif.get("Model") or "").strip()
        if marca and modello:
            if modello.lower().startswith(marca.lower() + " "):
                fotocamera = modello
            elif modello.lower().startswith(marca.lower()):
                fotocamera = marca + " " + modello[len(marca):].strip()
            else:
                fotocamera = f"{marca} {modello}"
            fotocamera = fotocamera.strip()
        else:
            fotocamera = (marca or modello).strip()
        return {"dimensioni_foto": dimensioni, "scatto_foto": scatto,
                "fotocamera_foto": fotocamera}

    # ------------------------------------------------------------ aggiornamento
    def update_file_info(self, file):
        """Sincrona e senza calcoli in linea: cache, oppure cella vuota e
        lettura differita (bloccare qui congelerebbe l'interfaccia)."""
        if file.get_uri_scheme() != "file" or file.is_directory():
            return
        percorso = file.get_location().get_path()
        if not percorso:
            return
        suffisso = os.path.splitext(percorso)[1].lower()
        if suffisso not in ESTENSIONI:
            return

        coppia = self._chiave(percorso)
        if coppia is None:
            return
        chiave, st = coppia
        if st.st_mtime > __import__("time").time() - ETA_MINIMA:
            return                     # sta ancora crescendo (scarico in corso)

        pronto = self._cache.get(chiave)
        if pronto is not None:
            self._cache.move_to_end(chiave)
            self._applica(file, pronto)
            return

        self._applica(file, VUOTO)
        if chiave in self._falliti or chiave in self._in_coda:
            return
        self._in_coda.add(chiave)
        self._attesa.append((percorso, chiave, file))
        self._prossima()

    def _applica(self, file, dati):
        for attributo in ATTRIBUTI:
            file.add_string_attribute(attributo, dati.get(attributo, ""))

    # ------------------------------------------------ esecuzione exiv2 asincrona
    def _prossima(self):
        while self._attive < MAX_EXIV2 and self._attesa:
            percorso, chiave, file = self._attesa.popleft()
            self._attive += 1
            # UNA sola invocazione con TUTTI i tag chiesti insieme (misurato:
            # quattro exiv2 separati per file quadruplicano il tempo su una
            # cartella di centinaia di foto)
            argv = ["exiv2", "-q", "-PEkvc"]
            for prefisso in TAGS:
                argv += ["-g", prefisso]
            argv += ["--", percorso]
            try:
                proc = Gio.Subprocess.new(
                    argv,
                    Gio.SubprocessFlags.STDOUT_PIPE |
                    Gio.SubprocessFlags.STDERR_SILENCE)
            except GLib.Error:
                # exiv2 assente dal PATH (rilievo audit 31.10): si restituisce
                # subito il posto e la coda avanza. Prima _attive restava
                # alzato e dopo MAX_EXIV2 file la colonna si fermava.
                self._attive -= 1
                self._in_coda.discard(chiave)
                self._falliti.add(chiave)
                continue
            proc.wait_check_async(None, self._finita, (percorso, chiave, file))

    def _finita(self, proc, risultato, dati):
        percorso, chiave, file = dati
        self._attive -= 1
        try:
            esito = proc.wait_check_finish(risultato)
        except GLib.Error:
            esito = False

        valori = {}
        if esito:
            stdout = proc.get_stdout_pipe()
            # letture asincrone del pipe (mai read_all bloccante sul main loop:
            # per cartelle enormi l'output e' comunque minuscolo, ma il gesto e'
            # quello giusto)
            stdout.read_bytes_async(64 * 1024, GLib.PRIORITY_LOW, None,
                                    self._letto, (proc, chiave, file, {}))
            return
        self._conclusa(proc, chiave, file, None)

    def _letto(self, pipe, risultato, dati):
        proc, chiave, file, accumulo = dati
        try:
            blocco = pipe.read_bytes_finish(risultato).get_data()
        except Exception:
            self._conclusa(proc, chiave, file, None)
            return
        if blocco:
            accumulo[b"parziale"] = accumulo.get(b"parziale", b"") + blocco
            pipe.read_bytes_async(64 * 1024, GLib.PRIORITY_LOW, None,
                                  self._letto, (proc, chiave, file, accumulo))
            return
        testo = accumulo.get(b"parziale", b"").decode("utf-8", "replace")
        valori = {}
        for riga in testo.splitlines():
            if not riga.startswith("Exif."):
                continue
            # «Exif.Image.Make       6  Canon» -> tag e valore
            parti = riga.split(None, 2)
            if len(parti) < 3:
                continue
            tag, valore = parti[0], parti[2].strip()
            valori[tag.split(".", 2)[-1]] = valore
        self._conclusa(proc, chiave, file, self._formatta(valori) if valori else None)

    def _conclusa(self, proc, chiave, file, formattati):
        self._in_coda.discard(chiave)
        if formattati is None:
            self._falliti.add(chiave)     # solo in memoria: al riavvio si riprova
        else:
            self._ricorda(chiave, formattati)
        self._prossima()
        if file.is_gone():
            return
        try:
            file.invalidate_extension_info()
        except Exception:
            pass
