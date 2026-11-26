/**
 * The Bun-only part of the package: reading a rules file from disk with
 * `Bun.file` and `Bun.YAML`, and the file policy store. The main entry,
 * `./coverage` and `./remote` use no `node:` or Bun API.
 */

export { filePolicyStore } from './file-store';
export { loadRules } from './load';
