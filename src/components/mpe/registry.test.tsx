/**
 * Tests du registre et du menu MPE : les modules enregistrés sont valides,
 * la sélection via le menu remonte l'id du module choisi.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MPE_MODULES, getMpeModule, mpeModuleIds } from './registry';
import SeaboardModal from './SeaboardModal';
import PushPadGrid from './PushPadGrid';
import MpeMenu from './MpeMenu';

describe('registre des modules MPE', () => {
  it('les modules Seaboard et Push sont enregistrés (le Seaboard en premier)', () => {
    expect(MPE_MODULES.length).toBeGreaterThanOrEqual(2);
    expect(MPE_MODULES[0].id).toBe('seaboard');
    expect(mpeModuleIds()).toContain('push');
  });

  it('chaque module a un id unique, un nom, une icône, une description et une modal', () => {
    const ids = mpeModuleIds();
    expect(new Set(ids).size).toBe(ids.length); // unicité
    for (const m of MPE_MODULES) {
      expect(m.id.length).toBeGreaterThan(0);
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.icon.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
      // memo() retourne un objet {$$typeof, type…} — vérifier la rendabilité
      expect(m.modal).toBeTruthy();
    }
  });

  it('getMpeModule retourne le module demandé, sinon le premier', () => {
    expect(getMpeModule('seaboard').id).toBe('seaboard');
    expect(getMpeModule('push').id).toBe('push');
    expect(getMpeModule('inconnu').id).toBe(MPE_MODULES[0].id);
  });

  it('les modals des modules correspondent aux composants attendus', () => {
    expect(getMpeModule('seaboard').modal).toBe(SeaboardModal);
    expect(getMpeModule('push').modal).toBe(PushPadGrid);
  });
});

describe('MpeMenu (le « deuxième menu » du bouton MPE)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('affiche la liste des modules au clic et remonte la sélection', () => {
    const onSelect = vi.fn();
    const root = createRoot(document.body);
    act(() => {
      root.render(<MpeMenu onSelect={onSelect} active={false} />);
    });
    const btn = document.querySelector('button') as HTMLElement;
    expect(btn.textContent).toContain('MPE');

    // Menu fermé : aucun module visible
    expect(document.body.innerHTML).not.toContain('Seaboard');

    act(() => btn.click());
    expect(document.body.innerHTML).toContain('Seaboard');
    expect(document.body.innerHTML).toContain('Push 3');

    // Clic sur le premier module → onSelect avec son id, menu refermé
    const items = document.querySelectorAll('button');
    const seaboardItem = Array.from(items).find(b => b.textContent?.includes('Seaboard')) as HTMLElement;
    act(() => seaboardItem.click());
    expect(onSelect).toHaveBeenCalledWith('seaboard');
    expect(document.body.innerHTML).not.toContain('Push 3'); // refermé
    act(() => root.unmount());
  });

  it('le bouton est marqué actif quand une modal MPE est ouverte', () => {
    const root = createRoot(document.body);
    act(() => {
      root.render(<MpeMenu onSelect={() => {}} active={true} />);
    });
    const btn = document.querySelector('button') as HTMLElement;
    expect(btn.textContent).toContain('●');
    act(() => root.unmount());
  });
});
