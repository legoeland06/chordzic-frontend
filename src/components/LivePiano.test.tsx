/**
 * Tests de rendu du composant LivePiano (react-dom/server, sans DOM).
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import LivePiano from './LivePiano';

describe('<LivePiano />', () => {
  it('affiche 84 touches (7 octaves × 12)', () => {
    const html = renderToString(<LivePiano activePitches={[]} />);
    const liCount = (html.match(/<li/g) ?? []).length;
    expect(liCount).toBe(84);
  });

  it('illumine les touches tenues (classe active)', () => {
    // C4 (60) → "white e", E4 (64) → "white c", G4 (67) → "white a"
    const html = renderToString(<LivePiano activePitches={[60, 64, 67]} />);
    expect(html).toContain('class="white e active"');
    expect(html).toContain('class="white c active"');
    expect(html).toContain('class="white a active"');
    // Une note non tenue de la même classe ne doit PAS être active
    expect(html).not.toContain('class="white e active" class="white e active"');
  });

  it('illumine aussi les touches noires', () => {
    // C#4 (61) → "black cs"
    const html = renderToString(<LivePiano activePitches={[61]} />);
    expect(html).toContain('class="black cs active"');
    // Le C4 voisin reste inactif
    expect(html).not.toContain('class="white e active"');
  });

  it('ignore les notes hors plage (pas d illumination parasite)', () => {
    const html = renderToString(<LivePiano activePitches={[12, 130, 60]} />);
    // Seul C4 (60) illumine
    const activeCount = (html.match(/active/g) ?? []).length;
    expect(activeCount).toBe(1);
  });

  it('peut afficher un nombre d octaves réduit', () => {
    const html = renderToString(<LivePiano activePitches={[36]} octaves={2} />);
    const liCount = (html.match(/<li/g) ?? []).length;
    expect(liCount).toBe(24);
    expect(html).toContain('class="white e active"');
  });

  it('affiche un tooltip note+octave sur chaque touche', () => {
    const html = renderToString(<LivePiano activePitches={[]} octaves={1} />);
    expect(html).toContain('title="C2"');
    expect(html).toContain('title="B2"');
  });
});
