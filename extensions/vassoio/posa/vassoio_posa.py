#!/usr/bin/python3 -B
"""Posa e ritorno del Vassoio (vassoio@codlab.de), 04.11.2026. PREPARATA, NON ESEGUITA sulla sessione vera. Solo utente,
niente sudo. Vale dal PROSSIMO LOGIN (la Shell 51 vede una cartella d'estensione nuova soltanto all'avvio).

    vassoio_posa.py posa     [--casa DIR] [--esegui]     # senza --esegui dice soltanto che cosa farebbe
    vassoio_posa.py ritorno  RICEVUTA     [--esegui]
    vassoio_posa.py stato    [--casa DIR]                # sola lettura: 0 posato e attivo, 1 no, 2 posato ma diverso

Posa: (1) ricevuta del prima in posa/ritorni/<ora>/prima.json (elenco delle abilitate, se la cartella c'era, le chiavi
del vassoio); (2) copia di estensione/vassoio@codlab.de (file 644, cartelle 755) con il manifesto delle impronte;
(3) vassoio@codlab.de IN FONDO all'elenco delle abilitate (ultima: quando la Shell «ribasa» un'estensione precedente,
il vassoio si spegne e si riaccende, provato); (4) rilettura. Nessun'altra chiave: Tiling Shell, AppIndicator, gdrive,
Cardinal, il vetro e le icone di tema restano come sono.
Ritorno: toglie SOLO vassoio@codlab.de dall'elenco di adesso (ciò che altri hanno abilitato dopo la posa resta), rimette
le chiavi del vassoio ai valori di serie, toglie la cartella solo se è ancora la nostra (impronte del manifesto) e lo stato
del testimone (~/.local/state/vassoio). Rilegge e confronta.
Guardia: con --casa diversa dalla casa vera servono GSETTINGS_BACKEND=keyfile, XDG_CONFIG_HOME dentro --casa e nessun bus
di sessione (le chiavi non devono finire nella dconf vera mentre i file vanno nella casa finta)."""
import argparse
import ast
import hashlib
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
UUID = 'vassoio@codlab.de'
SCHEMA = 'org.gnome.shell.extensions.vassoio'
SORGENTE = TASK / 'estensione' / UUID
VERA = Path(pwd.getpwuid(os.getuid()).pw_dir)        # la casa vera da passwd, non dall'HOME di chi chiama (D6 del vetro)


def gs(*arg, schemadir=None):
    cmd = ['gsettings'] + (['--schemadir', str(schemadir)] if schemadir else []) + list(arg)
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    if r.returncode:
        raise RuntimeError(f"gsettings {' '.join(arg)}: {r.stderr.strip()}")
    return r.stdout.strip()


def impronte(cartella):
    return {str(p.relative_to(cartella)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(cartella.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}


def guardia(casa):
    if casa.resolve() != VERA.resolve():
        if os.environ.get('GSETTINGS_BACKEND') != 'keyfile' or not os.environ.get('XDG_CONFIG_HOME', '').startswith(str(casa)):
            sys.exit('rifiuto: casa finta senza GSETTINGS_BACKEND=keyfile e XDG_CONFIG_HOME dentro la casa')
        if os.environ.get('DBUS_SESSION_BUS_ADDRESS'):
            sys.exit('rifiuto: casa finta con il bus di sessione vero nell\'ambiente')


def elenco(testo):
    t = testo.removeprefix('@as ').strip()
    return ast.literal_eval(t) if t not in ('', '[]') else []


def chiavi_vassoio(schemadir):
    return {k: gs('get', SCHEMA, k, schemadir=schemadir) for k in ('ordine', 'nel-menu', 'uniforma', 'doppioni', 'testimone-mochi')}


def posa(casa, esegui):
    guardia(casa)
    dest = casa / '.local/share/gnome-shell/extensions' / UUID
    if not (SORGENTE / 'schemas' / 'gschemas.compiled').exists():
        sys.exit('rifiuto: schemi non compilati nella sorgente')
    prima = {'ora': time.strftime('%F %T %Z'), 'casa': str(casa), 'abilitate': gs('get', 'org.gnome.shell', 'enabled-extensions'),
             'cartella_esisteva': dest.exists(), 'sorgente': str(SORGENTE), 'impronte_sorgente': impronte(SORGENTE)}
    piano = [f"ricevuta del prima (abilitate: {len(elenco(prima['abilitate']))}, cartella c'era: {prima['cartella_esisteva']})",
             f'copia {SORGENTE} → {dest} (644/755, {len(prima["impronte_sorgente"])} file)',
             f'{UUID} in fondo a org.gnome.shell enabled-extensions', 'rilettura; vale dal prossimo login']
    if not esegui:
        print('PROVA A SECCO (niente scritto):\n  ' + '\n  '.join(piano))
        return None
    if prima['cartella_esisteva']:
        sys.exit(f'rifiuto: {dest} esiste già (ritorno prima di una nuova posa)')
    if UUID in elenco(prima['abilitate']):
        sys.exit(f'rifiuto: {UUID} è già nell\'elenco delle abilitate senza la sua cartella: da guardare a mano')
    ric = QUI / 'ritorni' / time.strftime('%Y%m%d-%H%M%S')
    ric.mkdir(parents=True)
    (ric / 'prima.json').write_text(json.dumps(prima, ensure_ascii=False, indent=1) + '\n')
    shutil.copytree(SORGENTE, dest, ignore=shutil.ignore_patterns('__pycache__'))
    for p in dest.rglob('*'):
        p.chmod(0o755 if p.is_dir() else 0o644)
    dest.chmod(0o755)
    lista = elenco(prima['abilitate']) + [UUID]
    gs('set', 'org.gnome.shell', 'enabled-extensions', str(lista))
    # si rilegge sempre: senza bus gsettings può non scrivere e rispondere 0 lo stesso (D6 del vetro)
    abilitate = gs('get', 'org.gnome.shell', 'enabled-extensions')
    copia = impronte(dest)
    fatto = {'ora': time.strftime('%F %T %Z'), 'dest': str(dest), 'abilitate_dopo': abilitate,
             'copia_uguale': copia == prima['impronte_sorgente'], 'chiavi_vassoio': chiavi_vassoio(dest / 'schemas')}
    (ric / 'fatto.json').write_text(json.dumps(fatto, ensure_ascii=False, indent=1) + '\n')
    if elenco(abilitate)[-1:] != [UUID] or not fatto['copia_uguale']:
        sys.exit(f'ROSSO: riletto diverso dallo scritto (ultima abilitata {elenco(abilitate)[-1:]}, copia uguale '
                 f'{fatto["copia_uguale"]}). Ritorno: {Path(__file__).name} ritorno {ric} --esegui')
    print(f'POSATO (vale dal prossimo login). Ritorno: {Path(__file__).name} ritorno {ric} --esegui')
    return ric


def ritorno(ric, esegui):
    prima = json.loads((Path(ric) / 'prima.json').read_text())
    casa = Path(prima['casa'])
    guardia(casa)
    dest = casa / '.local/share/gnome-shell/extensions' / UUID
    nostra = dest.exists() and impronte(dest) == prima['impronte_sorgente']
    piano = [f'togli {UUID} da enabled-extensions (il resto dell\'elenco di adesso resta)',
             f'chiavi {SCHEMA} ai valori di serie', f'togli {dest} se è la nostra (adesso: {nostra})',
             'togli ~/.local/state/vassoio']
    if not esegui:
        print('PROVA A SECCO (niente scritto):\n  ' + '\n  '.join(piano))
        return
    if dest.exists() and not nostra:
        sys.exit(f'rifiuto: {dest} non è più la copia posata (impronte diverse): niente tolto, da guardare a mano')
    adesso = elenco(gs('get', 'org.gnome.shell', 'enabled-extensions'))
    if not prima['cartella_esisteva'] and UUID not in elenco(prima['abilitate']):
        gs('set', 'org.gnome.shell', 'enabled-extensions', str([u for u in adesso if u != UUID]))
    if dest.exists():
        gs('reset-recursively', SCHEMA, schemadir=dest / 'schemas')
        shutil.rmtree(dest)
    stato_dir = Path(os.environ.get('XDG_STATE_HOME') or casa / '.local/state') / 'vassoio'
    shutil.rmtree(stato_dir, ignore_errors=True)
    finale = elenco(gs('get', 'org.gnome.shell', 'enabled-extensions'))
    atteso = [u for u in adesso if u != UUID]
    if finale != atteso or dest.exists():
        sys.exit(f'ROSSO: dopo il ritorno elenco {finale[-3:]}… atteso {atteso[-3:]}…, cartella rimasta {dest.exists()}')
    print('RITORNO FATTO (vale dal prossimo login)')


def stato(casa):
    """Sola lettura. 0 posato e abilitato, con la copia uguale alla sorgente; 1 non posato; 2 posato ma diverso."""
    dest = casa / '.local/share/gnome-shell/extensions' / UUID
    abil = UUID in elenco(gs('get', 'org.gnome.shell', 'enabled-extensions'))
    uguale = dest.exists() and impronte(dest) == impronte(SORGENTE)
    test = Path(os.environ.get('XDG_STATE_HOME') or casa / '.local/state') / 'vassoio' / 'testimone-mochi.json'
    ultimo = None
    if test.exists():
        try:
            cicli = json.loads(test.read_text()).get('cicli') or []
            ultimo = cicli[-1] if cicli else None
        except ValueError:
            ultimo = 'illeggibile'
    esito = {'cartella': dest.exists(), 'abilitata': abil, 'copia_uguale_alla_sorgente': uguale, 'testimone_mochi_ultimo': ultimo}
    rc = 0 if (abil and uguale) else (1 if not dest.exists() and not abil else 2)
    print({0: 'POSATO', 1: 'NON POSATO', 2: 'DIVERSO'}[rc] + ': ' + json.dumps(esito, ensure_ascii=False))
    sys.exit(rc)


def main():
    a = argparse.ArgumentParser()
    a.add_argument('azione', choices=['posa', 'ritorno', 'stato'])
    a.add_argument('ricevuta', nargs='?')
    a.add_argument('--casa', default=os.environ.get('HOME', str(VERA)))
    a.add_argument('--esegui', action='store_true')
    x = a.parse_args()
    if x.azione == 'posa':
        posa(Path(x.casa), x.esegui)
    elif x.azione == 'stato':
        stato(Path(x.casa))
    else:
        ritorno(x.ricevuta, x.esegui)


if __name__ == '__main__':
    main()
