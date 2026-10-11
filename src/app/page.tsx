import styles from "./page.module.css";

/**
 * This service has no user-facing UI - the chat widget lives in
 * portfolio-website and calls the API over HTTP. The page exists so that
 * anyone who reaches the deployed root gets an explanation rather than a 404
 * or, worse, the framework's starter template.
 */
export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>portfolio-ai-chatbot</h1>

      <p className={styles.lead}>
        Backend service for the &ldquo;Ask Me Anything&rdquo; chatbot on my
        portfolio site. It proxies requests to Azure AI Foundry and is the only
        place the model credentials live.
      </p>

      <p className={styles.lead}>
        There is no interface here. The chat widget is part of the portfolio
        site itself and talks to this service over HTTP.
      </p>

      <dl className={styles.endpoints}>
        <dt>
          <code>POST /api/chat</code>
        </dt>
        <dd>Ask a question. Optionally streamed.</dd>

        <dt>
          <code>
            <a href="/api/health">GET /api/health</a>
          </code>
        </dt>
        <dd>Deployment probe.</dd>
      </dl>
    </main>
  );
}
