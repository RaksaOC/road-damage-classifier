import styles from "./SiteFooter.module.css";

export function SiteFooter({ onTour }: { onTour: () => void }) {
  return (
    <footer className={styles.footer}>
      <button className={styles.link} onClick={onTour}>
        How it works
      </button>
      <span aria-hidden="true">·</span>
      <span className={styles.demo} title="No model runs in this preview. Results are simulated from the photo's pixels.">
        Demo · simulated results
      </span>
    </footer>
  );
}
