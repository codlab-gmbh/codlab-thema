#!/usr/bin/python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
"""Installazione e rimozione vere in radice temporanea, solo dentro un contenitore."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('formato', choices=['rpm', 'deb'])
parser.add_argument('pacchetto', type=Path)
args = parser.parse_args()
assert os.geteuid() == 0 and (Path('/run/.containerenv').exists() or Path('/.dockerenv').exists()), 'Serve un contenitore isolato'
package = args.pacchetto.resolve()
validator = Path(__file__).resolve().parents[1] / 'validate.py'

def run(*cmd, expected=0):
    p = subprocess.run([str(x) for x in cmd], text=True, capture_output=True)
    assert (p.returncode == 0) == (expected == 0), (cmd, p.returncode, p.stdout, p.stderr)
    return p

with tempfile.TemporaryDirectory(prefix='codlab-radice-') as name:
    root = Path(name)
    if args.formato == 'rpm':
        for tag in ['PREIN', 'POSTIN', 'PREUN', 'POSTUN', 'PRETRANS', 'POSTTRANS']:
            assert run('rpm', '-qp', '--qf', '%{' + tag + '}', package).stdout == '(none)', tag
        run('rpm', '--root', root, '--initdb')
        run('rpm', '--root', root, '-i', '--nodeps', '--nosignature', package)
    else:
        control = root / 'controllo'
        run('dpkg-deb', '-e', package, control)
        assert {p.name for p in control.iterdir()} == {'control', 'md5sums'}, 'Script di manutenzione inattesi'
        import shutil
        shutil.rmtree(control)
        (root / 'var/lib/dpkg').mkdir(parents=True)
        (root / 'var/lib/dpkg/status').touch()
        run('dpkg', '--root=' + str(root), '--force-depends', '--install', package)
    print(run('python3', validator, '--root', root).stdout.strip())
    manifest = json.loads((root / 'usr/share/codlab-thema/manifest.json').read_text())
    files = [root / p for p in manifest] + [root / 'usr/share/codlab-thema/manifest.json']
    assert all(p.stat().st_uid == 0 and p.stat().st_gid == 0 for p in files), 'Proprietario payload'
    assert not (root / 'home').exists(), 'Scrittura in una casa utente'
    # Il controllo deve diventare rosso per tre guasti indipendenti del payload installato.
    meta = next(root.glob('usr/share/gnome-shell/extensions/*/metadata.json'))
    meta_stat = meta.stat()
    original = meta.read_bytes(); meta.write_text('{metadata rotto')
    result = run('python3', validator, '--root', root, expected=1)
    print('ROSSO metadata rotto:', result.stderr.strip()); meta.write_bytes(original)
    os.utime(meta, ns=(meta_stat.st_atime_ns, meta_stat.st_mtime_ns))
    extension = next(root.glob('usr/share/gnome-shell/extensions/*/extension.js'))
    extension_stat = extension.stat()
    original = extension.read_bytes(); extension.unlink()
    result = run('python3', validator, '--root', root, expected=1)
    print('ROSSO file mancante:', result.stderr.strip()); extension.write_bytes(original)
    os.utime(extension, ns=(extension_stat.st_atime_ns, extension_stat.st_mtime_ns))
    schema = next(root.glob('usr/share/gnome-shell/extensions/*/schemas/gschemas.compiled'))
    schema_stat = schema.stat()
    original = schema.read_bytes(); schema.write_bytes(b'rotto')
    result = run('python3', validator, '--root', root, expected=1)
    print('ROSSO schema corrotto:', result.stderr.strip()); schema.write_bytes(original)
    os.utime(schema, ns=(schema_stat.st_atime_ns, schema_stat.st_mtime_ns))
    print(run('python3', validator, '--root', root).stdout.strip())
    if args.formato == 'rpm':
        run('rpm', '--root', root, '--nodeps', '-V', 'codlab-thema')
        run('rpm', '--root', root, '-e', 'codlab-thema')
        assert run('rpm', '--root', root, '-q', 'codlab-thema', expected=1).returncode != 0
    else:
        run('dpkg', '--root=' + str(root), '--verify', 'codlab-thema')
        run('dpkg', '--root=' + str(root), '--purge', 'codlab-thema')
    assert not any(p.exists() for p in files), 'File del pacchetto residui'
    assert not (root / 'usr').exists() or not any(p.is_file() or p.is_symlink() for p in (root / 'usr').rglob('*')), 'Residui in /usr'
    print(f'VERDE {args.formato}: installazione e rimozione in radice isolata, tre mutanti rifiutati, zero file residui')
    print('Dipendenze escluse solo nella radice di prova vuota; nessuna prova della sessione grafica o risoluzione delle dipendenze.')
