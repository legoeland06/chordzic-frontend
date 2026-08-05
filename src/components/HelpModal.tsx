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
import React, { useState } from 'react';

interface HelpModalProps {
  show: boolean;
  onClose: () => void;
}

/** Petite section avec titre + contenu. */
function Section({ id, icon, title, children }: {
  id: string; icon: string; title: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-8 scroll-mt-20">
      <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
        <span>{icon}</span> {title}
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

  if (!show) return null;

  // Sommaire : sections + mots-clés de recherche
  const sections = [
    { id: 'demarrage', icon: '🚀', title: 'Démarrage rapide', keys: 'démarrer jouer premier accord grille' },
    { id: 'accords', icon: '🎼', title: 'Saisie des accords', keys: 'format durée qualité basse silence autocomplétion éditer' },
    { id: 'controles', icon: '🎛️', title: 'Barre de contrôle', keys: 'analyser jouer stop effacer tempo extract wav' },
    { id: 'pistes', icon: '🎚️', title: 'Pistes & réglages', keys: 'piste canal instrument mute volume 432hz navig loop walking pattern mesure reggae' },
    { id: 'pianoroll', icon: '🎹', title: 'Piano Roll', keys: 'note édition sélection créer déplacer redimensionner snap libre quantiser vélocité durée grouper zoom' },
    { id: 'raccourcis', icon: '⌨️', title: 'Raccourcis clavier', keys: 'ctrl z y c x v a suppr espace escape annuler copier coller' },
    { id: 'sauvegarde', icon: '💾', title: 'Sauvegarde & fichiers', keys: 'save load export import json grilles auto restauration actualisation perte' },
    { id: 'copiercoller', icon: '📋', title: 'Copier / coller entre pistes', keys: 'copier coller piste presse-papiers miroir emplacements valeurs' },
    { id: 'boucles', icon: '🔁', title: 'Boucles WAV drums', keys: 'boucle échantillon sample offset drums' },
    { id: 'depannage', icon: '🛠️', title: 'Dépannage', keys: 'pas de son fluidsynth midi muet erreur' },
  ];

  const filtered = sections.filter(s =>
    !query.trim() || (s.title + ' ' + s.keys).toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4"
      onClick={onClose}
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
            onClick={onClose}
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
          <Section id="demarrage" icon="🚀" title="Démarrage rapide">
            <p>
              chordZic est un <b className="text-white">moteur harmonique</b> : vous écrivez une grille
              d'accords, il la joue avec un arrangement automatique complet (lead, basse, nappes,
              batterie, accent) en temps réel.
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-gray-300">
              <li>Saisissez vos accords dans la zone de texte (une grille d'exemple est déjà chargée).</li>
              <li>Cliquez <b className="text-green-400">▶ Jouer</b> pour écouter. <b className="text-red-400">■ Stop</b> arrête.</li>
              <li>Réglez le <b>Tempo</b>, le <b>Pattern</b> (style de batterie) et la <b>Mesure</b>.</li>
              <li>Activez <b className="text-purple-400">📱 Navig.</b> : vue <b>DAW</b> (table de mixage + pistes horizontales) et rendu WAV du PC. <b className="text-amber-400">Extract Wav</b> télécharge le fichier.</li>
              <li>Sauvegardez vos grilles avec <b className="text-emerald-400">Save</b>, retrouvez-les avec <b className="text-cyan-400">Load</b>.</li>
            </ol>
            <p className="text-xs text-gray-500">
              Chaque piste peut être éditée note par note dans le <b>Piano Roll</b> (bouton 🎹 sur la piste).
            </p>
          </Section>

          {/* ── Saisie des accords ── */}
          <Section id="accords" icon="🎼" title="Saisie des accords">
            <p>Format : <code className="text-yellow-300 bg-gray-800 px-1.5 py-0.5 rounded text-xs">{'durée:Accord'}</code> séparés par des espaces.</p>
            <div className="bg-gray-800/60 rounded-lg px-3 py-2 font-mono text-xs text-green-300">
              4:Cm7 2:FM7 4:G7 4:C
            </div>
            <Row k="durée" v={<>nombre de <b>temps</b> avant les deux-points (défaut : 4). Un accord de durée <code>2</code> dure 2 temps, soit une blanche en 4/4.</>} />
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

          {/* ── Barre de contrôle ── */}
          <Section id="controles" icon="🎛️" title="Barre de contrôle">
            <Row k="Analyser" v="Parse immédiatement la grille (l'analyse est sinon automatique ~0,6 s après la frappe)." />
            <Row k="▶ Jouer" v="Lance la lecture de la grille entière (désactivé si la grille est vide)." />
            <Row k="■ Stop" v="Arrête la lecture." />
            <Row k="Extract Wav" v="Télécharge le dernier rendu WAV (mode 📱 Navig.) en fichier .wav." />
            <Row k="🗑 Effacer" v="Arrête et vide la grille." />
            <Row k="💾 Save / 📂 Load" v="Sauvegarde / charge une grille sur le serveur (fichier JSON)." />
            <Row k="📤 / 📥" v="Exporte la grille en fichier JSON / importe un fichier JSON." />
            <Row k="Tempo" v="Slider 40–220 BPM + champ numérique." />
          </Section>

          {/* ── Pistes & réglages ── */}
          <Section id="pistes" icon="🎚️" title="Pistes & réglages">
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
            <p>Sur chaque piste : bouton <b>On / MUTE</b>, sélecteur des <b>128 instruments GM</b> (sauf drums), slider de volume.</p>
            <Row k="Vol:" v="Volume master (10–127)." />
            <Row k="432Hz" v="Accordage A=432 Hz (au lieu de 440 Hz). Actif par défaut — mode Live uniquement." />
            <Row k="📱 Navig." v={<><b>Vue DAW</b> : bascule vers la table de mixage + les pistes horizontales (voir plus bas). Rendu WAV du PC, permet « Extract Wav » et le travail sur les notes de chaque piste.</>} />
            <Row k="🔁 Loop" v="Répète la grille en boucle (désactivé pendant la lecture)." />
            <Row k="🎵 WB" v="Walking bass : la basse joue 4 notes par mesure au lieu d'une tenue. Mode Live uniquement." />
            <Row k="Pattern:" v="Style de batterie : 🎸 Rock (défaut), 🎤 Pop, 🌴 Reggae, ⏬ OneDrop, 🌊 Bossa, 🎷 Jazz. Mode Live uniquement." />
            <Row k="Mesure:" v="Signature rythmique : 4/4 (défaut), 3/4, 6/8." />
            <Row k="🎛️ MIDI:" v="Choisit la sortie MIDI : FluidSynth (logiciel) ou Roland (piano numérique). Mode Live uniquement." />
            <p className="text-xs text-gray-500">
              💡 En mode 📱 Navig., les contrôles d'arrangement automatique (pattern, walking bass, 432Hz,
              grille d'accords) disparaissent : le travail se fait sur <b>vos notes</b>, piste par piste.
            </p>
            <p className="font-bold text-white mt-3">Vue DAW (mode 📱 Navig.)</p>
            <p>
              La <b className="text-white">table de mixage</b> (en haut, à la place du champ texte) : une colonne
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
            <p>
              En dessous, chaque piste est affichée <b className="text-white">horizontalement</b> (une ligne par
              piste, comme dans un DAW) avec ses notes en petits rectangles (position, durée, hauteur = note).
              Les pistes s'ouvrent <b className="text-white">en mode détail</b> (hauteur = hauteur des notes,
              numéros de mesure visibles) ; le <b className="text-white">chevron ▼</b> à gauche les réduit en
              mode fin (bandes compactes), <b className="text-white">▶</b> les agrandit à nouveau.
              Un <b className="text-white">clic sur le nom</b> d'une piste ouvre son Piano Roll pour l'éditer en détail.
              À <b className="text-white">droite du nom</b> de chaque piste, un <b className="text-white">mini-vumètre</b>
              (4 petits tirets vert/jaune/rouge) indique l'activité de la piste pendant la lecture.
            </p>
            <p>
              Les noms des pistes sont dans un <b className="text-white">panneau fixe à gauche</b> : la molette
              (zoom) et le défilement horizontal ne concernent que <b className="text-white">le contenu</b> des pistes.
              Pour <b className="text-white">réordonner les pistes</b>, glissez-déposez le nom d'une piste
              (le nouvel ordre s'applique partout : table de mixage, pistes et mode Live).
              Les pistes sont <b>pré-remplies automatiquement</b> avec l'arrangement classique ; vos
              modifications ne sont jamais écrasées.
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
          <Section id="pianoroll" icon="🎹" title="Piano Roll">
            <p>
              Ouvert par le bouton <b>🎹</b> d'une piste. Les notes que jouerait le mode classique y sont
              <b> pré-remplies automatiquement</b> ; vos modifications ne sont jamais écrasées.
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
            <Row k="− / + (zoom)" v="Zoom horizontal : du fit-to-width (dézoomer suffisamment affiche TOUTE la piste d'un coup) jusqu'à 400 % (ou Ctrl+molette ; Shift+molette = défilement)." />
            <Row k="Reg:" v="Registre visible (plage de notes affichée) ; s'étend automatiquement pour couvrir les notes." />
            <Row k="▶ Lecture" v="Écoute la piste seule (rendu WAV du canal) avec curseur rouge ; Espace = lecture/pause." />
            <p className="text-xs text-gray-500">
              📱 Tactile : pincer pour zoomer, double-tap sur une note = supprimer, barre de défilement en bas.
            </p>
          </Section>

          {/* ── Copier / coller entre pistes ── */}
          <Section id="copiercoller" icon="📋" title="Copier / coller entre pistes">
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
          <Section id="raccourcis" icon="⌨️" title="Raccourcis clavier">
            <p className="text-xs text-gray-500">(Piano Roll ouvert — les raccourcis ⌘ fonctionnent aussi sur Mac)</p>
            <Row k={<><Key>Ctrl</Key>+<Key>Z</Key></>} v="Annuler" />
            <Row k={<><Key>Ctrl</Key>+<Key>Shift</Key>+<Key>Z</Key> / <Key>Ctrl</Key>+<Key>Y</Key></>} v="Rétablir" />
            <Row k={<><Key>Ctrl</Key>+<Key>C</Key> / <Key>X</Key> / <Key>V</Key></>} v="Copier / Couper / Coller" />
            <Row k={<><Key>Ctrl</Key>+<Key>A</Key></>} v="Tout sélectionner" />
            <Row k={<><Key>Delete</Key> / <Key>Backspace</Key></>} v="Supprimer la sélection" />
            <Row k={<Key>Espace</Key>} v="Lecture / pause de la piste (hors saisie)" />
            <Row k={<Key>Esc</Key>} v="Fermer le piano roll" />
            <Row k={<><Key>Ctrl</Key>+molette</>} v="Zoom horizontal" />
            <Row k={<><Key>G</Key> / <Key>H</Key></>} v="Zoom arrière / zoom avant (piano roll)" />
            <Row k={<><Key>Shift</Key>+molette</>} v="Défilement horizontal" />
          </Section>

          {/* ── Sauvegarde & fichiers ── */}
          <Section id="sauvegarde" icon="💾" title="Sauvegarde & fichiers">
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

          {/* ── Boucles WAV drums ── */}
          <Section id="boucles" icon="🔁" title="Boucles WAV drums">
            <p>
              Si des échantillons existent pour le tempo courant dans{' '}
              <code className="text-gray-400">~/samples/drums/</code>, une section « boucle » apparaît :
              volume, toggle <b>🎵 Boucle</b>, choix du fichier et <b>offset en millisecondes</b> (calage fin de la boucle).
            </p>
            <p className="text-xs text-gray-500">
              La boucle est jouée en parallèle de l'arrangement MIDI. Sans échantillon pour ce tempo :
              « Aucune boucle pour {`{tempo}`} bpm dans ~/samples/drums/ ».
            </p>
          </Section>

          {/* ── Dépannage ── */}
          <Section id="depannage" icon="🛠️" title="Dépannage">
            <Row k="Pas de son ?" v="Vérifiez que le synthétiseur FluidSynth tourne et que la sortie MIDI est sur FluidSynth (ou Roland). Le backend se reconnecte automatiquement si FluidSynth redémarre." />
            <Row k="Mode 📱 Navig. muet" v="Relancez la lecture : le WAV est re-synthétisé à chaque lecture. Puis « Extract Wav » pour récupérer le fichier." />
            <Row k="« ❌ Erreur: … »" v="Le serveur a refusé la demande (séquence vide, etc.) — relisez le message affiché dans la ligne de statut." />
            <Row k="Save échoue" v="« Sauvegarde impossible (serveur injoignable) » : le serveur :4000 doit être accessible." />
            <Row k="Boucles absentes" v="Ajoutez des fichiers .wav nommés par tempo (ex. snap_120.wav) dans ~/samples/drums/." />
            <Row k="Registre piano roll" v="S'il s'étend tout seul, resserrez-le avec les sliders Reg: (écart min. 1 octave)." />
          </Section>

          <p className="text-center text-[10px] text-gray-600 pt-4">
            chordZIC V2 · Moteur Harmonique · by Legoeland — documentation intégrée
          </p>
        </div>
      </div>
    </div>
  );
}
