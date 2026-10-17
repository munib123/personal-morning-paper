// src/server/demo (W2-shipkit): the DEMO_FALLBACK snapshot reads. Light on purpose: owners import the
// guards from here. derive.ts (snapshot-time only) pulls in the engine and stays out of this barrel.
export {
  SNAPSHOT_FILE,
  isDemoFallback,
  loadSnapshot,
  readSnapshotFile,
  resetSnapshotCache,
  snapshotBuildEdition,
  snapshotGetArticle,
  snapshotGetEdition,
  snapshotGetHeatmap,
  snapshotGetLearningView,
  snapshotGetProfile,
  snapshotGetStreak,
  snapshotGetStreakView,
  snapshotListArchive,
  snapshotListEditions,
  snapshotPersonaId,
  snapshotProcessSignals,
} from './snapshot';
export { SNAPSHOT_MAX_BYTES, SNAPSHOT_MAX_EVENTS, SNAPSHOT_VERSION, SnapshotSchema } from './schema';
export type { DemoSnapshot, SnapshotActivity, SnapshotCluster, SnapshotEvent, SnapshotInterest } from './schema';
export { pickLocalPdf, stableStringify } from './format';
