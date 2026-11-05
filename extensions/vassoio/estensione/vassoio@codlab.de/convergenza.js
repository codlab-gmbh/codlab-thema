// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
// Le custom-icons di AppIndicator arrivano davvero (04.11.2026, misurato con PSI cpu al 19 %): AppIndicator le
// calcola solo in _updateWhenFullyReady; sotto carico l'icona originale chiesta prima (segnale 'icon', con la mappa
// delle custom ancora vuota) vince la corsa e resta in barra finché l'icona non viene smappata e rimappata — Discord e
// Coucou piene per tutta la corsa. Se l'icona mostrata non è quella che la configurazione di AppIndicator chiede, si
// rifà il gesto che AppIndicator fa da sé quando custom-icons cambia (appIndicator.js, 'changed::custom-icons'):
// _updateCustomIcons + _invalidateIconWhenFullyReady. Non si sostituisce nessuna icona e in disable non c'è niente da
// rimettere: si chiede ad AppIndicator di finire il suo lavoro, al massimo TENTATIVI volte per icona e per richiesta.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const APPINDICATOR = 'appindicatorsupport@rgcjonas.gmail.com';
const TENTATIVI = 3;
const QUIETE_MS = 800;      // si guarda dopo l'ultimo cambio d'icona: AppIndicator può essere a metà del suo giro

function mostrata(gicon) {
    const g = gicon instanceof Gio.EmblemedIcon ? gicon.get_icon() : gicon;
    if (g instanceof Gio.FileIcon)
        return {percorso: g.get_file().get_path() ?? '', nomi: []};
    if (g instanceof Gio.ThemedIcon)
        return {percorso: '', nomi: g.get_names()};
    return {percorso: '', nomi: []};
}

// la custom-icon chiesta è un percorso assoluto o un nome d'icona (che il tema può risolvere in un file)
function corrisponde(chiesta, gicon) {
    const m = mostrata(gicon);
    if (chiesta.startsWith('/'))
        return m.percorso === chiesta;
    const base = m.percorso.split('/').pop().replace(/\.(svg|png)$/, '');
    return m.nomi.includes(chiesta) || base === chiesta;
}

export class Convergenza {
    constructor() {
        this._legate = new Map();       // St.Icon di AppIndicator → stato
        this._impostazioni = null;
        this._riapplicate = 0;
    }

    _custom() {
        if (!this._impostazioni) {
            const ext = Main.extensionManager.lookup(APPINDICATOR);
            try {
                this._impostazioni = ext?.stateObj?.getSettings?.() ?? null;
            } catch {
                this._impostazioni = null;
            }
            this._impostazioni?.connectObject('changed::custom-icons', () => {
                for (const stato of this._legate.values()) {
                    stato.tentativi = 0;
                    this._programma(stato);
                }
            }, this);
        }
        const mappa = new Map();
        for (const [id, normale] of this._impostazioni?.get_value('custom-icons').deep_unpack() ?? []) {
            if (normale)
                mappa.set(id, normale);
        }
        return mappa;
    }

    // chiamata dal vassoio per ogni voce, a ogni disposizione: lega una volta sola per icona di AppIndicator
    segui(voce) {
        const icona = voce.button?.icon;
        const indicatore = voce.button?._indicator;
        if (!indicatore || !icona || this._legate.has(icona) || typeof icona._invalidateIconWhenFullyReady !== 'function')
            return;
        const stato = {icona, indicatore, tentativi: 0, attesa: 0};
        icona.connectObject(
            'notify::gicon', () => this._programma(stato),
            'notify::mapped', () => this._programma(stato),
            'destroy', () => {
                if (stato.attesa)
                    GLib.source_remove(stato.attesa);
                stato.attesa = 0;
                this._legate.delete(icona);
            }, stato);
        this._legate.set(icona, stato);
        this._programma(stato);
    }

    _programma(stato) {
        if (stato.attesa)
            GLib.source_remove(stato.attesa);
        stato.attesa = GLib.timeout_add(GLib.PRIORITY_DEFAULT, QUIETE_MS, () => {
            stato.attesa = 0;
            this._controlla(stato);
            return GLib.SOURCE_REMOVE;
        });
    }

    _controlla(stato) {
        const {icona, indicatore} = stato;
        // smappata (nel menu ⌄, o doppione): AppIndicator la ricalcola da sé quando torna mappata
        if (!icona.is_mapped() || !indicatore.isReady)
            return;
        const chiesta = this._custom().get(indicatore.id);
        if (!chiesta || corrisponde(chiesta, icona.gicon)) {
            stato.tentativi = 0;
            return;
        }
        if (stato.tentativi >= TENTATIVI) {
            if (stato.tentativi++ === TENTATIVI)
                console.log(`vassoio: custom-icon di ${indicatore.id} non arrivata dopo ${TENTATIVI} tentativi (${chiesta})`);
            return;
        }
        stato.tentativi++;
        this._spingi(stato);
        this._riapplicate++;
        console.log(`vassoio: custom-icon di ${indicatore.id} riapplicata (tentativo ${stato.tentativi})`);
    }

    _spingi(stato) {
        stato.icona._updateCustomIcons?.();
        stato.icona._invalidateIconWhenFullyReady();
    }

    stato() {
        const custom = this._impostazioni ? this._custom() : new Map();
        return {riapplicate: this._riapplicate, voci: [...this._legate.values()].map(s => ({
            id: s.indicatore.id, chiesta: custom.get(s.indicatore.id) ?? null,
            mostrata: mostrata(s.icona.gicon).percorso || mostrata(s.icona.gicon).nomi.join(','),
            arrivata: custom.has(s.indicatore.id) ? corrisponde(custom.get(s.indicatore.id), s.icona.gicon) : null,
            tentativi: s.tentativi, mappata: s.icona.is_mapped(),
        }))};
    }

    destroy() {
        this._impostazioni?.disconnectObject(this);
        this._impostazioni = null;
        for (const stato of this._legate.values()) {
            stato.icona.disconnectObject(stato);
            if (stato.attesa)
                GLib.source_remove(stato.attesa);
            stato.attesa = 0;
        }
        this._legate.clear();
    }
}
