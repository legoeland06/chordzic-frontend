# chordJAVA v2

Moteur harmonique MIDI — saisie de grilles d'accords, lecture en temps réel via FluidSynth.

## Architecture

```
┌─ Frontend React/Vite/Tailwind (port 5176) ─┐
│  Saisie grille → Autocomplétion             │
│  Play/Stop → POST /play, /stop, /config    │
│  5 tracks MIDI (Lead/Bass/Nappes/Accent/Drums)│
│  Barre progression + métronome visuel       │
└──────────┬──────────────────────────────────┘
           │ HTTP JSON
┌──────────▼──────────────────────────────────┐
│  Backend Rust Axum (port 4000)              │
│  midir → FluidSynth (SoundFont)             │
│  Patterns: Rock, Reggae, Jazz, Pop...       │
│  Walking Bass, Pompe Skank, Accent 2&4     │
└────────────────────────────────────────────┘
```

## Démarrage rapide

```bash
chordj        # Lance tout (backend + frontend + FluidSynth)
chordj stop   # Arrête tout
chordj status # Vérifie ce qui tourne
```

Puis ouvrir **http://localhost:5176/**

## Prérequis

- **Rust** (pour compiler le backend)
- **Node.js** 20+ (pour le frontend)
- **FluidSynth** + SoundFont (installé avec le système)
- SoundFont : `/usr/share/sounds/sf3/MuseScore_General_Full.sf3`

## Fonctionnalités

### Saisie
- Grille d'accords : `4:Cm7 2:FM7 4:G7 4:C`
- Silences : `4:_`
- 70+ qualités d'accords (m7, M7, dim, aug, 9, 13, sus...)
- Renversements : `Cmaj7/G`
- Autocomplétion intelligente (Tab)

### Lecture
- **5 tracks** : Lead, Bass, Nappes, Accent, Drums
- Volume / Mute / Instrument par track
- 6 patterns batterie : Rock, Pop, Reggae, OneDrop, Bossa, Jazz
- Walking Bass (chromatique, dominante, diatonique)
- Pompe Skank (Lead) — staccato sur contretemps 8ème
- Accent Piano (canal 4) — temps 2&4
- A=432Hz via pitch bend MIDI
- Loop, signatures (4/4, 3/4, 6/8)

### Interface
- Barre de progression + métronome visuel
- Affichage accord en cours (grosse police) + accord suivant
- Drag & drop réordonnancement des accords
- Save/Load grilles (localStorage)
- Export/Import JSON
- Clavier piano dans le détail d'accord

## Structure du code

```
src/
├── components/
│   ├── ChordApp.tsx          ← Composant principal
│   ├── TrackPanel.tsx        ← Contrôles + tracks + accord
│   ├── ControlBar.tsx        ← Boutons Jouer/Stop/Analyser
│   ├── ChordDetailModal.tsx  ← Popup détail accord
│   ├── ProgressBar.tsx       ← Barre progression + métronome
│   └── PianoKeyboard.tsx    ← Mini clavier interactif
├── lib/
│   └── audioEngine.ts        ← Moteur audio (backend bridge)
├── types/
│   └── chord.ts              ← Types + parseur + 70 qualités
└── main.tsx                  ← Point d'entrée React
```

## API Backend

| Route | Méthode | Description |
|-------|---------|-------------|
| `/` | GET | Page statique |
| `/play` | POST | Lance lecture MIDI |
| `/config` | POST | Configure en temps réel |
| `/stop` | POST | Arrête la lecture |

## Crédits

Développé par **Eric Bruneau** ([ericbruneau@gmail.com](mailto:ericbruneau@gmail.com))
