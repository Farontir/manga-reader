// Writes source-repo/index.html: the install page served at the root of the source repo.
// Each button opens Kumo Reader on its "add source" screen with the source URL filled in;
// the app shows the manifest and asks for confirmation before installing anything.
import { readFile, readdir, writeFile } from 'node:fs/promises';

const descriptions = {
  asurascans: 'Catalogue et chapitres publics d’Asura Scans.',
  flamecomics: 'Catalogue et chapitres publics de Flame Comics.',
  'komga-demo':
    'Serveur de démonstration Komga, avec des œuvres du domaine public. Sert de modèle pour brancher ton propre serveur.',
  mangabats: 'Catalogue et chapitres publics de MangaBats.',
  mangadex:
    'Catalogue communautaire MangaDex, chapitres en anglais, via son API publique. Explorer affiche les tendances du moment.',
  mangakakalot:
    'Catalogue MangaKakalot, avec le miroir MangaBats pour les fiches et pages bloquées sur le domaine principal.',
  mangakatana: 'Catalogue, fiches et chapitres publics de MangaKatana.',
  peppercarrot: 'Pepper&Carrot, le webcomic libre de David Revoy (CC BY 4.0).',
};

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

const cards = [];
const sourceRepo = new URL('../source-repo/', import.meta.url);
const directories = (await readdir(sourceRepo, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'fr'));

for (const name of directories) {
  const manifest = JSON.parse(await readFile(new URL(`${name}/manifest.json`, sourceRepo), 'utf8'));
  await readFile(new URL(`${name}/bundle.js`, sourceRepo));
  const description = descriptions[name] ?? `Source ${manifest.name}.`;
  cards.push(`      <article class="card" data-source="${escape(name)}">
        <div class="card-head">
          <h2>${escape(manifest.name)}</h2>
          <span class="status" data-status>…</span>
        </div>
        <p class="meta">Version ${escape(manifest.version)} · ${escape(manifest.language.toUpperCase())} · ${escape(manifest.allowedHosts.join(', '))}</p>
        <p>${escape(description)}</p>
        <div class="actions">
          <a class="install" data-install href="#">Installer dans Kumo Reader</a>
          <button class="copy" type="button" data-copy>Copier l’URL</button>
        </div>
      </article>`);
}

const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sources Kumo Reader</title>
    <meta name="description" content="Sources installables dans Kumo Reader en un toucher." />
    <style>
      :root {
        --bg: #f7f5f0;
        --surface: #ffffff;
        --text: #121820;
        --muted: #5f6873;
        --border: #e6e5e0;
        --accent: #d9553a;
        --accent-text: #ffffff;
        --ok: #23855d;
        --warn: #a96e00;
        --down: #cf3c3c;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #111519;
          --surface: #1d2328;
          --text: #f4f2ec;
          --muted: #adb4b8;
          --border: #353d41;
          --accent: #ff8667;
          --accent-text: #111519;
          --ok: #70cfa0;
          --warn: #f4b64e;
          --down: #ff7070;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font: 16px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      main { margin: 0 auto; max-width: 640px; padding: 40px 16px 56px; }
      .eyebrow { color: var(--accent); font-size: 12px; font-weight: 800; letter-spacing: 0.16em; margin: 0; }
      h1 { font-size: 32px; letter-spacing: -0.02em; line-height: 1.15; margin: 6px 0 12px; }
      .intro { color: var(--muted); margin: 0 0 28px; }
      .card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 16px;
        margin-bottom: 14px;
        padding: 18px;
      }
      .card-head { align-items: baseline; display: flex; gap: 12px; justify-content: space-between; }
      h2 { font-size: 19px; margin: 0; }
      .card p { margin: 8px 0 0; }
      .meta { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
      .status { color: var(--muted); flex-shrink: 0; font-size: 13px; font-weight: 700; }
      .status.ok { color: var(--ok); }
      .status.degraded { color: var(--warn); }
      .status.down { color: var(--down); }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
      .install, .copy {
        border-radius: 12px;
        cursor: pointer;
        font: inherit;
        font-size: 15px;
        font-weight: 700;
        min-height: 46px;
        padding: 11px 16px;
        text-align: center;
      }
      .install { background: var(--accent); border: 1px solid var(--accent); color: var(--accent-text); flex: 1 1 220px; text-decoration: none; }
      .copy { background: transparent; border: 1px solid var(--border); color: var(--text); flex: 0 1 auto; }
      .install:focus-visible, .copy:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
      .help { border-top: 1px solid var(--border); color: var(--muted); font-size: 14px; margin-top: 28px; padding-top: 20px; }
      .help p { margin: 0 0 10px; }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">KUMO READER</p>
      <h1>Sources</h1>
      <p class="intro">
        Ouvre cette page sur ton iPhone et touche « Installer » : Kumo Reader affiche la source
        et te demande de confirmer avant de l’installer.
      </p>
${cards.join('\n')}
      <section class="help">
        <p>
          Le bouton ouvre l’app installée depuis TestFlight ou l’App Store (pas Expo Go). Sinon,
          copie l’URL et colle-la dans <strong>Sources → Installer une source</strong>.
        </p>
        <p>
          Chaque bundle est vérifié par son empreinte SHA-256 et s’exécute isolé, limité aux
          domaines indiqués. Désinstaller une source conserve ta bibliothèque et ta progression.
        </p>
      </section>
    </main>
    <script>
      const labels = { ok: '● Opérationnelle', degraded: '● À surveiller', down: '● Indisponible' };
      for (const card of document.querySelectorAll('[data-source]')) {
        const sourceUrl = new URL(card.dataset.source + '/', location.href).href;
        card.querySelector('[data-install]').href =
          'mangareader://add-source?url=' + encodeURIComponent(sourceUrl);
        const copy = card.querySelector('[data-copy]');
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(sourceUrl);
            copy.textContent = 'Copiée ✓';
          } catch {
            prompt('URL de la source', sourceUrl);
          }
        });
        const status = card.querySelector('[data-status]');
        fetch(sourceUrl + 'status.json', { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .then((data) => {
            status.textContent = (data && labels[data.status]) || '';
            if (data && labels[data.status]) status.classList.add(data.status);
          })
          .catch(() => {
            status.textContent = '';
          });
      }
    </script>
  </body>
</html>
`;

await writeFile(new URL('index.html', sourceRepo), html);
process.stdout.write(`index.html: ${cards.length} sources\n`);
