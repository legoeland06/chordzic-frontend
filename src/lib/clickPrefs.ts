/**
 * Préférences du clic partagées entre le ClickControl (vue Navig) et la vue
 * DAW (DawView). L'état de la config vit côté SERVEUR (/click) ; on garde ici
 * seulement une « signature » de la config courante pour savoir, au moment
 * du Play, si le buffer rendu doit être re-rendu (le clic a changé).
 */
const SIG_KEY = 'chord…c_sig';

export const getClickSig = (): string => localStorage.getItem(SIG_KEY) || '';
export const setClickSig = (v: string): void => localStorage.setItem(SIG_KEY, v);
