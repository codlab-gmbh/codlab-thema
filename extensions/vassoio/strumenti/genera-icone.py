#!/usr/bin/python3 -B
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 CodLab UG (haftungsbeschränkt)
"""Le icone a filo del vassoio (04.11.2026), generate: niente `stroke` (St forza `fill` su path/rect/circle, trappola del
giro 10), solo sagome piene; i contorni sono ANELLI pieni (`fill-rule="evenodd"`, contorno esterno + interno spostato
dello spessore T). Il glifo dello stato sta dentro l'anello; errore e registrazione hanno class="error" (colore d'errore
del tema), l'audio class="warning". Uscita: estensione/vassoio@codlab.de/icons/*.svg
  genera-icone.py [--controlla]   (--controlla: rigenera in memoria e confronta coi file, uscita 1 se diversi)"""
import math
import sys
from pathlib import Path

QUI = Path(__file__).resolve().parent.parent / 'estensione' / 'vassoio@codlab.de' / 'icons'
T = 1.2          # spessore dei tratti (px a 16)
F = '#2e3436'    # colore simbolico convenzionale (la Shell lo sostituisce)


def n(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def poligono(punti):
    return 'M' + ' L'.join(f'{n(x)} {n(y)}' for x, y in punti) + ' Z'


def arco(cx, cy, r, a0, a1, passo=4):
    """Punti di un arco (gradi, y in giù: 90 = in basso), da a0 ad a1 crescente."""
    k = max(2, int(abs(a1 - a0) / passo))
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / k)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / k)))
            for i in range(k + 1)]


def intersezione(c1, r1, c2, r2, sopra=True):
    (x1, y1), (x2, y2) = c1, c2
    d = math.hypot(x2 - x1, y2 - y1)
    a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, r1 * r1 - a * a))
    xm, ym = x1 + a * (x2 - x1) / d, y1 + a * (y2 - y1) / d
    p1 = (xm + h * (y2 - y1) / d, ym - h * (x2 - x1) / d)
    p2 = (xm - h * (y2 - y1) / d, ym + h * (x2 - x1) / d)
    return min((p1, p2), key=lambda p: p[1]) if sopra else max((p1, p2), key=lambda p: p[1])


def angolo(c, p):
    a = math.degrees(math.atan2(p[1] - c[1], p[0] - c[0]))
    return a % 360


def nuvola(t=0.0):
    """Contorno della nuvola (tre lobi e base piatta a y=13), spostato verso l'interno di t."""
    L, rL = (4.5, 9.5), 3.5 - t
    C, rC = (8.6, 6.9), 4.3 - t
    R, rR = (11.7, 9.6), 3.4 - t
    lc = intersezione(L, rL, C, rC)
    cr = intersezione(C, rC, R, rR)
    pts = arco(*L, rL, 90, angolo(L, lc) + (360 if angolo(L, lc) < 90 else 0))
    a0, a1 = angolo(C, lc), angolo(C, cr)
    if a1 < a0:
        a1 += 360
    pts += arco(*C, rC, a0, a1)
    b0 = angolo(R, cr)
    pts += arco(*R, rR, b0, 450 if b0 > 90 else 90)
    return pts


def anello_nuvola():
    return poligono(nuvola()) + ' ' + poligono(nuvola(T))


def anello_cerchio(cx=8, cy=8, r=7.0):
    def c(rr):
        return (f'M{n(cx - rr)} {n(cy)}a{n(rr)} {n(rr)} 0 1 0 {n(2 * rr)} 0a{n(rr)} {n(rr)} 0 1 0 {n(-2 * rr)} 0Z')
    return c(r) + ' ' + c(r - T)


def tratto(punti, s=T):
    """Una spezzata come sagoma piena di spessore s (estremi netti, giunti a spigolo)."""
    sx, dx = [], []
    for i, (x, y) in enumerate(punti):
        dirs = []
        if i > 0:
            dirs.append((x - punti[i - 1][0], y - punti[i - 1][1]))
        if i < len(punti) - 1:
            dirs.append((punti[i + 1][0] - x, punti[i + 1][1] - y))
        nv = []
        for ddx, ddy in dirs:
            ll = math.hypot(ddx, ddy)
            nv.append((-ddy / ll, ddx / ll))
        mx, my = sum(v[0] for v in nv) / len(nv), sum(v[1] for v in nv) / len(nv)
        ml = math.hypot(mx, my)
        mx, my = mx / ml, my / ml
        k = (s / 2) / max(0.35, abs(mx * nv[0][0] + my * nv[0][1]))
        sx.append((x + mx * k, y + my * k))
        dx.append((x - mx * k, y - my * k))
    return poligono(sx + dx[::-1])


def rett(x, y, w, h):
    return f'M{n(x)} {n(y)}h{n(w)}v{n(h)}h{n(-w)}Z'


def punto(cx, cy, r):
    return f'M{n(cx - r)} {n(cy)}a{n(r)} {n(r)} 0 1 0 {n(2 * r)} 0a{n(r)} {n(r)} 0 1 0 {n(-2 * r)} 0Z'


def svg(titolo, *parti):
    corpo = ''.join(f'<path fill="{F}"{" class=" + chr(34) + c + chr(34) if c else ""} fill-rule="evenodd" d="{d}"/>'
                    for d, c in parti)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><title>{titolo}</title>'
            f'{corpo}</svg>\n')


def freccia_giu():
    return tratto([(4.6, 6.2), (8, 9.6), (11.4, 6.2)])


def icone():
    out = {}
    # Tiling Shell: cornice con una tessera a sinistra e due a destra
    cornice = ('M3.5 2.5h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z'
               'M3.5 3.7a.8.8 0 0 0-.8.8v7a.8.8 0 0 0 .8.8h9a.8.8 0 0 0 .8-.8v-7a.8.8 0 0 0-.8-.8Z')
    out['vassoio-tiling-symbolic.svg'] = svg('Tiling Shell, a filo', (cornice, ''), (rett(7.4, 3.7, 1.2, 8.6), ''),
                                             (rett(8.6, 7.4, 4.7, 1.2), ''))
    # Google Drive: nuvola ad anello + glifo dello stato
    nv = anello_nuvola()
    out['vassoio-gdrive-ok-symbolic.svg'] = svg('Drive in sincronia', (nv, ''),
                                                (tratto([(6.1, 9.7), (7.6, 11.0), (10.4, 8.2)]), ''))
    out['vassoio-gdrive-sync-symbolic.svg'] = svg('Drive trasferimento in corso', (nv, ''),
                                                  (rett(6.0, 8.0, 3.6, 1.1) + ' ' + poligono([(9.6, 7.0), (11.1, 8.55), (9.6, 10.1)]), ''))
    out['vassoio-gdrive-error-symbolic.svg'] = svg('Drive errore', (nv, ''),
                                                   (rett(7.35, 6.2, 1.3, 3.5) + ' ' + punto(8, 11.0, 0.8), ''))
    out['vassoio-gdrive-off-symbolic.svg'] = svg('Drive spento o non collegato', (nv, ''), (rett(6.1, 9.2, 4.0, 1.1), ''))
    # Cardinal Host: anello + glifo dello stato (lo stato sta nel glifo e nel titolo, come nel prodotto)
    an = anello_cerchio()
    out['vassoio-cardinal-chiuso-symbolic.svg'] = svg('Cardinal Host, accesso chiuso', (an, ''),
                                                      (tratto([(5.4, 8.1), (7.2, 9.9), (10.7, 6.3)]), ''))
    out['vassoio-cardinal-sospeso-symbolic.svg'] = svg('Cardinal Host, accesso sospeso', (an, ''),
                                                       (rett(6.2, 5.6, 1.2, 4.8) + ' ' + rett(8.6, 5.6, 1.2, 4.8), ''))
    lucchetto = ('M5.4 7.6h5.2v4h-5.2Z M6.5 8.7v1.8h3v-1.8Z')
    gancio = tratto([(8.9, 7.6), (8.9, 5.9), (9.6, 5.0), (10.6, 5.0), (11.3, 5.9), (11.3, 6.6)], 1.05)
    out['vassoio-cardinal-aperto-symbolic.svg'] = svg('Cardinal Host, sessione aperta', (an, ''), (lucchetto, ''), (gancio, ''))
    out['vassoio-cardinal-collegato-symbolic.svg'] = svg('Cardinal Host, sessione collegata', (an, ''),
                                                         (rett(2.4, 7.4, 3.7, 1.2) + ' ' + rett(9.9, 7.4, 3.7, 1.2) + ' ' + punto(8, 8, 1.55), ''))
    out['vassoio-cardinal-audio-symbolic.svg'] = svg('Cardinal Host, audio condiviso', (an, ''),
                                                     (rett(5.6, 6.6, 1.2, 2.8) + ' ' + rett(7.4, 5.0, 1.2, 6.0) + ' ' + rett(9.2, 6.0, 1.2, 4.0), ''))
    out['vassoio-cardinal-registrazione-symbolic.svg'] = svg('Cardinal Host, registrazione in corso', (an, ''),
                                                             (punto(8, 8, 2.3), ''))
    out['vassoio-cardinal-allarme-symbolic.svg'] = svg('Cardinal Host, revoca non riuscita', (an, ''),
                                                       (rett(7.35, 4.4, 1.3, 4.8) + ' ' + punto(8, 11.1, 0.8), ''))
    # GPaste: appunti a filo (tavoletta ad anello, fermaglio, due righe)
    tavoletta = ('M4.5 2.8h7a1.5 1.5 0 0 1 1.5 1.5v9.2a1.5 1.5 0 0 1-1.5 1.5h-7a1.5 1.5 0 0 1-1.5-1.5v-9.2a1.5 1.5 0 0 1 1.5-1.5Z'
                 'M4.5 4a.3.3 0 0 0-.3.3v9.2a.3.3 0 0 0 .3.3h7a.3.3 0 0 0 .3-.3v-9.2a.3.3 0 0 0-.3-.3Z')
    out['vassoio-gpaste-symbolic.svg'] = svg('GPaste, a filo', (tavoletta, ''), (rett(6.2, 1.6, 3.6, 2.0), ''),
                                             (rett(5.6, 7.0, 4.8, 1.1) + ' ' + rett(5.6, 9.8, 3.4, 1.1), ''))
    # il pulsante del menu delle icone nascoste
    out['vassoio-freccia-symbolic.svg'] = svg('Icone nascoste', (freccia_giu(), ''))
    return out


def main():
    controlla = '--controlla' in sys.argv
    diversi = []
    QUI.mkdir(parents=True, exist_ok=True)
    for nome, testo in icone().items():
        p = QUI / nome
        if controlla:
            if not p.exists() or p.read_text() != testo:
                diversi.append(nome)
        else:
            p.write_text(testo)
    if controlla:
        print('icone uguali al generatore' if not diversi else f'DIVERSE dal generatore: {diversi}')
        sys.exit(1 if diversi else 0)
    print(f'{len(icone())} icone in {QUI}')


if __name__ == '__main__':
    main()
