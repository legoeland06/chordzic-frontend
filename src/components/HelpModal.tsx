/**
 * HelpModal — documentation utilisateur de chordZIC V2.
 *
 * ⚠️ RÈGLE DE RELEASE : ce composant DOIT être mis à jour à CHAQUE release
 * (nouvelles fonctionnalités, boutons, raccourcis, changements de
 * comportement visibles). C'est la documentation utilisateur intégrée,
 * accessible via le bouton ❓ du header. Ne jamais livrer une release
 * dont l'aide ne reflète pas l'état réel de l'application.
 *
 * Modal plein écran avec sommaire cliquable et sections détaillées :
 * démarrage rapide, format des accords, barre de contrôle, pistes,
 * piano roll, sauvegarde, extraction WAV, boucles drums et dépannage.
 *
 * Contenu en dur (JSX) : aucune dépendance externe, cohérent avec le
 * thème sombre de l'application.
 */
import React, { useRef, useState } from 'react';
import LivePiano from './LivePiano';
import { backendUrl } from '../lib/chordUtils';
import mpeRise2Svg from '../../docs/mpe-rise2.svg?raw';
import mpeStripSvg from '../../docs/mpe-strip.svg?raw';
import mpePushSvg from '../../docs/mpe-push.svg?raw';

const API_BASE = backendUrl();

/** Illustration SVG (schéma d'un module MPE) — silencieuse pour la lecture vocale. */
function Figure({ svg, caption }: { svg: string; caption: string }) {
  return (
    <figure data-nospeak className="my-2 rounded-xl border border-gray-700/60 bg-[#0d1420]/60 p-2">
      <div className="[&_svg]:w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="mt-1 text-[10px] text-gray-500">{caption}</figcaption>
    </figure>
  );
}

interface HelpModalProps {
  show: boolean;
  onClose: () => void;
}

/** Petite section avec titre + contenu. */
function Section({ id, icon, title, children, onSpeak, speaking }: {
  id: string; icon: string; title: string; children: React.ReactNode;
  onSpeak?: (id: string) => void; speaking?: boolean;
}) {
  return (
    <section id={id} className="mb-8 scroll-mt-20">
      <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
        <span>{icon}</span> {title}
        {onSpeak && (
          <button
            onClick={() => onSpeak(id)}
            className={`ml-auto text-[10px] px-2 py-1 rounded-md border transition-colors shrink-0 ${
              speaking
                ? 'bg-sky-900/40 border-sky-700/50 text-sky-300'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
            }`}
            title={speaking ? 'Arrêter la lecture' : 'Lire la rubrique à voix haute (Piper)'}
          >
            {speaking ? '⏹ Stop' : '🔊 Lire'}
          </button>
        )}
      </h3>
      <div className="text-gray-300 text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

/** Ligne d'un tableau de raccourcis / boutons. */
function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5 border-b border-gray-800 last:border-0">
      <div className="w-36 sm:w-44 shrink-0 font-mono text-yellow-300 text-xs">{k}</div>
      <div className="text-xs text-gray-400">{v}</div>
    </div>
  );
}

/** Pastille de raccourci clavier. */
function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300 font-mono text-[10px]">
      {children}
    </span>
  );
}

export default function HelpModal({ show, onClose }: HelpModalProps) {
  const [query, setQuery] = useState('');

  // ── Lecture vocale des rubriques (Piper via le backend :4000) ──
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; source: AudioBufferSourceNode } | null>(null);

  /** Nettoie le texte avant synthèse : emojis/symboles retirés, espaces
   * normalisés (Piper lit le texte, pas les pictogrammes). */
  const cleanSpeakText = (raw: string): string => {
    return raw
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2705}\u{2795}\u{2796}\u{2714}\u{2716}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      try { audioRef.current.source.stop(); } catch { /* déjà arrêté */ }
      try { audioRef.current.ctx.close(); } catch { /* déjà fermé */ }
      audioRef.current = null;
    }
    setSpeakingId(null);
  };

  /** Lit la rubrique à voix haute (Piper) ; re-clic = arrêt. */
  const speakSection = async (id: string) => {
    if (speakingId === id) { stopSpeaking(); return; }
    stopSpeaking();
    const el = document.getElementById(id);
    if (!el) return;
    // Ignore les illustrations (data-nospeak) : la lecture vocale ne lit que
    // le texte explicatif.
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-nospeak]').forEach(n => n.remove());
    const text = cleanSpeakText(clone.textContent ?? '');
    if (text.length < 2) return;
    try {
      const resp = await fetch(`${API_BASE}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) throw new Error(`TTS HTTP ${resp.status}`);
      const wav = await resp.arrayBuffer();
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const buffer = await ctx.decodeAudioData(wav);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => { setSpeakingId(null); audioRef.current = null; };
      await ctx.resume();
      audioRef.current = { ctx, source };
      setSpeakingId(id);
      source.start();
    } catch (e) {
      console.warn('⚠️ Lecture vocale indisponible (Piper ?) :', e);
      setSpeakingId(null);
    }
  };

  if (!show) return null;

  // Sommaire : sections + mots-clés de recherche
  const sections = [
    { id: 'demarrage', icon: '🚀', title: 'Démarrage rapide', keys: 'démarrer jouer premier accord grille' },
    { id: 'accords', icon: '🎼', title: 'Saisie des accords', keys: 'format durée qualité basse silence autocomplétion éditer' },
    { id: 'livepiano', icon: '🎹', title: 'LivePiano', keys: 'piano live accord détecté illumination insertion grille piste roland midi timer program sustain son' },
    { id: 'mpe', icon: '🎛', title: 'MPE — expression', keys: 'mpe bend pitch aftertouch pression timbre brillance cc74 lfo vibrato seaboard roli osmose enregistrement rec expression jouer sur le son' },
    { id: 'push3', icon: '🥁', title: 'Push 3 — pads', keys: 'push ableton pads sample échantillon import wav mp3 ogg flac retrigger drum machine couleur dégradé palette peinture peindre déclencher' },
    { id: 'controles', icon: '🎛️', title: 'Barre de contrôle', keys: 'analyser jouer stop effacer tempo extract wav' },
    { id: 'clic', icon: '🥁', title: 'Clic & sortie dédiée', keys: 'clic métronome metronome sortie device casque hub usb latence accent synchro' },
    { id: 'pistes', icon: '🎚️', title: 'Pistes & réglages', keys: 'piste canal instrument mute volume 432hz navig loop walking pattern mesure reggae' },
    { id: 'pianoroll', icon: '🎹', title: 'Piano Roll', keys: 'note édition sélection créer déplacer redimensionner snap libre quantiser vélocité durée grouper zoom' },
    { id: 'raccourcis', icon: '⌨️', title: 'Raccourcis clavier', keys: 'ctrl z y c x v a suppr espace escape annuler copier coller' },
    { id: 'sauvegarde', icon: '💾', title: 'Sauvegarde & fichiers', keys: 'save load export import json grilles auto restauration actualisation perte' },
    { id: 'copiercoller', icon: '📋', title: 'Copier / coller entre pistes', keys: 'copier coller piste presse-papiers miroir emplacements valeurs' },
    { id: 'boucles', icon: '🎵', title: 'Boucle sample (Navig)', keys: 'boucle échantillon sample offset drums navig' },
    { id: 'depannage', icon: '🛠️', title: 'Dépannage', keys: 'pas de son fluidsynth midi muet erreur' },
  ];

  const filtered = sections.filter(s =>
    !query.trim() || (s.title + ' ' + s.keys).toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4"
      onClick={() => { stopSpeaking(); onClose(); }}
    >
      <div
        className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">❓</span>
            <h2 className="text-base sm:text-lg font-bold text-white truncate">Aide — chordZic V2</h2>
          </div>
          <button
            onClick={() => { stopSpeaking(); onClose(); }}
            className="px-3 py-1.5 text-sm bg-gray-800 text-gray-400 rounded-lg border border-gray-700 hover:text-white hover:border-gray-500 transition-colors shrink-0"
          >
            ✕ Fermer
          </button>
        </div>

        {/* Recherche */}
        <div className="px-4 sm:px-5 py-2 border-b border-gray-800 shrink-0">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 Rechercher dans l'aide…"
            className="w-full bg-gray-800 text-gray-200 text-sm rounded-lg border border-gray-700 px-3 py-1.5 outline-none focus:border-blue-500 placeholder:text-gray-600"
          />
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {/* Sommaire */}
          <nav className="mb-8 flex flex-wrap gap-1.5">
            {filtered.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 hover:text-yellow-300 transition-colors"
              >
                {s.icon} {s.title}
              </a>
            ))}
            {filtered.length === 0 && (
              <span className="text-xs text-gray-600">Aucune section ne correspond à « {query} »</span>
            )}
          </nav>

          {/* ── Démarrage rapide ── */}
          <Section id="demarrage" icon="🚀" title="Démarrage rapide" onSpeak={speakSection} speaking={speakingId === 'demarrage'}>
            <p>
              chordZic est un <b className="text-white">moteur harmonique</b> : vous écrivez une grille
              d'accords, il la joue avec un arrangement automatique complet (lead, basse, nappes,
              batterie, accent) en temps réel.
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-gray-300">
              <li>Saisissez vos accords dans la zone de texte (une grille d'exemple est déjà chargée).</li>
              <li>Cliquez <b className="text-green-400">▶ Jouer</b> pour écouter. <b className="text-red-400">■ Stop</b> arrête.</li>
              <li>Réglez le <b>Tempo</b>, le <b>Pattern</b> (style de batterie) et la <b>Mesure</b>.</li>
              <li>Activez <b className="text-purple-400">📱 Navig.</b> : vue <b>DAW</b> (panneau piano/mixeur + pistes horizontales) et rendu WAV du PC. <b className="text-amber-400">Extract Wav</b> télécharge le fichier.</li>
              <li>Sauvegardez vos grilles avec <b className="text-emerald-400">Save</b>, retrouvez-les avec <b className="text-cyan-400">Load</b>.</li>
            </ol>
            <p className="text-xs text-gray-500">
              Chaque piste peut être éditée note par note dans le <b>Piano Roll</b> (bouton 🎹 sur la piste).
            </p>
          </Section>

          {/* ── Saisie des accords ── */}
          <Section id="accords" icon="🎼" title="Saisie des accords" onSpeak={speakSection} speaking={speakingId === 'accords'}>
            <p>Format : <code className="text-yellow-300 bg-gray-800 px-1.5 py-0.5 rounded text-xs">{'durée:Accord'}</code> séparés par des espaces.</p>
            <div className="bg-gray-800/60 rounded-lg px-3 py-2 font-mono text-xs text-green-300">
              4:Cm7 2:FM7 4:G7 4:C
            </div>
            <Row k="durée" v={<>le nombre avant les deux-points <b>divise la mesure</b> (défaut : <code>4</code> = 1 temps). Dans une mesure de 4 temps : <code>1</code> = ronde (mesure entière) · <code>2</code> = blanche (2 temps) · <code>3</code> = 3 accords égaux par mesure · <code>4</code> = noire (1 temps) · <code>6</code> = triolet de noire · <code>8</code> = croche · <code>12</code> = triolet de croche · <code>16</code> = double croche · <code>32</code> = triple croche. Ex. <code>3:Cm7/Fx3</code> plaque 3 accords Cm7 espacés également dans une mesure de 4 temps. Dans la grille, la durée est indiquée discrètement par sa <b>figure rythmique</b>.</>} />
            <Row k="répétition" v={<><code>xN</code> après l'accord : répète l'accord (avec sa durée) N fois. Ex. <code className="text-yellow-300 bg-gray-800 px-1 py-0.5 rounded text-xs">2:Cm7x3</code> = <code className="text-yellow-300 bg-gray-800 px-1 py-0.5 rounded text-xs">2:Cm7 2:Cm7 2:Cm7</code>.</>} />
            <Row k="affichage" v={<>les accords majeurs simples s'affichent sans suffixe (<code>C</code>, <code>F#</code>…), et le <code>/</code> n'apparaît que pour une basse alternative (ex. <code>Am7/D</code>).</>} />
            <Row k="fondamentale" v={<>note de <code>A</code> à <code>G</code>, avec dièse <code>#</code> ou bémol <code>b</code> (ex. <code>F#</code>, <code>Bb</code>).</>} />
            <Row k="qualité" v={<>plus de 70 types : triades (<code>m</code>, <code>dim</code>, <code>sus4</code>…), 7tes (<code>7</code>, <code>m7</code>, <code>M7</code>, <code>7#9</code>…), 9/11/13 (<code>9</code>, <code>m9</code>, <code>13b9</code>…), <code>ø</code>, <code>°</code>, <code>add9</code>… Vide ou inconnu → accord <b>majeur</b>.</>} />
            <Row k="basse alt." v={<>après <code>/</code> (ex. <code>Cm7/Bb</code>) : la basse joue la note indiquée (octave grave).</>} />
            <Row k="silence" v={<><code>_</code> (ex. <code>2:_</code>) : vrai silence — aucun instrument ne joue, le tempo continue.</>} />
            <p className="pt-2">
              <b className="text-white">Autocomplétion :</b> tapez <code>4:Cm</code> puis <Key>Tab</Key> →
              menu des qualités (naviguez <Key>↑</Key> <Key>↓</Key>, validez <Key>Tab</Key>/<Key>Enter</Key>, fermez <Key>Esc</Key>).
              Tapez <code>4:</code> pour proposer le <b>dernier accord tapé</b>.
            </p>
            <p>
              <b className="text-white">Édition :</b> cliquez sur un accord de la grille → modal détail
              (notes, intervalles, clavier visuel) ; cliquez sur le chiffrage pour le modifier.
              Glissez les lignes de la grille (↕) pour <b>réordonner</b> les accords (désactivé pendant la lecture).
            </p>
          </Section>

          {/* ── LivePiano ── */}
          <Section id="livepiano" icon="🎹" title="LivePiano" onSpeak={speakSection} speaking={speakingId === 'livepiano'}>
            <p>
              Le <b className="text-white">LivePiano</b> est le panneau commun aux deux modes : piano 88 touches +
              reconnaissance d'accords en temps réel + insertion. En mode <b className="text-white">Live</b> il se trouve
              sous la saisie d'accords, <b>rétractable</b> via le chevron ▲/▼ (la reconnaissance continue de
              tourner même piano replié) ; en mode <b className="text-white">📱 Navig.</b>, il occupe le panneau
              supérieur (onglet <b>🎹 Piano</b>, rétractable lui aussi).
            </p>
            <p className="font-bold text-white mt-3">🎹 Le piano</p>
            <Row k="88 touches" v="Couvre l'étendue réelle du clavier MIDI (A0 → C8) : chaque touche jouée s'illume en bleu en direct (Roland). Le piano s'adapte à la largeur de l'écran (tient toujours sur une ligne)." />
            <Row k="Cliquable" v={<>
              Le piano se joue à la <b className="text-white">souris ou au doigt</b> : chaque touche appuyée envoie
              sa note au <b className="text-white">Roland</b> (note-on à l'appui, note-off au relâchement).
              Un <b className="text-white">clic rapide</b> laisse sonner la note ~0,3 s → on plaque un
              <b className="text-white"> accord en cliquant vite</b> (les notes se chevauchent) ; un maintien
              prolongé = tenue ; plusieurs doigts (écran tactile) = plusieurs notes. En mode Navig la
              note sort sur le <b className="text-white">canal de la piste cible</b> (elle sonne avec l'instrument de
              la piste) ; en Live, sur le canal par défaut du Roland.
            </>} />
            <Row k="Illustration" v={<>
              <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 mt-1">
                <div className="text-[10px] text-gray-500 mb-2">
                  Exemple : accord de <b className="text-cyan-300">Do majeur</b> illuminé (C4·E4·G4) — les deux
                  fondamentales <b className="text-cyan-300">C2·C3</b> à l'octave dans la basse
                </div>
                <div className="w-[440px] max-w-full mx-auto">
                  <LivePiano activePitches={[36, 48, 60, 64, 67]} pitchMin={36} pitchMax={71} />
                </div>
              </div>
            </>} />
            <Row k="Accord détecté" v="Le badge affiche l'accord plaqué en TRÈS GROS + ses notes en clair (ex. C · E · G). Règles : 2 notes = stricte ; 3+ = tolérance ; 1 note = la note seule. La basse réelle départage (C6 vs Am7) ; une basse imposée (≥ 1 octave sous le reste) est notée après un / (ex. C/G, Am7/D)." />
            <p className="font-bold text-white mt-3">📥 Insertion (mode Live — grille)</p>
            <Row k="+ Grille" v="Insère l'accord détecté dans la grille (1 ronde) : clic sur l'accord ou bouton « + Grille »." />
            <Row k="⏱ Timer" v="Un accord tenu ≥ 3 s (réglable 1/2/3/5 s sur le badge) est inséré automatiquement, sans lâcher le clavier." />
            <p className="font-bold text-white mt-3">📥 Insertion (mode Navig — piste)</p>
            <Row k="➕ Piste" v="Insère l'accord en NOTES dans la piste cible — celle dont le Piano Roll intégré est ouvert (mention « → nom de la piste » dans le bandeau). Fin de la piste, durée = 1 mesure. Les notes insérées sont celles réellement jouées (hauteurs exactes, inversions comprises), dans l'ORDRE d'appui." />
            <p className="font-bold text-white mt-3">✨ Illumination (mode Navig)</p>
            <Row k="✨ Piste ON/OFF" v="Pendant la lecture (WAV ou MIDI), les touches s'illument aussi au contenu de la piste jouée (fidèle, même tête de lecture). Le piano s'illume TOUJOURS quand tu joues sur le clavier. Préférence mémorisée." />
            <p className="font-bold text-white mt-3">🎛️ Son de la piste (mode Navig)</p>
            <Row k="Program change" v="Avec une piste sélectionnée et ✨ ON, le Roland reçoit le program change de la piste : tes notes sont renvoyées au clavier sur son canal → tu entends l'instrument de la piste en jouant. La pédale de sustain est relayée (les notes renvoyées durent avec la pédale)." />
            <p className="font-bold text-white mt-3">🔀 Boutons charnières</p>
            <Row k="📱 Navig. / 🖥 Live" v="En haut du cadre (alignés à la mention « Accord détecté ») : bascule entre les deux modes." />
          </Section>

          {/* ── MPE — expression ── */}
          <Section id="mpe" icon="🎛" title="MPE — expression" onSpeak={speakSection} speaking={speakingId === 'mpe'}>
            <p>
              Le bouton <b className="text-white">🎛 MPE</b> (barre de contrôle en mode Live, transport en mode
              Navig) est <b className="text-white">unique</b> : il ouvre un <b className="text-white">menu</b> listant{' '}
              <b className="text-white">tous les contrôleurs MPE simulés</b> (MIDI Polyphonic Expression) —
              ceux déjà développés (🎹 Seaboard, 🎛 ROLI Seaboard RISE 2, 🥁 Push 3 — pads) et ceux à venir
              (LinnStrument, Osmose…). Le choix ouvre la modal du module, qui permet de{' '}
              <b className="text-white">jouer sur le son en direct</b> — bend, pression et timbre — pendant que tu
              joues sur le Roland <b className="text-white">ou pendant un enregistrement</b> (les gestes sont alors
              horodatés avec les notes et réappliqués au rendu). Le serveur relaie tes notes
              (Local Control OFF) et y injecte les modulations : ce que tu entends est modulé en
              temps réel.
            </p>
            <p className="font-bold text-white mt-3">🧩 Modules disponibles</p>
            <Row k="🎹 Seaboard (strip)" v="Bande tactile plein écran — glisser ◀ ▶ = pitch bend, ▲ ▼ = timbre (CC74), molette = pression." />
            <Row k="🎛 ROLI Seaboard RISE 2" v="25 keywaves (C3 → C5, 2 octaves) — un piano assombri : touches blanches pleine hauteur, noires plus courtes, palette sombre, relief par les lumières. Appui = note · glissé vertical = bend (pose = juste) · glissé horizontal (petit) = vibrato · molette = pression · multi-touch. Voir le détail plus bas." />
            <Row k="🥁 Push 3 — pads" v="64 pads échantillonnés (import de samples, retrigger immédiat, couleur posable sur chaque pad en mode 🎨 Peindre, relief convexe) — voir la section dédiée plus bas." />
            <p className="font-bold text-white mt-3">🖐 Le strip tactile (type Seaboard)</p>
            <Row k="Glisser ◀ ▶ (X)" v="Pitch bend : glisse à gauche = grave, à droite = aigu. Le range est réglable (±2 à ±48 demi-tons, RPN 0 posé automatiquement) — défaut ±2 (bend musical)." />
            <Row k="Glisser ▲ ▼ (Y)" v="Timbre / brillance (CC74) : en haut = brillant, en bas = sombre." />
            <Row k="Molette 🖱" v="Pression (aftertouch, channel pressure 0-127) : molette vers le haut = plus de pression, vers le bas = moins — comme si tu enfonçais la touche." />
            <Row k="Retour auto / Maintien" v="Au relâchement : 🔄 retour auto ramène le bend au centre (style Seaboard — le silicone revient) ; 📌 maintien garde la valeur (style Osmose)." />
            <p className="font-bold text-white mt-3">🎛 Le ROLI Seaboard RISE 2</p>
            <Row k="2 octaves · C3 → C5" v="25 keywaves (C3, D3… C4… C5) — un piano assombri : touches blanches pleine hauteur, touches noires plus courtes (comme un vrai piano), palette sombre à faible contraste, relief sculpté par les lumières (liserés, ombres, courbes du sommet). Le repère lumineux marque les notes C." />
            <Row k="🎨 Couleurs de l'instrument" v="Pastilles en haut à droite : un choix de couleurs appliqué globalement à toutes les keywaves (Gris nuit, Bleu nuit, Vert sombre, Ambre sombre, Rose nuit) — persistant." />
            <Row k="🖐 Pose = accord JUSTE" v="Quand tu poses tes doigts, le moteur enregistre la hauteur exacte de CHAQUE doigt et la postule comme valeur par défaut juste : tes doigts peuvent être à des hauteurs différentes, l'accord est parfaitement juste à la pose (indispensable en multi-touch sur écran tactile)." />
            <Row k="Glissé ▲ ▼ (vertical)" v="Pitch bend par TRANSLATION du poignet : à partir de la pose, glisser vers le HAUT = aigu, vers le BAS = grave (une translation d'environ 1/3 de la hauteur = bend max). Range réglable ±2..±48 demi-tons." />
            <Row k="Glissé ◀ ▶ (horizontal, petit)" v="VIBRATO : l'intensité suit le décalage autour du centre de la touche (au centre = rien, vers les bords = vibrato maximal). Fréquence (Hz) et profondeur max (st) réglables dans le bandeau — persistants. Traverser une keywave voisine = glissando (la note change, comme sur le vrai Seaboard)." />
            <Row k="Molette 🖱" v="Pression (aftertouch, channel pressure 0-127)." />
            <Row k="🖐 Multi-touch" v="Plusieurs doigts = plusieurs notes en même temps (chacun garde sa note, son origine de pose et son glissando). Le bend / vibrato suivent le dernier doigt bougé ; quand un doigt se lève, le doigt restant reprend la main." />
            <p className="font-bold text-white mt-3">📐 En pratique (schémas)</p>
            <Figure svg={mpeRise2Svg} caption="ROLI Seaboard RISE 2 — 25 keywaves (2 octaves) : la pose est juste, le glissé vertical bend (translation du poignet), le glissé horizontal fait le vibrato." />
            <Figure svg={mpeStripSvg} caption="Seaboard (strip) — bande tactile : X = bend, Y = timbre, molette = pression." />
            <Figure svg={mpePushSvg} caption="Push 3 — 64 pads échantillonnés (8×8) : import de samples, retrigger immédiat, couleurs par dégradés." />
            <p className="font-bold text-white mt-3">🎚 Sliders & LFO</p>
            <Row k="Bend / Pression / Timbre" v="Réglages fins indépendants du strip, avec valeurs affichées." />
            <Row k="LFO (vibrato auto)" v="Fréquence (0-10 Hz), profondeur (0-24 demi-tons) et forme (sinus / triangle / carré) : le bend oscille tout seul — idéal pour un vibrato pendant une tenue ou un enregistrement." />
            <p className="font-bold text-white mt-3">📊 Affichage temps réel</p>
            <Row k="Notes tenues / Canal / Bend eff." v="Les notes que tu joues sur le Roland (avec leur nom), le canal cible résolu (écho ✨ de la piste si actif, sinon le canal 1), et le bend effectif LFO inclus." />
            <Row k="● REC" v="Rouge quand une session d'enregistrement MIDI tourne : tes gestes MPE sont enregistrés avec les notes et réappliqués au rendu WAV." />
            <Row k="↺ Reset" v="Remet l'expression à zéro (bend centre, pression 0, timbre neutre) — à utiliser si une note semble « bloquée » en bend." />
            <p className="font-bold text-white mt-3">ℹ️ Notes</p>
            <Row k="Fermeture" v="Fermer la modal remet automatiquement l'expression à zéro (jamais de note qui reste bendée)." />
            <Row k="Canal cible" v="Le canal 1 par défaut (ton canal de jeu). Si l'écho ✨ d'une piste est actif (mode Navig), les modulations suivent le canal de la piste." />
          </Section>

          {/* ── Push 3 — pads ── */}
          <Section id="push3" icon="🥁" title="Push 3 — pads" onSpeak={speakSection} speaking={speakingId === 'push3'}>
            <p>
              Le bouton <b className="text-white">🥁 Push</b> (barre de contrôle en mode Live, transport en mode
              Navig) ouvre une <b className="text-white">simulation de l'Ableton Push 3</b> : une grille de{' '}
              <b className="text-white">64 pads (8×8)</b>, chacun déclenchant un échantillon audio importé.{' '}
              À chaque appui, le son du pad s'arrête et se <b className="text-white">redéclenche sans délai</b>
              (retrigger — comportement drum machine). Accessible via le menu <b className="text-white">🎛 MPE →
              « Push 3 — pads »</b>.
            </p>
            <p className="font-bold text-white mt-3">📥 Importer des samples</p>
            <Row k="Bouton Importer" v="Importe un fichier audio (wav / mp3 / ogg / flac / m4a / aiff, max 25 Mo) vers le premier pad libre — sinon le pad 1 (remplacé)." />
            <Row k="Par pad" v="Clic droit (ou touche 🎵 du pad) pour assigner/remplacer le sample d'un pad précis. Le sample est uploadé sur le serveur (~/samples/pads/) et joué via Web Audio." />
            <Row k="Formats" v="Tout ce que le navigateur sait décoder (wav, mp3, ogg, flac, m4a, aiff…). Un sample illisible est signalé." />
            <p className="font-bold text-white mt-3">🎹 Déclenchement</p>
            <Row k="Clic = jouer" v="Chaque appui arrête la lecture précédente du pad et redéclenche depuis le début — zéro délai, idéal pour les breaks et les coups." />
            <Row k="Volume" v="Slider global (0-100 %) pour l'ensemble des pads." />
            <p className="font-bold text-white mt-3">🎨 Couleurs par pad (mode peinture)</p>
            <Row k="🎨 Peindre" v="Active le mode peinture : sélectionne une teinte dans la palette puis CLIQUE sur les pads pour leur poser LA couleur de ton choix, case par case (le clic ne joue plus le sample tant que le mode est actif)." />
            <Row k="Palette" v="9 teintes de base (rouge, orange, jaune, vert, cyan, bleu, violet, rose, blanc). Le blanc = pads « éteints » (style Push)." />
            <Row k="Dégradé + Appliquer à tous" v="4 modes : ■ solide, ▶ horizontal, ▼ vertical, ⤡ diagonal — les 64 pads s'échelonnent en luminosité sur la grille. « Appliquer à tous » ramène TOUS les pads au dégradé global (efface les couleurs posées pad par pad)." />
            <Row k="Relief convexe" v="Chaque case a un dégradé interne qui bombe la surface : la lumière accroche le haut de la case, les bords retombent dans l'ombre." />
            <p className="font-bold text-white mt-3">💾 Persistance</p>
            <Row k="Local" v="Les samples assignés, les couleurs par pad, le dégradé global et le volume sont mémorisés dans le navigateur (localStorage) : retrouvés au prochain chargement." />
          </Section>

          {/* ── Barre de contrôle ── */}
          <Section id="controles" icon="🎛️" title="Barre de contrôle" onSpeak={speakSection} speaking={speakingId === 'controles'}>
            <Row k="Analyser" v="Parse immédiatement la grille (l'analyse est sinon automatique ~0,6 s après la frappe)." />
            <Row k="▶ Jouer" v="Lance la lecture de la grille entière (désactivé si la grille est vide)." />
            <Row k="■ Stop" v="Arrête la lecture." />
            <Row k="Extract Wav" v="Télécharge le dernier rendu WAV (mode 📱 Navig.) en fichier .wav — la boucle sample active y est MIXÉE (mention « sample inclus » dans le statut)." />
            <Row k="🗑 Effacer" v="Arrête et vide la grille." />
            <Row k="💾 Save / 📂 Load" v="Sauvegarde / charge une grille sur le serveur (fichier JSON)." />
            <Row k="📤 / 📥" v="Exporte la grille en fichier JSON / importe un fichier JSON." />
            <Row k="Tempo" v="Slider 40–220 BPM + champ numérique (rangée de réglages sous la barre de contrôle, à droite de la Mesure)." />
          </Section>

          {/* ── Clic & sortie dédiée ── */}
          <Section id="clic" icon="🥁" title="Clic (mode Navig)" onSpeak={speakSection} speaking={speakingId === 'clic'}>
            <p>
              Le <b className="text-amber-400">Clic</b> (vue 📱 Navig, barre de transport) est un{' '}
              <b className="text-white">métronome intégré au rendu WAV</b> : un tick par temps, accentué
              sur le 1ᵉʳ temps de chaque mesure. Le bouton <b className="text-white">🔇</b> coupe le clic
              (mute) et le réactive au dernier volume. Pendant la <b className="text-white">lecture MIDI</b>
              (bouton 🔌), le clic est joué <b className="text-white">en MIDI temps réel</b> (même son,
              métronome GM canal 9 ou sons mélodiques canal 15) : le 🔇 mute et le volume
              agissent <b className="text-white">instantanément</b>, sans relancer la lecture. Deux modes au choix :
            </p>
            <Row k="Dans le rendu" v={<>
              Cochez pour <b className="text-white">mélanger le clic au WAV</b> rendu — synchronisation{' '}
              <b className="text-white">échantillon-parfaite par construction</b> (même passe de rendu,
              même tempo, aucun décalage possible). Le clic sort alors avec le son principal
              (table de mixage comprise). C'est l'état enregistré <b className="text-white">côté serveur</b> :
              pas besoin de changer de mode avant de jouer.
            </>} />
            <Row k="Sortie" v={<>
              Choisissez une <b className="text-white">sortie audio dédiée</b> (ex : la 2ᵉ sortie casque du
              hub USB-C). Le clic est alors joué <b className="text-white">par le serveur</b> en{' '}
              <b className="text-white">double canaux</b> : le son principal sur les canaux 1-2, le clic sur
              les canaux 3-4 d'un <b className="text-white">appareil MULTICANAL</b> — UNE seule horloge →
              <b className="text-white"> synchro échantillon-parfaite</b> entre les deux sorties.
              Sur Mac : crée un <b className="text-white">Agrégat</b> dans « Configuration Audio-MIDI »
              (sortie intégrée + hub USB-C, horloge maîtresse = sortie intégrée) et choisis-le ici.
              Sur Linux : crée un appareil <b className="text-white">« multi » ALSA</b> dans ~/.asoundrc
              (2 sorties → 4 canaux, ex : sortie principale + Roland Piano) et choisis-le ici.
              Le navigateur ne joue plus dans ce mode : la tête de lecture est <b className="text-white">estimée</b>
              (horloge locale) et continue de bouger ; un clic sur une lane relance la lecture
              depuis la position cliquée, <b className="text-white">sans couper le clic</b>.
            </>} />
            <Row k="Son" v={<>
              4 sons au choix : <b className="text-white">Métronome GM</b> (clic + cloche sur le 1ᵉʳ temps),
              <b className="text-white">Woodblock</b>, <b className="text-white">Agogo</b> et{' '}
              <b className="text-white">Taiko</b>.
            </>} />
            <Row k="Volume / Accent" v="Puissance du clic (0–100) et accentuation du 1ᵉʳ temps de mesure." />
            <Row k="Décalage" v={<>
              Plage <b className="text-white">−200…+200 ms</b> (slider + champ, ±1/±10 ms) : si le clic sort{' '}
              <b className="text-white">en avance</b> (chemin USB direct vs PipeWire), augmentez (+) ; s'il sort{' '}
              <b className="text-white">en retard</b>, diminuez (−). Lu <b className="text-white">en direct pendant la
              lecture</b> — mode « Sortie » ET lecture MIDI (🔌) — comme le volume : le clic se cale à
              l'oreille sans relancer.
            </>} />
            <p className="text-xs text-gray-500">
              Le clic n'existe qu'en mode Navig (pas de clic live) — retiré car les deux horloges audio
              ne pouvaient pas rester synchronisées. « Dans le rendu » = synchro parfaite ; « Sortie » =
              clic dans vos oreilles via l'agrégat multicanal, également échantillon-parfait.
            </p>
            <p className="mt-2">
              <b className="text-emerald-400">🎵 Loop</b> (à côté du clic, même barre) : un{' '}
              <b className="text-white">sample audio de quelques mesures</b> (fichiers{' '}
              <code className="text-gray-400">&lt;nom&gt;_&lt;tempo&gt;.wav</code> dans{' '}
              <code className="text-gray-400">~/samples/drums/</code>) est répété en boucle{' '}
              <b className="text-white">pendant la lecture</b>, joué par le navigateur en parallèle du WAV
              principal (même horloge Web Audio → synchro parfaite par construction). Le sélecteur ne
              propose que les samples du tempo courant, avec un badge <b className="text-white">durée · mesures</b>{' '}
              (ex. « 4,0s·2mes »). Le <b className="text-white">Décalage</b> (±1/±10 ms, slider + champ)
              décale la phase de la boucle <b className="text-white">EN DIRECT pendant la lecture</b> :
              tournez-le jusqu'à ce que le sample tombe pile sur les temps — vérification immédiate à
              l'oreille, comme le décalage du clic. La config est sauvegardée avec le projet
              (Save/Load/auto-sauvegarde) et l'offset du fichier est restauré automatiquement au
              chargement. Note : à l'extraction (Extract Wav), la boucle est MIXÉE au morceau — le WAV
              extrait reflète la lecture (seul le clic en mode « Sortie » en est absent).
            </p>
          </Section>

          {/* ── Pistes & réglages ── */}
          <Section id="pistes" icon="🎚️" title="Pistes & réglages" onSpeak={speakSection} speaking={speakingId === 'pistes'}>
            <p>
              <b className="text-white">Pistes dynamiques</b> : 5 pistes par défaut, mais vous pouvez{' '}
              <b className="text-white">ajouter</b> ou <b className="text-white">supprimer</b> (bouton 🗑) des pistes.
              Au clic sur <b>➕ Piste</b>, choisissez le type :
              <b className="text-white"> 🎹 Piste instrument</b> (128 instruments GM au choix) ou{' '}
              <b className="text-white">🥁 Piste drums / percussion</b> (kit de percussion GM, canal 9 s'il est
              libre, sinon un canal libre — le kit sonne sur n'importe quel canal). Les pistes drums ont un
              sélecteur d'instrument désactivé (« Kit drums ») et une plage de notes percussion dans leur piano roll.
              La suppression demande{' '}
              <b className="text-white">toujours une confirmation</b> (la piste et ses notes du piano roll
              sont alors définitivement supprimées — il n'y a pas d'annulation possible). Le{' '}
              <b className="text-white">nom</b> de
              chaque piste est <b className="text-white">modifiable</b> (cliquez dessus, Entrée valide, Esc annule)
              et est sauvegardé avec la grille (Save).
            </p>
            <p>Pistes par défaut (canal, instrument GM, rôle dans l'arrangement) :</p>
            <div className="rounded-lg border border-gray-700 overflow-hidden text-xs">
              {[
                ['🎹 Lead', 'Canal 0', 'Synth Strings 1 (51)', '#60a5fa', 'mélodie / pompe skank'],
                ['🎸 Bass', 'Canal 2', 'Electric Bass finger (33)', '#fbbf24', 'basse (tenue ou walking)'],
                ['🎻 Nappes', 'Canal 3', 'String Ensemble 2 (48)', '#c084fc', "tenues d'accords"],
                ['🥁 Drums', 'Canal 9', 'Kit standard (fixe)', '#f87171', 'batterie (pattern)'],
                ['🎹 Accent', 'Canal 4', 'Electric Grand Piano (2)', '#34d399', 'backbeat 2&4'],
              ].map(([label, ch, inst, color, role]) => (
                <div key={ch as string} className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 last:border-0">
                  <span className="w-20 font-bold" style={{ color: color as string }}>{label}</span>
                  <span className="text-gray-500 w-16">{ch}</span>
                  <span className="text-gray-400 w-44">{inst}</span>
                  <span className="text-gray-500">{role}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              💡 Une piste ajoutée n'a pas de rôle automatique : remplissez-la dans son
              <b> Piano Roll</b> (les notes personnalisées jouent en mode 📱 Navig.).
            </p>
            <p>Les pistes se règlent dans le <b className="text-white">mixeur</b> (mode 📱 Navig., onglet 🎚 Mixer) : nom, <b>MUTE</b>, instrument, volume, effets (reverb/chorus/delay/drive).</p>
            <Row k="Vol:" v="Volume master (10–127)." />
            <Row k="432Hz" v="Accordage A=432 Hz (au lieu de 440 Hz). Désactivé par défaut." />
            <Row k="🎯 Accord en lecture" v={<><b>Modal circulaire translucide</b> (mode Live) : pendant la lecture, l'accord joué par la séquence s'affiche en <b>très gros</b> au centre de l'écran, avec l'accord suivant en petit en dessous (un tiret <code>—</code> pour un silence). Ne bloque pas les clics (transparent aux événements).</>} />
            <Row k="📱 Navig." v={<><b>Vue DAW</b> : le bouton <b>📱 Navig.</b> (en haut du panneau piano, mode Live) bascule vers le mixeur/piano + les pistes horizontales (voir plus bas) ; en mode Navig, le panneau piano porte le bouton <b>🖥 Live</b> pour revenir. Rendu WAV du PC, permet « Extract Wav » et le travail sur les notes de chaque piste. Le bouton <b className="text-amber-400">🔌 MIDI</b> de la barre de transport joue <b>toutes les pistes</b> sur le port MIDI choisi (ex. Roland), comme le mode Live — <b>tête de lecture synchronisée</b>, arrêt par re-clic (⏹) ou Stop, clic sur une piste pour relancer depuis là. Réglage des ports via <b className="text-amber-400">⚙</b>.</>} />
            <Row k="🔁 Loop" v={<>
              Répète la grille en boucle (désactivé pendant la lecture). Avec les{' '}
              <b className="text-white">locators L/R</b> (barre au-dessus des pistes, mode 📱 Navig.), la boucle couvre{' '}
              <b className="text-white">uniquement l'intervalle [L, R[</b> — en lecture WAV <b className="text-white">et</b> en lecture MIDI
              (🔌 MIDI). Les locators sont <b className="text-white">draggables</b> avec <b className="text-white">snap-to-grid</b>
              (alignement au temps entier) : L (bleu) = début, R (orange) = fin de l'intervalle — la zone est
              surlignée en bleu. Les locators suivent le <b className="text-white">snap de la grille</b> (celui du Piano Roll
              intégré : 1/32 → 1/1, triolets, sextolets) comme les notes insérées. Deux champs{' '}
              <b className="text-white">L/R</b> dans la rangée supérieure du transport (entre Mes. et Temps) permettent un réglage
              précis au format <b className="text-white">mesure.temps</b> (ex. <code className="text-gray-400">005.3</code> = 3ᵉ temps de la 5ᵉ mesure —
              cohérent avec la signature), flèches ▲▼ = ±1 temps. Par défaut L=0 et R=fin du morceau (boucle complète). Le clic sur une piste
              (déplacement de la tête) reste libre : au wrap, la lecture revient à L.
            </>} />
            <Row k="✂ Export L–R" v={<>Le bouton <b className="text-white">✂</b> (transport Navig, à côté de l'extraction WAV, actif quand R &gt; L) exporte en fichier WAV la musique <b className="text-white">exactement entre les locators [L, R[</b> : le serveur re-rend la portion (les notes avant L et après R ne sont pas jouées) et télécharge <code>grille_L…-R…_.wav</code>. La section exportée est la musique pure (sans le clic métronome), au tempo et avec les instruments courants (pistes, notes du Piano Roll incluses).</>} />
            <Row k="▶ Play (audio)" v={<><b>Rendu WAV interne</b> (FluidSynth, rapide et silencieux) : le Play joue TOUJOURS l'audio rendu par le PC — il ne déclenche jamais le synthé externe. Pour entendre le morceau avec le son du Roland (ou du synthé choisi), utilise le bouton <b>▶ MIDI</b> du transport : seul le MIDI joue alors.</>} />
            <Row k="🎵 WB" v="Walking bass : la basse joue 4 notes par mesure au lieu d'une tenue. Réglable dans les deux modes (rangée de réglages du mode Live, transport en Navig)." />
            <Row k="Pattern:" v="Style de batterie : 🎸 Rock (défaut), 🎤 Pop, 🌴 Reggae, ⏬ OneDrop, 🌊 Bossa, 🎷 Jazz. Réglable dans les deux modes." />
            <Row k="Mesure:" v="Signature rythmique : 4/4 (défaut), 3/4, 6/8." />
            <Row k="🎛️ MIDI:" v="Choisit la sortie MIDI : FluidSynth (logiciel) ou Roland (piano numérique) — réglage dans le panneau ⚙ des ports MIDI & Audio." />
            <Row k="🎹 Roll" v={<><b>Bouton du mixeur</b> (mode 📱 Navig.) : sur chaque carte de piste, « 🎹 Roll » ouvre/ferme le <b>Piano Roll intégré</b> de cette piste (équivalent au clic sur son nom dans les pistes). Dans la barre d'outils du Piano Roll intégré, le bouton <b>⛶</b> ouvre le même Piano Roll en <b>modal plein écran</b> pour travailler à de meilleures échelles — les deux restent <b>parfaitement synchronisés</b> (mêmes notes, modification instantanée des deux côtés).</>} />
            <Row k="🎹 LivePiano" v={<>
              Le <b>panneau piano</b> (commun Live/Navig) : 88 touches illuminées en direct, accord détecté en
              gros + notes en clair, insertion grille (Live) ou notes dans la piste (Navig), ✨ illumination
              piste, 🎛️ son de la piste (program change + sustain) — voir la section <b>« LivePiano »</b>.
            </>} />
            <p className="text-xs text-gray-500">
              💡 En mode 📱 Navig., la grille d'accords (saisie Live) disparaît : le travail se fait sur
              <b> vos notes</b>, piste par piste. Les réglages (pattern, walking bass, 432Hz, mesure, volume)
              restent disponibles dans la rangée de réglages du transport.
            </p>
            <p className="font-bold text-white mt-3">Vue DAW (mode 📱 Navig.)</p>
            <p>
              L'<b className="text-white">onglet 🎚 Mixer</b> du panneau supérieur (en haut, à la place du champ texte) : une colonne
              par piste avec <b>nom modifiable</b>, <b>instrument</b>, <b>MUTE</b> —
              plus la carte <b>➕ Piste</b> pour ajouter un instrument.
            </p>
            <p className="font-bold text-white mt-2">Fader-vumètre fusionné</p>
            <p>
              Le <b className="text-white">fader de volume</b> occupe toute la hauteur du cadre et sert{' '}
              <b className="text-white">aussi de vumètre</b> : pendant la lecture, sa course s'allume
              (vert → jaune → rouge) selon l'activité de la piste, le curseur doré indiquant le volume.
              Clic ou drag n'importe où sur la course = régler le volume.
            </p>
            <p className="font-bold text-white mt-2">Modules d'effets (FX) par piste</p>
            <p>
              Chaque piste possède 4 <b className="text-white">potentiomètres circulaires</b> disposés{' '}
              <b className="text-white">autour du fader-vumètre</b> (2 à gauche : <b>Rv</b> reverb, <b>Ch</b> chorus ;
              2 à droite : <b>Dl</b> delay, <b>Dr</b> overdrive, 0-100) :{' '}
              <b className="text-white">drag vertical</b> pour régler (vers le haut = +). Ils sont appliqués{' '}
              <b className="text-white">avant le mixage final</b> : chaque piste est rendue séparément, passe dans sa chaîne d'effets
              (overdrive → delay → chorus → reverb), puis les pistes sont mixées. Réglés à 0 (défaut),
              le rendu reste le rendu classique rapide. Sauvegardés avec la grille (Save).
            </p>
            <p className="text-xs text-gray-500">
              💡 Reverb/Chorus sont aussi audibles en mode Live (envoyés au synthé via CC91/93) ;
              delay et overdrive ne s'entendent qu'au rendu WAV (mode 📱 Navig.).
            </p>
            <p className="font-bold text-white mt-4">Mode 🎚 PostProd (post-traitement audio)</p>
            <p>
              Quand le travail MIDI est terminé en mode 📱 Navig., le bouton{' '}
              <b className="text-amber-400">🎚 PostProd</b> (barre de transport) <b>bounce</b> chaque piste
              en WAV (avec ses effets MIDI) et ouvre l'<b>éditeur audio multipiste</b> : les pistes sont
              figées en audio, on n'édite plus de notes mais des <b>clips</b> (waveforms).
            </p>
            <p className="font-bold text-white mt-2">Outils (rail de gauche)</p>
            <p>
              <b className="text-white">V Sélecteur</b> : clic = sélectionner un clip, glisser = le déplacer
              (la timeline s'étend si on pousse un clip au-delà de la fin), glisser sur le fond = sélection de
              région (plusieurs clips), poignées de fade aux coins du clip sélectionné. <b className="text-white">B Ciseaux</b> :
              couper au point cliqué (ligne de coupe au survol). <b className="text-white">E Gomme</b> : supprimer
              (le clip survolé s'illumine en rouge). <b className="text-white">G Main</b> : déplacer.
              <b className="text-white"> T Trimmer</b> : étirer par les bords. <b className="text-white">S</b> : snap
              magnétique ON/OFF. Le <b className="text-white">sélecteur de snap</b> (barre de transport) propose les
              <b> mêmes subdivisions que le Piano Roll</b> : 1/32 → 1/1 (défaut : <b className="text-white">1 temps</b>),
              triolets (1/12, 1/6, 1/3) et sextolets (1/24, 1/18). <b className="text-white">↑↓</b> : gain du clip sélectionné. <b className="text-white">Ctrl+Z</b> :
              annuler. <b className="text-white">Delete</b> : effacer. <b className="text-white"> Espace</b> : lecture.
              Molette : zoom temporel centré curseur.
              <b className="text-white">Dans le Piano Roll</b> (intégré ou modal) : la molette simple fait un
              <b>scroll vertical du registre</b> (aller chercher les notes hors champ — le clavier de piano en
              marge suit), <b>Ctrl+molette</b> ou <b>G/H</b> zoome, <b>Shift+molette</b> défile horizontalement.
              À l'ouverture, le registre s'adapte automatiquement au contenu de la piste (fit vertical).
              Le <b>clavier de piano en marge</b> est rétractable via le bouton <b>🎹</b> de la barre d'outils
              (préférence mémorisée).
            </p>
            <p className="font-bold text-white mt-2">Table de mixage (au-dessus des pistes)</p>
            <p>
              Horizontale, dans le <b>même ordre que les pistes</b> : fader-vumètre, pan L/R, Mute/Solo par
              piste, master à droite. Le chevron <b className="text-amber-400">▲/▼</b> ouvre/ferme la table.
              Pour une piste <b className="text-white">🥁 drums</b>, le menu <b className="text-white">Kit</b> choisit le kit de
              percussion envoyé au synthé MIDI : <b className="text-white">Kit standard</b> (GM) ou les banques du Roland
              <b className="text-white"> JUNO-D</b> (PR-A 01-37, COMMON 01-74, USER 01-16) — banque MSB/LSB + program appliqués
              en MIDI live, lecture Navig et lecture d'une piste.
            </p>
            <p className="font-bold text-white mt-2">Importer un fichier audio</p>
            <p>
              Le bouton <b className="text-amber-400">📁 Importer audio</b> ajoute une piste 🎧 (WAV, MP3, FLAC,
              OGG…) avec <b>toutes les fonctionnalités des autres pistes</b> : clips, coupe, déplacement, fades,
              gain, volume, pan, mute/solo. Les pistes importées sont <b>conservées</b> quand on re-bounce les
              pistes MIDI depuis le mode Navig.
            </p>
            <p className="font-bold text-white mt-2">Mixage et export</p>
            <p>
              Le bouton <b className="text-amber-400">Exporter WAV</b> rend le mix complet (clips, fades, gains,
              faders, pan) en WAV stéréo via un rendu hors-ligne — le fichier exporté est <b>exactement</b> ce
              qu'on entend. Retour au MIDI : bouton <b className="text-blue-400">↩ Navig</b>. Le bounce reste
              valide tant que la grille ne change pas.
            </p>
            <p className="text-xs text-gray-500">
              💡 Édition non destructive : couper/déplacer/effacer ne modifie jamais les WAV d'origine.
            </p>
            <p>
              En dessous, chaque piste est affichée <b className="text-white">horizontalement</b> (une ligne par
              piste, comme dans un DAW) avec ses notes en petits rectangles (position, durée, hauteur = note).
              À l'ouverture, les pistes sont en <b className="text-white">mode aperçu</b> (petite hauteur) ; le{' '}
              <b className="text-white">chevron ▶</b> à gauche les agrandit : le <b className="text-white">Piano Roll intégré</b>{' '}
              s'affiche directement dans la piste (édition complète : créer, déplacer, redimensionner, sélectionner,
              vélocité, couper/copier/coller, undo/redo, audition locale) — ses <b className="text-white">contrôles sont
              dans la barre du haut</b> (juste au-dessus de la table de mixage, polices réduites). Le bouton <b className="text-white">🔌 MIDI</b>
              envoie les notes (même les dernières insérées) sur le <b className="text-white">port MIDI choisi</b> (instrument externe,
              ex. Roland) — le routage se règle via le bouton <b className="text-white">⚙ (en-tête)</b> : ports MIDI et sortie audio.
              Le panneau supérieur (<b className="text-white">🎹 Piano / 🎚 Mixer</b>, onglets) reste ouvert pendant
              l'édition — <b className="text-white">▼</b> le replie.
              Un <b className="text-white">clic sur le nom</b> d'une piste fait la même chose (agrandir/réduire le Piano Roll intégré).
              À <b className="text-white">droite du nom</b> de chaque piste, un <b className="text-white">mini-vumètre</b>
              (4 petits tirets vert/jaune/rouge) indique l'activité de la piste pendant la lecture.
            </p>
            <p>
              Les noms des pistes sont dans un <b className="text-white">panneau fixe à gauche</b> : la molette
              (zoom) et le défilement horizontal ne concernent que <b className="text-white">le contenu</b> des pistes.
              Pour <b className="text-white">réordonner les pistes</b>, glissez-déposez le nom d'une piste
              (le nouvel ordre s'applique partout : table de mixage, pistes et mode Live).
              À l'ouverture du Piano Roll, le <b className="text-white">registre s'adapte automatiquement au contenu</b>
              de la piste (fit vertical) ; vos modifications ne sont jamais écrasées.
            </p>
            <p className="font-bold text-white mt-3">Lecture (barre de transport)</p>
            <Row k="▶ Play" v="Lance le rendu WAV et la lecture depuis la tête de lecture (re-rendu automatique si le contenu a changé)." />
            <Row k="⏸ Pause" v="Gèle le son ET la tête de lecture (reprise exacte)." />
            <Row k="■ Stop" v="Arrête et remet la tête au début." />
            <Row k="⏮ Begin" v="Remet la tête de lecture au début." />
            <Row k="Ligne rouge verticale" v="Indique la position de lecture dans les pistes. Elle court pendant la lecture, se fige à la pause, et se déplace au <b>clic de souris</b> sur une piste (scrub — la lecture repart de l'endroit cliqué)." />
            <Row k="Afficheurs" v="La barre de transport affiche en continu : <b>Mes.</b> (mesure courante · temps dans la mesure, ex. 003.1), <b>Temps</b> écoulé (m:ss.d), <b>Durée</b> totale, <b>BPM</b> et <b>Sig.</b> (signature). Une LED rouge clignote en lecture, ambre en pause." />
            <p className="text-xs text-gray-500">
              💡 Choisir le pattern <b>Reggae</b> applique automatiquement une configuration
              complète (orgue drawbar, piano électrique, basse acoustique, nappes piano, loop activé).
            </p>
          </Section>

          {/* ── Piano Roll ── */}
          <Section id="pianoroll" icon="🎹" title="Piano Roll" onSpeak={speakSection} speaking={speakingId === 'pianoroll'}>
            <p>
              Ouvert par le bouton <b className="text-white">🎹 Roll</b> du mixeur, le <b className="text-white">clic sur le nom</b>
              d'une piste ou son <b className="text-white">chevron ▶</b> (mode 📱 Navig.).
            </p>
            <p className="font-bold text-white mt-3">Mode ✏️ Édition (défaut)</p>
            <Row k="Clic sur le vide" v="Crée une note (audition immédiate). Glisser ajuste la durée." />
            <Row k="Drag sur une note" v="La déplace (le curseur devient une main)." />
            <Row k="Bord droit (↔)" v="Redimensionne la note (le curseur devient une flèche bidirectionnelle)." />
            <Row k="Double-clic" v="Supprime la note." />
            <Row k="Clic simple" v="Sélectionne la note et la joue instantanément." />
            <p className="font-bold text-white mt-3">Mode 🖱 Sélection</p>
            <Row k="Clic" v="Sélectionne (⇧+clic : ajoute/retire)." />
            <Row k="Drag sur le vide" v="Rectangle de sélection (marquee jaune)." />
            <Row k="Drag sur une note" v="Déplace toute la sélection." />
            <p className="font-bold text-white mt-3">Outils de la barre</p>
            <Row k="🧲 Snap / ✋ Libre" v="Snap magnétique sur la grille, ou placement 100 % libre (positions et durées)." />
            <Row k="Snap: 1/16…" v="Subdivision de la grille : 1/32 → 1/1 ; 1/12, 1/6, 1/3 = triolets ; 1/24, 1/18 = sextolets." />
            <Row k="🎯 Quantiser" v="Aligne début ET fin des notes sélectionnées (ou toutes) sur la grille." />
            <Row k="Vel:" v="Vélocité (1–127) des notes sélectionnées." />
            <Row k="Dur:" v="Durée en subdivisions de grille des notes sélectionnées." />
            <Row k="📋 Copier / ✂ Couper / 📌 Coller" v="Presse-papiers du PROJET : Copier prend la sélection — ou TOUTE la piste si rien n'est sélectionné. Coller dans la même piste se fait à l'endroit du dernier clic ; coller dans une AUTRE piste place les notes aux mêmes emplacements et valeurs (voir la section « Copier / coller entre pistes »)." />
            <Row k="⛓ Grouper / Dégrouper" v="Les notes groupées se sélectionnent et se déplacent ensemble (le bord droit reste individuel)." />
            <Row k="↩ Annuler / ↪ Rétablir" v="Historique de 100 gestes." />
            <Row k="🔍 Zoom / défilement" v="Ctrl+molette ou G/H = zoom horizontal (bornes : fit-to-width → 400 %) ; molette simple = scroll vertical du registre (1 demi-ton par cran, « de case en case ») ; Shift+molette = défilement horizontal. Le modal s'ouvre calé sur tout le morceau (fit-to-width)." />
            <Row k="📐 Registre vertical" v="S'adapte automatiquement au contenu de la piste à l'ouverture (fit vertical) ; la molette le déplace (les notes hors champ deviennent accessibles — le clavier en marge suit)." />
            <Row k="⛶ Zoom sur la sélection" v="Recentre et zoome la vue (temps + registre) sur les notes sélectionnées." />
            <Row k="🎹 Clavier en marge" v="Le clavier de piano vertical (à droite) se rétracte/réaffiche via le bouton 🎹 posé sur la marge elle-même (préférence mémorisée)." />
            <Row k="▶ Lecture" v="Écoute la piste seule (rendu WAV du canal) avec curseur rouge ; Espace = lecture/pause." />
            <Row k="🔴 Rec MIDI" v="Enregistre ce que vous jouez sur le clavier (Roland) : un <b>décompte de 4 temps</b> (métronome) puis l'enregistrement démarre — les notes jouées s'affichent <b>en direct en cyan</b> dans le piano roll et sont <b>insérées dans la piste</b> (à la position de la tête de lecture) quand vous arrêtez (re-clic sur REC). <b>Play-along</b> : les AUTRES pistes jouent automatiquement en accompagnement (la piste enregistrée est exclue — vous la jouez vous-même) ; choisissez ce que vous voulez entendre avec les <b>MUTE</b> du mixeur. Le <b>décompte et l'accompagnement sont pilotés par le serveur</b> sur la même horloge (aucun décalage) ; la lecture continue après l'arrêt (▶ MIDI ou Stop pour la couper)." />
            <p className="font-bold text-white mt-3">⌨️ Raccourcis clavier</p>
            <Row k="E / V" v="Outil Édition ↔ outil Sélection." />
            <Row k="Ctrl+G / Ctrl+U" v="Grouper / dégrouper la sélection." />
            <Row k="Q" v="Quantiser (aligne les notes sur la grille)." />
            <Row k="*" v="REC : démarre / arrête l'enregistrement." />
            <Row k="0 · 1 · 2" v="Tête de lecture : début du morceau [1.1] · locator L · locator R." />
            <Row k="O" v="Zoom sur la sélection." />
            <Row k="Ctrl+Espace / Shift+Espace" v="Lecture AUDIO globale / lecture MIDI (Roland). Espace seul = écoute de la piste." />
            <Row k="G / H" v="Zoom horizontal (arrière / avant)." />
            <p className="text-xs text-gray-500">
              📱 Tactile : pincer pour zoomer, double-tap sur une note = supprimer, barre de défilement en bas.
            </p>
          </Section>

          {/* ── Copier / coller entre pistes ── */}
          <Section id="copiercoller" icon="📋" title="Copier / coller entre pistes" onSpeak={speakSection} speaking={speakingId === 'copiercoller'}>
            <p>
              Le presse-papiers est <b className="text-white">partagé entre tous les piano rolls</b> du projet :
              vous pouvez recopier les notes d'une piste (positions, durées, hauteurs, vélocités) dans une
              autre piste, <b className="text-white">aux mêmes emplacements et valeurs</b>.
            </p>
            <p className="font-bold text-white mt-3">Copier</p>
            <Row k="📋 Copier / Ctrl+C" v="Copie la sélection. Sans sélection, copie TOUTE la piste (le plus courant : dupliquer un pattern vers un autre instrument)." />
            <p className="font-bold text-white mt-3">Coller</p>
            <Row k="📌 Coller / Ctrl+V — même piste" v="Colle à l'endroit du dernier clic (comportement historique, décalé)." />
            <Row k="📌 Coller / Ctrl+V — autre piste" v="Colle les notes aux mêmes emplacements et valeurs que la piste d'origine (collage « miroir »). Si la piste de destination contient déjà des notes, une confirmation demande si vous voulez les fusionner (les notes copiées s'ajoutent aux notes existantes — annulable avec Ctrl+Z)." />
            <p className="text-xs text-gray-500">
              💡 Le badge <b className="text-yellow-300">📋 Source · N</b> dans la barre d'outils indique
              le contenu du presse-papiers (piste d'origine + nombre de notes) ; le ✕ le vide.
              Les groupes ⛓ sont préservés, mais détachés des groupes d'origine.
            </p>
          </Section>

          {/* ── Raccourcis clavier ── */}
          <Section id="raccourcis" icon="⌨️" title="Raccourcis clavier" onSpeak={speakSection} speaking={speakingId === 'raccourcis'}>
            <p className="text-xs text-gray-500">(Piano Roll ouvert — les raccourcis ⌘ fonctionnent aussi sur Mac)</p>
            <Row k={<><Key>Ctrl</Key>+<Key>Z</Key></>} v="Annuler" />
            <Row k={<><Key>Ctrl</Key>+<Key>Shift</Key>+<Key>Z</Key> / <Key>Ctrl</Key>+<Key>Y</Key></>} v="Rétablir" />
            <Row k={<><Key>Ctrl</Key>+<Key>C</Key> / <Key>X</Key> / <Key>V</Key></>} v="Copier / Couper / Coller" />
            <Row k={<><Key>Ctrl</Key>+<Key>A</Key></>} v="Tout sélectionner" />
            <Row k={<><Key>Delete</Key> / <Key>Backspace</Key></>} v="Supprimer la sélection" />
            <Row k={<Key>Espace</Key>} v="Lecture / pause de la piste (hors saisie)" />
            <Row k={<Key>Esc</Key>} v="Fermer le piano roll" />
            <Row k={<><Key>Ctrl</Key>+molette</>} v="Zoom horizontal" />
            <Row k={<Key>Molette</Key>} v="Scroll vertical du registre (piano roll)" />
            <Row k={<><Key>G</Key> / <Key>H</Key></>} v="Zoom arrière / zoom avant (piano roll)" />
            <Row k={<><Key>Shift</Key>+molette</>} v="Défilement horizontal" />
          </Section>

          {/* ── Sauvegarde & fichiers ── */}
          <Section id="sauvegarde" icon="💾" title="Sauvegarde & fichiers" onSpeak={speakSection} speaking={speakingId === 'sauvegarde'}>
            <p>
              <b className="text-white">Save / Load</b> utilisent le serveur : les grilles sont stockées en
              fichiers JSON dans <code className="text-gray-400">~/ChordZIC/grilles/</code> (nom, tempo, mesure,
              pistes, pattern, 432 Hz et notes du piano roll).
            </p>
            <p>
              Le <b className="text-white">nom du projet courant</b> (grille chargée, sauvegardée ou importée,
              sans extension) s'affiche à côté du titre : <b className="text-white">chordZic — MonProjet</b>.
            </p>
            <p>
              <b className="text-white">📤 Export</b> télécharge un fichier <code className="text-gray-400">.json</code>
              autonome ; <b className="text-white">📥 Import</b> le relit (les anciens formats sont convertis automatiquement).
            </p>
            <p>
              <b className="text-white">✨ Nouveau projet</b> (bouton <b className="text-fuchsia-400">Nouveau</b>,
              à côté de Save/Load) efface la grille, les pistes (retour aux 5 par défaut), les notes des piano
              rolls et tous les réglages pour <b className="text-white">repartir de zéro</b>. Une
              <b className="text-white"> confirmation</b> est demandée si le projet contient des données
              (jamais de suppression silencieuse). L'auto-sauvegarde locale est purgée : un rechargement
              après « Nouveau projet » démarre bien sur un projet vierge.
            </p>
            <p>
              <b className="text-white">Extract Wav</b> : en mode <b className="text-purple-400">📱 Navig.</b>, lancez une
              lecture puis cliquez — le WAV rendu est téléchargé (nom = début de grille + horodatage).
            </p>
            <p className="font-bold text-white mt-3">Auto-sauvegarde locale (anti-perte) 💾</p>
            <p>
              Depuis la v2.5, le projet est <b className="text-white">auto-sauvegardé automatiquement</b> dans
              le navigateur (localStorage) quelques centaines de ms après chaque modification : grille, tempo,
              mesure, pistes, notes des piano rolls, pattern, 432 Hz… L'indicateur{' '}
              <b className="text-emerald-400">💾 HH:MM</b> (à côté du statut) montre l'heure du dernier
              enregistrement. En cas d'<b className="text-white">actualisation (F5)</b> ou de fermeture
              accidentelle, la session est <b className="text-white">restaurée automatiquement</b> au
              prochain chargement (« ♻️ Session restaurée ») : plus rien n'est perdu.
            </p>
            <p className="text-xs text-gray-500">
              💡 L'auto-sauvegarde est locale au navigateur : elle ne remplace pas Save/Load (qui stockent
              la grille sur le serveur, pour la retrouver sur un autre appareil). Pensez à faire un
              <b> Save</b> pour archiver une version importante.
            </p>
          </Section>

          {/* ── Boucle sample (mode Navig) ── */}
          <Section id="boucles" icon="🎵" title="Boucle sample (mode Navig)" onSpeak={speakSection} speaking={speakingId === 'boucles'}>
            <p>
              Depuis la v2.6.1, les boucles de samples se font <b className="text-white">uniquement en mode{' '}
              <b className="text-purple-400">📱 Navig.</b></b> : le contrôle <b className="text-emerald-400">🎵 Loop</b>{' '}
              (barre de transport, à côté du clic) répète un sample de quelques mesures en boucle{' '}
              <b className="text-white">pendant la lecture</b>, joué par le navigateur en Web Audio en
              parallèle du WAV principal (synchro parfaite par construction). Sélecteur limité au tempo
              courant, badge durée·mesures, volume et <b className="text-white">décalage −2000…+2000 ms</b>{' '}
              (±1/±10 ms, slider + champ) réglable à l'oreille PENDANT la lecture : positif si le sample
              tombe en AVANCE, négatif s'il tombe en RETARD — voir la section du clic pour le principe.
              Au <b className="text-white">changement de tempo</b>, le sample bascule automatiquement sur un
              sample du nouveau tempo (ou la boucle se coupe s'il n'y en a pas). Le{' '}
              <b className="text-emerald-400">verrou 🔒</b> mémorise le décalage POUR CE SAMPLE (préférence
              globale, retrouvée à chaque sélection — le spinner se grise tant qu'il est verrouillé).
              Le décalage est <b className="text-white">sauvegardé avec le projet</b> (Save/Load/auto-sauvegarde,
              si le sample est actif) et <b className="text-white">restauré automatiquement</b> au chargement :
              la position du fichier prime sur la préférence locale — elle est appliquée dès la lecture,
              sans avoir à re-cliquer Stop.
              À l'<b className="text-white">extraction</b> (Extract Wav), le sample est <b className="text-white">MIXÉ</b> au
              morceau (mêmes volume et décalage que la lecture) : le WAV extrait reflète exactement ce
              qu'on entend — mention « sample inclus » dans le statut. (Seul le clic en mode « Sortie », joué
              par le serveur, reste absent du WAV extrait.)
            </p>
            <p>
              <b className="text-white">🎯 Recadrage automatique sur la grille :</b> pour que le sample ne
              dérive JAMAIS du métronome (même après des dizaines de mesures), la période de boucle est
              forcée à un <b className="text-white">multiple entier de la mesure</b> (calculée depuis le tempo
              et la signature). Si la durée réelle du sample n'est pas déjà parfaite, elle est ajustée
              automatiquement : <b className="text-emerald-400">✂ coupée</b> si le sample est trop long,{' '}
              <b className="text-sky-400">silence ajouté</b> s'il est trop court (espace entre chaque
              répétition). Le badge durée·mesures l'indique (✂−X ms / +Y ms) ; le recadrage suit
              immédiatement tout changement de tempo ou de signature.
            </p>
            <p className="text-xs text-gray-500">
              Fichiers attendus : <code className="text-gray-400">&lt;nom&gt;_&lt;tempo&gt;.wav</code> dans{' '}
              <code className="text-gray-400">~/samples/drums/</code> (ex. snap5_160.wav pour 160 BPM).
            </p>
          </Section>

          {/* ── Dépannage ── */}
          <Section id="depannage" icon="🛠️" title="Dépannage" onSpeak={speakSection} speaking={speakingId === 'depannage'}>
            <Row k="Pas de son ?" v="Vérifiez que le synthétiseur FluidSynth tourne et que la sortie MIDI est sur FluidSynth (ou Roland). Le backend se reconnecte automatiquement si FluidSynth redémarre." />
            <Row k="Mode 📱 Navig. muet" v="Relancez la lecture : le WAV est re-synthétisé à chaque lecture. Puis « Extract Wav » pour récupérer le fichier." />
            <Row k="« ❌ Erreur: … »" v="Le serveur a refusé la demande (séquence vide, etc.) — relisez le message affiché dans la ligne de statut." />
            <Row k="Save échoue" v="« Sauvegarde impossible (serveur injoignable) » : le serveur :4000 doit être accessible." />
            <Row k="Boucles absentes" v="Ajoutez des fichiers .wav nommés par tempo (ex. snap_120.wav) dans ~/samples/drums/." />
            <Row k="Registre piano roll" v="Piloté par le contenu (fit vertical à l'ouverture) ; déplacez-le à la molette (scroll vertical) — le clavier en marge suit." />
          </Section>

          <p className="text-center text-[10px] text-gray-600 pt-4">
            chordZIC V2 · Moteur Harmonique · by Legoeland — documentation intégrée
          </p>
        </div>
      </div>
    </div>
  );
}
