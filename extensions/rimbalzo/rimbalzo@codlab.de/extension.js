// Rimbalzo nel dock — prototipo (31.10.2026). Licenza GPL-2.0-or-later.
// Shell.AppSystem «app-state-changed»: un'app che passa a STARTING fa rimbalzare la sua icona nei dock di Dash to Dock
// (contenitori «dashtodockContainer») e nella dash della panoramica; il salto in corso finisce quando l'app è pronta.
//
// L'icona di un'app NON fissata compare solo quando l'app è pronta (RUNNING): Dash to Dock non mostra le app che stanno
// partendo. Misurato nell'isola il 31.10 (22:30–22:34, PSI cpu 48–66 %): STARTING, poi uno STOPPED transitorio 1,3–1,5 s
// dopo il lancio, poi RUNNING (Orologi lenti: 4,4 s). La ricerca dell'icona segue lo stato: finché l'app sta partendo, e
// per DOPO_MS da quando è pronta.
//
// Chiusura 2 (revisione del 01.11):
//  - un'app FISSATA che parte lenta salta finché non è pronta: lo STOPPED transitorio non ferma più il salto (prima
//    atterrava a ~1,4 s e gli Orologi arrivavano a 7 s senza riscontro). Un lancio che non diventa mai pronto smette
//    FINE_MS dopo, come la sequenza d'avvio di mutter.
//  - le icone possono sparire mentre saltano (Dash to Dock le ricrea; spegnendo un'estensione la Shell spegne prima
//    quelle caricate dopo): ogni icona si segue col suo «destroy» e dopo non si tocca più. Prima disable() toccava
//    St.Icon distrutte (Gjs-CRITICAL) e un'icona distrutta in volo lasciava il lancio appeso: niente più salti per
//    quell'app fino al disable.
//  - si salta solo su icone mappate, e un ease() che finisce dentro la chiamata (attore fuori scena, animazioni
//    spente: environment.js gli dà durata 0) chiude il salto invece di richiamarsi. Trovato scrivendo questa chiusura:
//    col limite a tempo la dash nascosta della panoramica faceva ricorrere _salta() all'infinito (i 6 salti di prima
//    lo coprivano).
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const SALTO = 0.45;          // altezza del salto in frazioni dell'icona (il Dock di macOS salta di circa metà icona)
const SU_MS = 240;
const GIU_MS = 240;
const FINE_MS = 15000;       // un lancio mai pronto smette di saltare 15 s dopo (mutter: 15 s di sequenza d'avvio)
const DOPO_MS = 3000;        // dopo «pronta» Dash to Dock aggiunge l'icona in un idle: la si cerca ancora per 3 s
const ora = () => GLib.get_monotonic_time() / 1000;

export default class Rimbalzo extends Extension {
    enable() {
        this._salti = new Map();     // app → {vivo, scade, idle, icone: Map(icona in volo → id del suo «destroy»)}
        Shell.AppSystem.get_default().connectObject('app-state-changed', (_s, app) => this._cambia(app), this);
    }

    _cambia(app) {
        let stato = this._salti.get(app);
        if (app.state === Shell.AppState.STARTING) {
            if (!stato) {
                stato = {vivo: true, scade: ora() + FINE_MS, idle: 0, icone: new Map()};
                this._salti.set(app, stato);
            }
            stato.vivo = true;                              // (di nuovo) in partenza: si salta finché non è pronta
            if (!stato.icone.size)
                this._cerca(app, stato, stato.scade);      // app fissata: l'icona c'è già e salta subito
            return;
        }
        if (!stato)
            return;
        if (app.state === Shell.AppState.RUNNING) {
            stato.vivo = false;                             // pronta: il salto in corso atterra, poi basta
            if (!stato.icone.size)
                this._cerca(app, stato, ora() + DOPO_MS);   // app non fissata: la sua icona arriva adesso
        }
        // STOPPED: transitorio (un'attivazione D-Bus lenta, poi RUNNING) o lancio fallito. Il salto continua e la
        // ricerca pure, fino a «scade»: RUNNING li chiude prima.
    }

    _icone(app) {
        const icone = [];
        const visita = attore => {
            for (const figlio of attore.get_children()) {
                if (figlio.app === app && figlio.icon?.icon) {
                    if (figlio.icon.icon.mapped)             // fuori scena (dash della panoramica nascosta) non salta
                        icone.push(figlio.icon.icon);        // AppIcon → BaseIcon → St.Icon (il pallino resta fermo)
                } else {
                    visita(figlio);
                }
            }
        };
        for (const radice of Main.layoutManager.uiGroup.get_children()) {
            if (radice.name === 'dashtodockContainer')
                visita(radice);
        }
        const dash = Main.overview.dash;
        if (dash)
            visita(dash);
        return icone;
    }

    _cerca(app, stato, fino) {
        // ogni 100 ms fino a «fino»; trovata, l'icona rimbalza almeno una volta anche se l'app è già pronta (come macOS)
        if (stato.idle)
            clearTimeout(stato.idle);
        const prova = () => {
            stato.idle = 0;
            const nuove = this._icone(app).filter(icona => !stato.icone.has(icona));
            for (const icona of nuove)
                stato.icone.set(icona, icona.connect('destroy', () => this._persa(app, stato, icona)));
            if (nuove.length) {
                for (const icona of nuove)
                    this._salta(app, stato, icona);
            } else if (ora() < fino) {
                stato.idle = setTimeout(prova, 100);
            } else if (!stato.icone.size) {
                this._chiudi(app, stato);                   // nessuna icona nei dock: niente salto
            }
        };
        stato.idle = setTimeout(prova, 30);
    }

    _salta(app, stato, icona) {
        if (!icona.mapped) {
            this._atterra(app, stato, icona);             // uscita di scena mentre saltava (il dock rifatto)
            return;
        }
        const h = icona.height || 48;
        let subito = true;                                  // l'ease finito dentro la chiamata: niente ricorsione
        icona.ease({
            translation_y: -Math.round(h * SALTO), duration: SU_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => icona.ease({
                translation_y: 0, duration: GIU_MS, mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    if (subito)
                        this._atterra(app, stato, icona, false);   // animazioni spente: niente salti, si chiude
                    else if (stato.vivo && ora() < stato.scade)
                        this._salta(app, stato, icona);
                    else
                        this._atterra(app, stato, icona);
                },
            }),
        });
        subito = false;
    }

    _atterra(app, stato, icona, ancora = true) {
        // a terra (o fuori scena: viva, si rimette a 0). L'ultima icona chiude il lancio, o se l'app sta ancora
        // partendo si cerca di nuovo (il dock rifatto ha icone nuove)
        const id = stato.icone.get(icona);
        stato.icone.delete(icona);
        if (id)
            icona.disconnect(id);
        icona.remove_transition('translation-y');
        icona.translation_y = 0;
        if (stato.icone.size || this._salti?.get(app) !== stato)
            return;
        if (ancora && stato.vivo && ora() < stato.scade)
            this._cerca(app, stato, stato.scade);
        else
            this._chiudi(app, stato);
    }

    _persa(app, stato, icona) {
        // distrutta mentre saltava: esce dalla scheda e non si tocca più (nemmeno per staccarle il segnale). Se l'app
        // sta ancora partendo si cerca l'icona nuova di Dash to Dock, se no il lancio finisce qui
        stato.icone.delete(icona);
        if (stato.icone.size || this._salti?.get(app) !== stato)
            return;
        if (stato.vivo && ora() < stato.scade)
            this._cerca(app, stato, stato.scade);
        else
            this._chiudi(app, stato);
    }

    _chiudi(app, stato) {
        if (stato.idle)
            clearTimeout(stato.idle);
        stato.idle = 0;
        if (this._salti?.get(app) === stato)
            this._salti.delete(app);
    }

    disable() {
        Shell.AppSystem.get_default().disconnectObject(this);
        for (const stato of this._salti.values()) {
            stato.vivo = false;
            if (stato.idle)
                clearTimeout(stato.idle);
            stato.idle = 0;
            for (const [icona, id] of stato.icone) {       // solo icone vive: le distrutte sono già uscite dalla scheda
                if (id)
                    icona.disconnect(id);
                icona.remove_transition('translation-y');
                icona.translation_y = 0;
            }
            stato.icone.clear();
        }
        this._salti = null;
    }
}
