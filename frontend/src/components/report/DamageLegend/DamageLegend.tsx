import { CLASSES } from "@/domain/damage";
import styles from "./DamageLegend.module.css";

export function DamageLegend() {
  return (
    <ul className={styles.legend} aria-label="Colour key">
      {CLASSES.filter((c) => c.k !== "none").map((c) => (
        <li key={c.k}>
          <span className={styles.sw} style={{ background: `var(${c.v})` }} />
          {c.n}
        </li>
      ))}
    </ul>
  );
}
