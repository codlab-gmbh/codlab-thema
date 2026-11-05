// Il vassoio: ordine, posto (barra o menu ⌄) e doppioni delle icone di stato a destra della barra.
// Non sposta niente fuori dalla barra e non tocca le estensioni altrui: riordina i loro contenitori nel _rightBox,
// nasconde il CONTENITORE (mai il pulsante: AppIndicator usa `visible` per lo stato Passive, Tiling Shell per
// show-indicator) e apre il loro menu VERO ancorato al ⌄ quando l'icona non è in barra.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const RUOLO_FRECCIA = 'vassoio@codlab.de-freccia';
// gli elementi di sistema restano dove li mette la Shell (come l'orologio e il Centro di Controllo sul Mac)
const SISTEMA = new Set(['quickSettings', 'dateMenu', 'a11y', 'keyboard', 'screenRecording', 'screenSharing',
    'dwellClick', 'activities', 'appMenu']);

function chiaveDi(ruolo, button) {
    const id = button._indicator?.id;
    if (typeof id === 'string' && id)
        return `sni:${id}`;
    if (ruolo.startsWith('appindicator-legacy:'))
        return ruolo.replace(/:\d+$/, '');          // la icona legacy cambia pid a ogni avvio
    return ruolo;
}

function nomeDi(ruolo, button) {
    const ind = button._indicator;
    if (ind)
        return String(ind.title || ind.accessibleName || ind.id || ruolo);
    const ext = Main.extensionManager.lookup(ruolo);
    return ext?.metadata?.name ?? button.accessible_name ?? ruolo;
}

function haMenu(button) {
    const menu = button.menu;
    return Boolean(menu) && typeof menu.numMenuItems === 'number' && menu.numMenuItems > 0;
}

export class Vassoio {
    constructor(estensione, settings, uniforma) {
        this._estensione = estensione;
        this._settings = settings;
        this._uniforma = uniforma;
        this._box = Main.panel._rightBox;
        this._seguiti = new Map();          // button → [[oggetto, id]...]
        this._nascostiDaNoi = new Set();    // contenitori che abbiamo nascosto noi
        this._ancorati = new Map();         // menu → {originale, id}
        this._voci = [];
        this._later = 0;
        this._riserva = 0;
        this._dentro = false;
        this._distrutto = false;
        this._ordineIniziale = this._box.get_children();     // per rimettere la barra com'era in disable

        this._freccia = new PanelMenu.Button(0.5, 'Icone nascoste', false);
        this._freccia.add_style_class_name('vassoio-freccia');
        this._freccia.add_child(new St.Icon({
            gicon: new Gio.FileIcon({file: Gio.File.new_for_path(`${estensione.path}/icons/vassoio-freccia-symbolic.svg`)}),
            style_class: 'system-status-icon',
        }));
        this._sezione = new PopupMenu.PopupMenuSection();
        this._freccia.menu.addMenuItem(this._sezione);
        this._freccia.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._freccia.menu.addAction('Disponi le icone…', () => this._estensione.openPreferences());
        this._freccia.menu.connectObject('open-state-changed', (_m, aperto) => {
            if (!aperto)
                return;
            // il menu mostra le chiavi di adesso: una disposizione ancora in coda si fa prima di riempirlo
            // (prova R1: Plex messo nel menu, ⌄ aperto, riga assente)
            if (this._later || this._riserva)
                this._eseguiProgramma();
            this._riempi();
        }, this);
        Main.panel.addToStatusArea(RUOLO_FRECCIA, this._freccia, 0, 'right');

        this._box.connectObject(
            'child-added', () => this._programma(),
            'child-removed', () => this._programma(),
            // la Shell che si chiude distrugge la barra senza disable: da lì in poi non si tocca più niente
            'destroy', () => this._smetti(), this);
        settings.connectObject('changed', (_s, chiave) => {
            if (chiave !== 'visti' && chiave !== 'posti')
                this._programma();
        }, this);
        this._disponi();
    }

    // prima del prossimo ridisegno, una volta sola per giro: un idle a bassa priorità resta in coda finché la Shell
    // ridisegna di continuo (panoramica, menu animati) — misurato nell'isola il 04.11 (bv-dopo, chiavi non applicate).
    // Senza ridisegni il later aspetta: la riserva a 250 ms (priorità normale) dispone comunque; il primo dei due vince
    _programma() {
        if (this._later || this._riserva || this._dentro || this._distrutto)
            return;
        this._later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._later = 0;
            this._eseguiProgramma();
            return GLib.SOURCE_REMOVE;
        });
        this._riserva = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this._riserva = 0;
            this._eseguiProgramma();
            return GLib.SOURCE_REMOVE;
        });
    }

    _togliProgramma() {
        if (this._later)
            global.compositor.get_laters().remove(this._later);
        this._later = 0;
        if (this._riserva)
            GLib.source_remove(this._riserva);
        this._riserva = 0;
    }

    _eseguiProgramma() {
        this._togliProgramma();
        this._disponi();
    }

    _smetti() {
        this._distrutto = true;
        this._togliProgramma();
    }

    _segui(button) {
        if (this._seguiti.has(button))
            return;
        const contenitore = button.container;
        button.connectObject(
            'notify::visible', () => this._programma(),
            'destroy', () => {
                this._seguiti.delete(button);
                this._nascostiDaNoi.delete(contenitore);
                this._programma();
            }, this);
        contenitore.connectObject('notify::visible', () => {
            if (this._nascostiDaNoi.has(contenitore) && contenitore.visible)
                this._programma();      // qualcuno l'ha rimostrato (AppIndicator lo rifà a ogni aggiunta)
        }, this);
        button._indicator?.connectObject?.('accessible-name', () => this._programma(), this);
        this._seguiti.set(button, {contenitore, indicatore: button._indicator ?? null});
    }

    _raccogli() {
        const voci = [];
        const indice = new Map(this._box.get_children().map((a, i) => [a, i]));
        for (const [ruolo, button] of Object.entries(Main.panel.statusArea)) {
            if (!button || SISTEMA.has(ruolo) || ruolo === RUOLO_FRECCIA || !button.container)
                continue;
            if (button.container.get_parent() !== this._box)
                continue;
            voci.push({ruolo, button, chiave: chiaveDi(ruolo, button), nome: nomeDi(ruolo, button),
                sni: Boolean(button._indicator), indice: indice.get(button.container) ?? 0});
        }
        return voci.sort((a, b) => a.indice - b.indice);
    }

    _disponi() {
        if (this._dentro || this._distrutto)
            return;
        this._dentro = true;
        try {
            const ordine = this._settings.get_strv('ordine');
            const nelMenu = new Set(this._settings.get_strv('nel-menu'));
            const doppioni = this._settings.get_boolean('doppioni');
            const voci = this._raccogli();
            const viste = new Set();
            for (const v of voci) {
                this._segui(v.button);
                this._uniforma.segui(v);
                if (doppioni && viste.has(v.chiave))
                    v.posto = 'doppione';
                else if (nelMenu.has(v.chiave))
                    v.posto = 'menu';
                else if (!v.button.visible)
                    v.posto = v.sni ? 'passiva' : (haMenu(v.button) ? 'menu-da-sé' : 'nascosta-da-sé');
                else
                    v.posto = 'barra';
                viste.add(v.chiave);
            }
            // l'ordine: prima le icone nuove (a sinistra, subito visibili), poi quelle in «ordine»
            const rango = v => {
                const i = ordine.indexOf(v.chiave);
                return i < 0 ? -1 : i;
            };
            const ordinate = [...voci].sort((a, b) => rango(a) - rango(b) || a.indice - b.indice);
            for (const v of ordinate) {
                const nascondi = v.posto === 'menu' || v.posto === 'doppione';
                if (nascondi) {
                    this._nascostiDaNoi.add(v.button.container);
                    if (v.button.container.visible)
                        v.button.container.hide();
                } else if (this._nascostiDaNoi.delete(v.button.container) || !v.button.container.visible) {
                    v.button.container.show();
                }
            }
            const sequenza = [this._freccia.container, ...ordinate.map(v => v.button.container)];
            sequenza.forEach((attore, i) => {
                if (this._box.get_child_at_index(i) !== attore)
                    this._box.set_child_at_index(attore, i);
            });
            const nascoste = ordinate.filter(v => v.posto === 'menu' || v.posto === 'menu-da-sé');
            this._freccia.container.visible = nascoste.length > 0;
            this._voci = ordinate;
            this._ricordaViste(ordinate);
        } finally {
            this._dentro = false;
        }
    }

    _ricordaViste(voci) {
        // per le preferenze: il nome senza lo stato («Cardinal Host — SESSIONE APERTA» → «Cardinal Host») e il posto
        const viste = this._settings.get_value('visti').deep_unpack();
        const posti = {};
        let cambiate = false;
        for (const v of voci) {
            if (v.posto === 'doppione' || v.posto === 'passiva')
                continue;
            const nome = v.nome.split(' — ')[0];
            posti[v.chiave] = v.posto;
            if (viste[v.chiave] !== nome) {
                viste[v.chiave] = nome;
                cambiate = true;
            }
        }
        if (cambiate)
            this._settings.set_value('visti', new GLib.Variant('a{ss}', viste));
        const prima = this._settings.get_value('posti').deep_unpack();
        if (JSON.stringify(prima) !== JSON.stringify(posti))
            this._settings.set_value('posti', new GLib.Variant('a{ss}', posti));
    }

    _iconaPerRiga(v) {
        const nostra = this._uniforma.iconaDi(v);
        if (nostra)
            return nostra;
        const icona = v.button.icon ?? v.button.get_first_child();
        const trovata = icona instanceof St.Icon ? icona : (icona?.get_children?.() ?? []).find(c => c instanceof St.Icon);
        return trovata?.gicon ?? null;
    }

    _riempi() {
        this._sezione.removeAll();
        for (const v of this._voci.filter(x => x.posto === 'menu' || x.posto === 'menu-da-sé')) {
            const riga = new PopupMenu.PopupBaseMenuItem({style_class: 'vassoio-riga'});
            riga.add_child(new St.Icon({gicon: this._iconaPerRiga(v), style_class: 'popup-menu-icon'}));
            riga.add_child(new St.Label({text: v.nome, y_align: Clutter.ActorAlign.CENTER, x_expand: true}));
            if (v.posto === 'menu-da-sé') {
                const nota = new St.Label({text: 'nascosta da sé', style_class: 'vassoio-nota', y_align: Clutter.ActorAlign.CENTER});
                nota.opacity = 150;
                riga.add_child(nota);
            }
            riga._vassoioChiave = v.chiave;
            riga.connect('activate', () => this._apriPoi(v.chiave));
            this._sezione.addMenuItem(riga);
        }
    }

    _apriPoi(chiave) {
        // la riga chiude il menu ⌄ da sé (itemActivated): il menu vero si apre al giro dopo
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this.apri(chiave);
            return GLib.SOURCE_REMOVE;
        });
    }

    // apre il menu VERO dell'icona ancorato al ⌄; senza menu, l'azione principale dell'app (Activate)
    apri(chiave) {
        const v = this._voci.find(x => x.chiave === chiave && x.posto !== 'doppione');
        if (!v)
            return 'assente';
        const menu = v.button.menu;
        if (haMenu(v.button)) {
            if (!this._ancorati.has(menu)) {
                const ancora = {originale: menu.sourceActor};
                menu.connectObject('open-state-changed', (_m, aperto) => {
                    if (aperto)
                        return;
                    menu.disconnectObject(ancora);
                    if (menu.sourceActor === this._freccia)
                        menu.sourceActor = ancora.originale;
                    this._ancorati.delete(menu);
                }, ancora);
                this._ancorati.set(menu, ancora);
                menu.sourceActor = this._freccia;
            }
            menu.open({animate: true});
            return 'menu';
        }
        if (v.sni && v.button._indicator?.open) {
            const [x, y] = this._freccia.get_transformed_position();
            v.button._indicator.open(Math.round(x), Math.round(y), global.get_current_time());
            return 'attiva';
        }
        return 'niente';
    }

    // per le prove (Eval nell'isola) e per chi verifica: com'è il vassoio adesso
    stato() {
        return {
            freccia: {visibile: this._freccia.container.visible, mappata: this._freccia.is_mapped(),
                box: [...this._freccia.get_transformed_position(), ...this._freccia.get_transformed_size()]},
            voci: this._voci.map(v => ({
                chiave: v.chiave, ruolo: v.ruolo, nome: v.nome, posto: v.posto, mappata: v.button.is_mapped(),
                x: v.button.get_transformed_position()[0],
            })),
            icone: this._uniforma.stato(),
        };
    }

    destroy() {
        if (this._finito)
            return;
        this._finito = true;
        const boxVivo = !this._distrutto;
        this._smetti();
        this._settings.disconnectObject(this);
        if (!boxVivo) {
            this._seguiti.clear();
            this._ancorati.clear();
            return;                     // la Shell si sta chiudendo: gli attori non ci sono più
        }
        this._box.disconnectObject(this);
        for (const [menu, ancora] of this._ancorati) {
            menu.disconnectObject(ancora);
            if (menu.sourceActor === this._freccia)
                menu.sourceActor = ancora.originale;
        }
        this._ancorati.clear();
        for (const [button, {contenitore, indicatore}] of this._seguiti) {
            button.disconnectObject(this);
            contenitore.disconnectObject(this);
            indicatore?.disconnectObject?.(this);
        }
        this._seguiti.clear();
        for (const contenitore of this._nascostiDaNoi)
            contenitore.show();
        this._nascostiDaNoi.clear();
        this._freccia.destroy();
        this._freccia = null;
        this._voci = [];
        // l'ordine com'era; le icone arrivate dopo vanno prima degli elementi di sistema
        const sistema = new Set(Object.entries(Main.panel.statusArea)
            .filter(([ruolo, b]) => SISTEMA.has(ruolo) && b?.container).map(([, b]) => b.container));
        const iniziali = this._ordineIniziale.filter(a => a.get_parent() === this._box);
        const nuovi = this._box.get_children().filter(a => !this._ordineIniziale.includes(a));
        const ps = iniziali.findIndex(a => sistema.has(a));
        const giusto = ps < 0 ? [...iniziali, ...nuovi] : [...iniziali.slice(0, ps), ...nuovi, ...iniziali.slice(ps)];
        giusto.forEach((attore, i) => {
            if (this._box.get_child_at_index(i) !== attore)
                this._box.set_child_at_index(attore, i);
        });
        this._ordineIniziale = [];
    }
}
