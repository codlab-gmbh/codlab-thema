#!/usr/bin/python3 -B
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
"""Posa e ritorno del Vetro CodLab (04.11.2026). Solo utente, niente sudo; vale dal prossimo login, con un ritorno
che rimette com'era ciò che la posa ha cambiato.

    vetro_posa.py posa     [--casa DIR] [--esegui]     # senza --esegui dice soltanto che cosa farebbe
    vetro_posa.py ritorno  RICEVUTA     [--esegui]
    vetro_posa.py stato    [--casa DIR | --dir DIR]   # sola lettura: 0 acceso, 1 spento (guasto o interruttore), 2 altro

Stato (V-CONTROLLO): la Shell dice ACTIVE anche quando il vetro si è spento da sé (canarino, cane da
guardia, sentinella). L'estensione scrive sempre il suo stato vero in ~/.local/state/vetro-codlab/stato.json (acceso, spento
col motivo, disabilitato) e una riga «vetro-codlab: …» nel journal; «stato» lo legge e ne fa un'uscita verificabile da un
controllo periodico del desktop.

Posa: (1) ricevuta del prima in posa/ritorni/<ora>/prima.json (chiavi blur di Blur my Shell per panel, dash-to-dock,
popup; elenco delle estensioni abilitate; se la cartella dell'estensione c'era); (2) copia di vetro@codlab.de (file 644,
cartelle 755) in ~/.local/share/gnome-shell/extensions; (3) Blur my Shell spenta su panel, dash-to-dock e popup con le
SUE chiavi (i suoi file non si toccano; panoramica e cartelle restano a lei); (4) vetro@codlab.de nell'elenco delle
abilitate. Vale dal PROSSIMO LOGIN (una cartella nuova la Shell la vede solo all'avvio; Blur my Shell toglie il suo vetro
subito: fino al login la barra resta col tema di serie, leggibile).
Ritorno: rimette le tre chiavi e l'elenco com'erano nella ricevuta, toglie la cartella (solo se è la nostra) e lo stato.
Spegnimento rapido senza ritorno: touch ~/.config/vetro-codlab/spento (vale al login dopo, o subito con disable/enable).
Guardia: con --casa diversa dalla casa vera servono GSETTINGS_BACKEND=keyfile e XDG_CONFIG_HOME dentro --casa (le chiavi
non devono finire nella dconf vera mentre i file vanno nella casa finta)."""
import argparse
import ast
import json
import os
import pwd
import shutil
import subprocess
import sys
import time
from pathlib import Path

QUI = Path(__file__).resolve().parent
TASK = QUI.parent
UUID = 'vetro@codlab.de'
BMS_SCHEMA = 'org.gnome.shell.extensions.blur-my-shell'
COMPONENTI = ('panel', 'dash-to-dock', 'popup')
VERA = Path(pwd.getpwuid(os.getuid()).pw_dir)


def gs(casa, *arg, schemadir=None):
    cmd = ['gsettings'] + (['--schemadir', str(schemadir)] if schemadir else []) + list(arg)
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    if r.returncode:
        raise RuntimeError(f"gsettings {' '.join(arg)}: {r.stderr.strip()}")
    return r.stdout.strip()


def schemi_bms(casa):
    d = casa / '.local/share/gnome-shell/extensions/blur-my-shell@aunetx/schemas'
    return d if (d / 'gschemas.compiled').exists() else None


def guardia(casa):
    if casa.resolve() != VERA:
        if os.environ.get('GSETTINGS_BACKEND') != 'keyfile' or not os.environ.get('XDG_CONFIG_HOME', '').startswith(str(casa)):
            sys.exit('rifiuto: casa finta senza GSETTINGS_BACKEND=keyfile e XDG_CONFIG_HOME dentro la casa')
        if os.environ.get('DBUS_SESSION_BUS_ADDRESS'):
            sys.exit('rifiuto: casa finta con il bus di sessione vero nell\'ambiente')


def leggi_prima(casa):
    sd = schemi_bms(casa)
    bms = {}
    for c in COMPONENTI:
        bms[c] = gs(casa, 'get', f'{BMS_SCHEMA}.{c}', 'blur', schemadir=sd) if sd else None
    return {'ora': time.strftime('%F %T %Z'), 'casa': str(casa), 'bms_blur': bms, 'bms_schemi': str(sd) if sd else None,
            'abilitate': gs(casa, 'get', 'org.gnome.shell', 'enabled-extensions'),
            'cartella_esisteva': (casa / '.local/share/gnome-shell/extensions' / UUID).exists()}


def posa(casa, esegui):
    guardia(casa)
    prima = leggi_prima(casa)
    dest = casa / '.local/share/gnome-shell/extensions' / UUID
    piano = [f'ricevuta del prima: {json.dumps(prima, ensure_ascii=False)}',
             f'copia {TASK / UUID} → {dest} (644/755)',
             *(f'gsettings set {BMS_SCHEMA}.{c} blur false' for c in COMPONENTI),
             f'aggiungi {UUID} a org.gnome.shell enabled-extensions', 'vale dal prossimo login']
    if not esegui:
        print('PROVA A SECCO (niente scritto):\n  ' + '\n  '.join(piano))
        return None
    if prima['cartella_esisteva']:
        sys.exit(f'rifiuto: {dest} esiste già (ritorno prima di una nuova posa)')
    ric = QUI / 'ritorni' / time.strftime('%Y%m%d-%H%M%S')
    ric.mkdir(parents=True)
    (ric / 'prima.json').write_text(json.dumps(prima, ensure_ascii=False, indent=1) + '\n')
    shutil.copytree(TASK / UUID, dest)
    for p in dest.rglob('*'):
        p.chmod(0o755 if p.is_dir() else 0o644)
    dest.chmod(0o755)
    sd = schemi_bms(casa)
    if sd:
        for c in COMPONENTI:
            gs(casa, 'set', f'{BMS_SCHEMA}.{c}', 'blur', 'false', schemadir=sd)
    lista = ast.literal_eval(prima['abilitate'].removeprefix('@as ')) if prima['abilitate'] not in ('@as []',) else []
    if UUID not in lista:
        lista.append(UUID)
    gs(casa, 'set', 'org.gnome.shell', 'enabled-extensions', str(lista))
    # si rilegge sempre (chiusura 1, D6): senza il bus di sessione gsettings non scrive e risponde 0 lo stesso
    riletto = {c: gs(casa, 'get', f'{BMS_SCHEMA}.{c}', 'blur', schemadir=sd) for c in COMPONENTI} if sd else {}
    abilitate = gs(casa, 'get', 'org.gnome.shell', 'enabled-extensions')
    (ric / 'fatto.json').write_text(json.dumps({'ora': time.strftime('%F %T %Z'), 'dest': str(dest),
                                                'bms_blur_dopo': riletto, 'abilitate_dopo': abilitate},
                                               ensure_ascii=False, indent=1) + '\n')
    if any(v != 'false' for v in riletto.values()) or f"'{UUID}'" not in abilitate:
        sys.exit(f'ROSSO: le chiavi rilette non sono quelle scritte (blur {riletto}; abilitate senza {UUID}?). '
                 f'Ritorno: {Path(__file__).name} ritorno {ric} --esegui')
    print(f'POSATO (vale dal prossimo login). Ritorno: {Path(__file__).name} ritorno {ric} --esegui')
    return ric


def ritorno(ric, esegui):
    prima = json.loads((Path(ric) / 'prima.json').read_text())
    casa = Path(prima['casa'])
    guardia(casa)
    dest = casa / '.local/share/gnome-shell/extensions' / UUID
    piano = [*(f"gsettings set {BMS_SCHEMA}.{c} blur {v}" for c, v in prima['bms_blur'].items() if v is not None),
             f"enabled-extensions ← {prima['abilitate']}", f'togli {dest} (se è la nostra)', 'togli ~/.local/state/vetro-codlab']
    if not esegui:
        print('PROVA A SECCO (niente scritto):\n  ' + '\n  '.join(piano))
        return
    sd = schemi_bms(casa)
    if sd:
        for c, v in prima['bms_blur'].items():
            if v is not None:
                gs(casa, 'set', f'{BMS_SCHEMA}.{c}', 'blur', v, schemadir=sd)
    gs(casa, 'set', 'org.gnome.shell', 'enabled-extensions', prima['abilitate'].removeprefix('@as '))
    meta = dest / 'metadata.json'
    if not prima['cartella_esisteva'] and meta.exists() and json.loads(meta.read_text()).get('uuid') == UUID:
        shutil.rmtree(dest)
    shutil.rmtree(casa / '.local/state/vetro-codlab', ignore_errors=True)
    diversi = [c for c, v in prima['bms_blur'].items() if v is not None and sd and
               gs(casa, 'get', f'{BMS_SCHEMA}.{c}', 'blur', schemadir=sd) != v]
    if gs(casa, 'get', 'org.gnome.shell', 'enabled-extensions') != prima['abilitate'] or diversi:
        sys.exit(f'ROSSO: dopo il ritorno le chiavi rilette non sono quelle della ricevuta (blur diversi: {diversi})')
    print('RITORNO FATTO (vale dal prossimo login; Blur my Shell rimette subito il suo vetro)')


def stato(casa, cartella=None):
    """Sola lettura: lo stato vero del vetro. Uscita 0 acceso, 1 spento (guasto, sentinella o interruttore), 2 nient'altro
    (disabilitato, mai acceso, stato illeggibile)."""
    d = Path(cartella) if cartella else Path(os.environ.get('XDG_STATE_HOME') or casa / '.local/state') / 'vetro-codlab'
    interruttore = Path(os.environ.get('XDG_CONFIG_HOME') or casa / '.config') / 'vetro-codlab' / 'spento'
    try:
        s = json.loads((d / 'stato.json').read_text())
    except (OSError, ValueError):
        s = None
    esito = {'stato': (s or {}).get('stato'), 'motivo': (s or {}).get('motivo'), 'persistente': (s or {}).get('persistente'),
             'ora': (s or {}).get('ora'), 'in_prova': (d / 'in-prova').exists(), 'interruttore': interruttore.exists(),
             'cartella': str(d)}
    if esito['interruttore'] or esito['stato'] == 'spento':
        rc = 1
    elif esito['stato'] == 'acceso':
        rc = 0
    else:
        rc = 2
    parola = {0: 'ACCESO', 1: 'SPENTO', 2: 'NON ACCESO'}[rc]
    print(f"{parola}: {json.dumps(esito, ensure_ascii=False)}")
    sys.exit(rc)


def main():
    a = argparse.ArgumentParser()
    a.add_argument('azione', choices=['posa', 'ritorno', 'stato'])
    a.add_argument('ricevuta', nargs='?')
    a.add_argument('--casa', default=os.environ.get('HOME', str(VERA)))
    a.add_argument('--dir', help='cartella dello stato (per le prove nell\'isola)')
    a.add_argument('--esegui', action='store_true')
    x = a.parse_args()
    if x.azione == 'posa':
        posa(Path(x.casa), x.esegui)
    elif x.azione == 'stato':
        stato(Path(x.casa), x.dir)
    else:
        ritorno(x.ricevuta, x.esegui)


if __name__ == '__main__':
    main()
