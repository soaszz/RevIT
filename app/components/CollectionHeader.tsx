import type { ReactNode } from "react";
import styles from "./CollectionHeader.module.css";

export type CollectionHeaderProps = {
  kicker?: string;
  title: string;
  description?: string | null;
  className?: string;
  children?: ReactNode;
};

export default function CollectionHeader({
  kicker,
  title,
  description,
  className,
  children,
}: CollectionHeaderProps) {
  return (
    <header className={`${styles.collectionHeader} ${className ?? ""}`.trim()}>
      <div className={styles.titles}>
        {kicker && <p className={styles.kicker}>{kicker}</p>}
        <h2 className={styles.title}>{title}</h2>
      </div>
      {description && <p className={styles.description}>{description}</p>}
      {children}
    </header>
  );
}
