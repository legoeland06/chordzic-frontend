/**
 * Setup global des tests Vitest.
 *
 * Déclare l'environnement React pour les tests de composants : sans
 * `IS_REACT_ACT_ENVIRONMENT`, `act()` (react-dom/test-utils) avertit
 * « not configured to support act(...) ».
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
