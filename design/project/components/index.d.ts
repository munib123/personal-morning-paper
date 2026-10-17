import type * as React from 'react';

export type IconName = 'arrow-right' | 'arrow-left' | 'chevron-right' | 'external' | 'download' | 'bookmark' | 'plus' | 'minus' | 'x' | 'check' | 'clock' | 'search' | 'reason' | 'sun' | 'moon' | 'play' | 'archive';
export interface IconProps { name: IconName; size?: number; filled?: boolean; title?: string; className?: string }
export declare function Icon(props: IconProps): React.ReactElement;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = ink fill (default) · accent = press red, once per screen · secondary = outlined · ghost = text only */
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  full?: boolean;
  /** Renders an <a> instead of a <button>. */
  href?: string;
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface MastheadProps {
  title?: string;
  /** Preformatted, e.g. "Saturday, 17 October 2026" */
  date: string;
  edition?: string | number;
  reader?: string;
  readingTime?: string;
  storyCount?: number;
  location?: string;
  tagline?: string;
  variant?: 'full' | 'compact';
  actions?: React.ReactNode;
}
export declare function Masthead(props: MastheadProps): React.ReactElement;

export interface SectionHeaderProps { title: string; meta?: React.ReactNode; action?: React.ReactNode; id?: string }
export declare function SectionHeader(props: SectionHeaderProps): React.ReactElement;

export interface StoryCardProps {
  variant?: 'lead' | 'standard' | 'brief' | 'compact';
  kicker?: string;
  headline: string;
  deck?: string;
  summary?: string;
  source?: string;
  readingTime?: string;
  published?: string;
  imageUrl?: string;
  imageAlt?: string;
  caption?: string;
  /** Original article URL; the headline links there in a new tab. */
  href?: string;
  /** Short reason the story was picked, shown as a WhyTag. */
  why?: React.ReactNode;
  read?: boolean;
  breaking?: boolean;
  /** Usually a <FeedbackBar/>. */
  footer?: React.ReactNode;
  /** Fires when the headline link is clicked: log an "open" signal here. */
  onOpen?: () => void;
}
export declare function StoryCard(props: StoryCardProps): React.ReactElement;

export interface WhyTagProps { children: React.ReactNode; onClick?: () => void }
export declare function WhyTag(props: WhyTagProps): React.ReactElement;

export type Feedback = 'more' | 'less' | null;
export interface FeedbackBarProps {
  value?: Feedback;
  saved?: boolean;
  onChange?: (value: Feedback) => void;
  onSave?: (saved: boolean) => void;
  onSkip?: () => void;
  /** Icon-only, labels move to aria-label + title. */
  compact?: boolean;
}
export declare function FeedbackBar(props: FeedbackBarProps): React.ReactElement;

export interface Takeaway { text: React.ReactNode; kicker?: string; href?: string }
export interface TakeawayBoxProps { title?: string; items: Takeaway[]; footnote?: React.ReactNode }
export declare function TakeawayBox(props: TakeawayBoxProps): React.ReactElement;

export interface PullQuoteProps { quote: string; attribution?: string }
export declare function PullQuote(props: PullQuoteProps): React.ReactElement;

export interface TopicChipProps { label: string; selected?: boolean; onToggle?: (selected: boolean) => void; hint?: string; size?: 'md' | 'lg' }
export declare function TopicChip(props: TopicChipProps): React.ReactElement;

export interface SegmentedOption { value: string; label: string; hint?: string }
export interface SegmentedProps { label?: string; options: SegmentedOption[]; value: string; onChange?: (value: string) => void; name?: string }
export declare function Segmented(props: SegmentedProps): React.ReactElement;

export interface TextFieldProps {
  label: string;
  hint?: string;
  error?: string;
  value?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  id?: string;
  onChange?: (value: string) => void;
}
export declare function TextField(props: TextFieldProps): React.ReactElement;

export interface OnboardingStepProps {
  step: number;
  total: number;
  title: string;
  description?: string;
  children?: React.ReactNode;
  nextLabel?: string;
  nextDisabled?: boolean;
  onNext?: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  footnote?: React.ReactNode;
}
export declare function OnboardingStep(props: OnboardingStepProps): React.ReactElement;

export interface ReadingProgressProps { /** 0–1 */ value: number; label?: string }
export declare function ReadingProgress(props: ReadingProgressProps): React.ReactElement;

export interface EditionCardProps {
  date: string;
  edition?: string | number;
  headline: string;
  storyCount?: number;
  readCount?: number;
  readingTime?: string;
  href?: string;
  pdfHref?: string;
  today?: boolean;
  title?: string;
}
export declare function EditionCard(props: EditionCardProps): React.ReactElement;

declare global {
  interface Window {
    Morrow: {
      Icon: typeof Icon; Button: typeof Button; Masthead: typeof Masthead; SectionHeader: typeof SectionHeader;
      StoryCard: typeof StoryCard; WhyTag: typeof WhyTag; FeedbackBar: typeof FeedbackBar; TakeawayBox: typeof TakeawayBox;
      PullQuote: typeof PullQuote; TopicChip: typeof TopicChip; Segmented: typeof Segmented; TextField: typeof TextField;
      OnboardingStep: typeof OnboardingStep; ReadingProgress: typeof ReadingProgress; EditionCard: typeof EditionCard;
    };
  }
}
