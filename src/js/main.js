// entry point — bootstraps the SPA
console.info('[reddit-clone] v0.0.0 — skeleton');

const app = document.getElementById('app');
if (app) {
  app.removeAttribute('aria-busy');
  app.innerHTML = `
    <main class="boot-screen">
      <h1>MiniMax Reddit Clone</h1>
      <p>Skeleton ready. UI mounts from <code>src/js/main.js</code>.</p>
      <p>See <a href="/CHANGELOG.md">CHANGELOG.md</a> for the version roadmap.</p>
    </main>
  `;
}
