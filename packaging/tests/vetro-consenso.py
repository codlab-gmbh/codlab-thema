#!/usr/bin/python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
"""La copia di sistema non attiva il vetro senza consenso per utente."""
import ast
from pathlib import Path
import tempfile

source = Path(__file__).resolve().parents[2] / 'nautilus/vetro/codlab-vetro.py'
function = next(n for n in ast.parse(source.read_text()).body if isinstance(n, ast.FunctionDef) and n.name == '_controlla')
with tempfile.TemporaryDirectory() as name:
    root = Path(name); calls = []
    sheet = root / 'codlab-vetro.css'; sheet.touch()
    state = {'prov': None, 'impronta': None, 'guardia': 'prova'}
    def metti():
        state['prov'] = True; state['impronta'] = 1; calls.append('metti')
    def togli():
        state['prov'] = None; calls.append('togli')
    context = dict(DI_SISTEMA=True, ATTIVO=root / 'attivo', SPENTO=root / 'spento', FOGLIO=sheet,
                   _s=state, _contrasto_elevato=lambda: False, _metti=metti, _togli=togli,
                   _impronta=lambda: 1, _scrivi=lambda _: None)
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), context)
    context['_controlla'](); assert calls == []
    context['ATTIVO'].touch(); context['_controlla'](); assert calls == ['metti']
    context['ATTIVO'].unlink(); context['_controlla'](); assert calls == ['metti', 'togli']
    context['DI_SISTEMA'] = False; context['_controlla'](); assert calls[-1] == 'metti'
    context['SPENTO'].touch(); context['_controlla'](); assert calls[-1] == 'togli'
print('VERDE: vetro di sistema spento senza consenso, attivazione e revoca a caldo, copie personali e interruttore preservati')
