#!/usr/bin/python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
"""Prepara esclusivamente i file del pacchetto dentro una radice vuota."""
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

source = Path(__file__).resolve().parents[1]
root = Path(sys.argv[1]).resolve()
if root.exists() and any(root.iterdir()):
    raise SystemExit('La radice di staging deve essere vuota')
root.mkdir(parents=True, exist_ok=True)

def copy(src, dest, executable=False):
    target = root / dest
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / src, target)
    target.chmod(0o755 if executable else 0o644)
    return target

folders = json.loads((source / 'packaging/extensions.json').read_text())['extensions']
for folder in folders:
    target = root / 'usr/share/gnome-shell/extensions' / Path(folder).name
    shutil.copytree(source / folder, target, ignore=shutil.ignore_patterns('gschemas.compiled', '__pycache__'))
    for item in target.rglob('*'):
        item.chmod(0o755 if item.is_dir() else 0o644)
    if (target / 'schemas').is_dir():
        subprocess.run(['glib-compile-schemas', '--strict', str(target / 'schemas')], check=True)
copy('packaging/bin/codlab-thema', 'usr/bin/codlab-thema', True)
copy('nautilus/vetro/codlab-vetro.py', 'usr/share/nautilus-python/extensions/codlab-vetro.py')
css = root / 'usr/share/nautilus-python/extensions/codlab-vetro.css'
css.write_text((source / 'nautilus/vetro/comune.css').read_text() + (source / 'nautilus/vetro/variante-b.css').read_text())
copy('extensions/dock-dal-bordo/servizio/dock-fine-avvio-prima-della-shell', 'usr/libexec/codlab-thema/dock-fine-avvio-prima-della-shell', True)
unit = copy('extensions/dock-dal-bordo/servizio/dock-fine-avvio-prima-della-shell.service', 'usr/lib/systemd/user/dock-fine-avvio-prima-della-shell.service')
unit.write_text(unit.read_text().replace('ConditionPathExists=%h/.local/share/gnome-shell/extensions/dock-dal-bordo@codlab.de/extension.js',
    'ConditionPathExists=%h/.config/codlab-thema/attivo').replace(
    'ExecStart=/usr/bin/python3 -B %h/.local/bin/dock-fine-avvio-prima-della-shell',
    'ExecStart=/usr/bin/python3 -B /usr/libexec/codlab-thema/dock-fine-avvio-prima-della-shell'))
copy('packaging/README.md', 'usr/share/doc/codlab-thema/README.md')
copy('LICENSE', 'usr/share/licenses/codlab-thema/LICENSE')
copy('packaging/deb/copyright', 'usr/share/doc/codlab-thema/copyright')
for src, dst in [('packaging/man/codlab-thema.1', 'usr/share/man/man1/codlab-thema.1.gz'),
                 ('packaging/deb/changelog', 'usr/share/doc/codlab-thema/changelog.Debian.gz')]:
    target = root / dst; target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(gzip.compress((source / src).read_bytes(), mtime=0))
data = root / 'usr/share/codlab-thema'; data.mkdir(parents=True)
(data / 'extensions.json').write_text(json.dumps(sorted(Path(p).name for p in folders), indent=2)+'\n')
manifest = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob('*')) if p.is_file()}
(data / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True)+'\n')
for folder in root.rglob('*'):
    if folder.is_dir(): folder.chmod(0o755)
    os.utime(folder, (int(os.environ.get('SOURCE_DATE_EPOCH', 0)),)*2)
