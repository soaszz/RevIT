import type { ReactNode } from "react";
import styles from "./CollectionHeader.module.css";

export type CollectionHeaderProps = {
  kicker?: string;
  title: string;
  description?: string | null;
  className?: string;
  children?: ReactNode;
  collection?: string;
  expanded?: boolean;
  panelId?: string;
  onToggle?: () => void;
};

export default function CollectionHeader({
  kicker,
  title,
  description,
  className,
  children,
  collection = "all-majors",
  expanded,
  panelId,
  onToggle,
}: CollectionHeaderProps) {
  const Copy = onToggle ? "span" : "div";
  const Title = onToggle ? "span" : "h2";
  const Text = onToggle ? "span" : "p";
  const identity = <>
      <svg className={styles.symbol} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {collection === "mtap-2" ? <><path d="m4 11 12-6 12 6-12 6Z" /><path d="m4 17 12 6 12-6M4 23l12 6 12-6" /></> : collection === "other-majors" ? <><path d="M16 4v24M4 16h24" /><path d="m7 7 6 6m6 6 6 6M7 25l6-6m6-6 6-6" /></> : <><path d="M16 9C12 5 7 5 3 6v19c5-1 9 0 13 3 4-3 8-4 13-3V6c-4-1-9-1-13 3Z" /><path d="M16 9v19M7 11c2 0 4 .5 5 1.5M20 12.5c1-1 3-1.5 5-1.5" /></>}
      </svg>
      <Copy className={styles.content}>
        <Copy className={styles.titles}>
          <Title className={styles.title}>{title}</Title>
          {kicker && <Text className={styles.kicker}>{kicker}</Text>}
        </Copy>
        {description && <Text id={onToggle ? `${panelId}-description` : undefined} className={styles.description}>{description}</Text>}
      </Copy>
  </>;
  if (onToggle && panelId) return <header data-collection={collection} className={`${styles.collectionHeader} ${styles.accordion} ${className ?? ""}`.trim()}>
    <h2 className={styles.accordionHeading}>
      <button id={`${panelId}-toggle`} className={styles.toggle} type="button" aria-label={title} aria-expanded={expanded} aria-controls={panelId} aria-describedby={description ? `${panelId}-description` : undefined} onClick={onToggle}>
        {identity}
        <svg className={styles.chevron} data-expanded={expanded} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </h2>
    {children}
  </header>;
  return <header data-collection={collection} className={`${styles.collectionHeader} ${className ?? ""}`.trim()}>{identity}{children}</header>;
}

export function CollectionPanel({ enabled, panelId, expanded, children }: { enabled: boolean; panelId: string; expanded: boolean; children: ReactNode }) {
  return enabled ? <div className={styles.panel} id={panelId} role="region" aria-labelledby={`${panelId}-toggle`} hidden={!expanded}>{children}</div> : <>{children}</>;
}
