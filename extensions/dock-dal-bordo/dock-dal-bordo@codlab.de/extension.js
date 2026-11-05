// Dock dal bordo (30.10.2026).
//
// La richiesta: sul secondo monitor (2K) il dock non deve stare a schermo, ma si deve poter richiamare spingendo il
// puntatore verso il basso, come su macOS.
//
// Dash to Dock 110 mette un dock per monitor (multi-monitor), ma «nascondi automaticamente» e «intellihide» sono chiavi
// GLOBALI: con intellihide acceso il dock del 2K resta a schermo finché nessuna finestra dell'app attiva lo copre, cioè
// quasi sempre. Ogni dock però ha proprietà GObject sue (is-main, intellihide-enabled, autohide-enabled, dock-state),
// che Dash to Dock riscrive dalle chiavi in _updateVisibilityMode() (alla nascita del dock e a ogni cambio di chiave).
//
// La cura: sui dock NON principali intellihide-enabled resta false. Rimane il solo «nascondi automaticamente» di Dash to
// Dock, con la sua barriera a pressione sul bordo basso: il dock compare quando il puntatore spinge sul bordo e sparisce
// quando lo lascia. Il dock principale (il 4K) non si tocca. Niente prototipi né metodi sostituiti: le proprietà
// pubbliche dei dock e il loro metodo pubblico updateDashVisibility(); disable() rende i dock a Dash to Dock.
//
// Una volta sola, al primo avvio dopo la posa (segno ~/.config/meraviglioso/dock-dal-bordo-al-login), riaccende i dock
// per monitor (multi-monitor): fino al login restano spenti, perché senza questa estensione il dock del 2K starebbe
// fisso. Lo fa solo dopo aver visto un dock con le proprietà attese (se Dash to Dock cambiasse, il 2K resta senza dock)
// e fuori dal gestore del segnale: Dash to Dock rifà i dock quando la chiave cambia, e non va fatto mentre uno di loro
// sta ancora entrando nella Chrome. La ricevuta va in ~/.config/meraviglioso/.fatto-dock-dal-bordo.
//
// Versione 2 (01.11.2026): i 438 avvisi
// «st_widget_get_theme_node called on the widget [… DashToDock …] which is not in the stage» del login del 31.10
// (due ondate da 219). Causa provata nell'isola (chiusura 1): con multi-monitor true Dash to Dock crea il dock del
// monitor secondario mentre Main.layoutManager._startingUp è vero; quel dock entra nello stage solo a 'startup-complete',
// e la panoramica allocata nel frattempo gli chiede la misura. La cura: finché la Shell si avvia, multi-monitor resta
// spento (solo il dock principale, che è nello stage); a 'startup-complete' (in un idle) si riaccende, e il dock del 2K
// nasce a Shell avviata, subito nello stage. Vale sia al login (multi-monitor già vero all'abilitazione) sia per chi lo
// accende durante l'avvio. Prima di spegnerlo si scrive il segno ~/.config/meraviglioso/dock-dal-bordo-mm-sospeso: se la
// Shell cade prima di 'startup-complete', all'avvio dopo multi-monitor si riaccende comunque (il segno dice che era vero).
// Chi spegne multi-monitor di proposito (prima del login) non viene contraddetto: il rinvio vale solo se era vero. La
// ricevuta del rinvio va in ~/.config/meraviglioso/.fatto-dock-fine-avvio (ora del rinvio e del ripristino).
// Il rinvio dall'estensione da solo NON basta (misurato nell'isola il 01.11, 01:41: 219 avvisi in un avvio su tre):
// Dash to Dock viene abilitata prima di questa estensione (ordine delle cartelle, non della lista) e crea il dock del 2K
// subito; se la panoramica si alloca prima del rinvio, gli avvisi ci sono. Per questo la versione 2 ha anche un servizio
// utente PRIMA della Shell (dock-fine-avvio-prima-della-shell.service): se multi-monitor è vero lo spegne e scrive il
// segno; la Shell parte con il solo dock principale, e questa estensione, trovato il segno durante l'avvio, riaccende
// multi-monitor a 'startup-complete'. Il segno trovato a Shell già avviata (caduta prima del ripristino) si onora subito.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const DTD = 'dash-to-dock@micxgx.gmail.com';
const SCHEMA_DTD = 'org.gnome.shell.extensions.dash-to-dock';
const NASCOSTO = 0, MOSTRATO = 2;      // State di docking.js: HIDDEN 0, SHOWING 1, SHOWN 2, HIDING 3

function eDock(a) {
    return a?.name === 'dashtodockContainer' && 'isMain' in a && 'intellihideEnabled' in a &&
        'autohideEnabled' in a && 'dockState' in a && typeof a.updateDashVisibility === 'function';
}

function inStato(nome) {
    return GLib.build_filenamev([GLib.get_user_config_dir(), 'meraviglioso', nome]);
}

function impostazioniDtd() {
    const fonte = Gio.SettingsSchemaSource.get_default();
    let schema = fonte?.lookup(SCHEMA_DTD, true);
    if (!schema) {
        const dir = Main.extensionManager.lookup(DTD)?.dir?.get_child('schemas');
        if (dir?.query_exists(null))
            schema = Gio.SettingsSchemaSource.new_from_directory(dir.get_path(), fonte, false).lookup(SCHEMA_DTD, false);
    }
    if (!schema)
        throw new Error(`schema ${SCHEMA_DTD} assente`);
    return new Gio.Settings({settings_schema: schema});
}

function puntatoreSul(dock) {
    const [x, y] = global.get_pointer();
    const [ox, oy] = dock.get_transformed_position();
    const [w, h] = dock.get_transformed_size();
    return x >= ox && x < ox + w && y >= oy && y < oy + h;
}

function scriviJson(nome, dati) {
    GLib.file_set_contents(inStato(nome), `${JSON.stringify(dati)}\n`);
}

export default class DockDalBordo extends Extension {
    enable() {
        this._docks = new Map();
        this._segnoVisto = false;
        this._idMulti = 0;
        this._idAvvio = 0;
        this._idFineAvvio = 0;
        this._idChiave = 0;
        this._rinvio = null;
        this._fineAvvio();
        const ui = Main.layoutManager.uiGroup;
        // un dock entra nella Chrome (addChrome → uiGroup) quando nasce a sessione avviata, a fine avvio
        // («startup-complete») e quando cambia dock-fixed: lo si governa appena c'è
        this._idFiglio = ui.connect('child-added', (_g, a) => {
            if (eDock(a))
                this._governa(a);
        });
        ui.get_children().filter(eDock).forEach(d => this._governa(d));
    }

    disable() {
        Main.layoutManager.uiGroup.disconnect(this._idFiglio);
        if (this._idMulti)
            GLib.source_remove(this._idMulti);
        this._idMulti = 0;
        if (this._idAvvio)
            Main.layoutManager.disconnect(this._idAvvio);
        if (this._idFineAvvio)
            GLib.source_remove(this._idFineAvvio);
        if (this._idChiave)
            this._impostazioni?.disconnect(this._idChiave);
        this._idAvvio = this._idFineAvvio = this._idChiave = 0;
        // spenta durante l'avvio con multi-monitor rinviato: lo si rende subito (il segno resta solo se la scrittura fallisce)
        if (this._rinvio)
            this._ripristina('disable');
        const docks = this._docks;
        this._docks = null;
        // a Dash to Dock il modo che scrive lui dalle chiavi (_updateVisibilityMode): intellihide se non è fisso né
        // nascosto a mano. Si legge dalle chiavi e non da ciò che si è visto passare: la notifica di una scrittura fatta
        // dentro il gestore di notify::intellihide-enabled arriva DOPO il gestore (provato nell'isola il 30.10, 17:53)
        let voluto = null;
        try {
            const s = impostazioniDtd();
            voluto = !s.get_boolean('dock-fixed') && !s.get_boolean('manualhide') && s.get_boolean('intellihide');
        } catch (e) {
            logError(e, 'dock-dal-bordo: chiavi di Dash to Dock illeggibili, i dock restano come sono');
        }
        for (const [dock, ids] of docks) {
            ids.forEach(id => dock.disconnect(id));
            if (voluto) {
                dock.intellihideEnabled = true;
                dock.updateDashVisibility();
            }
        }
    }

    _governa(dock) {
        this._multiMonitorAlLogin();
        if (dock.isMain || this._docks.has(dock))
            return;
        this._docks.set(dock, [
            dock.connect('notify::intellihide-enabled', () => this._dalBordo(dock)),
            dock.connect('destroy', () => this._docks?.delete(dock)),
        ]);
        this._dalBordo(dock);
    }

    _dalBordo(dock) {
        // false: già solo dal bordo, oppure lo vuole Dash to Dock (dock fisso, nascosto a mano, intellihide spento),
        // oppure è la notifica della nostra stessa scrittura, che GObject consegna dopo questo gestore
        if (!dock.intellihideEnabled)
            return;
        dock.intellihideEnabled = false;       // il dock spegne il suo Intellihide (notify::intellihide-enabled)
        // Nato a sessione avviata, un dock parte a schermo (slide-x 1) con dock-state HIDDEN: col solo «nascondi
        // automaticamente» _animateOut() esce subito per lo stato HIDDEN e il dock resterebbe a schermo fino al primo
        // passaggio del puntatore. Se il puntatore non è sul dock, lo si dichiara mostrato: updateDashVisibility() lo
        // nasconde e rimette la barriera del bordo.
        if (dock.dockState === NASCOSTO && !puntatoreSul(dock))
            dock.dockState = MOSTRATO;
        dock.updateDashVisibility();
    }

    _fineAvvio() {
        // versione 2: multi-monitor spento finché la Shell si avvia, riacceso a 'startup-complete'
        try {
            this._impostazioni = impostazioniDtd();
        } catch (e) {
            logError(e, 'dock-dal-bordo: chiavi di Dash to Dock illeggibili, niente rinvio di multi-monitor');
            return;
        }
        const sospeso = Gio.File.new_for_path(inStato('dock-dal-bordo-mm-sospeso'));
        if (sospeso.query_exists(null)) {
            let dal = '(segno illeggibile)';
            try {
                dal = JSON.parse(new TextDecoder().decode(sospeso.load_contents(null)[1])).ora ?? dal;
            } catch (e) {
                logError(e, 'dock-dal-bordo: segno di multi-monitor sospeso illeggibile, lo si onora lo stesso');
            }
            this._rinvio = {ora_rinvio: dal, quando: 'segno'};
            // durante l'avvio (lo ha scritto il servizio prima della Shell): si riaccende a 'startup-complete';
            // a Shell avviata (caduta prima del ripristino, o estensione riaccesa): adesso
            if (!Main.layoutManager._startingUp)
                this._ripristina('segno a Shell avviata');
        }
        this._idChiave = this._impostazioni.connect('changed::multi-monitor', () => this._rinvia('chiave'));
        // il collegamento resta per tutta la vita dell'estensione: la Shell emette 'startup-complete' una volta sola, ma
        // una Shell di prova che rifà l'avvio («meccanismo») lo emette di nuovo
        this._idAvvio = Main.layoutManager.connect('startup-complete', () => {
            if (this._idFineAvvio)
                return;
            // in un idle, fuori dal gestore: Dash to Dock rifà i dock quando la chiave cambia
            this._idFineAvvio = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._idFineAvvio = 0;
                if (this._rinvio)
                    this._ripristina('startup-complete');
                return GLib.SOURCE_REMOVE;
            });
        });
        this._rinvia('abilitazione');
    }

    _rinvia(quando) {
        if (!Main.layoutManager._startingUp || !this._impostazioni.get_boolean('multi-monitor'))
            return;
        const sospeso = Gio.File.new_for_path(inStato('dock-dal-bordo-mm-sospeso'));
        try {
            GLib.mkdir_with_parents(GLib.path_get_dirname(sospeso.get_path()), 0o755);
            scriviJson('dock-dal-bordo-mm-sospeso', {ora: GLib.DateTime.new_now_local().format('%F %T %Z'), quando});
            this._rinvio ??= {ora_rinvio: GLib.DateTime.new_now_local().format('%F %T %Z'), quando};
            this._impostazioni.set_boolean('multi-monitor', false);
            Gio.Settings.sync();
        } catch (e) {
            logError(e, 'dock-dal-bordo: rinvio di multi-monitor');
        }
    }

    _ripristina(perche) {
        try {
            this._impostazioni.set_boolean('multi-monitor', true);
            Gio.Settings.sync();
            scriviJson('.fatto-dock-fine-avvio', {...this._rinvio, ora_ripristino: GLib.DateTime.new_now_local().format('%F %T %Z'),
                perche, multi_monitor_dopo: this._impostazioni.get_boolean('multi-monitor')});
            const sospeso = Gio.File.new_for_path(inStato('dock-dal-bordo-mm-sospeso'));
            if (sospeso.query_exists(null))
                sospeso.delete(null);
            this._rinvio = null;
        } catch (e) {
            logError(e, 'dock-dal-bordo: ripristino di multi-monitor');
        }
    }

    _multiMonitorAlLogin() {
        if (this._segnoVisto)
            return;
        this._segnoVisto = true;
        const segno = Gio.File.new_for_path(inStato('dock-dal-bordo-al-login'));
        if (!segno.query_exists(null))
            return;
        this._idMulti = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idMulti = 0;
            try {
                const s = impostazioniDtd();
                const prima = s.get_boolean('multi-monitor');
                if (!prima && Main.layoutManager._startingUp) {
                    // versione 2: durante l'avvio non si accende, lo farà il ripristino di 'startup-complete'
                    this._rinvio ??= {ora_rinvio: GLib.DateTime.new_now_local().format('%F %T %Z'), quando: 'segno del login'};
                    scriviJson('dock-dal-bordo-mm-sospeso', {ora: this._rinvio.ora_rinvio, quando: 'segno del login'});
                } else if (!prima) {
                    s.set_boolean('multi-monitor', true);
                }
                Gio.Settings.sync();
                const ricevuta = {
                    ora: GLib.DateTime.new_now_local().format('%F %T %Z'), multi_monitor_prima: prima,
                    multi_monitor_dopo: s.get_boolean('multi-monitor') || this._rinvio !== null, segno: segno.get_path(),
                };
                GLib.file_set_contents(inStato('.fatto-dock-dal-bordo'), `${JSON.stringify(ricevuta)}\n`);
                segno.delete(null);
            } catch (e) {
                logError(e, 'dock-dal-bordo: multi-monitor al login');
            }
            return GLib.SOURCE_REMOVE;
        });
    }
}
