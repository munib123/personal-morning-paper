// Fixtures for every lane (ARCHITECTURE §9.1). Every UI lane builds against these first, and
// src/contracts/contracts.test.ts checks that each one passes its zod schema.
//
// The stories are fictional. They are written to read like real news so that pages can be judged,
// but no event, figure or statement in them is real, and no real person is named or quoted.
// Source ids and names match seed/feeds.json (id = slugify(name)), so they line up with the seeded sources.
//
// The persona is Ayesha in Islamabad, on day 14 of her paper. The scores, tiers, section order and interest
// weights below are derived from one Beta(α, β) interest model with the rank-v1 formulas (§10.4), so the
// numbers agree with each other.
import type { TopicNode, TopicSlug } from './taxonomy';
import { ancestorsOf, rootOf } from './taxonomy';
import type { InterestWeight, Presentation, Profile, TasteCard } from './profile';
import type { ArticleCard, RecallQuestion, Tier } from './article';
import type { ArchiveEntry, Edition, EditionItem, Reason, ReasonCode, ScoreBreakdown, Slot } from './edition';
import type { EventsResult, WeightDelta } from './signals';
import type { HeatmapDay, StreakView } from './streak';
import type { LearningView, SimulationDay, SimulationResult } from './learning';
import taxonomyJson from '../../seed/taxonomy.json';
import topicExtrasJson from '../../seed/topic-extras.json';

// ── Ids and clock ───────────────────────────────────────────────────────────────────────────────
// Fixture ids are 00000000-0000-4000-8000-0000000000NN: articles 01–28, their clusters 31–58,
// the edition 90 and the user 99.
const fid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const FIXTURE_USER_ID = fid(99);
const EDITION_ID = fid(90);
const EDITION_DATE = '2026-10-17';
const EDITION_NUMBER = 14;
const BUILT_AT = '2026-10-17T01:00:00.000Z'; // 06:00 PKT, when the daily job builds the paper

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const r4 = (x: number): number => Math.round(x * 10000) / 10000;

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Taxonomy: seed/taxonomy.json + seed/topic-extras.json, parents first ─────────────────────────
interface RawTopic { slug: string; name: string; description: string; children: RawTopic[] }
interface TopicExtra { emoji: string; synonyms: string[] }

const RAW_ROOTS: RawTopic[] = taxonomyJson.roots;
const EXTRAS: Record<string, TopicExtra> = topicExtrasJson;

function flattenTaxonomy(nodes: RawTopic[], parentSlug: TopicSlug | null, level: 1 | 2 | 3, out: TopicNode[]): TopicNode[] {
  for (const node of nodes) {
    const extra = level < 3 ? EXTRAS[node.slug] : undefined;
    out.push({
      slug: node.slug,
      parentSlug,
      level,
      name: node.name,
      description: node.description,
      emoji: extra?.emoji ?? null,
      synonyms: extra ? [...extra.synonyms] : [],
    });
    if (node.children.length > 0) {
      if (level === 3) throw new Error(`seed/taxonomy.json: ${node.slug} has children below level 3`);
      flattenTaxonomy(node.children, node.slug, level === 1 ? 2 : 3, out);
    }
  }
  return out;
}

/** All 67 topics, depth-first in seed order (every parent comes before its children). Level 3 has no emoji or synonyms. */
export const FIXTURE_TAXONOMY: TopicNode[] = flattenTaxonomy(RAW_ROOTS, null, 1, []);

const TOPICS = new Map<TopicSlug, TopicNode>(FIXTURE_TAXONOMY.map((t) => [t.slug, t]));

function known(slug: TopicSlug): TopicSlug {
  if (!TOPICS.has(slug)) throw new Error(`fixtures: unknown topic slug '${slug}'`);
  return slug;
}
const topicName = (slug: TopicSlug): string => TOPICS.get(known(slug))?.name ?? slug;

// ── Ayesha's interest model: Beta(α, β) per topic (§10.4) ────────────────────────────────────────
// Onboarding picks: World & Pakistan (tile), Cricket, Climate & Environment and AI & Machine Learning (chips).
// Blocked at onboarding: Crypto & Web3. Pinned later: Cricket. Fourteen days of reading moved the rest.
const PICKED = new Set<TopicSlug>(['news', 'sports.cricket', 'science.climate-environment', 'technical.cs.ai-ml']);
const PINNED = new Set<TopicSlug>(['sports.cricket']);
const MUTED = new Set<TopicSlug>(['business.crypto']);
const UNPICKED_PRIOR: readonly [number, number] = [1, 3];
const LEARNED: Record<TopicSlug, readonly [number, number]> = {
  news: [3.6, 1.6],
  'news.pakistan': [4.4, 2.0],
  'news.pakistan.politics': [1.8, 2.8],
  'news.pakistan.law-security': [1.6, 2.9],
  'news.pakistan.cities': [3.0, 2.0],
  'news.south-asia': [1.9, 2.8],
  'news.middle-east': [1.7, 2.9],
  'news.global-affairs': [2.3, 2.4],
  'news.opinion': [1.5, 3.0],
  business: [1.6, 3.0],
  'business.pakistan-economy': [3.6, 2.2],
  'business.markets': [1.6, 2.8],
  'business.startups': [3.0, 2.2],
  'business.personal-finance': [1.8, 2.8],
  technical: [2.6, 2.6],
  'technical.cs': [4.0, 2.4],
  'technical.cs.web-dev': [3.4, 2.6],
  'technical.cs.ai-ml': [9.5, 1.6],
  'technical.cs.devops-cloud': [1.8, 3.0],
  'technical.cs.security': [2.4, 2.6],
  'technical.cs.languages-tools': [2.0, 2.8],
  'technical.cs.data-databases': [2.2, 2.6],
  'technical.cs.research': [1.8, 2.8],
  'technical.gadgets': [1.4, 3.2],
  'technical.industry': [2.4, 2.6],
  'technical.pakistan-tech': [3.2, 2.4],
  science: [2.8, 2.4],
  'science.space': [4.6, 2.4],
  'science.life-sciences': [1.6, 3.0],
  'science.climate-environment': [7.2, 1.8],
  health: [1.4, 3.0],
  'health.public-health': [2.6, 2.4],
  'health.fitness-nutrition': [1.6, 2.9],
  sports: [3.0, 2.2],
  'sports.cricket': [8.2, 1.9],
  'sports.cricket.pakistan': [6.8, 1.8],
  'sports.cricket.international': [3.9, 2.0],
  'sports.cricket.leagues': [4.6, 2.0],
  'sports.football': [1.0, 3.4],
  entertainment: [1.0, 3.2],
  'entertainment.pakistani-showbiz': [1.0, 4.6],
};

const BLEND = [0.6, 0.3, 0.1] as const;
const betaOf = (slug: TopicSlug): readonly [number, number] => LEARNED[slug] ?? UNPICKED_PRIOR;
const meanOf = (slug: TopicSlug): number => { const [a, b] = betaOf(slug); return a / (a + b); };

/** θ̂ = 0.6·m(node) + 0.3·m(parent) + 0.1·m(grandparent), renormalised over the levels that exist. */
function thetaOf(slug: TopicSlug): number {
  const chain = [slug, ...ancestorsOf(slug).reverse()]; // self, parent, grandparent
  let sum = 0;
  let weight = 0;
  chain.forEach((s, i) => { sum += BLEND[i] * meanOf(s); weight += BLEND[i]; });
  return sum / weight;
}

const followed = (slug: TopicSlug): boolean => [slug, ...ancestorsOf(slug)].some((s) => PICKED.has(s));

/** One row per topic, in taxonomy order (what toInterestWeights returns). */
export const FIXTURE_INTEREST_WEIGHTS: InterestWeight[] = FIXTURE_TAXONOMY.map((t) => {
  const [alpha, beta] = betaOf(t.slug);
  return {
    slug: t.slug,
    name: t.name,
    level: t.level,
    theta: r3(thetaOf(t.slug)),
    alpha,
    beta,
    picked: PICKED.has(t.slug),
    muted: MUTED.has(t.slug),
    pinned: PINNED.has(t.slug),
  };
});

// ── Sources (ids = slugify(name) of the verified core feeds in seed/feeds.json) ────────────────
interface Source { id: string; name: string; domain: string; quality: number }

const SRC = {
  techReview: { id: 'mit-technology-review', name: 'MIT Technology Review', domain: 'technologyreview.com', quality: 0.85 },
  cricinfoPk: { id: 'espncricinfo-pakistan', name: 'ESPNcricinfo - Pakistan', domain: 'espncricinfo.com', quality: 0.85 },
  dawnPakistan: { id: 'dawn-pakistan', name: 'Dawn - Pakistan', domain: 'dawn.com', quality: 0.8 },
  brecorder: { id: 'business-recorder-latest', name: 'Business Recorder - latest', domain: 'brecorder.com', quality: 0.7 },
  smashing: { id: 'smashing-magazine', name: 'Smashing Magazine', domain: 'smashingmagazine.com', quality: 0.75 },
  bbcCricket: { id: 'bbc-sport-cricket', name: 'BBC Sport - Cricket', domain: 'bbc.com', quality: 0.85 },
  spaceCom: { id: 'space-com', name: 'Space.com', domain: 'space.com', quality: 0.75 },
  techJuice: { id: 'techjuice', name: 'TechJuice', domain: 'techjuice.pk', quality: 0.6 },
  tribunePakistan: { id: 'express-tribune-pakistan', name: 'Express Tribune - Pakistan', domain: 'tribune.com.pk', quality: 0.7 },
  bleeping: { id: 'bleepingcomputer', name: 'BleepingComputer', domain: 'bleepingcomputer.com', quality: 0.75 },
  geoPakistan: { id: 'geo-news-pakistan', name: 'Geo News - Pakistan', domain: 'geo.tv', quality: 0.65 },
  geoSports: { id: 'geo-news-sports', name: 'Geo News - Sports', domain: 'geo.tv', quality: 0.65 },
  proPakistani: { id: 'propakistani', name: 'ProPakistani', domain: 'propakistani.pk', quality: 0.6 },
  brecorderMarkets: { id: 'business-recorder-markets', name: 'Business Recorder - Markets', domain: 'brecorder.com', quality: 0.7 },
  bbcWorld: { id: 'bbc-news-world', name: 'BBC News - World', domain: 'bbc.com', quality: 0.85 },
  gsmArena: { id: 'gsmarena-news-reviews', name: 'GSMArena news & reviews', domain: 'gsmarena.com', quality: 0.7 },
  dawnHome: { id: 'dawn-home', name: 'Dawn - Home', domain: 'dawn.com', quality: 0.8 },
  dezeen: { id: 'dezeen', name: 'Dezeen', domain: 'dezeen.com', quality: 0.8 },
  guardianFood: { id: 'the-guardian-food', name: 'The Guardian - Food', domain: 'theguardian.com', quality: 0.85 },
  guardianMusic: { id: 'the-guardian-music', name: 'The Guardian - Music', domain: 'theguardian.com', quality: 0.85 },
  dawnImages: { id: 'dawn-images-showbiz-lifestyle', name: 'Dawn Images (showbiz & lifestyle)', domain: 'images.dawn.com', quality: 0.6 },
  infoQ: { id: 'infoq', name: 'InfoQ', domain: 'infoq.com', quality: 0.75 },
  bbcFootball: { id: 'bbc-sport-football', name: 'BBC Sport - Football', domain: 'bbc.com', quality: 0.85 },
  nprHealth: { id: 'npr-health', name: 'NPR - Health', domain: 'npr.org', quality: 0.75 },
  tribuneBusiness: { id: 'express-tribune-business', name: 'Express Tribune - Business', domain: 'tribune.com.pk', quality: 0.7 },
  scienceDaily: { id: 'sciencedaily-all', name: 'ScienceDaily - all', domain: 'sciencedaily.com', quality: 0.7 },
  dw: { id: 'dw-all-english', name: 'DW - all English', domain: 'dw.com', quality: 0.8 },
  register: { id: 'the-register', name: 'The Register', domain: 'theregister.com', quality: 0.75 },
} satisfies Record<string, Source>;

// ── Story copy ──────────────────────────────────────────────────────────────────────────────────
interface RecallSeed { question: string; options: [string, string, string]; answer: 0 | 1 | 2; explanation: string }
interface Copy {
  provider: 'gemini' | 'extractive';
  headline: string | null; // null: extractive, the headline is the title
  brief: string;
  std: string;
  deep: string;
  whyItMatters: string | null;
  keyFact: string;
  recall: RecallSeed | null;
}

/** Gemini enrichment (§10.3): brief ~25 words, std ~60 (the byte), deep ~120 (std plus context). */
function ai(c: { headline: string; brief: string; std: string; more: string; why: string; keyFact: string; recall: RecallSeed }): Copy {
  return {
    provider: 'gemini',
    headline: c.headline,
    brief: c.brief,
    std: c.std,
    deep: `${c.std} ${c.more}`,
    whyItMatters: c.why,
    keyFact: c.keyFact,
    recall: c.recall,
  };
}

const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length;

function sentencesUpTo(sentences: string[], maxWords: number): string {
  const kept: string[] = [];
  let words = 0;
  for (const s of sentences) {
    if (kept.length > 0 && words + wordCount(s) > maxWords) break;
    kept.push(s);
    words += wordCount(s);
  }
  return kept.join(' ');
}

/** Extractive fallback (§10.3 rule 5): whole sentences only; brief and key fact = the first sentence. */
function extractive(sentences: string[]): Copy {
  return {
    provider: 'extractive',
    headline: null,
    brief: sentences[0],
    std: sentencesUpTo(sentences, 60),
    deep: sentencesUpTo(sentences, 120),
    whyItMatters: null,
    keyFact: sentences[0],
    recall: null,
  };
}

interface Story {
  src: Source;
  url: string;
  title: string;
  copy: Copy;
  labels: [TopicSlug, number][]; // most specific first; conf sums to 1
  image: boolean;
  publishedAt: string;
  words: number;
  sourceCount: number; // distinct outlets in the cluster
  also: string[]; // other source names in the cluster (max 5)
  cosPos: number; // cos(profile, story) — drives the similarity term
  cosNeg: number; // cos(negative profile, story)
}

// Headlines Ayesha engaged with in the last 14 days (for the "Because you read" chip and the archive).
const READ_T20_SERIES = 'Pakistan seal the T20 series with a game to spare';
const READ_AI_CODING = 'Open-source AI coding assistants pass a new reliability test';
const READ_ROOFTOP_SOLAR = 'Karachi startup raises seed round for rooftop solar';
const READ_STELLAR_NURSERY = 'Telescope captures the sharpest image yet of a stellar nursery';
const READ_VECTOR_SEARCH = 'Postgres extension speeds up vector search for AI apps';

const STORIES: Story[] = [
  // 01 · lead · technical.cs.ai-ml
  {
    src: SRC.techReview,
    url: 'https://www.technologyreview.com/2026/10/16/small-open-ai-models-benchmark/',
    title: 'Small Open AI Models Are Catching Up Fast, and That Changes Who Gets to Build With Them',
    copy: ai({
      headline: "Small open AI models now rival last year's best systems",
      brief: 'A new independent benchmark finds that compact open-weight language models now match the scores large closed systems posted a year ago, at a fraction of the cost.',
      std: 'An independent benchmark run by university researchers finds that open-weight language models small enough to run on a single laptop now match the scores that large closed systems posted a year ago. The test covered coding, maths and reading comprehension. Running the small models costs about a tenth as much, which could let schools, startups and local governments build their own tools.',
      more: 'The researchers caution that benchmarks reward narrow skills and that small models still make more factual errors on open-ended questions. They also found wide gaps between languages: scores in Urdu and other South Asian languages trailed English by a large margin. The team has published its test set so that others can check the results and add new languages.',
      why: 'Cheaper models that run on ordinary hardware put useful AI within reach of smaller teams, including in Pakistan.',
      keyFact: 'Running the small open models costs about a tenth as much as the large closed systems they now match.',
      recall: {
        question: 'What did the benchmark find about small open-weight AI models?',
        options: ["They now match last year's large closed systems", "They beat today's largest models at every task", 'They cannot yet run on a laptop'],
        answer: 0,
        explanation: 'They matched the scores large closed systems posted a year ago, at about a tenth of the cost.',
      },
    }),
    labels: [['technical.cs.ai-ml', 0.71], ['technical.cs.research', 0.18], ['technical.industry', 0.11]],
    image: true,
    publishedAt: '2026-10-16T21:10:00.000Z',
    words: 1380,
    sourceCount: 8,
    also: ['The Verge', 'WIRED - AI', 'Ars Technica - All', 'TechCrunch - AI', 'Dawn - Tech'],
    cosPos: 0.72,
    cosNeg: 0.05,
  },
  // 02 · top · sports.cricket.pakistan
  {
    src: SRC.cricinfoPk,
    url: 'https://www.espncricinfo.com/story/pakistan-name-squad-for-home-tests-uncapped-leg-spinner-1500101',
    title: 'Uncapped Leg-Spinner Called Up as Pakistan Name 16-Man Squad for Home Tests',
    copy: ai({
      headline: 'Pakistan pick an uncapped leg-spinner for the home Test series',
      brief: "Pakistan's selectors have named a 16-player squad for next month's two home Tests, calling up an uncapped leg-spinner after a strong domestic season.",
      std: "Pakistan's selectors have named a 16-player squad for next month's two-Test home series, calling up an uncapped leg-spinner who took the most wickets in this year's first-class competition. Two fast bowlers return from injury, while an experienced opener has been left out. The first Test is in Rawalpindi, where the pitch has helped spinners in recent seasons.",
      more: 'Selectors said the squad was picked for home conditions and that the left-out opener remains in their plans for the tours that follow. The leg-spinner has played for his region for four seasons and bowled the most overs of any spinner this year. A three-day warm-up match next week will decide the final balance of the side.',
      why: 'Home Tests reward spin, so this pick shows how Pakistan plans to win the series.',
      keyFact: "The uncapped leg-spinner took the most wickets in this year's first-class competition.",
      recall: {
        question: 'Why was the uncapped leg-spinner called up?',
        options: ['He took the most first-class wickets this year', 'He starred in a T20 league final', 'An injured spinner withdrew'],
        answer: 0,
        explanation: "He topped the wicket list in this year's first-class competition.",
      },
    }),
    labels: [['sports.cricket.pakistan', 0.74], ['sports.cricket', 0.26]],
    image: true,
    publishedAt: '2026-10-16T14:30:00.000Z',
    words: 820,
    sourceCount: 5,
    also: ['Dawn - Sport', 'Geo News - Sports', 'Express Tribune - Sports', 'BBC Sport - Cricket'],
    cosPos: 0.58,
    cosNeg: 0.04,
  },
  // 03 · top · science.climate-environment
  {
    src: SRC.dawnPakistan,
    url: 'https://www.dawn.com/news/1950001/satellite-study-maps-karachis-hottest-streets',
    title: "Study maps Karachi's hottest neighbourhoods using satellite data",
    copy: ai({
      headline: "Satellite study maps Karachi's hottest streets, block by block",
      brief: "Researchers combined satellite readings with street sensors to map Karachi's heat block by block, finding dense areas with few trees run several degrees hotter.",
      std: "Researchers combined three summers of satellite readings with a network of street sensors to map Karachi's heat block by block. Dense neighbourhoods with few trees and dark rooftops ran up to 6°C hotter at night than leafy areas nearby. The team says white roofs, shade trees and open water channels would cool the worst blocks fastest, and has shared the maps with city planners.",
      more: 'Night-time heat matters most for health, because bodies cannot recover when temperatures stay high after dark. The hottest blocks also had the fewest public spaces and the oldest housing, so the people most exposed have the fewest ways to escape the heat. The researchers plan to repeat the survey in Lahore and Hyderabad next summer.',
      why: 'Street-level heat maps show where shade and cooler roofs would protect the most people during heatwaves.',
      keyFact: "Karachi's densest, least leafy blocks ran up to 6°C hotter at night than leafy areas nearby.",
      recall: {
        question: "How much hotter did Karachi's densest blocks run at night?",
        options: ['Up to 2°C', 'Up to 6°C', 'Up to 12°C'],
        answer: 1,
        explanation: 'Dense blocks with few trees and dark roofs ran up to 6°C hotter at night.',
      },
    }),
    labels: [['science.climate-environment', 0.81], ['news.pakistan.cities', 0.19]],
    image: true,
    publishedAt: '2026-10-16T18:45:00.000Z',
    words: 950,
    sourceCount: 3,
    also: ['Express Tribune - Pakistan', 'Arab News Pakistan'],
    cosPos: 0.47,
    cosNeg: 0.03,
  },
  // 04 · top · business.pakistan-economy
  {
    src: SRC.brecorder,
    url: 'https://www.brecorder.com/news/40390001/remittances-rise-for-third-straight-month',
    title: "Workers' remittances post third straight monthly increase",
    copy: ai({
      headline: 'Remittances from overseas Pakistanis rise for a third month',
      brief: 'Money sent home by Pakistanis working abroad rose for a third month in a row, helped by a steady rupee and more transfers through banks.',
      std: 'Money sent home by Pakistanis working abroad rose for a third month in a row, according to central bank data released on Friday. Most of the money came from Saudi Arabia, the UAE and the UK. Bankers credit a steady rupee and wider use of mobile banking apps, which have moved more transfers away from informal hawala channels and into the banking system.',
      more: "Remittances are one of Pakistan's biggest sources of foreign currency, and they help pay for imported fuel and food. Economists say the rise gives the country a little more room on its external accounts, but warn that it depends on jobs in the Gulf, where construction and oil prices drive hiring.",
      why: 'Steady remittances support the rupee and help Pakistan pay for imported fuel and food.',
      keyFact: 'Most remittances came from Saudi Arabia, the UAE and the UK.',
      recall: {
        question: 'What do bankers credit for more transfers going through banks?',
        options: ['A new tax on cash', 'Mobile banking apps and a steady rupee', 'Lower oil prices'],
        answer: 1,
        explanation: 'A steady rupee and mobile banking apps moved transfers away from hawala.',
      },
    }),
    labels: [['business.pakistan-economy', 0.83], ['business.personal-finance', 0.17]],
    image: true,
    publishedAt: '2026-10-16T12:20:00.000Z',
    words: 640,
    sourceCount: 4,
    also: ['Dawn - Business', 'Express Tribune - Business', 'Arab News Pakistan'],
    cosPos: 0.41,
    cosNeg: 0.06,
  },
  // 05 · core · technical.cs.web-dev
  {
    src: SRC.smashing,
    url: 'https://www.smashingmagazine.com/2026/10/cross-document-view-transitions-every-browser/',
    title: 'Browsers Agree on a Native Way to Animate Between Pages',
    copy: ai({
      headline: 'Major browsers now support animated transitions between pages',
      brief: 'Every major browser now supports view transitions across pages, so ordinary multi-page websites can animate between screens without a JavaScript framework.',
      std: 'Every major browser now supports cross-document view transitions, a web standard that lets ordinary multi-page websites animate smoothly between pages. Developers opt in with two lines of CSS, and browsers that lack support simply load the next page as before. Early adopters report that shops and news sites feel faster, even though the pages themselves load no quicker.',
      more: 'Until now, smooth transitions mostly required single-page apps built with heavy JavaScript frameworks. The new approach keeps the simplicity of plain links and server-rendered pages, which are easier to cache and to make accessible. Developers can switch the animation off for people who ask their system for reduced motion, so sites stay comfortable for everyone.',
      why: 'Simple multi-page sites can now feel as smooth as complex apps, with less code to maintain.',
      keyFact: 'Developers can enable cross-document view transitions with two lines of CSS.',
      recall: {
        question: 'How do developers turn on cross-document view transitions?',
        options: ['By installing a JavaScript framework', 'With two lines of CSS', 'By rebuilding the site as a single-page app'],
        answer: 1,
        explanation: 'The feature is opt-in with two lines of CSS; unsupported browsers just load pages normally.',
      },
    }),
    labels: [['technical.cs.web-dev', 0.86], ['technical.cs', 0.14]],
    image: true,
    publishedAt: '2026-10-16T09:05:00.000Z',
    words: 1650,
    sourceCount: 1,
    also: [],
    cosPos: 0.52,
    cosNeg: 0.02,
  },
  // 06 · core · sports.cricket.international
  {
    src: SRC.bbcCricket,
    url: 'https://www.bbc.com/sport/cricket/articles/darker-pink-ball-day-night-tests',
    title: 'Darker Pink Ball Approved for Day-Night Tests After Trial',
    copy: ai({
      headline: 'A darker pink ball is approved for day-night Tests',
      brief: 'After a season of trials, a darker pink ball will be used in day-night Tests, following complaints that the old one was hard to see at dusk.',
      std: 'A darker pink ball will be used in day-night Test matches from next season, after a year of trials in domestic cricket. Batters had complained that the old ball was hard to pick up at dusk, when light fades fastest. The new ball also kept its shape and colour longer in the trials, which bowlers hope will bring back swing in the later overs.',
      more: 'Day-night Tests were introduced to draw bigger crowds after work, but players have long said the twilight session plays differently from the rest of the match. Officials will review data from every day-night game next season, including how often batters lose sight of the ball and how quickly it softens, before deciding whether to make the change permanent.',
      why: 'Ball visibility at dusk has shaped results in day-night Tests, so the change could alter how teams plan.',
      keyFact: 'Batters had complained that the old pink ball was hard to see at dusk.',
      recall: {
        question: 'Why is a darker pink ball being introduced?',
        options: ['It is cheaper to make', 'Batters struggled to see the old ball at dusk', 'Bowlers wanted a heavier ball'],
        answer: 1,
        explanation: 'The old ball was hard to pick up at dusk, when light fades fastest.',
      },
    }),
    labels: [['sports.cricket.international', 0.68], ['sports.cricket', 0.32]],
    image: true,
    publishedAt: '2026-10-16T16:40:00.000Z',
    words: 700,
    sourceCount: 3,
    also: ['The Guardian - Cricket', 'ESPNcricinfo - global news'],
    cosPos: 0.49,
    cosNeg: 0.03,
  },
  // 07 · core · science.space
  {
    src: SRC.spaceCom,
    url: 'https://www.space.com/astronomers-water-vapor-nearby-rocky-exoplanet',
    title: 'Astronomers Detect Water Vapor Around a Nearby Rocky Exoplanet',
    copy: ai({
      headline: 'Astronomers find water vapour around a nearby rocky planet',
      brief: 'Astronomers have found signs of water vapour in the atmosphere of a rocky planet about 40 light-years away, a rare result for a world this small.',
      std: "Astronomers using a space telescope have found signs of water vapour in the atmosphere of a rocky planet about 40 light-years from Earth. The planet is slightly larger than Earth and circles a small red star every few days, so it is far too hot for oceans. Still, the result shows that some rocky worlds can hold on to an atmosphere despite their star's flares.",
      more: "Red dwarf stars are the most common in the galaxy, and their violent flares were thought to strip nearby planets bare. The team measured starlight passing through the planet's atmosphere during several transits and found the water signal each time. Other astronomers say more observations are needed to rule out spots on the star itself, which can mimic the same signal.",
      why: 'Most stars are red dwarfs, so rocky planets keeping atmospheres there would widen the search for habitable worlds.',
      keyFact: 'The rocky planet is about 40 light-years from Earth and orbits a small red star every few days.',
      recall: {
        question: 'Why can the planet not have oceans?',
        options: ['It has no atmosphere', 'It is far too hot', 'It is made of gas'],
        answer: 1,
        explanation: 'It circles its red star every few days, so it is far too hot for oceans.',
      },
    }),
    labels: [['science.space', 0.88], ['science.discoveries', 0.12]],
    image: true,
    publishedAt: '2026-10-16T19:30:00.000Z',
    words: 1100,
    sourceCount: 4,
    also: ['NASA - News Releases', 'New Scientist', 'The Guardian - Science'],
    cosPos: 0.44,
    cosNeg: 0.02,
  },
  // 08 · core · business.startups
  {
    src: SRC.techJuice,
    url: 'https://www.techjuice.pk/lahore-agritech-startup-raises-6-million-crop-insurance/',
    title: 'Lahore-based agritech startup raises $6 million to expand crop insurance app',
    copy: ai({
      headline: 'Lahore agritech startup raises $6 million for crop insurance',
      brief: 'A Lahore startup that sells weather-based crop insurance through a phone app has raised $6 million to reach more small farmers in Punjab and Sindh.',
      std: 'A Lahore startup that sells weather-based crop insurance through a phone app has raised $6 million from local and Gulf investors. Farmers pay a small premium when they sow, and the app pays out automatically when satellite data shows drought or flooding, with no claim forms. The company says it covers 40,000 farmers and plans to expand across Punjab and Sindh.',
      more: 'Most small farmers in Pakistan have no insurance, so a single bad season can push a family into debt. Automatic payouts avoid the slow inspections that made older schemes unpopular. The startup will use the money to hire field agents, add wheat and cotton cover, and partner with microfinance banks.',
      why: 'Automatic payouts could protect small farmers from the debt that follows a single failed harvest.',
      keyFact: 'The app pays out automatically when satellite data shows drought or flooding.',
      recall: {
        question: 'How does the startup decide when to pay farmers?',
        options: ['Farmers file a claim form', 'Satellite data shows drought or flooding', 'An inspector visits the field'],
        answer: 1,
        explanation: 'Payouts are automatic when satellite data shows drought or flooding.',
      },
    }),
    labels: [['business.startups', 0.66], ['technical.pakistan-tech', 0.21], ['science.climate-environment', 0.13]],
    image: true,
    publishedAt: '2026-10-16T10:15:00.000Z',
    words: 720,
    sourceCount: 2,
    also: ['ProPakistani'],
    cosPos: 0.57,
    cosNeg: 0.03,
  },
  // 09 · core · news.pakistan.cities
  {
    src: SRC.tribunePakistan,
    url: 'https://tribune.com.pk/story/2600001/islamabad-adds-30-electric-feeder-buses',
    title: 'Capital to get 30 new electric feeder buses by December',
    copy: ai({
      headline: 'Islamabad adds 30 electric buses to its feeder routes',
      brief: 'Islamabad will add 30 electric buses to the routes that feed its metro line, linking outer sectors and nearby towns to the city centre.',
      std: 'Islamabad will add 30 electric buses to the feeder routes that connect outer sectors and nearby towns to its metro line, city officials said. The buses are due by December and will run every 15 minutes at peak hours. Fares stay the same, and riders will be able to pay with the same card used on the metro.',
      more: "Feeder routes carry many of the city's daily commuters, but the older diesel buses are often crowded and late. Officials expect the electric fleet to cut fuel costs and roadside fumes along the busiest corridors. New charging points are being built at two depots, and the city plans to replace the rest of the diesel fleet over the next three years.",
      why: 'Faster, cleaner feeder buses could shorten daily commutes for people living on the edge of the capital.',
      keyFact: "Islamabad's 30 new electric feeder buses will run every 15 minutes at peak hours.",
      recall: {
        question: 'How often will the new feeder buses run at peak hours?',
        options: ['Every 5 minutes', 'Every 15 minutes', 'Every 30 minutes'],
        answer: 1,
        explanation: 'The 30 electric buses will run every 15 minutes at peak hours.',
      },
    }),
    labels: [['news.pakistan.cities', 0.79], ['news.pakistan', 0.21]],
    image: false,
    publishedAt: '2026-10-16T07:50:00.000Z',
    words: 540,
    sourceCount: 3,
    also: ['Dawn - Pakistan', 'Aaj English TV - latest'],
    cosPos: 0.36,
    cosNeg: 0.05,
  },
  // 10 · core · technical.cs.security
  {
    src: SRC.bleeping,
    url: 'https://www.bleepingcomputer.com/news/security/open-source-image-library-patches-critical-flaw/',
    title: 'Popular Open-Source Image Library Patches Critical Remote Code Execution Flaw',
    copy: ai({
      headline: 'A widely used image library fixes a critical security flaw',
      brief: 'Maintainers of a widely used open-source image library have fixed a flaw that let a booby-trapped picture run code on servers that process uploads.',
      std: 'Maintainers of a widely used open-source image library have released a fix for a critical flaw that let a specially crafted picture run code on any server that resizes uploaded images. The bug affects millions of websites that use the library behind the scenes. Security researchers urge developers to update now, because attack code is already circulating online.',
      more: 'Image libraries are a common weak point because they parse complicated file formats from untrusted users. Many sites do not know they depend on this one, since it arrives inside frameworks and content tools. Developers can check their dependency lists, update to the patched release, and, as a stopgap, block uncommon image formats until the update is in place.',
      why: 'Any site that resizes user uploads may be exposed, and working attack code is already public.',
      keyFact: 'The flaw let a specially crafted picture run code on servers that resize uploaded images.',
      recall: {
        question: 'What could the booby-trapped picture do?',
        options: ['Crash phones that viewed it', 'Run code on servers that resize uploads', 'Steal passwords from browsers'],
        answer: 1,
        explanation: 'A crafted image could run code on any server that resizes uploaded images.',
      },
    }),
    labels: [['technical.cs.security', 0.77], ['technical.cs.languages-tools', 0.23]],
    image: false,
    publishedAt: '2026-10-16T22:15:00.000Z',
    words: 900,
    sourceCount: 4,
    also: ['The Hacker News (security)', 'Krebs on Security', 'The Register'],
    cosPos: 0.46,
    cosNeg: 0.04,
  },
  // 11 · core · health.public-health
  {
    src: SRC.geoPakistan,
    url: 'https://www.geo.tv/latest/650001-dengue-cases-rise-twin-cities',
    title: 'Dengue cases rise in twin cities as health department steps up fumigation',
    copy: ai({
      headline: 'Dengue cases climb in Rawalpindi and Islamabad after the monsoon',
      brief: 'Hospitals in Rawalpindi and Islamabad are seeing more dengue patients as the post-monsoon peak arrives, and officials are urging residents to clear standing water.',
      std: 'Hospitals in Rawalpindi and Islamabad are treating more dengue patients as the post-monsoon peak arrives, health officials said. Teams are fumigating the worst-hit neighbourhoods and checking rooftops, tyres and water tanks where mosquitoes breed. Officials urge residents to empty standing water every few days and to see a doctor quickly if a high fever comes with body pain.',
      more: 'Dengue usually peaks in October and November, when warm weather and leftover rainwater give mosquitoes ideal breeding spots. Most patients recover with rest and fluids, but a small share develop severe illness that needs hospital care. Doctors advise against taking painkillers such as aspirin or ibuprofen without advice, because they can raise the risk of bleeding.',
      why: 'Clearing standing water at home is the simplest way to cut dengue risk during the seasonal peak.',
      keyFact: 'Dengue usually peaks in October and November, when leftover rainwater gives mosquitoes breeding spots.',
      recall: {
        question: 'What do officials ask residents to do?',
        options: ['Stay indoors after sunset', 'Empty standing water every few days', 'Boil drinking water'],
        answer: 1,
        explanation: 'Mosquitoes breed in standing water, so residents should empty it every few days.',
      },
    }),
    labels: [['health.public-health', 0.84], ['news.pakistan.cities', 0.16]],
    image: true,
    publishedAt: '2026-10-16T11:30:00.000Z',
    words: 610,
    sourceCount: 3,
    also: ['Express Tribune - Pakistan', 'ARY News - all'],
    cosPos: 0.33,
    cosNeg: 0.07,
  },
  // 12 · core · sports.cricket.leagues
  {
    src: SRC.geoSports,
    url: 'https://www.geo.tv/latest/650002-t20-league-teams-retain-four-players',
    title: 'PSL franchises to retain four players each ahead of next season draft',
    copy: ai({
      headline: 'T20 league teams can keep four players before the draft',
      brief: "Each franchise in Pakistan's top T20 league may keep four players before next season's draft, down from eight, to spread talent more evenly.",
      std: "Each franchise in Pakistan's top T20 league may keep only four players before next season's draft, down from eight, under new rules announced on Thursday. Organisers say the change will spread star players more evenly and make more matches competitive. Teams must name their retained players by the end of November, and the draft itself will be held in Lahore in December.",
      more: 'Fewer retentions mean the strongest sides will lose some of the players who won them titles, while weaker teams get an earlier pick of proven talent. Franchise owners had asked for longer contracts to build loyal fan bases, so the league plans to review the rule after one season.',
      why: "Fewer retained stars could reshuffle every squad and make next season's title race more open.",
      keyFact: 'Franchises may now keep four players before the draft, down from eight.',
      recall: {
        question: 'How many players may each franchise now keep before the draft?',
        options: ['Two', 'Four', 'Eight'],
        answer: 1,
        explanation: 'The limit drops from eight to four retained players per franchise.',
      },
    }),
    labels: [['sports.cricket.leagues', 0.81], ['sports.cricket.pakistan', 0.19]],
    image: true,
    publishedAt: '2026-10-16T05:10:00.000Z',
    words: 480,
    sourceCount: 2,
    also: ['Dawn - Sport'],
    cosPos: 0.55,
    cosNeg: 0.05,
  },
  // 13 · core · technical.pakistan-tech
  {
    src: SRC.proPakistani,
    url: 'https://propakistani.pk/2026/10/16/it-exports-grow-first-quarter-freelancers/',
    title: 'IT exports grow in first quarter as freelancers lead the way',
    copy: ai({
      headline: "Pakistan's IT exports grow as freelancers lead the rise",
      brief: "Pakistan's IT exports grew in the first quarter of the fiscal year, with freelancers and small software firms earning a bigger share than before.",
      std: "Pakistan's IT and IT-enabled services exports grew in the first quarter of the fiscal year, according to central bank figures, with freelancers and small software firms earning a bigger share than before. Industry groups credit faster payment channels for freelancers. They warn that slow internet speeds and frequent outages could hold back growth unless broadband capacity improves soon.",
      more: 'Software and services are one of the few export sectors that need little imported material, so each extra dollar earned helps the balance of payments directly. Freelancers sell design, writing and programming work to clients abroad, often through global platforms. Industry groups want cheaper business internet and simpler tax filing so that more of them can register as companies.',
      why: 'Tech exports bring in dollars without big import bills, but they depend on reliable internet.',
      keyFact: "Freelancers and small software firms earned a bigger share of Pakistan's IT exports than before.",
      recall: {
        question: 'What do industry groups warn could hold back IT export growth?',
        options: ['Slow internet speeds and outages', 'A shortage of laptops', 'New export taxes'],
        answer: 0,
        explanation: 'They warn that slow internet and frequent outages could hold back growth.',
      },
    }),
    labels: [['technical.pakistan-tech', 0.72], ['business.pakistan-economy', 0.28]],
    image: true,
    publishedAt: '2026-10-16T08:40:00.000Z',
    words: 560,
    sourceCount: 3,
    also: ['TechJuice', 'Dawn - Tech'],
    cosPos: 0.5,
    cosNeg: 0.04,
  },
  // 14 · core · business.markets (extractive)
  {
    src: SRC.brecorderMarkets,
    url: 'https://www.brecorder.com/news/40390002/stocks-close-higher-banking-shares-extend-gains',
    title: 'Stocks close higher as banking shares extend gains',
    copy: extractive([
      'The Pakistan Stock Exchange closed higher on Friday as banking and energy shares extended their gains for a second session.',
      'Traders said buying was driven by expectations of steady interest rates and strong quarterly results from large lenders.',
      'Trading volumes rose compared with the previous session, while cement and textile stocks traded mostly flat through the day.',
      'Analysts expect the market to stay range-bound next week as investors wait for fresh inflation data.',
      'Foreign investors were small net sellers during the session, while local mutual funds and insurers were the main buyers.',
      'Oil and gas exploration shares gained after global crude prices edged up overnight.',
      'Fertiliser stocks slipped on profit-taking after a strong run earlier in the month.',
      'The rupee was little changed against the dollar in the interbank market.',
    ]),
    labels: [['business.markets', 0.88], ['business.pakistan-economy', 0.12]],
    image: false,
    publishedAt: '2026-10-16T11:05:00.000Z',
    words: 330,
    sourceCount: 2,
    also: ['Dawn - Business'],
    cosPos: 0.28,
    cosNeg: 0.08,
  },
  // 15 · core · news.global-affairs
  {
    src: SRC.bbcWorld,
    url: 'https://www.bbc.com/news/articles/ministers-meet-ahead-of-un-climate-summit',
    title: 'Ministers meet ahead of UN climate summit to break deadlock on adaptation funding',
    copy: ai({
      headline: 'Ministers meet early to unblock climate adaptation funding',
      brief: "Environment ministers from about 50 countries are meeting ahead of next month's UN climate summit to agree how money for adapting to climate change is shared.",
      std: "Environment ministers from about 50 countries are meeting this weekend ahead of next month's UN climate summit, hoping to settle a long dispute over adaptation funding. Poorer countries want a clear share of climate money set aside for sea walls, drought-resistant crops and early-warning systems. Richer countries favour counting private investment toward the goal, which poorer nations call too uncertain.",
      more: 'Adaptation pays for protection against climate impacts that can no longer be avoided, from floods to heatwaves. Countries such as Pakistan, which suffered severe floods in recent years, argue that they did little to cause the warming but carry much of the cost. Negotiators hope that a deal this weekend would leave the summit free to focus on cutting emissions.',
      why: 'How adaptation money is shared decides whether flood-prone countries like Pakistan can afford stronger defences.',
      keyFact: 'Poorer countries want a clear share of climate money set aside for adaptation, such as sea walls and early-warning systems.',
      recall: {
        question: 'What do richer countries want to count toward the adaptation goal?',
        options: ['Private investment', 'Debt relief', 'Carbon taxes'],
        answer: 0,
        explanation: 'Richer countries favour counting private investment, which poorer nations call too uncertain.',
      },
    }),
    labels: [['news.global-affairs', 0.58], ['science.climate-environment', 0.42]],
    image: true,
    publishedAt: '2026-10-16T23:20:00.000Z',
    words: 900,
    sourceCount: 4,
    also: ['The Guardian - World', 'DW - all English', 'France 24 - English'],
    cosPos: 0.42,
    cosNeg: 0.05,
  },
  // 16 · core · technical.gadgets (extractive)
  {
    src: SRC.gsmArena,
    url: 'https://www.gsmarena.com/budget_phones_seven_years_updates_pledge-news-70001.php',
    title: 'Budget phones get seven years of software updates in new industry pledge',
    copy: extractive([
      'Several large Android phone makers have agreed to provide at least seven years of security updates for new models, including budget phones.',
      'Until now, long support periods were mostly limited to expensive flagship devices.',
      'The pledge applies to phones launched from next year and covers security patches rather than every new feature.',
      'Consumer groups welcomed the move, saying longer support lets people keep phones for more years and cuts electronic waste.',
      'Repair shops say batteries and screens, not software, are now the main reason people replace older handsets.',
      'The companies have not said whether existing models will receive longer support.',
      'Regulators in several regions have been pushing for longer update periods as part of wider right-to-repair rules.',
    ]),
    labels: [['technical.gadgets', 0.9], ['technical.industry', 0.1]],
    image: false,
    publishedAt: '2026-10-16T13:25:00.000Z',
    words: 420,
    sourceCount: 3,
    also: ['The Verge', 'Engadget'],
    cosPos: 0.31,
    cosNeg: 0.06,
  },
  // 17 · bigstory · health.public-health
  {
    src: SRC.dawnHome,
    url: 'https://www.dawn.com/news/1950002/nationwide-polio-drive-begins-monday',
    title: 'Nationwide anti-polio drive begins Monday, targets over 40 million children',
    copy: ai({
      headline: 'A nationwide polio drive aims to reach 40 million children',
      brief: 'A week-long polio vaccination campaign starts on Monday across Pakistan, with health workers going door to door to reach more than 40 million children under five.',
      std: 'A week-long polio vaccination campaign starts on Monday across Pakistan, with health workers going door to door to reach more than 40 million children under five. Teams will also be posted at bus stations, markets and border crossings. Officials say recent sewage samples from several cities still show the virus circulating, so every child needs the drops, even if vaccinated before.',
      more: "Pakistan and Afghanistan are the last two countries where wild polio has never been stopped. Repeated doses build stronger protection, which is why campaigns return several times a year. Parents can also take children to any government health centre during the week. Vaccinators mark each child's finger with ink so that teams can see who has been reached.",
      why: 'Polio is still circulating in Pakistan, and every round of drops brings the country closer to ending it.',
      keyFact: 'Pakistan and Afghanistan are the last two countries where wild polio has never been stopped.',
      recall: {
        question: 'Why does every child need the drops, even if vaccinated before?',
        options: ['The vaccine formula has changed', 'Sewage samples show the virus still circulating', 'Old records were lost'],
        answer: 1,
        explanation: 'Recent sewage samples from several cities still show the virus circulating.',
      },
    }),
    labels: [['health.public-health', 0.61], ['news.pakistan', 0.39]],
    image: true,
    publishedAt: '2026-10-16T15:00:00.000Z',
    words: 760,
    sourceCount: 9,
    also: ['Geo News - Top', 'Express Tribune - Home', 'ARY News - all', 'Arab News Pakistan', 'BBC News - Asia'],
    cosPos: 0.3,
    cosNeg: 0.04,
  },
  // 18 · explore · arts.design-architecture
  {
    src: SRC.dezeen,
    url: 'https://www.dezeen.com/2026/10/16/mud-brick-school-sindh-cool-without-air-conditioning/',
    title: 'Mud-brick school in Sindh keeps classrooms cool without air conditioning',
    copy: ai({
      headline: 'A mud-brick school in Sindh stays cool without air conditioning',
      brief: 'A school built from mud bricks and lime in rural Sindh keeps classrooms several degrees cooler than concrete buildings nearby, without using air conditioning.',
      std: 'A primary school built from mud bricks and lime in rural Sindh keeps its classrooms several degrees cooler than concrete buildings nearby, with no air conditioning. Thick walls soak up the daytime heat, a raised roof lets warm air escape, and wind-catchers draw breezes through the rooms. Local builders made the bricks on site, keeping costs below a standard concrete school.',
      more: 'The design borrows from traditional houses in the region, which used similar wind-catchers for centuries before concrete became common. The architects trained local workers in the techniques, so the village can repair the building itself. Teachers say attendance has stayed higher during the hottest months than at the old school, where classes often ended early.',
      why: 'Cheap, locally made buildings that stay cool could keep children learning through longer, hotter summers.',
      keyFact: 'Wind-catchers and thick mud walls keep the Sindh school cooler than nearby concrete buildings.',
      recall: {
        question: "What draws breezes through the school's rooms?",
        options: ['Ceiling fans', 'Wind-catchers', 'Solar-powered vents'],
        answer: 1,
        explanation: 'Wind-catchers draw breezes through the rooms while thick walls absorb heat.',
      },
    }),
    labels: [['arts.design-architecture', 0.74], ['science.climate-environment', 0.26]],
    image: true,
    publishedAt: '2026-10-16T06:30:00.000Z',
    words: 1200,
    sourceCount: 2,
    also: ['designboom'],
    cosPos: 0.38,
    cosNeg: 0.03,
  },
  // 19 · explore · lifestyle.food
  {
    src: SRC.guardianFood,
    url: 'https://www.theguardian.com/food/2026/oct/16/how-to-make-winter-pickles-at-home',
    title: 'The slow joy of fermenting your own winter pickles',
    copy: ai({
      headline: 'How to make winter pickles at home with three ingredients',
      brief: 'Winter carrot and turnip pickles need only vegetables, salt and mustard seed, and a week in a warm spot, cooks say, making them an easy first ferment.',
      std: 'Winter carrot and turnip pickles need only vegetables, salt and crushed mustard seed, plus a week in a warm spot. The salt draws water out of the vegetables, and natural bacteria slowly turn their sugars sour. The jar is ready when the liquid turns cloudy and tangy. Kept in the fridge afterwards, the pickle stays crisp for about a month.',
      more: 'Cooks recommend a clean glass jar and vegetables cut into even sticks so that they ferment at the same pace. Shaking the jar once a day spreads the mustard and keeps the top layer under the brine. If mould appears on the surface or the smell turns unpleasant rather than sour, the batch should be thrown away.',
      why: 'Home fermenting is cheap, uses winter vegetables at their best, and needs no special equipment.',
      keyFact: 'Salt draws water out of the vegetables, and natural bacteria turn their sugars sour.',
      recall: {
        question: 'How can you tell the pickle is ready?',
        options: ['The vegetables turn soft and brown', 'The liquid turns cloudy and tangy', 'Bubbles stop appearing'],
        answer: 1,
        explanation: 'The jar is ready when the liquid turns cloudy and tangy.',
      },
    }),
    labels: [['lifestyle.food', 0.92], ['lifestyle.home-living', 0.08]],
    image: true,
    publishedAt: '2026-10-16T04:45:00.000Z',
    words: 1300,
    sourceCount: 1,
    also: [],
    cosPos: 0.22,
    cosNeg: 0.05,
  },
  // 20 · serendipity · entertainment.music
  {
    src: SRC.guardianMusic,
    url: 'https://www.theguardian.com/music/2026/oct/16/young-qawwali-group-european-tour',
    title: 'The young qawwali group packing out European concert halls',
    copy: ai({
      headline: 'A young Lahore qawwali group sells out its first European tour',
      brief: 'A qawwali ensemble whose members are all under 30 has sold out its first European tour, drawing audiences who had never heard the devotional music before.',
      std: 'A qawwali ensemble from Lahore whose members are all under 30 has sold out its first European tour, playing 12 cities in a month. The group keeps the traditional harmonium, tabla and hand-clapping, but trims performances to fit concert halls. Many listeners found the group through short clips online, and organisers say most tickets went to people new to qawwali.',
      more: 'Qawwali is a form of Sufi devotional music that grew up in South Asia over several centuries, and traditional performances can last all night. The ensemble learned from older masters in Lahore before starting to tour. It plans to release a studio recording next year and to return to Europe for a second, longer tour.',
      why: 'A centuries-old devotional tradition is finding a new, younger audience far from home.',
      keyFact: 'The under-30 qawwali ensemble played 12 European cities in a month.',
      recall: {
        question: 'How did many new listeners discover the group?',
        options: ['Through radio interviews', 'Through short clips online', 'Through a film soundtrack'],
        answer: 1,
        explanation: 'Many listeners found the group through short clips online.',
      },
    }),
    labels: [['entertainment.music', 0.79], ['arts.culture-heritage', 0.21]],
    image: true,
    publishedAt: '2026-10-16T03:20:00.000Z',
    words: 1500,
    sourceCount: 2,
    also: ['Dawn Images (showbiz & lifestyle)'],
    cosPos: 0.34,
    cosNeg: 0.06,
  },
  // 21 · reserve · entertainment.pakistani-showbiz
  {
    src: SRC.dawnImages,
    url: 'https://images.dawn.com/news/1190001/hit-drama-serial-gets-second-season',
    title: 'Hit drama serial gets a second season after record streaming numbers',
    copy: ai({
      headline: 'A hit TV drama returns for a second season after streaming success',
      brief: 'A popular Pakistani drama serial will return for a second season after its episodes drew record views on streaming platforms at home and abroad.',
      std: 'A popular Pakistani drama serial will return for a second season after its episodes drew record views on streaming platforms, many of them from viewers outside the country. The producers say most of the original cast will return, and filming starts in Lahore next month. The new season will have fewer episodes, which the producers say keeps the story tighter.',
      more: 'Pakistani dramas have built large audiences across South Asia and the Middle East, and streaming has made it easier for viewers abroad to follow them as they air. Producers increasingly plan shorter seasons with streaming in mind, rather than the long runs that once filled weekly television slots for most of a year.',
      why: 'Streaming is changing how Pakistani dramas are made, with shorter seasons aimed at viewers worldwide.',
      keyFact: "The drama's second season will have fewer episodes than the first.",
      recall: {
        question: 'Where will filming for the new season start?',
        options: ['Karachi', 'Lahore', 'Islamabad'],
        answer: 1,
        explanation: 'Filming for the second season starts in Lahore next month.',
      },
    }),
    labels: [['entertainment.pakistani-showbiz', 0.71], ['entertainment.tv-streaming', 0.29]],
    image: true,
    publishedAt: '2026-10-16T17:10:00.000Z',
    words: 520,
    sourceCount: 3,
    also: ['Geo News - Entertainment', 'Express Tribune - Life & Style'],
    cosPos: 0.12,
    cosNeg: 0.41,
  },
  // 22 · reserve · technical.cs.devops-cloud
  {
    src: SRC.infoQ,
    url: 'https://www.infoq.com/news/2026/10/container-platform-two-year-support/',
    title: 'Container Orchestration Project Moves to Two-Year Support Windows',
    copy: ai({
      headline: 'A major container platform extends support to two years',
      brief: 'The maintainers of a widely used container orchestration platform will support each stable release for two years, up from about fourteen months.',
      std: 'The maintainers of a widely used open-source container orchestration platform will support each stable release for two years, up from about fourteen months. Operators had complained that frequent forced upgrades took weeks of testing and caused outages. Security fixes will still arrive quickly, but new features will only land in the latest release, which keeps older branches simpler to patch.',
      more: 'Longer support matters most for banks, hospitals and governments, which often run strict change controls and cannot upgrade every few months. Cloud providers that sell managed versions of the platform are expected to follow the new schedule. The maintainers will review the policy after the first two-year release reaches the end of its support window.',
      why: 'Teams running critical systems get fewer forced upgrades, which means less risky maintenance work.',
      keyFact: 'Each stable release will now be supported for two years, up from about fourteen months.',
      recall: {
        question: 'How long will each stable release now be supported?',
        options: ['Six months', 'Fourteen months', 'Two years'],
        answer: 2,
        explanation: 'Support rises to two years, up from about fourteen months.',
      },
    }),
    labels: [['technical.cs.devops-cloud', 0.83], ['technical.cs.languages-tools', 0.17]],
    image: true,
    publishedAt: '2026-10-16T20:20:00.000Z',
    words: 1050,
    sourceCount: 2,
    also: ['The Register'],
    cosPos: 0.56,
    cosNeg: 0.02,
  },
  // 23 · reserve · sports.football (extractive)
  {
    src: SRC.bbcFootball,
    url: 'https://www.bbc.com/sport/football/articles/late-winner-sends-leaders-four-points-clear',
    title: 'Late winner sends league leaders four points clear',
    copy: extractive([
      'A stoppage-time header gave the league leaders a 2-1 win on Friday night and moved them four points clear at the top of the table.',
      'The visitors had equalised early in the second half and defended deep for most of the final half-hour.',
      "The winning goal came from a corner, the side's fifth set-piece goal of the season.",
      'Their nearest rivals play on Sunday and can cut the gap back to one point with a win.',
      "The home side's manager rested two key midfielders ahead of a midweek European tie.",
      'Both players are expected to return for that match.',
      'The defeat leaves the visitors in the bottom half after a run of three games without a win.',
    ]),
    labels: [['sports.football', 1]],
    image: false,
    publishedAt: '2026-10-16T22:45:00.000Z',
    words: 610,
    sourceCount: 2,
    also: ['The Guardian - Football'],
    cosPos: 0.18,
    cosNeg: 0.12,
  },
  // 24 · reserve · health.fitness-nutrition
  {
    src: SRC.nprHealth,
    url: 'https://www.npr.org/sections/health/2026/10/16/short-walks-after-meals-blood-sugar',
    title: 'Short walks after meals may help control blood sugar, review finds',
    copy: ai({
      headline: 'Short walks after meals help steady blood sugar, review finds',
      brief: 'A review of past studies finds that walking for just a few minutes after eating lowers blood sugar spikes, with the clearest benefit in people with diabetes.',
      std: 'A review of past studies finds that walking for just two to five minutes after a meal lowers the spike in blood sugar that follows eating. The effect was strongest when people walked within an hour of eating, and clearest in people with type 2 diabetes. Even standing up helped a little, though light walking worked noticeably better than standing.',
      more: 'Muscles use glucose for fuel, so moving soon after a meal pulls sugar out of the blood before it peaks. Researchers say the habit is easy to fit into a day: a short walk after lunch, or a few minutes of pacing during a phone call. They caution that walking does not replace medicine for people who need it.',
      why: 'A few minutes of walking after meals is a free, easy habit that may protect long-term health.',
      keyFact: 'Walking for two to five minutes after a meal lowers the blood sugar spike that follows eating.',
      recall: {
        question: 'When did walking help blood sugar the most?',
        options: ['Before breakfast', 'Within an hour of eating', 'Late at night'],
        answer: 1,
        explanation: 'The effect was strongest when people walked within an hour of eating.',
      },
    }),
    labels: [['health.fitness-nutrition', 0.81], ['health.medicine', 0.19]],
    image: true,
    publishedAt: '2026-10-16T13:50:00.000Z',
    words: 880,
    sourceCount: 2,
    also: ['Medical Xpress'],
    cosPos: 0.27,
    cosNeg: 0.05,
  },
  // 25 · reserve · business.personal-finance
  {
    src: SRC.tribuneBusiness,
    url: 'https://tribune.com.pk/story/2600002/banks-launch-app-only-savings-accounts',
    title: 'Banks roll out digital savings accounts with zero minimum balance',
    copy: ai({
      headline: 'Banks launch app-only savings accounts with no minimum balance',
      brief: 'Several Pakistani banks have launched savings accounts that open entirely in an app, need no minimum balance and pay profit monthly.',
      std: 'Several Pakistani banks have launched savings accounts that open entirely in a mobile app using a national ID card and a selfie, with no minimum balance. Profit is paid monthly, though rates are lower than on fixed deposits. Bankers hope the accounts will draw in young savers and people who have never had a bank account, especially women.',
      more: 'Opening an account at a branch can take several visits and paperwork, which keeps many people using cash. App-based accounts have daily limits on deposits and transfers until customers complete extra checks. The accounts can also be used to receive salaries and remittances. Financial advisers suggest comparing profit rates and fees across banks before moving savings, because terms differ widely.',
      why: 'Easier accounts could bring more people into formal banking and help them save safely.',
      keyFact: 'The new savings accounts open in an app with a national ID card and a selfie.',
      recall: {
        question: 'What do you need to open the new app-only accounts?',
        options: ['A national ID card and a selfie', 'A salary slip and a guarantor', 'A visit to a branch'],
        answer: 0,
        explanation: 'The accounts open in an app using a national ID card and a selfie.',
      },
    }),
    labels: [['business.personal-finance', 0.77], ['technical.pakistan-tech', 0.23]],
    image: false,
    publishedAt: '2026-10-16T09:45:00.000Z',
    words: 590,
    sourceCount: 1,
    also: [],
    cosPos: 0.35,
    cosNeg: 0.04,
  },
  // 26 · reserve · science.life-sciences
  {
    src: SRC.scienceDaily,
    url: 'https://www.sciencedaily.com/releases/2026/10/261016071500.htm',
    title: 'Underwater recordings reveal how blind Indus river dolphins navigate murky water',
    copy: ai({
      headline: 'Recordings show how blind Indus dolphins find their way',
      brief: 'Underwater microphones in the Indus have recorded how its nearly blind dolphins use rapid clicks to map the muddy river and find fish.',
      std: 'Researchers placed underwater microphones along a stretch of the Indus in Sindh and recorded how its nearly blind river dolphins use rapid clicks to map the muddy water. The dolphins clicked faster near fishing nets and barrages, suggesting they work harder to avoid them. The team hopes the recordings can warn fishers when dolphins are close and reduce accidental deaths in nets.',
      more: 'The Indus river dolphin lives almost entirely in Pakistan and is listed as endangered, though careful protection has helped numbers recover in recent decades. Because the river is too muddy for sight, the dolphins rely almost entirely on sound. The researchers now want to test small acoustic alarms on nets, which have cut accidental catches of other dolphin species elsewhere.',
      why: 'Knowing how the endangered dolphins move could help fishers avoid catching them by accident.',
      keyFact: 'The dolphins clicked faster near fishing nets and barrages.',
      recall: {
        question: 'How do Indus river dolphins find their way in the muddy river?',
        options: ['By sight', 'Using rapid clicks', 'By following boats'],
        answer: 1,
        explanation: 'They are nearly blind and use rapid clicks to map the muddy water.',
      },
    }),
    labels: [['science.life-sciences', 0.76], ['science.climate-environment', 0.24]],
    image: true,
    publishedAt: '2026-10-16T07:15:00.000Z',
    words: 830,
    sourceCount: 2,
    also: ['Phys.org'],
    cosPos: 0.31,
    cosNeg: 0.03,
  },
  // 27 · reserve · news.middle-east (extractive)
  {
    src: SRC.dw,
    url: 'https://www.dw.com/en/gulf-states-agree-single-tourist-visa-pilot/a-70000001',
    title: 'Gulf states agree on single tourist visa pilot',
    copy: extractive([
      'Six Gulf states have agreed to start a pilot of a single tourist visa that would let visitors travel between their countries on one permit.',
      'The pilot will begin with travellers who already hold residency in one of the member states.',
      "Officials said a full launch depends on linking the countries' immigration databases.",
      'Tourism boards hope the visa will encourage longer, multi-country trips similar to those common in Europe.',
      'Airlines in the region have welcomed the plan, which could increase demand for connecting flights.',
      'No date has been set for opening the visa to all visitors.',
      'Fees and the length of stay allowed are still being discussed.',
      'Millions of Pakistanis live and work in the Gulf, and families visiting them could benefit from simpler travel.',
    ]),
    labels: [['news.middle-east', 0.82], ['lifestyle.travel', 0.18]],
    image: false,
    publishedAt: '2026-10-16T10:40:00.000Z',
    words: 450,
    sourceCount: 3,
    also: ['France 24 - English', 'The Guardian - World'],
    cosPos: 0.25,
    cosNeg: 0.06,
  },
  // 28 · reserve · technical.cs.languages-tools
  {
    src: SRC.register,
    url: 'https://www.theregister.com/2026/10/16/package_manager_install_seconds/',
    title: 'New package manager cuts project install times from minutes to seconds',
    copy: ai({
      headline: 'A new package manager cuts install times to seconds',
      brief: 'A new open-source package manager for a popular programming language installs project dependencies in seconds rather than minutes, and developers are switching fast.',
      std: 'A new open-source package manager for a popular programming language installs project dependencies in seconds rather than minutes, by downloading in parallel and caching every package it has seen before. It reads existing project files, so teams can switch without rewriting anything. Its maintainers say it now handles most large projects, though some older build plugins still need work.',
      more: 'Slow installs waste time on every developer laptop and in every automated test run, so the savings add up quickly for large teams. The tool is written in a compiled language, which helps it start instantly. Long-time maintainers of older tools have welcomed the competition and are borrowing some of its caching ideas.',
      why: 'Faster installs speed up every test run and make it cheaper to work on large codebases.',
      keyFact: 'The package manager downloads in parallel and caches every package it has seen before.',
      recall: {
        question: 'How does the new package manager install dependencies so quickly?',
        options: ['It skips security checks', 'It downloads in parallel and caches packages', 'It installs only half the dependencies'],
        answer: 1,
        explanation: 'It downloads in parallel and caches every package it has already seen.',
      },
    }),
    labels: [['technical.cs.languages-tools', 0.88], ['technical.cs.devops-cloud', 0.12]],
    image: true,
    publishedAt: '2026-10-16T18:05:00.000Z',
    words: 760,
    sourceCount: 3,
    also: ['Lobsters', 'InfoQ'],
    cosPos: 0.58,
    cosNeg: 0.02,
  },
];

function toArticleCard(story: Story, index: number): ArticleCard {
  const n = index + 1;
  const id = fid(n);
  const { copy } = story;
  return {
    id,
    url: story.url,
    sourceId: story.src.id,
    sourceName: story.src.name,
    sourceDomain: story.src.domain,
    title: story.title,
    headline: copy.headline ?? story.title,
    summary: { brief: copy.brief, std: copy.std, deep: copy.deep },
    whyItMatters: copy.whyItMatters,
    keyFact: copy.keyFact,
    imageUrl: story.image ? `https://picsum.photos/seed/subah-${String(n).padStart(2, '0')}/1200/675` : null,
    publishedAt: story.publishedAt,
    readingMinutes: Math.max(1, Math.round(story.words / 230)),
    labels: story.labels.map(([slug, conf]) => ({ slug: known(slug), conf })),
    clusterId: fid(n + 30),
    alsoCoveredBy: [...story.also],
    aiProvider: copy.provider,
    recall: copy.recall
      ? {
          articleId: id,
          question: copy.recall.question,
          options: [...copy.recall.options],
          answerIndex: copy.recall.answer,
          explanation: copy.recall.explanation,
        }
      : null,
    ur: null,
  };
}

/** 28 stories over all 9 roots. 24 are Gemini-enriched with a recall question; 4 use the extractive fallback. */
export const FIXTURE_ARTICLES: ArticleCard[] = STORIES.map(toArticleCard);

// ── Edition No. 14 (rank-v1, §10.4) ───────────────────────────────────────────────────────────────
const W = { topic: 0.4, similarity: 0.25, negative: 0.15, importance: 0.15, freshness: 0.15, source: 0.05, pinnedBonus: 0.1 } as const;
const MAX_SOURCES_TODAY = 12; // the most distinct outlets any cluster had today
const BUILT_AT_MS = Date.parse(BUILT_AT);

const isPinnedStory = (story: Story): boolean =>
  story.labels.some(([slug]) => [slug, ...ancestorsOf(slug)].some((s) => PINNED.has(s)));

function breakdownOf(story: Story): ScoreBreakdown {
  const affinity = story.labels.reduce((sum, [slug, conf]) => sum + conf * thetaOf(slug), 0);
  const ageHours = (BUILT_AT_MS - Date.parse(story.publishedAt)) / 3_600_000;
  const importance = Math.log(1 + story.sourceCount) / Math.log(1 + MAX_SOURCES_TODAY);
  const parts = {
    topic: r4(W.topic * affinity),
    similarity: r4(W.similarity * story.cosPos), // c_u = 1: Ayesha has engaged with more than 10 stories
    negative: r4(W.negative * Math.max(0, story.cosNeg)),
    importance: r4(W.importance * importance),
    freshness: r4(W.freshness * Math.exp(-ageHours / 24)),
    source: r4(W.source * story.src.quality),
  };
  const pinned = isPinnedStory(story) ? W.pinnedBonus : 0;
  const total = parts.topic + parts.similarity - parts.negative + parts.importance + parts.freshness + parts.source + pinned;
  return { ...parts, total: r4(total) };
}

function tierOf(slot: Slot, story: Story): Tier {
  if (slot === 'lead') return 'deep'; // the lead is always deep
  const theta = thetaOf(story.labels[0][0]);
  return theta >= 0.7 ? 'deep' : theta >= 0.4 ? 'std' : 'brief'; // Standard 15 rule
}

type ReasonSeed = [ReasonCode, string];
// Chip copy (§10.4, §9.7), built from the taxonomy names so the text always matches the topic.
const chip = {
  topic: (slug: TopicSlug): ReasonSeed =>
    ['topic', followed(slug) ? `You follow ${topicName(slug)}` : `You've been reading ${topicName(slug)}`],
  similar: (headline: string): ReasonSeed => ['similar', `Because you read "${headline}"`],
  bigstory: (outlets: number): ReasonSeed => ['bigstory', `Covered by ${outlets} outlets today`],
  explore: (slug: TopicSlug): ReasonSeed => ['explore', `Trying something new: ${topicName(slug)}`],
  serendipity: (): ReasonSeed => ['serendipity', 'A step outside your usual'],
  pinned: (slug: TopicSlug): ReasonSeed => ['pinned', `You pinned ${topicName(slug)}`],
  fresh: (): ReasonSeed => ['fresh', 'Fresh this morning'],
};

function reasonWeight(code: ReasonCode, b: ScoreBreakdown): number {
  switch (code) {
    case 'topic': return b.topic;
    case 'similar': return b.similarity;
    case 'pinned': return W.pinnedBonus;
    case 'fresh': return b.freshness;
    default: return 1; // bigstory, explore, serendipity: the slot itself is the reason
  }
}

function toEditionItem(storyIndex: number, rank: number, slot: Slot, reasons: ReasonSeed[]): EditionItem {
  const story = STORIES[storyIndex];
  const article = FIXTURE_ARTICLES[storyIndex];
  const breakdown = breakdownOf(story);
  return {
    rank,
    slot,
    sectionSlug: rootOf(article.labels[0].slug),
    tier: tierOf(slot, story),
    score: breakdown.total,
    breakdown,
    reasons: reasons
      .map(([code, text]): Reason => ({ code, text, weight: reasonWeight(code, breakdown) }))
      .sort((a, b) => b.weight - a.weight),
    article,
  };
}

// Items use articles 0–19 (ranks 1–20), the reserve uses articles 20–27 (ranks 21–28).
const ITEM_PLAN: [Slot, ReasonSeed[]][] = [
  ['lead', [chip.topic('technical.cs.ai-ml'), chip.similar(READ_AI_CODING)]],
  ['top', [chip.topic('sports.cricket.pakistan'), chip.pinned('sports.cricket')]],
  ['top', [chip.topic('science.climate-environment')]],
  ['top', [chip.topic('business.pakistan-economy')]],
  ['core', [chip.topic('technical.cs.web-dev')]],
  ['core', [chip.topic('sports.cricket.international'), chip.pinned('sports.cricket')]],
  ['core', [chip.topic('science.space'), chip.similar(READ_STELLAR_NURSERY)]],
  ['core', [chip.topic('business.startups'), chip.similar(READ_ROOFTOP_SOLAR)]],
  ['core', [chip.topic('news.pakistan.cities')]],
  ['core', [chip.topic('technical.cs.security')]],
  ['core', [chip.topic('health.public-health')]],
  ['core', [chip.topic('sports.cricket.leagues'), chip.similar(READ_T20_SERIES)]],
  ['core', [chip.topic('technical.pakistan-tech')]],
  ['core', [chip.topic('business.markets')]],
  ['core', [chip.topic('news.global-affairs')]],
  ['core', [chip.fresh()]],
  ['bigstory', [chip.bigstory(STORIES[16].sourceCount), chip.topic('health.public-health')]],
  ['explore', [chip.explore('arts.design-architecture')]],
  ['explore', [chip.explore('lifestyle.food')]],
  ['serendipity', [chip.serendipity()]],
];
const RESERVE_PLAN: ReasonSeed[][] = [
  [chip.fresh()],
  [chip.topic('technical.cs.devops-cloud'), chip.similar(READ_VECTOR_SEARCH)],
  [chip.fresh()],
  [chip.topic('health.fitness-nutrition')],
  [chip.topic('business.personal-finance')],
  [chip.topic('science.life-sciences')],
  [chip.topic('news.middle-east')],
  [chip.topic('technical.cs.languages-tools'), chip.similar(READ_AI_CODING)],
];

const EDITION_ITEMS: EditionItem[] = ITEM_PLAN.map(([slot, reasons], i) => toEditionItem(i, i + 1, slot, reasons));
const EDITION_RESERVE: EditionItem[] = RESERVE_PLAN.map((reasons, i) => toEditionItem(20 + i, 21 + i, 'reserve', reasons));

/** Sections = roots of the core items, ordered by Σ score (§10.4 layout). */
function sectionOrderOf(items: EditionItem[]): TopicSlug[] {
  const sums = new Map<TopicSlug, number>();
  for (const item of items) {
    if (item.slot === 'core') sums.set(item.sectionSlug, (sums.get(item.sectionSlug) ?? 0) + item.score);
  }
  return [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([slug]) => slug);
}

/** Display names for every sectionSlug and every label slug used by the items and the reserve. */
function sectionNamesOf(items: EditionItem[]): Record<TopicSlug, string> {
  const names: Record<TopicSlug, string> = {};
  for (const item of items) {
    for (const slug of [item.sectionSlug, ...item.article.labels.map((l) => l.slug)]) names[slug] = topicName(slug);
  }
  return names;
}

function recallOf(storyIndex: number): RecallQuestion {
  const question = FIXTURE_ARTICLES[storyIndex].recall;
  if (!question) throw new Error(`fixtures: article ${storyIndex} has no recall question`);
  return question;
}

const PRESENTATION: Presentation = { timeBudget: 15, depth: 'basics', lang: 'en' };

export const FIXTURE_EDITION: Edition = {
  id: EDITION_ID,
  userId: FIXTURE_USER_ID,
  date: EDITION_DATE,
  number: EDITION_NUMBER,
  paperName: 'The Morrow',
  editorNote:
    "Good morning, Ayesha. Today's paper leads with a benchmark showing that small open AI models now match last year's best systems. Pakistan have picked an uncapped leg-spinner for the home Tests, and a new study maps Karachi's hottest streets block by block. You've read more cricket and space this week and less showbiz, so today's mix leans that way.",
  editorNoteSource: 'gemini',
  sectionOrder: sectionOrderOf(EDITION_ITEMS),
  leadArticleId: EDITION_ITEMS[0].article.id,
  sectionNames: sectionNamesOf([...EDITION_ITEMS, ...EDITION_RESERVE]),
  items: EDITION_ITEMS,
  reserve: EDITION_RESERVE,
  recall: [recallOf(6), recallOf(11), recallOf(12)],
  presentation: { ...PRESENTATION },
  receipt: {
    buildMs: 11,
    articlesConsidered: 1084,
    clustersConsidered: 612,
    llmCallsThisEdition: 0,
    aiShare: {
      gemini: EDITION_ITEMS.filter((i) => i.article.aiProvider === 'gemini').length,
      extractive: EDITION_ITEMS.filter((i) => i.article.aiProvider === 'extractive').length,
    },
    algoVersion: 'rank-v1',
  },
  pdfUrl: null,
  createdAt: BUILT_AT,
};

// ── Profile ───────────────────────────────────────────────────────────────────────────────────────
export const FIXTURE_PROFILE: Profile = {
  userId: FIXTURE_USER_ID,
  displayName: 'Ayesha',
  paperName: 'The Morrow',
  tz: 'Asia/Karachi',
  city: 'Islamabad',
  presentation: { ...PRESENTATION },
  deliveryHour: 7,
  isDemo: true,
  onboardedAt: '2026-10-04T03:30:00.000Z',
};

// ── Reading history, streak, heatmap, archive ─────────────────────────────────────────────────────
// Day 1 was 2026-10-04. She read every day except 10-10 and 10-11 (wave 1 has no freezes, so the streak broke).
const STORIES_READ: Record<string, number> = {
  '2026-10-04': 4,
  '2026-10-05': 7,
  '2026-10-06': 3,
  '2026-10-07': 9,
  '2026-10-08': 5,
  '2026-10-09': 11,
  '2026-10-10': 0,
  '2026-10-11': 0,
  '2026-10-12': 6,
  '2026-10-13': 8,
  '2026-10-14': 4,
  '2026-10-15': 12,
  '2026-10-16': 7,
  '2026-10-17': 3,
};
const readsOn = (date: string): number => STORIES_READ[date] ?? 0;

export const FIXTURE_STREAK: StreakView = {
  state: 'done_today',
  current: 6,
  longest: 6,
  totalDays: 12,
  freezesAvailable: 0,
  todayQualified: true,
  todayStoriesRead: readsOn(EDITION_DATE),
  editionComplete: false, // needs 5 stories read and the recall answered
  milestone: null,
  last7: Array.from({ length: 7 }, (_, i): StreakView['last7'][number] => {
    const date = addDays(EDITION_DATE, i - 6);
    return { date, status: readsOn(date) > 0 ? 'read' : 'missed' };
  }),
};

const heatLevel = (storiesRead: number): HeatmapDay['level'] =>
  storiesRead === 0 ? 0 : storiesRead <= 2 ? 1 : storiesRead <= 4 ? 2 : storiesRead <= 9 ? 3 : 4;

/** 84 days, oldest first, ending on the edition date. */
export const FIXTURE_HEATMAP: HeatmapDay[] = Array.from({ length: 84 }, (_, i): HeatmapDay => {
  const date = addDays(EDITION_DATE, i - 83);
  return { date, storiesRead: readsOn(date), level: heatLevel(readsOn(date)) };
});

const PAST_LEADS: Record<string, string> = {
  '2026-10-16': READ_T20_SERIES,
  '2026-10-15': READ_AI_CODING,
  '2026-10-14': READ_VECTOR_SEARCH,
  '2026-10-13': 'Lahore schools shift to later hours as smog season begins',
  '2026-10-12': 'Heatwave alerts by text message reach farmers in southern Punjab',
  '2026-10-11': 'Rupee firms as the central bank holds its policy rate',
  '2026-10-10': 'Islamabad marathon draws its biggest field of runners yet',
  '2026-10-09': 'Pakistan women win the T20 series decider in the final over',
  '2026-10-08': 'Solar panel imports climb as power tariffs rise',
};

/** The last 10 papers, newest first. Today's PDF is not rendered yet; past ones point at the committed sample PDF. */
export const FIXTURE_ARCHIVE: ArchiveEntry[] = Array.from({ length: 10 }, (_, i): ArchiveEntry => {
  const date = addDays(EDITION_DATE, -i);
  return {
    date,
    number: EDITION_NUMBER - i,
    leadHeadline: i === 0 ? FIXTURE_EDITION.items[0].article.headline : PAST_LEADS[date],
    storiesRead: readsOn(date),
    qualified: readsOn(date) > 0,
    pdfUrl: i === 0 ? null : '/demo/sample.pdf',
  };
});

// ── Learning ──────────────────────────────────────────────────────────────────────────────────────
const MOVER_DELTAS: [TopicSlug, number][] = [
  ['entertainment.pakistani-showbiz', -0.09],
  ['sports.cricket', 0.08],
  ['science.space', 0.07],
  ['technical.cs.ai-ml', 0.05],
  ['business.startups', 0.03],
];
const deltaFor = (slug: TopicSlug, change: number): WeightDelta => {
  const after = r3(thetaOf(slug));
  return { slug, name: topicName(slug), before: r3(after - change), after };
};

const headlineOf = (storyIndex: number): string => FIXTURE_ARTICLES[storyIndex].headline;

export const FIXTURE_LEARNING: LearningView = {
  weights: FIXTURE_INTEREST_WEIGHTS.map((w) => ({ ...w })),
  movers: MOVER_DELTAS.map(([slug, change]) => deltaFor(slug, change)),
  changeSummary:
    'More Cricket and Space & Astronomy, less Pakistani Showbiz: you read 5 cricket stories to the end and skipped 2 pakistani showbiz pieces.',
  sinceDate: addDays(EDITION_DATE, -7),
  timeline: [
    { at: '2026-10-17T03:42:00.000Z', type: 'more', headline: headlineOf(1), effect: 'Pakistan Cricket +3%' },
    { at: '2026-10-17T03:41:30.000Z', type: 'dwell', headline: headlineOf(1), effect: 'Pakistan Cricket +2%' },
    { at: '2026-10-17T03:38:00.000Z', type: 'open', headline: headlineOf(1), effect: 'Pakistan Cricket +1%' },
    { at: '2026-10-17T03:35:00.000Z', type: 'read_original', headline: headlineOf(0), effect: 'AI & Machine Learning +2%' },
    { at: '2026-10-17T03:25:00.000Z', type: 'open', headline: headlineOf(2), effect: 'Climate & Environment +1%' },
    { at: '2026-10-17T03:21:00.000Z', type: 'recall_answer', headline: headlineOf(11), effect: 'T20 Leagues +1%' },
    { at: '2026-10-17T03:20:00.000Z', type: 'recall_answer', headline: headlineOf(6), effect: 'Space & Astronomy +1%' },
    { at: '2026-10-16T16:05:00.000Z', type: 'skip', headline: 'Actor announces a break from television dramas', effect: 'Pakistani Showbiz −5%' },
    { at: '2026-10-16T15:50:00.000Z', type: 'read_original', headline: READ_ROOFTOP_SOLAR, effect: 'Startups & Venture +3%' },
    { at: '2026-10-16T15:41:00.000Z', type: 'save', headline: READ_T20_SERIES, effect: 'Pakistan Cricket +4%' },
    { at: '2026-10-16T15:20:00.000Z', type: 'dwell', headline: READ_STELLAR_NURSERY, effect: 'Space & Astronomy +3%' },
    { at: '2026-10-16T04:02:00.000Z', type: 'pdf_download', headline: null, effect: 'Every story in the paper +1%' },
    { at: '2026-10-16T03:55:00.000Z', type: 'less', headline: 'Celebrity couple share wedding photos from Lahore', effect: 'Pakistani Showbiz −8%' },
  ],
};

/** What POST /api/events answers after a "More" on the Pakistan cricket story. */
export const FIXTURE_EVENTS_RESULT: EventsResult = {
  accepted: 1,
  streak: { ...FIXTURE_STREAK, last7: FIXTURE_STREAK.last7.map((d) => ({ ...d })) },
  deltas: [
    deltaFor('sports.cricket.pakistan', 0.021),
    deltaFor('sports.cricket', 0.012),
    deltaFor('sports', 0.004),
  ],
  toast: `Got it, more ${topicName('sports.cricket.pakistan')}`,
};

// ── Onboarding taste cards (6 matched + 2 wildcards at positions 2 and 5) ─────────────────────────
const TASTE_PLAN: [storyIndex: number, wildcard: boolean][] = [
  [0, false],
  [1, false],
  [17, true],
  [4, false],
  [5, false],
  [18, true],
  [27, false],
  [11, false],
];

export const FIXTURE_TASTE_CARDS: TasteCard[] = TASTE_PLAN.map(([storyIndex, wildcard]) => {
  const article = FIXTURE_ARTICLES[storyIndex];
  const topicSlug = article.labels[0].slug;
  return {
    articleId: article.id,
    headline: article.headline,
    sourceName: article.sourceName,
    topicSlug,
    topicName: topicName(topicSlug),
    imageUrl: article.imageUrl,
    wildcard,
  };
});

// ── Fast-forward simulation (illustrative fixture numbers, not measurements) ───────────────────────
const simDay = (day: number, precisionAt20: number, ndcgAt10: number, diversity: number, exploreHits: number): SimulationDay =>
  ({ day, precisionAt20, ndcgAt10, diversity, exploreHits });

const SIM_START: Record<TopicSlug, number> = {
  'sports.cricket': 0.64,
  'technical.cs.ai-ml': 0.66,
  'science.space': 0.31,
  'science.climate-environment': 0.6,
  'news.pakistan': 0.58,
  'business.startups': 0.36,
  'entertainment.pakistani-showbiz': 0.33,
  'arts.design-architecture': 0.25,
};
const SIM_END: Record<TopicSlug, number> = {
  'sports.cricket': 0.79,
  'technical.cs.ai-ml': 0.81,
  'science.space': 0.58,
  'science.climate-environment': 0.66,
  'news.pakistan': 0.61,
  'business.startups': 0.47,
  'entertainment.pakistani-showbiz': 0.17,
  'arts.design-architecture': 0.31,
};

export const FIXTURE_SIMULATION: SimulationResult = {
  persona: 'ayesha',
  learning: [
    simDay(1, 0.45, 0.52, 0.71, 0),
    simDay(2, 0.55, 0.6, 0.69, 1),
    simDay(3, 0.6, 0.66, 0.68, 1),
    simDay(4, 0.65, 0.71, 0.67, 1),
    simDay(5, 0.7, 0.75, 0.66, 2),
    simDay(6, 0.75, 0.79, 0.65, 1),
    simDay(7, 0.8, 0.82, 0.64, 2),
  ],
  onboardingOnly: [
    simDay(1, 0.45, 0.52, 0.71, 0),
    simDay(2, 0.45, 0.51, 0.7, 1),
    simDay(3, 0.4, 0.5, 0.71, 0),
    simDay(4, 0.45, 0.52, 0.7, 1),
    simDay(5, 0.45, 0.51, 0.71, 0),
    simDay(6, 0.4, 0.5, 0.7, 1),
    simDay(7, 0.45, 0.51, 0.71, 0),
  ],
  popularity: [
    simDay(1, 0.3, 0.33, 0.82, 0),
    simDay(2, 0.25, 0.3, 0.81, 0),
    simDay(3, 0.3, 0.32, 0.83, 0),
    simDay(4, 0.3, 0.31, 0.82, 0),
    simDay(5, 0.25, 0.29, 0.82, 0),
    simDay(6, 0.3, 0.31, 0.81, 0),
    simDay(7, 0.25, 0.3, 0.82, 0),
  ],
  snapshots: Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    weights: Object.fromEntries(
      Object.keys(SIM_START).map((slug) => [slug, r3(SIM_START[slug] + ((SIM_END[slug] - SIM_START[slug]) * i) / 6)]),
    ),
  })),
};
