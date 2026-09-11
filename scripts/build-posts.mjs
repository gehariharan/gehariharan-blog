// Builds static HTML post pages, updates /blog/ archive, RSS feed, sitemap,
// and homepage latest posts from Markdown files in `posts/*.md`.
//
// Usage: node scripts/build-posts.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "posts");
const PUBLIC_DIR = path.join(ROOT, "public");
const BLOG_DIR = path.join(PUBLIC_DIR, "blog");
const SITE_URL = "https://gehariharan.com";

function escapeHtml(input) {
	return (input || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function escapeAttr(input) {
	return escapeHtml(input).replace(/"/g, "&quot;");
}

function stripTags(html) {
	return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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

// Lightweight Markdown to HTML parser supporting common formatting:
// headings, bold/italic, lists, blockquotes, links, images, code blocks, paragraphs.
function markdownToHtml(markdown) {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const output = [];
	let inList = false;
	let inBlockquote = false;
	let inCodeBlock = false;
	let codeBlockLang = "";
	let codeBlockLines = [];

	function closeOpenBlocks() {
		if (inList) {
			output.push("</ul>");
			inList = false;
		}
		if (inBlockquote) {
			output.push("</blockquote>");
			inBlockquote = false;
		}
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Code block toggle
		if (line.startsWith("```")) {
			if (inCodeBlock) {
				output.push(`<pre><code class="language-${escapeAttr(codeBlockLang)}">${escapeHtml(codeBlockLines.join("\n"))}</code></pre>`);
				inCodeBlock = false;
				codeBlockLines = [];
			} else {
				closeOpenBlocks();
				inCodeBlock = true;
				codeBlockLang = line.slice(3).trim();
			}
			continue;
		}

		if (inCodeBlock) {
			codeBlockLines.push(line);
			continue;
		}

		// Empty line
		if (!line.trim()) {
			closeOpenBlocks();
			continue;
		}

		// Headings
		const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			closeOpenBlocks();
			const level = headingMatch[1].length;
			output.push(`<h${level}>${parseInlines(headingMatch[2])}</h${level}>`);
			continue;
		}

		// Blockquotes
		if (line.startsWith("> ")) {
			if (!inBlockquote) {
				closeOpenBlocks();
				output.push("<blockquote>");
				inBlockquote = true;
			}
			output.push(`<p>${parseInlines(line.slice(2))}</p>`);
			continue;
		} else if (inBlockquote) {
			output.push("</blockquote>");
			inBlockquote = false;
		}

		// Unordered list items (- or *)
		const listMatch = line.match(/^[-*]\s+(.*)$/);
		if (listMatch) {
			if (!inList) {
				closeOpenBlocks();
				output.push("<ul>");
				inList = true;
			}
			output.push(`<li>${parseInlines(listMatch[1])}</li>`);
			continue;
		} else if (inList) {
			output.push("</ul>");
			inList = false;
		}

		// Standard paragraph
		output.push(`<p>${parseInlines(line)}</p>`);
	}

	closeOpenBlocks();
	if (inCodeBlock) {
		output.push(`<pre><code>${escapeHtml(codeBlockLines.join("\n"))}</code></pre>`);
	}

	return output.join("\n");
}

function parseInlines(text) {
	return text
		// Inline code: `code`
		.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`)
		// Images: ![alt](url)
		.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}">`)
		// Links: [text](url)
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `<a href="${escapeAttr(url)}">${label}</a>`)
		// Bold: **text** or __text__
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/__([^_]+)__/g, "<strong>$1</strong>")
		// Italic: *text* or _text_
		.replace(/\*([^*]+)\*/g, "<em>$1</em>")
		.replace(/_([^_]+)_/g, "<em>$1</em>");
}

function parseFrontmatter(fileContent) {
	if (!fileContent.startsWith("---")) {
		return { meta: {}, body: fileContent };
	}
	const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	if (!match) {
		return { meta: {}, body: fileContent };
	}

	const rawMeta = match[1];
	const body = match[2];
	const meta = {};

	for (const line of rawMeta.split("\n")) {
		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;
		const key = line.slice(0, colonIdx).trim();
		let val = line.slice(colonIdx + 1).trim();
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
			val = val.slice(1, -1);
		}
		meta[key] = val;
	}

	return { meta, body };
}

function renderPostPage(post) {
	const excerpt = excerptOf(post.contentHtml);
	const postUrl = `${SITE_URL}/blog/${post.slug}/`;

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="description" content="${escapeAttr(excerpt)}" />
		<title>${escapeHtml(post.title)} &mdash; Gehariharan</title>
		<link rel="stylesheet" href="/styles.css" />
		<link rel="canonical" href="${postUrl}" />
		<link rel="alternate" type="application/rss+xml" title="Gehariharan" href="/rss.xml" />
	</head>
	<body>
		<main class="page">
			<nav>
				<a class="wordmark" href="/">Gehariharan</a>
				<a class="nav-link" href="/blog/">All writing</a>
			</nav>

			<article class="post-content">
				<header>
					<time datetime="${post.date}">${formatDisplayDate(post.date)}</time>
					<h1>${escapeHtml(post.title)}</h1>
				</header>
				<div class="prose">
					${post.contentHtml}
				</div>
			</article>

			<section class="post-footer">
				<p>Get new writing delivered straight to your inbox:</p>
				<form id="subscribe-form" class="subscribe-compact">
					<div class="form-row">
						<input id="email" name="email" type="email" placeholder="Type your email..." aria-label="Email address" required />
						<button type="submit">Subscribe</button>
					</div>
					<p class="status" id="status" aria-live="polite"></p>
				</form>
			</section>

			<footer>
				<a href="/">&larr; Back to home</a>
				<a href="/blog/">All writing</a>
			</footer>
		</main>
		<script>
			document.getElementById("subscribe-form")?.addEventListener("submit", async (e) => {
				e.preventDefault();
				const status = document.getElementById("status");
				const input = document.getElementById("email");
				status.textContent = "Subscribing...";
				try {
					const res = await fetch("/api/subscribe", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ email: input.value }),
					});
					const data = await res.json();
					status.textContent = data.message || data.error || "Done.";
					if (res.ok) input.value = "";
				} catch {
					status.textContent = "Could not subscribe right now. Please try again later.";
				}
			});
		</script>
	</body>
</html>
`;
}

export function buildPosts() {
	if (!existsSync(POSTS_DIR)) {
		mkdirSync(POSTS_DIR, { recursive: true });
	}

	const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
	if (files.length === 0) {
		console.log("No markdown posts found in posts/*.md (nothing new to compile).");
		return;
	}

	let count = 0;
	for (const file of files) {
		const filePath = path.join(POSTS_DIR, file);
		const raw = readFileSync(filePath, "utf-8");
		const { meta, body } = parseFrontmatter(raw);

		const slug = meta.slug || file.replace(/\.md$/, "");
		const title = meta.title || slug;
		const date = meta.date || new Date().toISOString().slice(0, 10);
		const contentHtml = markdownToHtml(body);

		const post = { slug, title, date, contentHtml };
		const postDir = path.join(BLOG_DIR, slug);
		if (!existsSync(postDir)) {
			mkdirSync(postDir, { recursive: true });
		}
		writeFileSync(path.join(postDir, "index.html"), renderPostPage(post));
		count++;
	}

	console.log(`Successfully built ${count} markdown post(s) to public/blog/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	buildPosts();
}
