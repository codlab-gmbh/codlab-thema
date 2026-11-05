# Estensioni GNOME Shell di CodLab Thema

*English: the CodLab GNOME Shell extensions, for GNOME Shell 51. Each folder has its own README with install and
removal steps.*

| Cartella | UUID | Dove sta l'estensione | Posa |
|---|---|---|---|
| [`vetro`](vetro/) | `vetro@codlab.de` | `vetro/vetro@codlab.de/` | `posa/vetro_posa.py` |
| [`vassoio`](vassoio/) | `vassoio@codlab.de` | `vassoio/estensione/vassoio@codlab.de/` (schemi compilati inclusi) | `posa/vassoio_posa.py` |
| [`launchpad`](launchpad/) | `launchpad@codlab.de` | `launchpad/launchpad@codlab.de/` | a mano |
| [`rimbalzo`](rimbalzo/) | `rimbalzo@codlab.de` | `rimbalzo/rimbalzo@codlab.de/` | a mano |
| [`dock-dal-bordo`](dock-dal-bordo/) | `dock-dal-bordo@codlab.de` | `dock-dal-bordo/dock-dal-bordo@codlab.de/` e il servizio utente in `servizio/` | a mano |
| [`rifiniture`](rifiniture/) | `rifiniture@codlab.de` | `rifiniture/rifiniture@codlab.de/` | a mano |
| [`quiete-aree`](quiete-aree/) | `quiete-aree@codlab.de` | `quiete-aree/quiete-aree@codlab.de/` | a mano |
| [`ricerca-azioni`](ricerca-azioni/) | `ricerca-azioni@codlab.de` | `ricerca-azioni/ricerca-azioni@codlab.de/` | a mano |
| [`centro-notifiche`](centro-notifiche/) | `centro-notifiche@codlab.de` | `centro-notifiche/centro-notifiche@codlab.de/` | a mano |
| [`svuota-notifiche`](svuota-notifiche/) | `svuota-notifiche@codlab` | `svuota-notifiche/svuota-notifiche@codlab/` | a mano |

«A mano» vuol dire: copiare la cartella dell'estensione in `~/.local/share/gnome-shell/extensions/`, poi al login
successivo `gnome-extensions enable <UUID>`; per toglierla `gnome-extensions disable <UUID>` e cancellare la cartella.
La Shell vede una cartella d'estensione nuova solo al login.
