/**
 * Garde de lecture — décide si un projet contient quelque chose à jouer.
 *
 * Un projet se compose de DEUX sources possibles :
 * - la grille Live (accords, input) ;
 * - les notes des piano rolls (mode Navig).
 *
 * La lecture est possible si AU MOINS une des deux contient des éléments —
 * c'est ce qui permet de lire en mode Navig un contenu créé uniquement en
 * notes, sans aucune grille Live (et vice-versa). L'alerte « rien à jouer »
 * ne doit retentir que si les DEUX sont vides.
 */
export function hasPlayableContent(chordsLength: number, notesLength: number): boolean {
  return chordsLength > 0 || notesLength > 0;
}
