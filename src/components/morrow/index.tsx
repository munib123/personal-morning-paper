'use client';
// Morrow UI — React 18 components for the personal morning paper.
// Styling: classes in bundle.css (mw-*) + type-style classes from tokens.css.
import * as React from 'react';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/* ───────────────────────── Icon ───────────────────────── */

const ICONS: Record<string, string> = {
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  bookmark: 'M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  clock: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 8v4l3 2',
  search: 'M11 5a6 6 0 1 0 0 12a6 6 0 1 0 0-12zM20 20l-4.5-4.5',
  reason: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4z',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  play: 'M8 5v14l11-7z',
  archive: 'M4 5h16v4H4zM6 9v10h12V9M10 13h4',
};
const FILLED = new Set(['play']);

export type IconName = keyof typeof ICONS;
export interface IconProps { name: IconName | string; size?: number; filled?: boolean; title?: string; className?: string }

export function Icon({ name, size = 18, filled, title, className }: IconProps) {
  const fill = filled || FILLED.has(name as string);
  return (
    <svg className={cx('mw-icon', className)} width={size} height={size} viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      <path d={ICONS[name as string] || ICONS.x} />
    </svg>
  );
}

/* ───────────────────────── Button ───────────────────────── */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName | string;
  iconRight?: IconName | string;
  full?: boolean;
  href?: string;
}

export function Button({ variant = 'primary', size = 'md', icon, iconRight, full, href, className, children, ...rest }: ButtonProps) {
  const cls = cx('mw-btn', 'ui-button', 'mw-btn--' + variant, 'mw-btn--' + size, full && 'mw-btn--full', !children && 'mw-btn--icon', className);
  const inner = (
    <>
      {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children ? <span>{children}</span> : null}
      {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 16 : 18} /> : null}
    </>
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- design-system source: button attrs re-used on <a>
  if (href) return <a className={cls} href={href} {...(rest as any)}>{inner}</a>;
  return <button type="button" className={cls} {...rest}>{inner}</button>;
}

/* ───────────────────────── Masthead ───────────────────────── */

export interface MastheadProps {
  title?: string;
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

export function Masthead({ title = 'The Morrow', date, edition, reader, readingTime, storyCount, location, tagline, variant = 'full', actions }: MastheadProps) {
  if (variant === 'compact') {
    return (
      <header className="mw-masthead mw-masthead--compact">
        <span className="masthead-sm mw-masthead__title">{title}</span>
        <span className="dateline mw-masthead__date">{date}</span>
        <span className="mw-masthead__actions">{actions}</span>
      </header>
    );
  }
  const strip = [date, location, storyCount != null ? storyCount + ' stories' : null, readingTime].filter(Boolean);
  return (
    <header className="mw-masthead">
      <div className="mw-masthead__row">
        <div className="dateline mw-masthead__ear">
          {edition != null ? <div>Edition No. {edition}</div> : null}
          {tagline ? <div className="mw-masthead__tagline">{tagline}</div> : null}
        </div>
        <h1 className="masthead mw-masthead__title">{title}</h1>
        <div className="dateline mw-masthead__ear mw-masthead__ear--right">
          {reader ? <div>Prepared for {reader}</div> : null}
          {actions ? <div className="mw-masthead__actions">{actions}</div> : null}
        </div>
      </div>
      <div className="dateline mw-masthead__strip">
        {strip.map((s, i) => <span key={i}>{s}</span>)}
      </div>
    </header>
  );
}

/* ───────────────────────── SectionHeader ───────────────────────── */

export interface SectionHeaderProps { title: string; meta?: React.ReactNode; action?: React.ReactNode; id?: string }

export function SectionHeader({ title, meta, action, id }: SectionHeaderProps) {
  return (
    <div className="mw-section" id={id}>
      <h2 className="mw-section__title">{title}</h2>
      {meta ? <span className="ui-meta mw-section__meta">{meta}</span> : null}
      {action ? <span className="mw-section__action">{action}</span> : null}
    </div>
  );
}

/* ───────────────────────── WhyTag ───────────────────────── */

export interface WhyTagProps { children: React.ReactNode; onClick?: () => void }

export function WhyTag({ children, onClick }: WhyTagProps) {
  const content = (<><Icon name="reason" size={14} /><span>{children}</span></>);
  return onClick
    ? <button type="button" className="mw-why ui-meta" onClick={onClick}>{content}</button>
    : <span className="mw-why ui-meta">{content}</span>;
}

/* ───────────────────────── FeedbackBar ───────────────────────── */

export type Feedback = 'more' | 'less' | null;
export interface FeedbackBarProps {
  value?: Feedback;
  saved?: boolean;
  onChange?: (v: Feedback) => void;
  onSave?: (saved: boolean) => void;
  onSkip?: () => void;
  compact?: boolean;
}

export function FeedbackBar({ value = null, saved = false, onChange, onSave, onSkip, compact }: FeedbackBarProps) {
  const t = (v: Feedback) => onChange && onChange(value === v ? null : v);
  const btn = (key: string, label: string, icon: string, pressed: boolean | undefined, onClick?: () => void) => (
    <button key={key} type="button" className={cx('mw-fb__btn', 'ui-meta', pressed && 'is-on')}
      aria-pressed={pressed === undefined ? undefined : pressed} aria-label={compact ? label : undefined}
      title={compact ? label : undefined} onClick={onClick}>
      <Icon name={icon} size={16} />{compact ? null : <span>{label}</span>}
    </button>
  );
  return (
    <div className={cx('mw-fb', compact && 'mw-fb--compact')} role="group" aria-label="Tune your paper">
      {btn('more', 'More like this', 'plus', value === 'more', () => t('more'))}
      {btn('less', 'Less like this', 'minus', value === 'less', () => t('less'))}
      {btn('save', saved ? 'Saved' : 'Save', 'bookmark', saved, () => onSave && onSave(!saved))}
      {onSkip ? btn('skip', 'Skip', 'x', undefined, onSkip) : null}
    </div>
  );
}

/* ───────────────────────── StoryCard ───────────────────────── */

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
  href?: string;
  why?: React.ReactNode;
  read?: boolean;
  breaking?: boolean;
  footer?: React.ReactNode;
  onOpen?: () => void;
}

export function StoryCard(p: StoryCardProps) {
  const v = p.variant || 'standard';
  const hClass = v === 'lead' ? 'headline-xl' : v === 'standard' ? 'headline-md' : 'headline-sm';
  const meta = [p.source, p.readingTime, p.published].filter(Boolean);
  const headline = p.href
    ? <a className="mw-story__link" href={p.href} target="_blank" rel="noopener noreferrer" onClick={p.onOpen}>{p.headline}</a>
    : p.headline;
  return (
    <article className={cx('mw-story', 'mw-story--' + v, p.read && 'is-read')}>
      {p.imageUrl && (v === 'lead' || v === 'standard') ? (
        <figure className="mw-story__figure">
          <img src={p.imageUrl} alt={p.imageAlt || ''} loading="lazy" referrerPolicy="no-referrer" />
          {p.caption && v === 'lead' ? <figcaption className="ui-meta">{p.caption}</figcaption> : null}
        </figure>
      ) : null}
      <div className="mw-story__body">
        {p.kicker || p.breaking ? (
          <div className="mw-story__kicker kicker">
            {p.breaking ? <span className="mw-badge-breaking">Developing</span> : null}
            {p.kicker ? <span>{p.kicker}</span> : null}
          </div>
        ) : null}
        <h3 className={cx('mw-story__headline', hClass)}>{headline}</h3>
        {p.deck && v !== 'brief' && v !== 'compact' ? <p className="deck mw-story__deck">{p.deck}</p> : null}
        {p.summary && v !== 'compact' ? <p className={cx(v === 'lead' ? 'body-text' : 'body-sm', 'mw-story__summary')}>{p.summary}</p> : null}
        {meta.length || p.read ? (
          <div className="ui-meta mw-story__meta">
            {meta.map((m, i) => <span key={i} className={i === 0 ? 'mw-story__source' : undefined}>{m}</span>)}
            {p.read ? <span className="mw-story__read"><Icon name="check" size={14} />Read</span> : null}
          </div>
        ) : null}
        {p.why ? <div className="mw-story__why"><WhyTag>{p.why}</WhyTag></div> : null}
        {p.footer ? <div className="mw-story__footer">{p.footer}</div> : null}
      </div>
    </article>
  );
}

/* ───────────────────────── TakeawayBox ───────────────────────── */

export interface Takeaway { text: React.ReactNode; kicker?: string; href?: string }
export interface TakeawayBoxProps { title?: string; items: Takeaway[]; footnote?: React.ReactNode }

export function TakeawayBox({ title = 'Three things to know', items, footnote }: TakeawayBoxProps) {
  return (
    <aside className="mw-takeaway" aria-label={title}>
      <h2 className="mw-takeaway__title kicker">{title}</h2>
      <ol className="mw-takeaway__list">
        {items.map((it, i) => (
          <li key={i} className="mw-takeaway__item">
            <span className="mw-takeaway__num" aria-hidden="true">{i + 1}</span>
            <div>
              {it.kicker ? <div className="kicker mw-takeaway__kicker">{it.kicker}</div> : null}
              <p className="headline-sm mw-takeaway__text">
                {it.href ? <a href={it.href} target="_blank" rel="noopener noreferrer">{it.text}</a> : it.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {footnote ? <p className="ui-meta mw-takeaway__foot">{footnote}</p> : null}
    </aside>
  );
}

/* ───────────────────────── PullQuote ───────────────────────── */

export interface PullQuoteProps { quote: string; attribution?: string }

export function PullQuote({ quote, attribution }: PullQuoteProps) {
  return (
    <figure className="mw-pq">
      <blockquote className="pull-quote">{quote}</blockquote>
      {attribution ? <figcaption className="dateline">{attribution}</figcaption> : null}
    </figure>
  );
}

/* ───────────────────────── TopicChip ───────────────────────── */

export interface TopicChipProps { label: string; selected?: boolean; onToggle?: (selected: boolean) => void; hint?: string; size?: 'md' | 'lg' }

export function TopicChip({ label, selected = false, onToggle, hint, size = 'md' }: TopicChipProps) {
  return (
    <button type="button" className={cx('mw-chip', 'ui-label', 'mw-chip--' + size, selected && 'is-on')} aria-pressed={selected}
      onClick={() => onToggle && onToggle(!selected)}>
      <Icon name={selected ? 'check' : 'plus'} size={16} />
      <span>{label}</span>
      {hint ? <span className="mw-chip__hint">{hint}</span> : null}
    </button>
  );
}

/* ───────────────────────── Segmented ───────────────────────── */

export interface SegmentedOption { value: string; label: string; hint?: string }
export interface SegmentedProps { label?: string; options: SegmentedOption[]; value: string; onChange?: (v: string) => void; name?: string }

export function Segmented({ label, options, value, onChange, name = 'mw-seg' }: SegmentedProps) {
  return (
    <fieldset className="mw-seg">
      {label ? <legend className="ui-label mw-seg__legend">{label}</legend> : null}
      <div className="mw-seg__track" role="radiogroup">
        {options.map((o) => (
          <label key={o.value} className={cx('mw-seg__opt', value === o.value && 'is-on')}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange && onChange(o.value)} />
            <span className="ui-label">{o.label}</span>
            {o.hint ? <span className="ui-meta mw-seg__hint">{o.hint}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ───────────────────────── TextField ───────────────────────── */

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

export function TextField({ label, hint, error, value, placeholder, multiline, rows = 3, id, onChange }: TextFieldProps) {
  const fid = id || 'mw-f-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const props = {
    id: fid, className: cx('mw-field__input', 'ui-text', error && 'is-error'), value, placeholder,
    'aria-describedby': hint || error ? fid + '-d' : undefined, 'aria-invalid': error ? true : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- design-system source: shared by <input> and <textarea>
    onChange: (e: any) => onChange && onChange(e.target.value),
  };
  return (
    <div className="mw-field">
      <label htmlFor={fid} className="ui-label">{label}</label>
      {multiline ? <textarea rows={rows} {...props} /> : <input type="text" {...props} />}
      {error ? <p id={fid + '-d'} className="ui-meta mw-field__error">{error}</p>
        : hint ? <p id={fid + '-d'} className="ui-meta mw-field__hint">{hint}</p> : null}
    </div>
  );
}

/* ───────────────────────── OnboardingStep ───────────────────────── */

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

export function OnboardingStep({ step, total, title, description, children, nextLabel = 'Continue', nextDisabled, onNext, onBack, onSkip, skipLabel = 'Skip for now', footnote }: OnboardingStepProps) {
  const bars = [];
  for (let i = 1; i <= total; i++) bars.push(<span key={i} className={cx('mw-ob__bar', i <= step && 'is-on')} />);
  return (
    <section className="mw-ob" aria-labelledby="mw-ob-title">
      <div className="mw-ob__progress" aria-hidden="true">{bars}</div>
      <div className="dateline mw-ob__count">Step {step} of {total}</div>
      <h2 id="mw-ob-title" className="headline-lg mw-ob__title">{title}</h2>
      {description ? <p className="ui-text mw-ob__desc">{description}</p> : null}
      <div className="mw-ob__body">{children}</div>
      <div className="mw-ob__foot">
        {onBack ? <Button variant="ghost" icon="arrow-left" onClick={onBack}>Back</Button> : <span />}
        <span className="mw-ob__right">
          {onSkip ? <Button variant="ghost" onClick={onSkip}>{skipLabel}</Button> : null}
          <Button variant="primary" iconRight="arrow-right" disabled={nextDisabled} onClick={onNext}>{nextLabel}</Button>
        </span>
      </div>
      {footnote ? <p className="ui-meta mw-ob__note">{footnote}</p> : null}
    </section>
  );
}

/* ───────────────────────── ReadingProgress ───────────────────────── */

export interface ReadingProgressProps { value: number; label?: string }

export function ReadingProgress({ value, label }: ReadingProgressProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="mw-progress">
      <div className="mw-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label || 'Reading progress'}>
        <div className="mw-progress__fill" style={{ width: pct + '%' }} />
      </div>
      {label ? <span className="ui-meta mw-progress__label">{label}</span> : null}
    </div>
  );
}

/* ───────────────────────── EditionCard ───────────────────────── */

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

export function EditionCard({ date, edition, headline, storyCount, readCount, readingTime, href, pdfHref, today, title = 'The Morrow' }: EditionCardProps) {
  const progress = storyCount ? (readCount || 0) / storyCount : 0;
  return (
    <article className={cx('mw-edition', today && 'is-today')}>
      <div className="mw-edition__head">
        <span className="masthead-sm mw-edition__title">{title}</span>
        {today ? <span className="kicker mw-edition__today">Today</span> : null}
      </div>
      <div className="dateline mw-edition__date">{date}{edition != null ? ' · No. ' + edition : ''}</div>
      <h3 className="headline-sm mw-edition__headline">{href ? <a href={href}>{headline}</a> : headline}</h3>
      <div className="ui-meta mw-edition__meta">
        {[storyCount != null ? storyCount + ' stories' : null, readingTime].filter(Boolean).join(' · ')}
      </div>
      {storyCount ? <ReadingProgress value={progress} label={(readCount || 0) + ' of ' + storyCount + ' read'} /> : null}
      <div className="mw-edition__actions">
        {href ? <Button size="sm" variant="secondary" href={href}>Read</Button> : null}
        {pdfHref ? <Button size="sm" variant="ghost" icon="download" href={pdfHref}>PDF</Button> : null}
      </div>
    </article>
  );
}
