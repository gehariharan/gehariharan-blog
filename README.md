# gehariharan.com

A minimalist, Cloudflare-native personal blog and newsletter platform for **[gehariharan.com](https://gehariharan.com)**, migrated from Blogger.

## Architecture

- **Edge Runtime:** Cloudflare Workers (`src/index.ts`, `wrangler.jsonc`)
- **Static Delivery:** Worker Static Assets (`public/`)
- **Database:** Cloudflare D1 (`gehariharan-blog`) for subscriber list
- **Media Storage:** Cloudflare R2 (`gehariharan-blog-media`) for images and attachments
- **Email Service:** Cloudflare Email Routing / Sending (`newsletter@gehariharan.com`)
- **CI/CD:** GitHub Actions (`.github/workflows/deploy.yml`) auto-deploying on push to `main`

---

## Authoring & Publishing Workflow

### 1. Draft a New Post
Use the scaffolding CLI helper:
```sh
node scripts/new-post.mjs "My First New Post"
```
This creates `posts/my-first-new-post.md` with prefilled YAML frontmatter.

### 2. Build Static HTML
Compile Markdown posts into static pages (`public/blog/`), update the archive, RSS feed (`public/rss.xml`), and sitemap (`public/sitemap.xml`):
```sh
npm run build:posts
```

### 3. Deploy
Deploy directly to Cloudflare:
```sh
npm run deploy
```
Or push to `main` on GitHub to trigger the automated GitHub Actions deployment.

---

## Agent Instructions & Author Persona

See **[`AGENTS.md`](./AGENTS.md)** (or **[`CLAUDE.md`](./CLAUDE.md)**) for comprehensive authoring guidelines, developer instructions, and a detailed synthesis of the author's voice, writing persona, and content pillars derived from 190+ historical posts.

---

## Development & Local Testing

Start the local Worker runtime with Miniflare / Wrangler:
```sh
npm run dev
```
Test the landing page, newsletter submission, and cookie bypass locally at `http://localhost:8787`.

---

## Historical Blogger Migration & Images

- `scripts/migrate-blogger.mjs`: Parses `migration/blogger-export.xml` into the initial 190 static HTML posts and generates 301 legacy redirects in `src/redirects.ts`.
- `scripts/migrate-images-to-r2.mjs`: Extracts external Blogger images, downloads them locally, uploads to Cloudflare R2 bucket `gehariharan-blog-media`, and rewrites URLs to `/media/<hash>.<ext>`.

