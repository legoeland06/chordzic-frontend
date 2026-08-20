/**
 * 🎛 Rise2Modal — module « ROLI Seaboard RISE 2 » du système MPE.
 *
 * Contrôleur MPE simulé : 49 keywaves 5D (Strike / Glide / Slide / Press /
 * Lift) dans le cadre commun ExpressionFrame. Enregistré dans MPE_MODULES
 * et ouvert via le menu du bouton « 🎛 MPE ».
 */
import { memo } from 'react';
import ExpressionFrame from './ExpressionFrame';
import Rise2Keywaves from './Rise2Keywaves';

interface Rise2ModalProps {
  onClose: () => void;
}

function Rise2Modal({ onClose }: Rise2ModalProps) {
  return (
    <ExpressionFrame
      title="ROLI Seaboard RISE 2"
      icon="🎛"
      pad={Rise2Keywaves}
      onClose={onClose}
    />
  );
}

export default memo(Rise2Modal);
