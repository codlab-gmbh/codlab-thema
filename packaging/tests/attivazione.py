#!/usr/bin/python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
"""Esegue il comando vero con backend keyfile, schemi e casa temporanei."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

SOURCE = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='codlab-attivazione-') as name:
    root = Path(name)
    home = root / 'home'; home.mkdir()
    config = home / '.config'; config.mkdir()
    schemas = root / 'schemas'; schemas.mkdir()
    (schemas / 'shell.gschema.xml').write_text('''<schemalist>
      <schema id="org.gnome.shell" path="/org/gnome/shell/">
      <key name="enabled-extensions" type="as"><default>[]</default></key>
      <key name="disabled-extensions" type="as"><default>[]</default></key>
      </schema></schemalist>''')
    subprocess.run(['glib-compile-schemas', '--strict', str(schemas)], check=True)
    binary = root / 'usr/bin/codlab-thema'; binary.parent.mkdir(parents=True)
    shutil.copy2(SOURCE / 'packaging/bin/codlab-thema', binary)
    data = root / 'usr/share/codlab-thema/extensions.json'; data.parent.mkdir(parents=True)
    uuids = sorted(json.loads(p.read_text())['uuid'] for p in (SOURCE / 'extensions').rglob('metadata.json'))
    data.write_text(json.dumps(uuids))
    unitdir = config / 'systemd/user'; unitdir.mkdir(parents=True)
    unit = unitdir / 'dock-fine-avvio-prima-della-shell.service'
    unit.write_text('[Unit]\nDescription=Prova isolata\n[Service]\nExecStart=/usr/bin/true\n[Install]\nWantedBy=gnome-session-pre.target\n')
    env = os.environ.copy()
    env.update(HOME=str(home), XDG_CONFIG_HOME=str(config), XDG_DATA_HOME=str(home / '.local/share'),
               GSETTINGS_BACKEND='keyfile', GSETTINGS_SCHEMA_DIR=str(schemas),
               DBUS_SESSION_BUS_ADDRESS='unix:path=/nonexistent', SYSTEMD_OFFLINE='1',
               XDG_RUNTIME_DIR=str(root / 'runtime'))
    def run(*args, ok=True):
        r = subprocess.run(args, env=env, text=True, capture_output=True)
        assert (r.returncode == 0) == ok, (args, r.returncode, r.stdout, r.stderr)
        return r.stdout
    run('gsettings', 'set', 'org.gnome.shell', 'enabled-extensions', "['altra@example.org']")
    run('gsettings', 'set', 'org.gnome.shell', 'disabled-extensions', repr([uuids[0], 'spenta@example.org']))
    run(str(binary), 'attiva')
    assert (config / 'codlab-thema/attivo').exists()
    first = run('gsettings', 'get', 'org.gnome.shell', 'enabled-extensions')
    assert 'altra@example.org' in first and all(u in first for u in uuids)
    run(str(binary), 'attiva')
    assert run('gsettings', 'get', 'org.gnome.shell', 'enabled-extensions') == first
    assert 'spenta@example.org' in run('gsettings', 'get', 'org.gnome.shell', 'disabled-extensions')
    assert 'https://www.paypal.com/paypalme/codlabUG' in run(str(binary), 'stato')
    run(str(binary), 'disattiva')
    assert not (config / 'codlab-thema/attivo').exists()
    assert run('gsettings', 'get', 'org.gnome.shell', 'enabled-extensions').strip() == "['altra@example.org']"
    run(str(binary), 'disattiva')
    print('VERDE: attiva/disattiva/stato, idempotenza, terzi preservati, casa e backend isolati')
    # La copia personale deve impedire l'attivazione senza cambiare le preferenze.
    shadow = home / '.local/share/gnome-shell/extensions' / uuids[0]; shadow.mkdir(parents=True)
    run(str(binary), 'attiva', ok=False)
    assert not (config / 'codlab-thema/attivo').exists()
    assert run('gsettings', 'get', 'org.gnome.shell', 'enabled-extensions').strip() == "['altra@example.org']"
    print('VERDE: copia personale rifiutata prima di ogni modifica')
