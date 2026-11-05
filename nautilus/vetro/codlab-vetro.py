# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
"""CodLab vetro per File (01.11.2026).

Il vetro della barra laterale (e, con la variante B, della barra del titolo) dentro File.

Carica il foglio codlab-vetro.css che sta ACCANTO a questo file dentro File, e solo lì, con la priorità appena sopra il
gtk.css dell'utente: il gtk.css non si tocca, e nessun'altra app GTK 4 cambia.

Si accende solo dove il vetro è VERO:
  - display Wayland (su X11/Xwayland Mutter non sfoca: la barra sarebbe trasparente SENZA sfocatura);
  - GTK >= 4.24 (il protocollo ext-background-effect arriva in GTK 4.23.3).
Interruttore A CALDO: se esiste ~/.config/codlab-vetro/spento il vetro si toglie entro 2 s, senza riavviare File; se il
file sparisce torna. Anche il foglio si rilegge a caldo se cambia (una variante nuova vale senza riavvio).
Contrasto elevato (giro di chiusura 1, K2): appena il sistema chiede più contrasto (Gtk.Settings:gtk-interface-contrast
= MORE, o Adw.StyleManager:high-contrast) il foglio si TOGLIE e File torna pieno come libadwaita; torna il vetro quando
la richiesta cade. Segue i due segnali dal vivo, e ricontrolla ogni 2 s. Il provider ha inoltre prefers-contrast,
prefers-color-scheme e prefers-reduced-motion collegati al sistema come GTK fa con i propri fogli (gtksettings.c
1173-1197): un provider creato da un'app nasce a NO_PREFERENCE, e il ramo @media del foglio non scattava mai.
L'estensione stessa la carica solo un File che PARTE: la prima volta dopo la posa serve «nautilus -q» o il login.
Ogni guasto qui dentro si scrive su stderr e lascia File com'è: un'estensione non deve mai fermare File.
"""
import sys
from pathlib import Path

import gi
gi.require_version("Gtk", "4.0")
gi.require_version("Gdk", "4.0")
from gi.repository import Gdk, GLib, GObject, Gtk  # noqa: E402

try:                                       # File usa libadwaita; senza il suo typelib basta il segnale di GTK
    gi.require_version("Adw", "1")
    from gi.repository import Adw  # noqa: E402
except (ImportError, ValueError):
    Adw = None

QUI = Path(__file__).resolve().parent
FOGLIO = QUI / "codlab-vetro.css"
SPENTO = Path(GLib.get_user_config_dir()) / "codlab-vetro" / "spento"
# Le copie di sistema richiedono il consenso esplicito del singolo utente.
DI_SISTEMA = str(QUI).startswith('/usr/')
ATTIVO = Path(GLib.get_user_config_dir()) / 'codlab-thema' / 'attivo'
PRIORITA = Gtk.STYLE_PROVIDER_PRIORITY_USER + 1     # sopra il gtk.css dell'utente (800)
PREFERENZE = (("gtk-interface-contrast", "prefers-contrast"), ("gtk-interface-color-scheme", "prefers-color-scheme"),
              ("gtk-interface-reduced-motion", "prefers-reduced-motion"))
_s = {"disp": None, "prov": None, "impronta": None, "guardia": None}


def _scrivi(msg):
    print(f"codlab-vetro: {msg}", file=sys.stderr, flush=True)


def _impronta():
    try:
        st = FOGLIO.stat()
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None


def _contrasto_elevato():
    """Il sistema chiede più contrasto: lo dice GTK (gtk-interface-contrast, dal portale) o libadwaita (high-contrast)."""
    imp = Gtk.Settings.get_for_display(_s["disp"])
    if imp is not None and imp.get_property("gtk-interface-contrast") == Gtk.InterfaceContrast.MORE:
        return True
    return Adw is not None and bool(Adw.StyleManager.get_for_display(_s["disp"]).get_high_contrast())


def _togli():
    if _s["prov"] is not None:
        Gtk.StyleContext.remove_provider_for_display(_s["disp"], _s["prov"])
        _s["prov"] = None


def _metti():
    prov = Gtk.CssProvider()
    imp = Gtk.Settings.get_for_display(_s["disp"])
    for sistema, foglio in PREFERENZE:
        imp.bind_property(sistema, prov, foglio, GObject.BindingFlags.SYNC_CREATE)
    prov.load_from_path(str(FOGLIO))
    _togli()
    Gtk.StyleContext.add_provider_for_display(_s["disp"], prov, PRIORITA)
    _s["prov"], _s["impronta"] = prov, _impronta()


def _controlla(*_):
    """Ogni 2 s (due stat, costo trascurabile) e a ogni cambio del contrasto: interruttore, contrasto, foglio cambiato."""
    try:
        elevato = _contrasto_elevato()
        voluto = (not DI_SISTEMA or ATTIVO.is_file()) and not SPENTO.exists() and FOGLIO.is_file() and not elevato
        if not voluto and _s["prov"] is not None:
            _togli()
            _scrivi("spento a caldo" if SPENTO.exists() else
                    "contrasto elevato: vetro tolto, File pieno come libadwaita" if elevato else
                    f"{FOGLIO.name} tolto: vetro spento")
        elif voluto and (_s["prov"] is None or _impronta() != _s["impronta"]):
            _metti()
            _scrivi(f"attivo ({_s['guardia']}, {FOGLIO.name})")
    except Exception as e:                 # noqa: BLE001  (File non deve mai cadere per il vetro)
        _scrivi(f"guasto, File resta com'è: {e!r}")
    return True


def _avvia():
    try:
        disp = Gdk.Display.get_default()
        if disp is None:
            return True                    # display non ancora aperto: si riprova al giro dopo
        tipo = GObject.type_name(disp.__gtype__)
        versione = (Gtk.get_major_version(), Gtk.get_minor_version(), Gtk.get_micro_version())
        if "Wayland" not in tipo:
            _scrivi(f"display {tipo}: niente vetro (su X11 Mutter non sfoca)")
        elif versione < (4, 24, 0):
            _scrivi(f"GTK {'.'.join(map(str, versione))}: niente vetro (serve GTK 4.24)")
        else:
            _s["disp"], _s["guardia"] = disp, f"{tipo}, GTK {'.'.join(map(str, versione))}"
            Gtk.Settings.get_for_display(disp).connect("notify::gtk-interface-contrast", _controlla)
            if Adw is not None:
                Adw.StyleManager.get_for_display(disp).connect("notify::high-contrast", _controlla)
            _controlla()
            if _s["prov"] is None and SPENTO.exists():
                _scrivi(f"spento da {SPENTO}: niente vetro finché c'è")
            elif _s["prov"] is None and _contrasto_elevato():
                _scrivi("contrasto elevato: niente vetro finché il sistema lo chiede")
            GLib.timeout_add_seconds(2, _controlla)
    except Exception as e:                 # noqa: BLE001
        _scrivi(f"guasto, File resta com'è: {e!r}")
    return False


if _avvia():                               # True = display non ancora aperto: si riprova dal ciclo di GLib
    GLib.idle_add(_avvia)
