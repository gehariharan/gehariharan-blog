// CLI command to scaffold a new markdown post, optionally build it, and prepare for publishing.
//
// Usage: node scripts/new-post.mjs "Post Title Here"

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "posts");

function slugify(title) {
	return title
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

const title = process.argv.slice(2).join(" ").trim() || "Untitled Post";
const slug = slugify(title) || `post-${Date.now()}`;
const today = new Date().toISOString().slice(0, 10);

if (!existsSync(POSTS_DIR)) {
	mkdirSync(POSTS_DIR, { recursive: true });
}

const targetPath = path.join(POSTS_DIR, `${slug}.md`);

if (existsSync(targetPath)) {
	console.error(`Post already exists at: ${targetPath}`);
	process.exit(1);
}

const template = `---
title: "${title}"
slug: "${slug}"
date: "${today}"
---

Write your post content here in Markdown.

## Section Header

You can use standard markdown formatting:
- Bullet points
- **Bold text** and *italics*
- Links: [Visit my site](https://gehariharan.com)
- Images: \`![Alt description](/media/image.png)\`
- Code snippets

When ready, run:
\`\`\`bash
npm run build:posts
\`\`\`
`;

writeFileSync(targetPath, template, "utf-8");
console.log(`Created new post draft at: posts/${slug}.md`);
console.log(`Edit the file, then run: npm run build:posts`);
