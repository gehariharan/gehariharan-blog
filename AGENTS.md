# AGENTS.md

Instructions, operational workflows, and authoring guidelines for AI agents working in this repository.

---

## 1. Repository Architecture & Stack

This repository powers **[gehariharan.com](https://gehariharan.com)**, a minimalist personal blog and newsletter platform.

- **Edge Runtime:** Cloudflare Workers (`wrangler.jsonc`, `src/index.ts`).
- **Static Delivery:** Cloudflare Worker Static Assets (`public/`).
- **Database:** Cloudflare D1 (`env.DB`, `gehariharan-blog`) for newsletter subscribers.
- **Media / Storage:** Cloudflare R2 (`env.MEDIA`, `gehariharan-blog-media`) serving `/media/*`.
- **Email Delivery:** Cloudflare Email Routing / Sending Service (`newsletter@gehariharan.com`).
- **CI/CD:** GitHub Actions (`.github/workflows/deploy.yml`) auto-deploying to Cloudflare on push to `main`.

---

## 2. Authoring New Posts

Posts are authored in Markdown in the `posts/` directory and compiled to static HTML before deployment.

### A. Scaffolding a New Post
Use the scaffolding script:
```sh
node scripts/new-post.mjs "Your Post Title Here"
```
This generates `posts/<slug>.md` with prefilled YAML frontmatter:
```markdown
---
title: "Your Post Title Here"
date: "2026-09-11"
tags: ["Technology", "Reflections"]
description: "Brief 1-2 sentence description for SEO and RSS feeds"
---

Write your post content here in Markdown...
```

### B. Building & Compiling Posts
Compile Markdown posts into static HTML pages (`public/blog/<slug>/index.html`), update the archive (`public/blog/index.html`), RSS feed (`public/rss.xml`), and sitemap (`public/sitemap.xml`):
```sh
npm run build:posts
```

### C. Deploying
Deploy directly to Cloudflare:
```sh
npm run deploy
```
*(Or commit and push to `origin/main` for automated GitHub Actions deployment).*

---

## 3. Hariharan's Writing Persona & Style Profile

*Based on an analysis of 190 posts across 15+ years (2006–2021+), from early engineering roots in Tamil Nadu through XLRI, tech leadership in Seattle, endurance cycling, and community initiatives.*

### Core Persona
- **Curious Pragmatist & Lifelong Learner:** Driven by first-principles understanding, multidisciplinary mental models (Charlie Munger, Herbert Simon, Richard Feynman), and practical experimentation.
- **Relentless Action-Oriented Community Builder:** Balances analytical rigor with high empathy and execution (e.g., Seattle Face Mask Army during COVID-19, fundraising for Asha for Education & Isha Vidhya via endurance rides).
- **Reflective & Humble Storyteller:** Honest about personal challenges, physical limits on the bike, learning curves with new tech, and the joy of simple human connections.

### Key Content Pillars
1. **Systems, Technology & Craft:** Web architecture, data systems, A/B testing, search dynamics, product experiments, developer workflows, and the evolution of tech.
2. **Endurance & Outdoor Sports:** Long mountain climbs (Mt. Baker Artist Point, Mt. Rainier Sunrise, RAMROD, STP), cycling suffering/euphoria, preparation, gear, and mental resilience.
3. **Mental Models, Reading & Books:** Deep book synthesis (Mortimer Adler, Rich Dad Poor Dad, Simon Singh, Charlie Munger's lattices), financial literacy, and disciplined thinking habits.
4. **Community, Volunteering & Social Causes:** Grassroots initiatives, public health efforts, education access for children, and mutual aid.
5. **Personal Growth & Life Notes:** Toastmasters speeches, college memories (XLRI), family journeys, and mindfulness/wellness.

### Voice & Tone Characteristics
- **Tone:** Earnest, warm, reflective, conversational, and direct.
- **Opening Style:** Often opens with a quote, a compelling thought, or an honest timestamp/reflection on time passed.
- **Structure:** Clean, focused sections with practical takeaways rather than abstract fluff.
- **Authenticity:** Speaks from personal experience ("Here's what I tried, what worked, and what didn't").

---

## 4. Agent Operational Guidelines & Rules

When assisting with this blog:

1. **Keep Static Output Clean & Minimalist:** Respect the lightweight levels.io-inspired design (pure CSS, semantic HTML, dark/light mode via CSS variables, zero heavy JS client frameworks).
2. **Preserve Legacy URLs & Redirects:** Never break old Blogger URLs. Check `src/redirects.ts` and ensure all canonical links and RSS feeds remain valid.
3. **Always Run Validation:** Ensure `npm run build:posts` compiles cleanly before deploying or committing.
4. **Maintain Style Consistency:** When drafting or editing posts, emulate the persona described in Section 3 while embracing modern clarity and conciseness.
