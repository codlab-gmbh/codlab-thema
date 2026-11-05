// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
// Launchpad CodLab — prototipo (31.10.2026). Licenza GPL-3.0-or-later.
//
// Cosa cambia, e solo finché l'estensione è attiva:
//  1. Super da solo (overlay-key): griglia delle app a tutto schermo; se la panoramica è già aperta, la chiude.
//     Il gestore della Shell (overviewControls.js, «overlay-key») viene BLOCCATO, non tolto: disable() lo sblocca.
//  2. Ogni apertura della griglia dalla scrivania (Super, Super+A, pulsante delle app del dock) è «modo Launchpad»:
//     la griglia non sale dal basso (la sua scatola è già al suo posto) ma entra con lo zoom del Launchpad (scala
//     1,08 → 1 e dissolvenza), la scrivania svanisce sul posto e a grandezza piena invece di rimpicciolirsi verso
//     l'alto, e si esce allo stesso modo; svanita, non prende né clic né rilasci (cartelle, riordino). Icone della
//     griglia a 128 punti (di serie 96).
//  3. Nel modo Launchpad spegnere il pulsante delle app (Esc a ricerca vuota, il pulsante del dock, Super+A) chiude
//     tutto, invece di passare dalla panoramica delle finestre. Un solo punto: il gestore del pulsante della Shell.
// La panoramica delle finestre (Mission Control) resta all'angolo attivo e a toggle-overview.
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as WorkspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const {ControlsState} = OverviewControls;
const ZOOM = 1.08;
const ICONA = 128;           // icone della griglia in punti logici (di serie 96): più vicine al Launchpad
const SVANISCE = 0.4;        // la scrivania svanisce nel primo 40 % del percorso scrivania → griglia

export default class LaunchpadCodlab extends Extension {
    enable() {
        this._modo = false;
        const controls = Main.overview._overview.controls;
        this._controls = controls;
        this._a11y = new Gio.Settings({schema_id: 'org.gnome.desktop.a11y.keyboard'});

        // 1. Super: si blocca il gestore della Shell e se ne collega uno nostro
        this._bloccato = GObject.signal_handler_find(global.display, {signalId: 'overlay-key'});
        if (this._bloccato)
            global.display.block_signal_handler(this._bloccato);
        this._superId = global.display.connect('overlay-key', () => {
            if (this._a11y.get_boolean('stickykeys-enable'))
                return;
            if (Main.overview.visible)
                Main.overview.hide();
            else
                Main.overview.showApps();
        });

        // 2. la griglia aperta dalla scrivania = modo Launchpad: Super, Super+A (_toggleAppsPage chiama show(APP_GRID)),
        //    showApps() del pulsante del dock. Si avvolge show() sull'istanza; disable() toglie la proprietà.
        const showOrig = Object.getPrototypeOf(Main.overview).show;
        Main.overview.show = (state = ControlsState.WINDOW_PICKER) => {
            if (!Main.overview.visible && state === ControlsState.APP_GRID)
                this._modo = true;
            return showOrig.call(Main.overview, state);
        };

        const layout = controls.layout_manager;
        this._layout = layout;
        const boxOrig = layout._getAppDisplayBoxForState;
        layout._getAppDisplayBoxForState = (state, ...resto) =>
            boxOrig.call(layout, this._modo ? ControlsState.APP_GRID : state, ...resto);

        // la scrivania resta dov'è (scatola dello stato HIDDEN) e svanisce: niente rimpicciolimento verso l'alto
        const wd = controls._workspacesDisplay;
        this._wd = wd;
        wd.allocate = box => {
            if (this._modo) {
                const pieno = layout._cachedWorkspaceBoxes?.get(ControlsState.HIDDEN);
                if (pieno)
                    box = pieno;
            }
            Clutter.Actor.prototype.allocate.call(wd, box);
        };
        // ...e dentro la sua scatola resta UNA scrivania a grandezza piena (aree di lavoro in «fit single»). Con quello
        // di serie della griglia («fit all») le aree si rimpicciolivano una accanto all'altra mentre svanivano: la doppia
        // immagine con quattro finestre (A4, 01.11). ControlsManager._update() lo chiede qui.
        const fitOrig = controls._getFitModeForState;
        controls._getFitModeForState = state => this._modo ? WorkspacesView.FitMode.SINGLE : fitOrig.call(controls, state);

        const app = controls._appDisplay;
        this._app = app;
        const griglia = app._grid?.layout_manager;
        this._griglia = griglia;
        this._iconaPrima = griglia?.fixed_icon_size ?? -1;
        this._allineaPrima = griglia ? [griglia.page_halign, griglia.page_valign] : null;
        if (griglia) {
            griglia.fixed_icon_size = ICONA;
            griglia.page_halign = Clutter.ActorAlign.CENTER;     // con poche voci la pagina sta al centro,
            griglia.page_valign = Clutter.ActorAlign.CENTER;     // come il Launchpad, non in alto a sinistra
        }
        // Lo strato della scrivania nel modo Launchpad, in un punto solo: opacità dal percorso e, quando è svanita, né
        // visibile né reattiva (come fa la Shell durante una ricerca) né scelta sotto il puntatore. Chiusura 2: prima
        // restava invisibile ma SOPRA la griglia, e il clic sulle icone lo prendeva lei (il Launchpad si chiudeva senza
        // lanciare l'app); svuotando una ricerca, poi, la Shell la riportava a opacità piena sopra la griglia.
        this._ritaglio = null;
        const ricerca = controls._searchController;
        const adj = controls._stateAdjustment;
        const scrivania = () => {
            if (!this._modo)
                return;
            const p = Math.min(1, Math.max(0, adj.value / ControlsState.APP_GRID));
            const opacita = Math.round(255 * Math.max(0, 1 - p / SVANISCE));
            wd.remove_transition('opacity');
            wd.opacity = opacita;
            const vista = opacita > 0 && !ricerca.searchActive;
            wd.reactive = vista;
            wd.setPrimaryWorkspaceVisible(vista);
            this._ritaglia(!vista);
        };
        // Le animazioni del Launchpad seguono lo stato della panoramica (0 scrivania → 2 griglia), che la Shell anima
        // e rallenta da sé: un ease() proprio su attori non ancora mappati verrebbe saltato (environment.js, «mapped»).
        // Griglia: zoom 1,08 → 1 e dissolvenza; scrivania: svanisce nel primo 40 % del percorso, sul posto.
        adj.connectObject('notify::value', () => {
            if (!this._modo)
                return;
            const p = Math.min(1, Math.max(0, adj.value / ControlsState.APP_GRID));
            const scala = ZOOM - (ZOOM - 1) * p;
            app.set_pivot_point(0.5, 0.5);
            app.set_scale(scala, scala);
            app.opacity = Math.round(255 * p);
            scrivania();
        }, this);
        const ricercaOrig = controls._onSearchChanged;
        controls._onSearchChanged = () => {
            ricercaOrig.call(controls);
            scrivania();
        };
        Main.overview.connectObject('hidden', () => {
            this._modo = false;
            app.set_scale(1, 1);
            app.opacity = 255;
            this._scrivaniaDiSerie();
        }, this);

        // 3. un solo punto: nel Launchpad il pulsante delle app spento (Esc a ricerca vuota della Shell, il pulsante del
        //    dock, Super+A) chiude tutto invece di mostrare le finestre. Il gestore della Shell lo chiama sull'istanza
        //    (overviewControls.js, «notify::checked»). Chiusura 2: prima c'erano due punti, un involucro di Esc e un
        //    secondo ascolto del pulsante, e togliere il primo lasciava la prova verde (L2, C2).
        const toggleOrig = controls._onShowAppsButtonToggled;
        controls._onShowAppsButtonToggled = () => {
            if (this._modo && !controls._ignoreShowAppsButtonToggle && !controls.dash.showAppsButton.checked) {
                Main.overview.hide();
                return;
            }
            toggleOrig.call(controls);
        };
    }

    _scrivaniaDiSerie() {
        if (!this._wd)
            return;
        this._wd.opacity = 255;
        this._wd.reactive = true;
        this._wd.setPrimaryWorkspaceVisible(true);
        this._ritaglia(false);
    }

    // Chiusura 3 (01.11): Firefox trascinato su Impostazioni non creava la cartella. Il DND sceglie il bersaglio
    // del rilascio (e del passaggio) in PickMode.ALL (dnd.js, _pickTargetActor e _dragActorDropped), che ignora
    // «reactive» e l'opacità: la scrivania svanita, ultima figlia dei controlli e nel modo Launchpad grande quanto lo
    // schermo, restava sopra la griglia e prendeva il rilascio (cartelle, uscita da una cartella, riordino). Nasconderla
    // con hide() no: WorkspacesDisplay.vfunc_hide distrugge le viste delle aree e scollega i segnali della panoramica
    // (workspacesView.js), e all'uscita la scrivania non potrebbe ricomparire sul posto. Un ritaglio vuoto la toglie
    // dalla scelta e dal disegno senza toccare viste, allocazione e ordine dei figli; si toglie appena la scrivania
    // torna visibile, quando la panoramica si chiude (prima di Super+W) e al disable.
    _ritaglia(si) {
        const wd = this._wd;
        if (!wd || si === (this._ritaglio !== null))
            return;
        if (si) {
            this._ritaglio = wd.has_clip ? wd.get_clip() : [];       // un ritaglio di altri si rimette com'era
            wd.set_clip(0, 0, 0, 0);
        } else {
            const prima = this._ritaglio;
            this._ritaglio = null;
            if (prima.length)
                wd.set_clip(...prima);
            else
                wd.remove_clip();
        }
    }

    disable() {
        if (this._superId)
            global.display.disconnect(this._superId);
        this._superId = 0;
        if (this._bloccato)
            global.display.unblock_signal_handler(this._bloccato);
        this._bloccato = 0;
        delete Main.overview.show;                          // torna al metodo della classe
        delete this._layout?._getAppDisplayBoxForState;      // torna al metodo della classe
        if (this._controls) {
            delete this._controls._getFitModeForState;
            delete this._controls._onSearchChanged;
            delete this._controls._onShowAppsButtonToggled;
        }
        Main.overview.disconnectObject(this);
        this._controls?._stateAdjustment.disconnectObject(this);
        if (this._app) {
            this._app.set_scale(1, 1);
            this._app.opacity = 255;
        }
        if (this._wd) {
            delete this._wd.allocate;                        // torna al metodo di Clutter.Actor
            this._scrivaniaDiSerie();
        }
        if (this._griglia) {
            this._griglia.fixed_icon_size = this._iconaPrima;
            [this._griglia.page_halign, this._griglia.page_valign] = this._allineaPrima;
        }
        this._app = this._wd = this._griglia = this._layout = this._controls = this._a11y = null;
        this._modo = false;
    }
}
