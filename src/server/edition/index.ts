// src/server/edition (L3). §9.3 exports: buildEdition, getEdition, listArchive, loadCandidatePool.
// awaitNote=false (request paths) → editor note via after(); awaitNote=true (scripts/jobs) → awaited inline.
export { buildEdition, moversBetween, persistEdition, type PersistInput } from './build';
export { getEdition, listArchive } from './read';
export { loadCandidatePool, rowToCandidate } from './pool';
export { loadTaxonomy, loadTopicEmbeddings } from './taxonomy';
