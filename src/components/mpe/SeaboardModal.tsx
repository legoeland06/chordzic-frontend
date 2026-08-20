/**
 * 🎹 SeaboardModal — module « Seaboard (strip) » du système MPE.
 *
 * Contrôleur MPE simulé : bande tactile plein écran (X = pitch bend,
 * Y = timbre, molette = pression) dans le cadre commun ExpressionFrame.
 * Enregistré dans MPE_MODULES et ouvert via le menu du bouton « 🎛 MPE ».
 */
import { memo } from 'react';
import ExpressionFrame from './ExpressionFrame';
import MpeStrip from './MpeStrip';

interface SeaboardModalProps {
  onClose: () => void;
}

function SeaboardModal({ onClose }: SeaboardModalProps) {
  return (
    <ExpressionFrame
      title="Seaboard — Expression"
      icon="🎹"
      pad={MpeStrip}
      onClose={onClose}
    />
  );
}

export default memo(SeaboardModal);
