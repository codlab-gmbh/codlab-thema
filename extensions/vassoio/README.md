# Vassoio — `vassoio@codlab.de`

*English: puts the status icons on the right of the GNOME Shell top bar in order, in the bar or in a ⌄ menu, with
symbolic icons that match the system ones and without duplicates.*

Le icone di stato a destra della barra, in ordine:

- **ordine e posto**: ogni icona sta nella barra o nel menu ⌄, ognuna con il suo menu vero (chiavi `ordine`,
  `nel-menu`, `posti`); il vassoio riordina i contenitori delle altre estensioni nella barra, non le modifica;
- **icone a filo** (`uniforma.js`): le icone piene note (Tiling Shell, Google Drive, Cardinal Host, GPaste) diventano
  simboliche come quelle di sistema, per lo stesso stato; uno stato sconosciuto lascia l'icona del proprietario;
  `convergenza.js` rifà il gesto di AppIndicator quando le sue icone personalizzate arrivano in ritardo;
- **doppioni**: lo stesso elemento registrato due volte compare una volta sola;
- **testimone di Mochi** (`testimone.js`, facoltativo): annota soltanto se l'estensione `mochi-flotta@codlab.de` (non
  pubblicata qui) resta fuori dalla panoramica; senza di lei non annota niente.

Disabilitandola la barra torna com'era. Impostazioni: `gnome-extensions prefs vassoio@codlab.de`.

Le icone in `estensione/vassoio@codlab.de/icons/` sono disegnate da `strumenti/genera-icone.py` (sagome piene, niente
`stroke`): `python3 strumenti/genera-icone.py --controlla` esce 1 se i file non sono quelli che il generatore produce.

Requisiti: GNOME Shell 51. Le estensioni di cui ordina le icone (AppIndicator, Tiling Shell, …) sono facoltative.

## Installare

Solo utente, niente sudo. Vale dal prossimo login.

```bash
python3 posa/vassoio_posa.py posa            # a secco: dice che cosa farebbe
python3 posa/vassoio_posa.py posa --esegui   # copia con il manifesto delle impronte e abilita in fondo all'elenco
python3 posa/vassoio_posa.py stato           # 0 posato e attivo, 1 no, 2 posato ma diverso dalla sorgente
```

A mano: copiare `estensione/vassoio@codlab.de/` in `~/.local/share/gnome-shell/extensions/` e, dopo il login,
`gnome-extensions enable vassoio@codlab.de`.

## Togliere

```bash
python3 posa/vassoio_posa.py ritorno posa/ritorni/<ora> --esegui
```

Toglie solo `vassoio@codlab.de` dall'elenco delle abilitate, rimette le sue chiavi ai valori di serie e toglie la
cartella se è ancora la nostra. A mano: `gnome-extensions disable vassoio@codlab.de`, poi
`rm -r ~/.local/share/gnome-shell/extensions/vassoio@codlab.de ~/.local/state/vassoio`.

Licenza: vedi [LICENSE.md](../../LICENSE.md).
