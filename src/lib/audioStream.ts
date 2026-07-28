/**
 * Audio Stream Player — lit les samples PCM streamés par le backend
 * via WebSocket, les envoie à l'API AudioContext pour lecture temps réel.
 *
 * Utilise des AudioBufferSourceNode chaînés (gapless) plutôt qu'un
 * AudioWorklet, pour rester compatible sans fichier worklet séparé.
 */

function backendHost(): string {
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  return 'localhost';
}

export class AudioStreamPlayer {
  private ctx: AudioContext | null = null;
  private ws: WebSocket | null = null;
  private gainNode: GainNode | null = null;
  private _playing = false;
  private nextPlayTime = 0;
  private chunksReceived = 0;
  private wsUrl: string;
  private onEnd: (() => void) | null = null;

  constructor() {
    this.wsUrl = `ws://${backendHost()}:4000/audio-stream`;
  }

  get isPlaying() { return this._playing; }

  /** Démarre la connexion WebSocket et prépare AudioContext */
  async connect(): Promise<void> {
    if (this.ctx) return;

    this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 1.0;
    this.gainNode.connect(this.ctx.destination);

    this.nextPlayTime = 0;
    this.chunksReceived = 0;
  }

  /** Définit le volume (0-127) */
  setVolume(v: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = v / 127;
    }
  }

  /** Callback appelé quand le stream se termine (playback fini) */
  onFinished(cb: () => void) {
    this.onEnd = cb;
  }

  /** Ouvre la connexion WebSocket et commence à écouter */
  private openSocket(resolveConnected: () => void) {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    console.log(`🔊 WebSocket → ${this.wsUrl}`);
    const ws = new WebSocket(this.wsUrl);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      console.log('🔊 WebSocket connecté');
      this._playing = true;
      this.nextPlayTime = 0;
      this.chunksReceived = 0;
      resolveConnected();
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (ev.data instanceof ArrayBuffer && this.ctx && this.gainNode) {
        this.onAudioData(ev.data);
      } else if (typeof ev.data === 'string') {
        console.log('🔊 WS message texte:', ev.data);
      }
    };

    ws.onerror = (err) => {
      console.error('🔊 WebSocket error:', err);
      this._playing = false;
    };

    ws.onclose = () => {
      console.log('🔊 WebSocket fermé');
      this._playing = false;
      if (this.onEnd) this.onEnd();
    };
  }

  /** Traite un chunk audio binaire reçu du WebSocket */
  private onAudioData(arrayBuffer: ArrayBuffer) {
    const chunkId = this.chunksReceived++;
    const floats = new Float32Array(arrayBuffer);
    const frames = Math.floor(floats.length / 2);
    if (frames === 0) return;

    // Console sporadique pour ne pas flood
    if (chunkId % 10 === 0) {
      console.log(`🔊 Chunk #${chunkId}: ${floats.length} floats, ${frames} frames`);
    }

    // Dé-entrelacer en canaux gauche/droite
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      left[i] = floats[i * 2];
      right[i] = floats[i * 2 + 1];
    }

    // Créer un AudioBuffer et le programmer pour lecture
    const buffer = this.ctx!.createBuffer(2, frames, 44100);
    buffer.copyToChannel(left, 0);
    buffer.copyToChannel(right, 1);

    const source = this.ctx!.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode!);

    const now = this.ctx!.currentTime;
    // Si on a du retard, démarrer immédiatement avec 10ms de lookahead
    if (this.nextPlayTime < now + 0.005) {
      this.nextPlayTime = now + 0.01;
    }
    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;
  }

  /** Connecte le WebSocket et retourne une promesse résolue quand la connexion est établie */
  async connectAndPlay(): Promise<void> {
    await this.connect();
    return new Promise((resolve) => {
      this.openSocket(resolve);
    });
  }

  /** Arrête tout */
  stop() {
    this._playing = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    // Note: les sources AudioBuffer déjà programmées continueront à jouer
    // brièvement mais le flux s'arrête car plus de données WebSocket
  }

  /** Nettoie les ressources */
  dispose() {
    this.stop();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
