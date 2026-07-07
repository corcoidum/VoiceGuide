export { chatgptPack } from './chatgpt.js';
export { githubPack } from './github.js';
export { googleDocsPack } from './googleDocs.js';

import { chatgptPack } from './chatgpt.js';
import { githubPack } from './github.js';
import { googleDocsPack } from './googleDocs.js';
import type { GuidePack } from '../types.js';

/** Packs bundled with the MVP. New packs register without core changes. */
export const builtinPacks: GuidePack[] = [chatgptPack, githubPack, googleDocsPack];
