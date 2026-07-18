#!/bin/bash
# chordJAVA v2 — Lancement complet
# Usage: ./start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="/home/legoeland/Dev/zic_dev/dev/play_chords/server-rs"
LOG_DIR="/tmp/chordjava"

mkdir -p "$LOG_DIR"

echo "🎵 chordJAVA v2 — Démarrage..."
echo ""

# 1. FluidSynth (ne pas relancer si déjà actif)
if ! pgrep -x fluidsynth > /dev/null; then
    echo "[1/3] 🎹 Démarrage FluidSynth..."
    fluidsynth -a pulseaudio -g 0.8 -o synth.polyphony=64 \
        -o synth.sample-rate=44100 \
        -o midi.driver=alsa_seq \
        -is /usr/share/sounds/sf3/MuseScore_General_Full.sf3 \
        > "$LOG_DIR/fluidsynth.log" 2>&1 &
    sleep 3
    echo "       FluidSynth PID: $(pgrep -x fluidsynth)"
else
    echo "[1/3] ✅ FluidSynth déjà en cours"
fi

# 2. Serveur Rust
if curl -sf http://localhost:4000/ > /dev/null 2>&1; then
    echo "[2/3] ✅ Backend déjà sur :4000"
else
    echo "[2/3] 🦀 Démarrage du backend Rust..."
    # Trouver le port FluidSynth
    FLUID_PORT=$(aconnect -l 2>/dev/null | grep "FLUID Synth" | grep -oP 'client \K\d+')
    if [ -n "$FLUID_PORT" ]; then
        echo "       → Connexion à FluidSynth (client $FLUID_PORT)"
        MIDI_PORT="$FLUID_PORT" \
        "$SERVER_DIR/target/release/chords-server-rs" \
        > "$LOG_DIR/server.log" 2>&1 &
    else
        "$SERVER_DIR/target/release/chords-server-rs" \
        > "$LOG_DIR/server.log" 2>&1 &
    fi
    sleep 2
    if curl -sf http://localhost:4000/ > /dev/null 2>&1; then
        echo "       ✅ Backend prêt"
    else
        echo "       ⚠️  Vérifie les logs: $LOG_DIR/server.log"
    fi
fi

# 3. Frontend
echo "[3/3] ⚛️  Lancement du frontend..."
cd "$SCRIPT_DIR"
npx vite --host 0.0.0.0 --port 5176 --open > "$LOG_DIR/frontend.log" 2>&1 &
echo "       Frontend: http://localhost:5176/"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🐱 chordJAVA v2"
echo "  📡 Frontend: http://localhost:5176/"
echo "  🔧 Backend:  http://localhost:4000/"
echo "  🎹 MIDI: FluidSynth"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
