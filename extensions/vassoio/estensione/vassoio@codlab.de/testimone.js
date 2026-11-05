// Testimone passivo di Mochi (difetto 4, «Mochi vero non osservato»): quando l'utente apre e chiude la
// panoramica da sé, guarda l'attore di Mochi e annota com'era. Non cambia niente: legge visible e is_mapped().
// Un ciclo conta solo se Mochi era in scena (attore visibile): altrimenti «non in scena», nessuna prova.
// Esito in $XDG_STATE_HOME/vassoio/testimone-mochi.json (ultimi 20 cicli) e una riga nel giornale a ogni cambio:
//   journalctl --user -b -g 'vassoio: testimone Mochi'
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MOCHI = 'mochi-flotta@codlab.de';
const TENUTI = 20;

function ora() {
    return GLib.DateTime.new_now_local().format('%F %T %Z');
}

export class Testimone {
    constructor(settings) {
        this._settings = settings;
        this._cartella = GLib.build_filenamev([GLib.get_user_state_dir(), 'vassoio']);
        this._file = GLib.build_filenamev([this._cartella, 'testimone-mochi.json']);
        this._cicli = [];
        this._ultimoEsito = null;
        this._ciclo = null;
        this._attese = new Set();      // una per ciclo: un ciclo nuovo non cancella l'annotazione di quello prima
        Main.overview.connectObject(
            'shown', () => this._inPanoramica(),
            'hidden', () => this._dopo(), this);
    }

    _attore() {
        const ext = Main.extensionManager.lookup(MOCHI);
        return {ext, attore: ext?.stateObj?._automa?.attore?.actor ?? null};
    }

    _inPanoramica() {
        if (!this._settings.get_boolean('testimone-mochi'))
            return;
        const {ext, attore} = this._attore();
        this._ciclo = {aperta: ora(), estensione: ext ? ext.state : 'assente'};
        if (!attore) {
            this._ciclo.esito = ext ? 'attore non trovato' : 'Mochi assente';
            return;
        }
        this._ciclo.in_scena = attore.visible;
        this._ciclo.mappata_in_panoramica = attore.is_mapped();
    }

    _dopo() {
        const ciclo = this._ciclo;
        this._ciclo = null;
        if (!ciclo)
            return;
        // Mochi rimostra il suo velo su 'hidden': si guarda un attimo dopo, quando tutti hanno risposto
        const attesa = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            this._attese.delete(attesa);
            const {attore} = this._attore();
            if (!ciclo.esito) {
                ciclo.chiusa = ora();
                ciclo.in_scena_dopo = attore?.visible ?? null;
                ciclo.mappata_dopo = attore?.is_mapped() ?? null;
                if (!ciclo.in_scena)
                    ciclo.esito = 'non in scena';               // nessuna prova: Mochi non c'era
                else if (ciclo.mappata_in_panoramica)
                    ciclo.esito = 'VISIBILE in panoramica';     // il difetto: Mochi sopra la panoramica
                else if (ciclo.in_scena_dopo && !ciclo.mappata_dopo)
                    ciclo.esito = 'non ripristinata';           // sparita anche dopo
                else
                    ciclo.esito = 'nascosta in panoramica e ripristinata';
            }
            this._annota(ciclo);
            return GLib.SOURCE_REMOVE;
        });
        this._attese.add(attesa);
    }

    _annota(ciclo) {
        this._cicli.push(ciclo);
        this._cicli = this._cicli.slice(-TENUTI);
        if (ciclo.esito !== this._ultimoEsito) {
            this._ultimoEsito = ciclo.esito;
            console.log(`vassoio: testimone Mochi ${ciclo.esito} (${ciclo.aperta})`);
        }
        this._scrivi();
    }

    // una scrittura alla volta: se ne arriva un'altra mentre la prima è in corso, si riscrive dopo con l'ultimo stato
    _scrivi() {
        if (this._scrivendo) {
            this._ancora = true;
            return;
        }
        this._scrivendo = true;
        this._ancora = false;
        try {
            GLib.mkdir_with_parents(this._cartella, 0o700);
            const testo = `${JSON.stringify({estensione: MOCHI, cicli: this._cicli}, null, 1)}\n`;
            Gio.File.new_for_path(this._file).replace_contents_bytes_async(new GLib.Bytes(new TextEncoder().encode(testo)),
                null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, r) => {
                    try {
                        f.replace_contents_finish(r);
                    } catch (e) {
                        console.warn(`vassoio: testimone Mochi, file non scritto: ${e.message}`);
                    }
                    this._scrivendo = false;
                    if (this._ancora && !this._finito)
                        this._scrivi();
                });
        } catch (e) {
            this._scrivendo = false;
            console.warn(`vassoio: testimone Mochi, file non scritto: ${e.message}`);
        }
    }

    stato() {
        return {cicli: this._cicli, file: this._file};
    }

    destroy() {
        this._finito = true;
        Main.overview.disconnectObject(this);
        for (const attesa of this._attese)
            GLib.source_remove(attesa);
        this._attese.clear();
    }
}
