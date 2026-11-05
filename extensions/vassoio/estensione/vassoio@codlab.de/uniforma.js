// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
// Icone a filo: le icone piene note si sostituiscono sullo STESSO St.Icon, a caldo, con le simboliche di icons/.
// Il proprietario continua a scrivere la sua icona (notify::gicon): si ricorda la sua ultima e si rimette la nostra
// equivalente per lo stesso stato. Uno stato sconosciuto lascia l'icona del proprietario: mai uno stato inventato.
// Spegnendo (chiave «uniforma» o disable) torna l'ultima icona del proprietario, con le sue classi.
import Gio from 'gi://Gio';
import St from 'gi://St';

import {Convergenza} from './convergenza.js';

// Cardinal Host: lo stato è nel titolo SNI («Cardinal Host — …», testo_stato() di cardinal-indicatore.py 236–254)
const TITOLI_CARDINAL = new Map([
    ['Accesso chiuso', 'chiuso'],
    ['Accesso sospeso', 'sospeso'],
    ['SESSIONE APERTA', 'aperto'],
    ['SESSIONE COLLEGATA', 'collegato'],
    ['AUDIO CONDIVISO', 'audio'],
    ['REGISTRAZIONE IN CORSO', 'registrazione'],
    ['REVOCA NON RIUSCITA', 'allarme'],
]);

function percorso(gicon) {
    const g = gicon instanceof Gio.EmblemedIcon ? gicon.get_icon() : gicon;
    return g instanceof Gio.FileIcon ? g.get_file().get_path() ?? '' : '';
}

function nomi(gicon) {
    return gicon instanceof Gio.ThemedIcon ? gicon.get_names() : [];
}

function impronta(gicon) {
    if (!gicon)
        return '';
    return gicon instanceof Gio.EmblemedIcon ? `E:${gicon.get_icon().to_string()}` : gicon.to_string();
}

function primaIcona(attore, prova) {
    for (const figlio of attore.get_children()) {
        if (figlio instanceof St.Icon && prova(figlio))
            return figlio;
        const dentro = primaIcona(figlio, prova);
        if (dentro)
            return dentro;
    }
    return null;
}

export function statoCardinal(titolo) {
    const testo = String(titolo ?? '').replace(/^Cardinal Host\s*[—-]\s*/, '').trim();
    return TITOLI_CARDINAL.get(testo) ?? null;
}

export class Uniforma {
    constructor(cartella, settings) {
        this._icone = `${cartella}/icons`;
        this._settings = settings;
        this._attiva = settings.get_boolean('uniforma');
        this._legate = new Map();          // St.Icon → stato del legame
        this._convergenza = new Convergenza();   // le custom-icons di AppIndicator, che sotto carico non arrivano
        settings.connectObject('changed::uniforma', () => {
            this._attiva = settings.get_boolean('uniforma');
            for (const stato of this._legate.values())
                stato.applica();
        }, this);
        // le regole: chi è, dove sta la sua icona, che icona nostra per quale icona sua
        this._regole = [
            {
                nome: 'tilingshell',
                vale: voce => voce.ruolo === 'tilingshell@ferrarodomenico.com',
                icona: voce => primaIcona(voce.button, i => percorso(i.gicon).endsWith('/icons/indicator-symbolic.svg')),
                sostituto: gicon => percorso(gicon).endsWith('/icons/indicator-symbolic.svg') ? this._file('vassoio-tiling') : null,
            },
            {
                nome: 'gdrive',
                vale: voce => voce.ruolo === 'gdrive-linux@codlab.de',
                icona: voce => primaIcona(voce.button, i => /\/gdrive-linux-[a-z]+-symbolic\.svg$/.test(percorso(i.gicon))),
                sostituto: gicon => {
                    const m = /\/gdrive-linux-(ok|sync|error|off)-symbolic\.svg$/.exec(percorso(gicon));
                    return m ? this._file(`vassoio-gdrive-${m[1]}`) : null;
                },
                // la famiglia mista: gdrive colora l'intera icona (verde/blu/rosso); a filo il colore è quello della
                // barra e lo stato è nella forma del glifo (spunta, frecce, «!», trattino)
                togliClassi: /^gdrive-linux-(ok|sync|error|off)$/,
            },
            {
                // GPaste carica per NOME (org.gnome.GPaste.Ui-symbolic di hicolor): la tavoletta piena con l'orologio
                nome: 'gpaste',
                vale: voce => voce.ruolo === 'gpaste',
                icona: voce => primaIcona(voce.button, i => nomi(i.gicon).includes('org.gnome.GPaste.Ui-symbolic')),
                sostituto: gicon => nomi(gicon).includes('org.gnome.GPaste.Ui-symbolic') ? this._file('vassoio-gpaste') : null,
            },
            {
                nome: 'cardinal',
                vale: voce => voce.chiave === 'sni:cardinal-assistenza' && Boolean(voce.button.icon),
                icona: voce => voce.button.icon,
                sostituto: (_gicon, voce) => {
                    const stato = statoCardinal(voce.button._indicator?.title);
                    // AppIndicator presuppone un Gio.EmblemedIcon (appIndicator.js _setGicon: get_icon())
                    return stato ? new Gio.EmblemedIcon({gicon: this._file(`vassoio-cardinal-${stato}`)}) : null;
                },
                segnali: voce => [[voce.button._indicator, 'accessible-name'], [voce.button._indicator, 'reset']],
            },
        ];
    }

    _file(nome) {
        return new Gio.FileIcon({file: Gio.File.new_for_path(`${this._icone}/${nome}-symbolic.svg`)});
    }

    _nostra(gicon) {
        return percorso(gicon).startsWith(`${this._icone}/`);
    }

    // chiamata dal vassoio per ogni voce, a ogni disposizione: lega una volta sola per icona
    segui(voce) {
        this._convergenza.segui(voce);
        const regola = this._regole.find(r => r.vale(voce));
        if (!regola)
            return;
        const icona = regola.icona(voce);
        if (!icona || this._legate.has(icona))
            return;
        const stato = {regola, voce, icona, sua: icona.gicon, contenuto: icona.content ?? null, classiTolte: [],
            esterni: [], dentro: false};
        stato.applica = () => this._applica(stato);
        // AppIndicator disegna le pixmap come `content` dell'attore e mette gicon a null (appIndicator.js
        // _createIconFromPixmap → _setImageContent): si seguono tutte e due
        icona.connectObject(
            'notify::gicon', stato.applica,
            'notify::content', stato.applica,
            'destroy', () => {
                for (const oggetto of stato.esterni)
                    oggetto.disconnectObject?.(stato);
                stato.esterni = [];
                this._legate.delete(icona);
            }, stato);
        if (regola.togliClassi)
            icona.connectObject('notify::style-class', stato.applica, stato);
        for (const [oggetto, segnale] of regola.segnali?.(voce) ?? []) {
            if (oggetto?.connectObject) {
                oggetto.connectObject(segnale, stato.applica, stato);
                stato.esterni.push(oggetto);
            }
        }
        this._legate.set(icona, stato);
        stato.applica();
    }

    _applica(stato) {
        if (stato.dentro)
            return;
        const {icona, regola} = stato;
        stato.dentro = true;
        try {
            if (!this._nostra(icona.gicon))
                stato.sua = icona.gicon;           // l'ultima icona scritta dal proprietario (anche null)
            if (icona.content)
                stato.contenuto = icona.content;   // la sua pixmap: noi il content lo togliamo soltanto
            if (!this._attiva) {
                this._rimetti(stato);
                return;
            }
            const nostra = regola.sostituto(stato.sua, stato.voce);
            if (!nostra) {                         // stato sconosciuto: l'icona del proprietario
                this._rimetti(stato);
                return;
            }
            if (icona.content)
                icona.content = null;
            if (impronta(icona.gicon) !== impronta(nostra))
                icona.gicon = nostra;
            if (regola.togliClassi) {
                for (const c of (icona.style_class ?? '').split(/\s+/).filter(x => regola.togliClassi.test(x))) {
                    icona.remove_style_class_name(c);
                    stato.classiTolte = [c];       // una sola classe di stato alla volta: si ricorda l'ultima
                }
            }
        } finally {
            stato.dentro = false;
        }
    }

    _rimetti(stato) {
        const {icona} = stato;
        if (this._nostra(icona.gicon))
            icona.gicon = stato.sua;
        if (stato.contenuto && !icona.content)
            icona.content = stato.contenuto;
        for (const c of stato.classiTolte)
            icona.add_style_class_name(c);
        stato.classiTolte = [];
    }

    // per le prove e per il menu ⌄: che icona mostra adesso quella voce
    iconaDi(voce) {
        for (const stato of this._legate.values()) {
            if (stato.voce.button === voce.button)
                return stato.icona.gicon;
        }
        return null;
    }

    stato() {
        return [...this._legate.values()].map(s => ({
            regola: s.regola.nome, chiave: s.voce.chiave, mappata: s.voce.button.is_mapped(),
            mostrata: percorso(s.icona.gicon) || impronta(s.icona.gicon),
            sua: percorso(s.sua) || impronta(s.sua), classi: s.icona.style_class ?? '',
        }));
    }

    destroy() {
        if (this._finito)
            return;
        this._finito = true;
        this._settings.disconnectObject(this);
        this._convergenza.destroy();
        for (const stato of this._legate.values()) {
            stato.icona.disconnectObject(stato);
            for (const oggetto of stato.esterni)
                oggetto.disconnectObject?.(stato);
            stato.dentro = true;
            this._rimetti(stato);
        }
        this._legate.clear();
    }
}
