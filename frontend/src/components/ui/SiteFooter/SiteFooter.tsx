import styles from "./SiteFooter.module.css";

export function SiteFooter({ onTour }: { onTour: () => void }) {
  return (
    <footer className={styles.footer}>
      <button className={styles.link} onClick={onTour}>
        How it works
      </button>
    </footer>
  );
}
