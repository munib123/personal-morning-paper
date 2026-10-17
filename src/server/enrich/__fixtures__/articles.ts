// Fictional source texts for the enrich tests. They read like real news, but no event, figure or
// statement in them is real, and no real person is named or quoted.
import type { EnrichmentItem } from '../schema';

export interface FixtureSource { title: string; text: string }

export const PSX_SOURCE: FixtureSource = {
  title: 'PSX benchmark closes at a record 98,400 points',
  text: [
    "The Pakistan Stock Exchange's benchmark KSE-100 index gained 1,250 points on Friday to close at a record 98,400, as investors bought banking and energy shares.",
    'Trading volume rose to 640 million shares, the highest this month.',
    'Brokers said falling inflation and expectations of another interest rate cut drove the buying.',
    'The State Bank of Pakistan will announce its next policy decision in November.',
    'The index has risen 18 percent so far in 2026.',
    'Foreign investors were net buyers for a third straight session, according to exchange data.',
    'Banking stocks led the gains, with the sector index up 2.1 percent on the day.',
    'Energy companies also rose after the government cleared part of the circular debt owed to power producers.',
    'Some analysts warned that the rally could slow if global oil prices climb again, since Pakistan imports most of its fuel.',
    'Retail investors have returned to the market this year, and new brokerage accounts reached a record in September.',
  ].join(' '),
};

export const CRICKET_SOURCE: FixtureSource = {
  title: 'Pakistan beat New Zealand by six wickets to level the series',
  text: [
    'Pakistan beat New Zealand by six wickets in the second one-day international in Rawalpindi on Thursday to level the three-match series 1-1.',
    'Chasing 268, the hosts reached the target with 14 balls to spare after a century from their opening batter.',
    'New Zealand had been 140 for two before a collapse against spin left them short of a bigger total.',
    'The deciding match is in Lahore on Sunday.',
  ].join(' '),
};

export const TECH_SOURCE: FixtureSource = {
  title: 'Open-source database adds vector search in its new release',
  text: [
    'A popular open-source database has added built-in vector search in version 9, letting developers store embeddings next to ordinary rows.',
    'The maintainers said queries over one million vectors return in under 20 milliseconds on a single laptop.',
    'The release also drops support for two older operating systems.',
    'Hosting companies are expected to offer the new version within weeks.',
  ].join(' '),
};

/** A faithful Gemini item for PSX_SOURCE: passes every guardrail. */
export const PSX_ITEM: EnrichmentItem = {
  id: 'a1',
  usable: true,
  headline: 'KSE-100 gains 1,250 points to close at a record 98,400',
  summary_brief: 'The KSE-100 index rose 1,250 points on Friday to a record 98,400 as investors bought banking and energy shares.',
  summary_std:
    'The KSE-100 index gained 1,250 points on Friday to close at a record 98,400 as investors bought banking and energy shares. ' +
    'Volume rose to 640 million shares, the highest this month. Brokers credited falling inflation and hopes of another rate cut. ' +
    'The State Bank of Pakistan announces its next policy decision in November. The index is up 18 percent in 2026.',
  summary_deep:
    'The KSE-100 index gained 1,250 points on Friday to close at a record 98,400, as investors bought banking and energy shares. ' +
    'Trading volume rose to 640 million shares, the highest level this month. Brokers said falling inflation and expectations of another ' +
    'interest rate cut drove the buying, ahead of the State Bank of Pakistan policy decision in November. The index has risen 18 percent ' +
    'so far in 2026. Foreign investors were net buyers for a third straight session. Banking stocks led the gains, with the sector index ' +
    'up 2.1 percent, and energy companies rose after the government cleared part of the circular debt owed to power producers. Some ' +
    'analysts warned the rally could slow if global oil prices climb again.',
  why_it_matters: 'Record share prices reflect investor confidence that inflation is easing and borrowing costs will keep falling.',
  key_fact: 'The KSE-100 closed at a record 98,400 points on Friday.',
  topic_slugs: ['business.markets', 'business.pakistan-economy'],
  entities: ['KSE-100', 'Pakistan Stock Exchange', 'State Bank of Pakistan'],
  recall: {
    question: 'How many points did the KSE-100 gain on Friday?',
    options: ['1,250', '980', '640'],
    answer_index: 0,
    explanation: 'The index rose 1,250 points to a record close.',
  },
};
