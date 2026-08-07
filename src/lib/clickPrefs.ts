/**
 * Préférences du clic partagées entre la ControlBar (ClickControl) et le
 * moteur de rendu Navig (browserSynth). Le « dans le rendu » décide si le
 * clic est intégré au WAV rendu (mode Navig) — synchronisation
 * échantillon-parfaite par construction.
 */
const KEY = 'chordzic_click_render';

export const getClickInRender = (): boolean => localStorage.getItem(KEY) === '1';
export const setClickInRender = (v: boolean): void =>
  localStorage.setItem(KEY, v ? '1' : '0');
