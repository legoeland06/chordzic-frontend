/**
 * BrowserSynth — rendu audio via le backend + lecture dans le navigateur.
 *
 * Mode alternatif au MIDI live : le backend génère un fichier WAV complet
 * (via `/render-wav`), joué ensuite via l'API Web Audio.
 *
 * Les conversions de notes et l'URL backend sont importés depuis
 * lib/chordUtils.ts (partagé avec audioEngine.ts).
 */
import { ChordData, GrilleData } from '../types/chord';
import { backendUrl, chordToNoteNames } from './chordUtils';
import { computeSamplePhase, fitSampleToGrid, measureDurationSec } from './sampleLoop';
import { estimatePositionSec, navStartAtBeats } from './navPosition';

export interface TrackCfg {
  channel: number;
  program?: number;
  volume?: number;
  mute?: boolean;
}

export interface RenderOptions {
  tempo: number;
  pattern?: string;
  walking?: boolean;
  sig?: string;
  tracks?: TrackCfg[];
  master_vol?: number;
  customNotes?: Array<{
    channel: number;
    start_time: number;
    pitch: number;
    duration: number;
    velocity: number;
  }>;
  /** Canaux en mode PianoRoll (même vides) — les autres jouent le mode classique. */
  customChannels?: number[];
  /** Intégrer le clic (métronome) au WAV rendu — synchro parfaite. */
  click_in_render?: boolean;
}

/** Configuration de la boucle sample (mode Navig) : un sample audio de
 * quelques mesures, joué en boucle par le NAVIGATEUR en parallèle du WAV
 * principal (même horloge Web Audio → synchro parfaite par construction).
 * `offsetMs` décale la phase en DIRECT pendant la lecture (vérification
 * à l'oreille, comme le décalage de la piste clic). */
export interface SampleLoopCfg {
  enabled: boolean;
  /** Nom du fichier sample (ex. « snap5_160.wav » dans ~/samples/drums/). */
  sample: string;
  /** Volume 0-100. */
  volume: number;
  /** Décalage de phase 0-200 ms. */
  offsetMs: number;
  /** Contexte de la grille (rempli par ChordApp à l'appel) : sert à calculer
   * la durée d'une mesure pour recadrer le sample sur la grille. */
  tempo?: number;
  beatsPerBar?: number;
}

/**
 * Synthétiseur audio navigateur — utilise le backend pour le rendu WAV
 * et l'API Web Audio pour la lecture.
 */
export class BrowserSynth {
  private audioCtx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private _playing = false;
  /** Sortie audio dédiée au clic séparé (mode Navig) — lue par le serveur. */
  private _clickDevice: string | null = null;
  /** Résout la promesse de fin de lecture du mode séparé (au Stop). */
  private _navPlayResolver: (() => void) | null = null;
  private _buffer: AudioBuffer | null = null;
  /** Dernier WAV brut reçu du backend (extraction par l'utilisateur). */
  private _lastWavBlob: Blob | null = null;
  private ctxTimeAtStart = 0;
  private _loopTimer: ReturnType<typeof setTimeout> | null = null;
  private sources: AudioBufferSourceNode[] = [];
  /** Boucle sample (mode Navig) : config + objets Web Audio dédiés. */
  private _sampleLoop: SampleLoopCfg | null = null;
  private _sampleBuffer: AudioBuffer | null = null;
  /** Nom du sample actuellement en cache (pour recharger quand on change). */
  private _lastSampleName: string | null = null;
  private _sampleSource: AudioBufferSourceNode | null = null;
  private _sampleGain: GainNode | null = null;
  /** Sample RECADRÉ sur la grille (coupé ou complété par du silence) — c'est
   * CE buffer qui est bouclé, pour que chaque période soit un multiple exact
   * de la mesure et que le sample ne dérive jamais du métronome.
   * Cache clé par (nom du sample, période cible, sampleRate). */
  private _alignedSample: { name: string; periodSec: number; sampleRate: number; buffer: AudioBuffer } | null = null;
  /** Génération de la config boucle : incrémentée à CHAQUE setSampleLoop.
   * Un _syncSampleLoop lancé avec une ancienne génération abandonne après
   * son await (fetch) — un changement de config plus récent a gagné. */
  private _sampleLoopGen = 0;
  /** Mode SÉPARÉ (lecture serveur, double canaux) : pas de buffer local —
   * la position de la tête de lecture est ESTIMÉE (horloge locale) car le
   * navigateur ne joue aucun son. start = performance.now() au lancement,
   * durée = duration_sec restant renvoyé par /navig-play. */
  private _sepActive = false;
  private _sepStartMs = 0;
  private _sepDurSec = 0;
  /** Dernier body envoyé à /navig-play (pour relancer depuis une position). */
  private _lastNavBody: Record<string, unknown> | null = null;
  private _lastNavTempo = 120;
  /** Génération des scrubs séparés : seul le DERNIER clic gagne (un scrub
   * plus lent qui répond après un plus récent n'écrase pas sa position). */
  private _seekGen = 0;

  get isPlaying() { return this._playing; }

  /** Configure la boucle sample. Pendant la lecture, un changement (offset,
   * volume, sample, toggle) est appliqué IMMÉDIATEMENT : la boucle est
   * recalculée à la bonne phase — vérification en direct à l'oreille.
   * À l'arrêt, le sample est PRÉ-CHARGÉ en arrière-plan (cache chaud) : le
   * premier Play part sans latence de fetch → le sample démarre calé. */
  setSampleLoop(cfg: SampleLoopCfg | null) {
    this._sampleLoop = cfg;
    this._sampleLoopGen++; // invalide tout _syncSampleLoop en cours
    if (cfg && cfg.enabled && cfg.sample) {
      if (this._playing) {
        this._syncSampleLoop();
      } else {
        this._preloadSample(cfg.sample);
      }
    } else {
      this._stopSampleLoop();
    }
  }

  /** Charge le sample en cache sans le jouer (premier Play sans latence). */
  private _preloadSample(name: string) {
    if (this._sampleBuffer && this._lastSampleName === name) return; // déjà chaud
    void (async () => {
      const buf = await this._loadSample(name);
      if (buf) {
        this._sampleBuffer = buf;
        this._lastSampleName = name;
      }
    })();
  }

  /** Charge (et met en cache) le fichier sample depuis le backend. */
  private async _loadSample(name: string): Promise<AudioBuffer | null> {
    try {
      const resp = await fetch(`${backendUrl()}/sample-file/${encodeURIComponent(name)}`);
      if (!resp.ok) return null;
      const data = await resp.arrayBuffer();
      const ctx = await this.getContext();
      return await ctx.decodeAudioData(data);
    } catch {
      return null;
    }
  }

  /** Arrête la source de la boucle sample (sans toucher au WAV principal). */
  private _stopSampleLoop() {
    if (this._sampleSource) {
      try { this._sampleSource.stop(); } catch {}
      this._sampleSource.disconnect();
      this._sampleSource = null;
    }
    if (this._sampleGain) {
      this._sampleGain.disconnect();
      this._sampleGain = null;
    }
  }

  /** (Re)synchronise la boucle sample sur la position courante du morceau.
   * Appelé après chaque (re)création de la source WAV (play, reprise, scrub)
   * et à chaque changement de config pendant la lecture. La phase jouée est
   * `position_du_morceau + offset` (modulo la période de boucle, brute ou
   * recadrée) → l'offset décale la boucle en direct, exactement comme le
   * décalage du clic. */
  private _syncSampleLoop() {
    const cfg = this._sampleLoop;
    const ctx = this.audioCtx;
    // Mode SÉPARÉ : la lecture est SERVEUR (double canaux) — le sample n'est
    // pas dans le flux serveur, on ne le joue JAMAIS côté navigateur (il
    // sortirait en double, désynchronisé).
    if (this._sepActive) {
      this._stopSampleLoop();
      return;
    }
    if (!cfg || !cfg.enabled || !cfg.sample || !ctx || !this._playing) {
      this._stopSampleLoop();
      return;
    }
    const gen = this._sampleLoopGen; // config capturée pour ce cycle
    const pos = this.getPositionRaw();
    if (pos < 0) return;
    void (async () => {
      // Cache INVALIDÉ si le sample change (sinon l'ancien buffer resservait)
      if (!this._sampleBuffer || this._lastSampleName !== cfg.sample) {
        try {
          this._sampleBuffer = await this._loadSample(cfg.sample);
        } catch (e) {
        }
        this._lastSampleName = cfg.sample;
      }
      // Abandonner si la config a changé pendant le fetch (un cycle plus
      // récent est en cours — il créera sa propre source) ou si la lecture
      // s'est arrêtée entre-temps.
      if (gen !== this._sampleLoopGen || !this._playing) return;
      const buf = this._sampleBuffer;
      if (!buf) return;
      // Recadrage sur la grille : la période de boucle est un multiple ENTIER
      // de la mesure (coupe si le sample est trop long, silence si trop court)
      // → le sample ne dérive JAMAIS du métronome, même sur 100 mesures.
      const aligned = this._getAlignedSample(cfg, buf, ctx);
      // ⚠️ Position RE-CAPTURÉE après le chargement du sample : le fetch +
      // décodage peuvent prendre 100-300 ms — utiliser la position d'avant
      // démarrait le sample en RETARD (décalage faux au premier Play, qui
      // disparaissait après un Stop/Play une fois le cache chaud).
      const posNow = this.getPositionRaw();
      if (posNow < 0) return;
      // Phase cible : position du morceau + offset (modulo la période recadrée)
      const startPos = computeSamplePhase(posNow, cfg.offsetMs, aligned.duration);
      this._stopSampleLoop();
      const gain = ctx.createGain();
      gain.gain.value = cfg.volume / 100;
      gain.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = aligned;
      src.loop = true;
      src.connect(gain);
      src.start(0, startPos);
      this._sampleSource = src;
      this._sampleGain = gain;
    })();
  }

  /** Buffer sample RECADRÉ sur la grille (cache par nom + période).
   * La période cible dépend du tempo et de la signature courants : si le
   * contexte (tempo/sig) manque, le sample brut est utilisé tel quel. */
  private _getAlignedSample(
    cfg: SampleLoopCfg,
    buf: AudioBuffer,
    ctx: BaseAudioContext,
  ): AudioBuffer {
    if (!cfg.tempo || !cfg.beatsPerBar) return buf; // contexte inconnu → brut
    const measureSec = measureDurationSec(cfg.tempo, cfg.beatsPerBar);
    const fit = fitSampleToGrid(buf.duration, measureSec);
    if (fit.mode === 'exact') return buf; // déjà parfait → pas de recopie
    if (
      this._alignedSample &&
      this._alignedSample.name === cfg.sample &&
      this._alignedSample.sampleRate === ctx.sampleRate &&
      Math.abs(this._alignedSample.periodSec - fit.periodSec) < 1e-9
    ) {
      return this._alignedSample.buffer; // cache valide
    }
    this._alignedSample = {
      name: cfg.sample,
      periodSec: fit.periodSec,
      sampleRate: ctx.sampleRate,
      buffer: buildAlignedBuffer(ctx, buf, fit.periodSec),
    };
    return this._alignedSample.buffer;
  }

  setVolume(_v: number) {
    // Le volume est géré par le rendu backend (master_vol)
  }

  /** Retourne ou crée le AudioContext (et le resume si suspendu). */
  private async getContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      try { await this.audioCtx.resume(); } catch (e) { console.warn('🔊 resume failed:', e); }
    }
    return this.audioCtx;
  }

  /** Joue un aperçu d'un seul accord (boucle). */
  async playChordPreview(chord: ChordData, tempo: number, opts?: RenderOptions): Promise<void> {
    const notes = chordToNoteNames(chord);
    await this._playSequence([{ notes, beats: 4.0 }], tempo, true, opts);
  }

  /** Joue une grille complète, avec ou sans boucle. */
  async playGrille(grille: GrilleData, tempo: number, loop?: boolean, opts?: RenderOptions): Promise<void> {
    const sequence = grille.chords.map(c => ({
      notes: chordToNoteNames(c), beats: 4.0 / c.time,
    }));
    await this._playSequence(sequence, tempo, loop || false, opts);
  }

  /** 1. Appelle /render-wav → 2. décode → 3. joue. */
  private async _playSequence(
    sequence: { notes: string[]; beats: number }[],
    tempo: number, doLoop: boolean, opts?: RenderOptions,
  ): Promise<void> {
    const body: Record<string, unknown> = { sequence, tempo };
    if (opts) {
      if (opts.pattern) body.pattern = opts.pattern;
      if (opts.walking !== undefined) body.walking = opts.walking;
      if (opts.sig) body.sig = opts.sig;
      if (opts.tracks) body.tracks = opts.tracks;
      if (opts.master_vol !== undefined) body.master_vol = opts.master_vol;
      if (opts.customNotes && opts.customNotes.length > 0) {
        body.custom_notes = opts.customNotes;
      }
      if (opts.customChannels && opts.customChannels.length > 0) {
        body.custom_channels = opts.customChannels;
      }
    }
    // Config du clic (source de vérité : le serveur) — mode Navig
    await this._applyClickConfig(body);
    await this._renderAndPlay(body, doLoop);
  }

  /** Joue un rendu WAV personnalisé : uniquement les notes PianoRoll d'un canal
   * (tous les canaux passés en mode custom, les autres vides → seuls les notes
   * fournies sont rendues). */
  async playPianoRollChannel(
    customNotes: NonNullable<RenderOptions['customNotes']>,
    customChannels: number[],
    tempo: number,
    opts?: RenderOptions,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      sequence: [], tempo,
      custom_notes: customNotes,
      custom_channels: customChannels,
    };
    if (opts) {
      if (opts.pattern) body.pattern = opts.pattern;
      if (opts.walking !== undefined) body.walking = opts.walking;
      if (opts.sig) body.sig = opts.sig;
      if (opts.tracks) body.tracks = opts.tracks;
      if (opts.master_vol !== undefined) body.master_vol = opts.master_vol;
    }
    // Config du clic (source de vérité : le serveur) — mode Navig
    await this._applyClickConfig(body);
    await this._renderAndPlay(body, false);
  }

  /** Applique la config du clic côté serveur à la requête de rendu :
   * - sortie dédiée choisie (et pas de mix) → clic SÉPARÉ (2 WAV, réponse JSON)
   * - sinon « Dans le rendu » → clic MIXÉ (synchro parfaite) */
  private async _applyClickConfig(body: Record<string, unknown>): Promise<void> {
    this._clickDevice = null;
    try {
      const cfg = await (await fetch(`${backendUrl()}/click`)).json();
      if (cfg.out_device && !cfg.in_render) {
        this._clickDevice = cfg.out_device;
        body.click_separate = true;
      } else {
        body.click_in_render = !!cfg.in_render;
      }
    } catch { /* pas de clic */ }
  }

  /** Appelle /render-wav puis décode et joue le buffer. Si le clic est en
   * mode SÉPARÉ (sortie dédiée) : délègue au serveur (/navig-play) qui joue
   * main (canaux 1-2) + clic (canaux 3-4) sur l'appareil multicanal → une
   * seule horloge, synchro échantillon-parfaite entre les deux sorties. */
  private async _renderAndPlay(body: Record<string, unknown>, doLoop: boolean): Promise<void> {
    // Mode séparé : le SERVEUR joue tout (double canaux).
    if (body.click_separate) {
      const resp = await fetch(`${backendUrl()}/navig-play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg.length > 200 ? msg.slice(0, 200) : msg);
      }
      const data = await resp.json();
      console.log('[Navig séparé]', data);
      // Informer l'UI du mode réel (channels / mixed_fallback)
      window.dispatchEvent(new CustomEvent('chordzic:click-mode', { detail: data }));
      // Pas de lecture locale : le serveur joue main + clic. La position de
      // la tête de lecture est ESTIMÉE (horloge locale + durée restante) —
      // le navigateur n'a pas de buffer, donc pas d'horloge audio.
      this._lastNavBody = body;
      this._lastNavTempo = Number(body.tempo) || 120;
      this._sepActive = true;
      this._sepStartMs = performance.now();
      this._sepDurSec = typeof data.duration_sec === 'number' ? data.duration_sec : 0;
      this._lastWavBlob = null;
      this._playing = true;
      await new Promise<void>((resolve) => {
        this._navPlayResolver = resolve;
      });
      return;
    }

    const resp = await fetch(`${backendUrl()}/render-wav`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`render failed: ${resp.status}`);

    const wavData = await resp.arrayBuffer();
    // Garder le WAV brut : permet l'extraction (téléchargement) par l'utilisateur
    this._lastWavBlob = new Blob([wavData], { type: 'audio/wav' });
    const ctx = await this.getContext();
    const buffer = await ctx.decodeAudioData(wavData);
    this._buffer = buffer;
    this._playBuffer(buffer, doLoop);
  }

  /** Récupère les notes générées par le mode classique (base PianoRoll).
   * Appelle /render-notes avec la séquence et la configuration courantes.
   */
  async getPianoNotes(
    sequence: { notes: string[]; beats: number }[],
    tempo: number,
    opts?: RenderOptions,
  ): Promise<RenderOptions['customNotes']> {
    const body: Record<string, unknown> = { sequence, tempo };
    if (opts) {
      if (opts.pattern) body.pattern = opts.pattern;
      if (opts.walking !== undefined) body.walking = opts.walking;
      if (opts.sig) body.sig = opts.sig;
      if (opts.tracks) body.tracks = opts.tracks;
    }
    const resp = await fetch(`${backendUrl()}/render-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`render-notes failed: ${resp.status}`);
    const data = await resp.json();
    return data.notes ?? [];
  }

  /** Position de lecture courante dans le buffer (0..duration), boucle comprise.
   * En mode séparé (pas de buffer) : position estimée modulo la durée restante. */
  getPosition(): number {
    if (!this.audioCtx) return 0;
    if (!this.source || !this._buffer) {
      if (this._sepActive) {
        const dur = this._sepDurSec;
        const raw = estimatePositionSec(this._sepStartMs, performance.now());
        if (dur > 0) return ((raw % dur) + dur) % dur;
        return raw;
      }
      return 0;
    }
    const elapsed = this.audioCtx.currentTime - this.ctxTimeAtStart;
    return ((elapsed % this._buffer.duration) + this._buffer.duration) % this._buffer.duration;
  }

  /** Position brute (secondes depuis le début, sans modulo). -1 si aucune source active.
   * En mode séparé : position ESTIMÉE (le serveur joue, le navigateur n'a pas
   * d'horloge audio) — la tête de lecture bouge quand même. */
  getPositionRaw(): number {
    if (!this.source || !this.audioCtx || !this._buffer) {
      if (this._sepActive) {
        return estimatePositionSec(this._sepStartMs, performance.now());
      }
      return -1;
    }
    return this.audioCtx.currentTime - this.ctxTimeAtStart;
  }

  /** Durée du buffer audio courant (secondes), ou durée restante en mode séparé. */
  getDuration(): number {
    if (this._buffer) return this._buffer.duration;
    if (this._sepActive) return this._sepDurSec;
    return 0;
  }

  /** Dernier WAV rendu (blob brut), ou null si aucun rendu. */
  getLastWavBlob(): Blob | null {
    return this._lastWavBlob;
  }

  /** WAV à extraire : si la boucle sample est ACTIVE, le sample est MIXÉ au
   * morceau (OfflineAudioContext — rendu hors-ligne, mêmes volume/offset que
   * la lecture) puis encodé en WAV. Sinon, le WAV brut du rendu. */
  async getExtractWavBlob(): Promise<Blob | null> {
    const cfg = this._sampleLoop;
    if (!this._buffer) return this._lastWavBlob;
    const sampleActive = !!(cfg && cfg.enabled && cfg.sample);
    if (!sampleActive) return this._lastWavBlob;

    // Charger le sample s'il n'est pas déjà en cache
    if (!this._sampleBuffer || this._lastSampleName !== cfg.sample) {
      this._sampleBuffer = await this._loadSample(cfg.sample);
      this._lastSampleName = cfg.sample;
    }
    const sample = this._sampleBuffer;
    if (!sample) return this._lastWavBlob; // sample illisible → brut

    const main = this._buffer;
    const ctx = new OfflineAudioContext(
      main.numberOfChannels,
      Math.ceil(main.duration * main.sampleRate),
      main.sampleRate,
    );

    // Morceau principal (tel que rendu)
    const srcMain = ctx.createBufferSource();
    srcMain.buffer = main;
    srcMain.connect(ctx.destination);
    srcMain.start(0);

    // Sample RECADRÉ sur la grille (même buffer que la lecture → l'extraction
    // est rigoureusement identique à ce qui s'entend pendant la lecture) :
    // période = multiple entier de la mesure, coupée ou complétée par du
    // silence pour que la boucle ne dérive jamais du métronome.
    const aligned = this._getAlignedSample(cfg, sample, ctx);

    // Sample bouclé sur toute la durée, avec son volume et sa phase (offset)
    const gain = ctx.createGain();
    gain.gain.value = cfg.volume / 100;
    const srcSample = ctx.createBufferSource();
    srcSample.buffer = aligned;
    srcSample.loop = true;
    srcSample.connect(gain);
    gain.connect(ctx.destination);
    // Début du morceau (position 0) + décalage de phase mémorisé
    const startPos = computeSamplePhase(0, cfg.offsetMs, aligned.duration);
    srcSample.start(0, startPos);

    const rendered = await ctx.startRendering();
    return encodeWav(rendered);
  }

  /** Pause : gèle le contexte audio → le son et le curseur se figent,
   * la reprise est exacte (le currentTime ne bouge pas). */
  async pause(): Promise<void> {
    if (this.audioCtx && this.audioCtx.state === 'running') {
      try { await this.audioCtx.suspend(); } catch { /* silencieux */ }
    }
  }

  /** Reprend après une pause. */
  async resume(): Promise<void> {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try { await this.audioCtx.resume(); } catch { /* silencieux */ }
    }
  }

  /** Joue le buffer courant depuis une position (secondes).
   * `whenSec` : démarrage différé (secondes dans le futur) — utilisé pour
   * synchroniser avec le clic séparé joué par le serveur.
   * Reprend le contexte s'il était suspendu (pause précédente) : un source
   * créé sur un contexte suspendu ne produit aucun son. */
  playBufferFrom(seconds: number, loop: boolean, whenSec = 0) {
    if (!this._buffer || !this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    this.stop();
    const ctx = this.audioCtx;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;
    gainNode.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = this._buffer;
    source.loop = loop;
    source.connect(gainNode);
    this.ctxTimeAtStart = ctx.currentTime + whenSec - Math.max(0, seconds);
    source.start(whenSec, Math.max(0, seconds));
    this.source = source;
    this._playing = true;
    this._syncSampleLoop();
    source.onended = () => {
      if (this.source === source) { this._playing = false; this.source = null; }
    };
  }

  /** Scrub : déplace la tête de lecture.
   *  - Mode SÉPARÉ (lecture serveur) : relance /navig-play depuis la position
   *    (main + clic alignés, accents de mesure conservés) et déplace
   *    l'estimateur local. Ne touche JAMAIS au clic serveur.
   *  - Buffer local (mode mixé) : recrée la source à la position SANS couper
   *    le clic séparé serveur (le clic mixé est dans le buffer, il continue).
   *  - Sinon (lecture arrêtée, pas de buffer) : ne fait rien. */
  seekTo(seconds: number) {
    // Mode séparé : pas de buffer local — relance le serveur depuis la
    // position (un éventuel buffer obsolète d'une lecture précédente ne doit
    // PAS être rejoué ni arrêter le clic serveur).
    if (this._sepActive) {
      this._seekSeparate(seconds);
      return;
    }
    if (!this._buffer || !this.audioCtx) return;
    const loop = this.source?.loop ?? false;
    const wasPlaying = this._playing;
    if (!wasPlaying) return; // arrêté : la position manuelle est gérée par l'UI
    // Arrêt LOCAL uniquement (sources Web Audio) — l'ancien stop() coupait
    // le clic séparé serveur au moindre scrub (bug « le clic disparaît »).
    this._stopLocalSources();
    this._stopSampleLoop();
    const ctx = this.audioCtx;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;
    gainNode.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = this._buffer;
    source.loop = loop;
    source.connect(gainNode);
    this.ctxTimeAtStart = ctx.currentTime - Math.max(0, seconds);
    source.start(0, Math.max(0, seconds));
    this.source = source;
    this._playing = true;
    this._syncSampleLoop();
    source.onended = () => {
      if (this.source === source) { this._playing = false; this.source = null; }
    };
  }

  /** Relance la lecture SÉPARÉE (serveur, double canaux) depuis `seconds`. */
  private _seekSeparate(seconds: number) {
    const body = this._lastNavBody;
    const gen = ++this._seekGen;
    if (!body) {
      this._moveSeparateHead(seconds);
      return;
    }
    const next = { ...body, start_at: navStartAtBeats(seconds, this._lastNavTempo) };
    void (async () => {
      try {
        const resp = await fetch(`${backendUrl()}/navig-play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        if (!resp.ok) {
          if (gen === this._seekGen) this._moveSeparateHead(seconds);
          return;
        }
        const data = await resp.json();
        if (gen !== this._seekGen) return; // un scrub plus récent a gagné
        // Le serveur repart de `seconds` (durée restante renvoyée) →
        // l'estimateur repart de cette position, le clic continue.
        this._sepActive = true;
        this._sepStartMs = performance.now() - Math.max(0, seconds) * 1000;
        if (typeof data.duration_sec === 'number') this._sepDurSec = data.duration_sec;
      } catch {
        if (gen === this._seekGen) this._moveSeparateHead(seconds);
      }
    })();
  }

  /** Déplace uniquement l'estimateur de position (repli si le serveur ne
   * répond pas) : la tête bouge, la lecture serveur continue telle quelle. */
  private _moveSeparateHead(seconds: number) {
    this._sepStartMs = performance.now() - Math.max(0, seconds) * 1000;
  }

  /** Arrêt LOCAL des sources Web Audio (sans toucher au clic séparé serveur).
   * Utilisé par le scrub : la lecture continue, seul le buffer est recréé. */
  private _stopLocalSources() {
    if (this._loopTimer) { clearTimeout(this._loopTimer); this._loopTimer = null; }
    // Arrêter TOUTES les sources actives (boucle crossfade inclus)
    for (const s of this.sources) {
      try { s.stop(); } catch {}
      s.disconnect();
    }
    this.sources = [];
    if (this.source) {
      try { this.source.stop(); } catch {}
      this.source.disconnect();
      this.source = null;
    }
  }

  stop() {
    this._playing = false;
    this._stopSampleLoop();
    // Terminer la promesse du mode séparé (le serveur coupe le son)
    if (this._navPlayResolver) {
      const r = this._navPlayResolver;
      this._navPlayResolver = null;
      r();
    }
    // Fin du mode séparé : plus d'estimateur, plus de body de relance
    this._sepActive = false;
    this._lastNavBody = null;
    this._seekGen++; // invalide tout scrub séparé en vol
    this._stopLocalSources();
    // Arrêter aussi le clic séparé joué par le serveur
    fetch(`${backendUrl()}/navig-click-stop`, { method: 'POST' }).catch(() => {});
  }

  /** Lance la lecture d'un AudioBuffer. En boucle : `source.loop` simple
   * (durée exacte du buffer → timing métronomique strict). Le fade-out
   * backend (30 ms réels) évite le clic à la frontière. Les erreurs sont
   * propagées (pas de lecture fantôme silencieuse). */
  private _playBuffer(buffer: AudioBuffer, loop: boolean) {
    this.stop();
    const ctx = this.audioCtx!;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;
    gainNode.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(gainNode);
    this.ctxTimeAtStart = ctx.currentTime;
    source.start();
    this.source = source;
    this._playing = true;
    this._syncSampleLoop();
    source.onended = () => {
      if (this.source === source) { this._playing = false; this.source = null; }
    };
  }
}

/** Construit un buffer RECADRÉ sur la grille : copie du sample sur
 * `periodSec` (période = multiple entier de la mesure) — coupé si le sample
 * est trop long, complété par du silence (zéros) s'il est trop court.
 * Un micro fade-out (~2 ms) est appliqué à la fin de la partie audible pour
 * éviter tout clic à la jonction de boucle (la coupure peut tomber en plein
 * hit de batterie ; le silence ajouté peut suivre une fin non nulle). */
function buildAlignedBuffer(
  ctx: BaseAudioContext,
  src: AudioBuffer,
  periodSec: number,
): AudioBuffer {
  const srcLen = src.length;
  const periodLen = Math.max(1, Math.round(periodSec * src.sampleRate));
  const copyLen = Math.min(srcLen, periodLen);
  // ~2 ms à 44,1 kHz ≈ 88 échantillons (ajusté si la partie copiée est courte)
  const fadeSamples = Math.min(88, copyLen);
  const out = ctx.createBuffer(src.numberOfChannels, periodLen, src.sampleRate);
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    const s = src.getChannelData(ch);
    const d = out.getChannelData(ch);
    d.set(s.subarray(0, copyLen));
    // Micro fade-out sur la fin de la partie copiée (ramène à zéro)
    for (let i = 0; i < fadeSamples; i++) {
      const idx = copyLen - 1 - i;
      if (idx >= 0) d[idx] *= (i + 1) / (fadeSamples + 1);
    }
  }
  return out;
}

/** Encode un AudioBuffer en WAV PCM 16-bit (interleaved) — utilisé pour
 * l'extraction du rendu avec le sample mixé. */
function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const blockAlign = numCh * 2;
  const dataSize = numFrames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);            // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);           // 16 bits
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
