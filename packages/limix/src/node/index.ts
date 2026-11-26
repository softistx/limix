/**
 * The Node-only part of the package: reading a rules file from disk and the
 * file policy store. The main entry, `./coverage` and `./remote` import no
 * `node:` module.
 */
export { loadRules } from '../rules/load';
export { filePolicyStore } from './file-store';
