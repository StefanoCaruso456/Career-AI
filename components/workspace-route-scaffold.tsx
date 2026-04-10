import styles from "./workspace-route-scaffold.module.css";

type WorkspaceRouteMetric = {
  label: string;
  value: string;
};

type WorkspaceRouteCard = {
  copy: string;
  eyebrow: string;
  title: string;
};

export function WorkspaceRouteScaffold({
  cards,
  description,
  eyebrow,
  metrics,
  title,
}: {
  cards: WorkspaceRouteCard[];
  description: string;
  eyebrow: string;
  metrics: WorkspaceRouteMetric[];
  title: string;
}) {
  return (
    <section className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>

          <div className={styles.metricGrid}>
            {metrics.map((metric) => (
              <article className={styles.metricCard} key={metric.label}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </article>
            ))}
          </div>
        </div>

        <div className={styles.cardGrid}>
          {cards.map((card) => (
            <article className={styles.card} key={card.title}>
              <span className={styles.cardEyebrow}>{card.eyebrow}</span>
              <h2>{card.title}</h2>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
