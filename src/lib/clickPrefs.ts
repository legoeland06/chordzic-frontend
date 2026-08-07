/**
 * Préférences du clic partagées entre le ClickControl (vue Navig) et le
 * moteur de rendu (browserSynth). « Dans le rendu » décide si le clic est
 * intégré au WAV rendu (mode Navig) — synchronisation échantillon-parfaite.
 */
const KEY = 'chordzic_click_in_render';

export const getClickInRender = (): boolean => localStorage.getItem(KEY) === '1';
export const setClickInRender = (v: boolean): void =>
  localStorage.setItem(KEY, v ? '1' : '0');
