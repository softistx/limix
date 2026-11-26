/**
 * The Node-only part of the package: reading a rules file from disk. The main
 * entry and `./coverage` import no `node:` module, so they run in a browser.
 */
export { loadRules } from '../rules/load';
