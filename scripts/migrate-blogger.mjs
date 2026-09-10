// One-time (re-runnable) migration from the Blogger WXR export into static
// site content: per-post pages, an archive index, RSS, a sitemap, and a
// redirect map from old Blogger permalinks to the new post URLs.
//
// Usage: node scripts/migrate-blogger.mjs

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const EXPORT_PATH = path.join(ROOT, "migration", "blogger-export.xml");
const PUBLIC_DIR = path.join(ROOT, "public");
const BLOG_DIR = path.join(PUBLIC_DIR, "blog");
const SITE_URL = "https://gehariharan.com";

function decodeEntities(input) {
	let current = input;
	for (let i = 0; i < 4; i += 1) {
		const previous = current;
		current = current
			.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
			.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&apos;/g, "'");
		if (current === previous) break;
	}
	return current;
}

function escapeHtml(input) {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function escapeAttr(input) {
	return escapeHtml(input).replace(/"/g, "&quot;");
}

function stripTags(html) {
	return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function excerptOf(html, length = 160) {
	const text = stripTags(html);
	if (text.length <= length) return text;
	return `${text.slice(0, length).trimEnd()}…`;
}

function formatDisplayDate(isoDate) {
	const [year, month, day] = isoDate.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}

function formatCompactDate(isoDate) {
	const [year, month, day] = isoDate.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function formatRfc822(isoDate) {
	const [year, month, day] = isoDate.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
	return date.toUTCString();
}

function parseItems(xml) {
	const itemBlocks = xml.split("<item>").slice(1).map((block) => block.split("</item>")[0]);
	const posts = [];

	for (const block of itemBlocks) {
		const title = decodeEntities((block.match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1].trim());
		const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [, ""])[1].trim();
		const contentMatch = block.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
		const content = contentMatch ? contentMatch[1] : "";
		const slugMatch = block.match(/<wp:post_name><!\[CDATA\[([\s\S]*?)\]\]><\/wp:post_name>/);
		const slug = slugMatch ? slugMatch[1].trim() : null;
		const dateMatch = block.match(/<wp:post_date><!\[CDATA\[([\s\S]*?)\]\]><\/wp:post_date>/);
		const isoDate = dateMatch ? dateMatch[1].trim().slice(0, 10) : null;
		const statusMatch = block.match(/<wp:status>([\s\S]*?)<\/wp:status>/);
		const status = statusMatch ? statusMatch[1].trim() : "publish";

		const categories = [...block.matchAll(/<category domain="category" nicename="([^"]*)"><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g)].map(
			(m) => decodeEntities(m[2].trim()),
		);

		let oldPath = null;
		try {
			oldPath = new URL(link).pathname;
		} catch {
			oldPath = null;
		}

		if (!slug || !isoDate || status !== "publish") continue;

		posts.push({ title, slug, isoDate, content, categories, oldPath });
	}

	return posts;
}

function postTemplate(post) {
	const categoriesHtml = post.categories.length
		? ` &middot; ${post.categories.map((c) => escapeHtml(c)).join(", ")}`
		: "";

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="description" content="${escapeAttr(excerptOf(post.content))}" />
		<title>${escapeHtml(post.title)} &mdash; Gehariharan</title>
		<link rel="canonical" href="${SITE_URL}/blog/${post.slug}/" />
		<link rel="stylesheet" href="/styles.css" />
		<link rel="alternate" type="application/rss+xml" title="Gehariharan" href="/rss.xml" />
	</head>
	<body>
		<main class="page">
			<nav>
				<a class="wordmark" href="/">Gehariharan</a>
				<a class="nav-link" href="/blog/">All writing</a>
			</nav>
			<header class="post-header">
				<h1 class="post-title">${escapeHtml(post.title)}</h1>
				<p class="post-meta"><time datetime="${post.isoDate}">${formatDisplayDate(post.isoDate)}</time>${categoriesHtml}</p>
			</header>
			<article class="post-body">
${post.content}
			</article>
			<a class="back-link" href="/blog/">&larr; Back to all writing</a>
			<footer>
				<span>&copy; 2026 Gehariharan</span>
				<span>Built on Cloudflare</span>
			</footer>
		</main>
	</body>
</html>
`;
}

function archiveTemplate(postsByYear) {
	const years = Object.keys(postsByYear).sort((a, b) => Number(b) - Number(a));
	const sections = years
		.map((year) => {
			const items = postsByYear[year]
				.map(
					(post) =>
						`\t\t\t\t<li><time datetime="${post.isoDate}">${formatCompactDate(post.isoDate)}</time><a href="/blog/${post.slug}/">${escapeHtml(post.title)}</a></li>`,
				)
				.join("\n");
			return `\t\t\t<h2 class="archive-year">${year}</h2>\n\t\t\t<ul class="archive-list">\n${items}\n\t\t\t</ul>`;
		})
		.join("\n");

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="description" content="All writing from Gehariharan, migrated from Blogger." />
		<title>All writing &mdash; Gehariharan</title>
		<link rel="canonical" href="${SITE_URL}/blog/" />
		<link rel="stylesheet" href="/styles.css" />
		<link rel="alternate" type="application/rss+xml" title="Gehariharan" href="/rss.xml" />
	</head>
	<body>
		<main class="page">
			<nav>
				<a class="wordmark" href="/">Gehariharan</a>
				<a class="nav-link" href="/">Home</a>
			</nav>
			<header class="post-header">
				<h1 class="post-title">All writing</h1>
				<p class="post-meta">The complete archive, migrated from Blogger.</p>
			</header>
${sections}
			<footer>
				<span>&copy; 2026 Gehariharan</span>
				<span>Built on Cloudflare</span>
			</footer>
		</main>
	</body>
</html>
`;
}

function rssTemplate(posts) {
	const items = posts
		.slice(0, 30)
		.map(
			(post) => `\t\t<item>
			<title>${escapeHtml(post.title)}</title>
			<link>${SITE_URL}/blog/${post.slug}/</link>
			<guid>${SITE_URL}/blog/${post.slug}/</guid>
			<pubDate>${formatRfc822(post.isoDate)}</pubDate>
			<description>${escapeHtml(excerptOf(post.content))}</description>
		</item>`,
		)
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
	<channel>
		<title>Gehariharan</title>
		<link>${SITE_URL}</link>
		<description>Notes on technology, building, and the things worth thinking about.</description>
${items}
	</channel>
</rss>
`;
}

function sitemapTemplate(posts) {
	const urls = [
		`\t<url><loc>${SITE_URL}/</loc></url>`,
		`\t<url><loc>${SITE_URL}/blog/</loc></url>`,
		...posts.map((post) => `\t<url><loc>${SITE_URL}/blog/${post.slug}/</loc><lastmod>${post.isoDate}</lastmod></url>`),
	];

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

function redirectsModule(posts) {
	const entries = posts
		.filter((post) => post.oldPath && post.oldPath !== `/blog/${post.slug}/`)
		.map((post) => `\t"${post.oldPath}": "/blog/${post.slug}/",`)
		.join("\n");

	return `// Generated by scripts/migrate-blogger.mjs — do not edit by hand.
// Maps old Blogger permalink paths to their new post URLs.
export const blogRedirects: Record<string, string> = {
${entries}
};
`;
}

function updateHomepageLatestPosts(posts) {
	const homepagePath = path.join(PUBLIC_DIR, "index.html");
	const homepage = readFileSync(homepagePath, "utf8");

	const latest = posts.slice(0, 5);
	const postsHtml = latest
		.map(
			(post) => `\t\t\t\t\t<a class="post" href="/blog/${post.slug}/">
						<time datetime="${post.isoDate}">${formatCompactDate(post.isoDate)}</time>
						<div>
							<h2>${escapeHtml(post.title)}</h2>
							<p class="excerpt">${escapeHtml(excerptOf(post.content, 140))}</p>
						</div>
					</a>`,
		)
		.join("\n");

	const updated = homepage.replace(
		/<!-- LATEST_POSTS_START -->[\s\S]*?<!-- LATEST_POSTS_END -->/,
		`<!-- LATEST_POSTS_START -->\n${postsHtml}\n\t\t\t\t\t<!-- LATEST_POSTS_END -->`,
	);

	writeFileSync(homepagePath, updated);
}

function main() {
	const xml = readFileSync(EXPORT_PATH, "utf8");
	const posts = parseItems(xml).sort((a, b) => (a.isoDate < b.isoDate ? 1 : -1));

	const slugCounts = new Map();
	for (const post of posts) {
		slugCounts.set(post.slug, (slugCounts.get(post.slug) || 0) + 1);
	}
	const duplicates = [...slugCounts.entries()].filter(([, count]) => count > 1);
	if (duplicates.length) {
		throw new Error(`Duplicate slugs found: ${duplicates.map(([slug]) => slug).join(", ")}`);
	}

	if (existsSync(BLOG_DIR)) rmSync(BLOG_DIR, { recursive: true, force: true });
	mkdirSync(BLOG_DIR, { recursive: true });

	for (const post of posts) {
		const dir = path.join(BLOG_DIR, post.slug);
		mkdirSync(dir, { recursive: true });
		writeFileSync(path.join(dir, "index.html"), postTemplate(post));
	}

	const postsByYear = {};
	for (const post of posts) {
		const year = post.isoDate.slice(0, 4);
		(postsByYear[year] ||= []).push(post);
	}
	writeFileSync(path.join(BLOG_DIR, "index.html"), archiveTemplate(postsByYear));

	writeFileSync(path.join(PUBLIC_DIR, "rss.xml"), rssTemplate(posts));
	writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), sitemapTemplate(posts));
	writeFileSync(path.join(ROOT, "src", "redirects.ts"), redirectsModule(posts));

	updateHomepageLatestPosts(posts);

	console.log(`Migrated ${posts.length} posts.`);
	console.log(`Generated: public/blog/<slug>/index.html (${posts.length} pages), public/blog/index.html, public/rss.xml, public/sitemap.xml, src/redirects.ts`);
}

main();
