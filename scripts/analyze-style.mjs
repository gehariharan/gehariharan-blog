import fs from "node:fs";
import path from "node:path";

const dir = "public/blog";
const subdirs = fs
	.readdirSync(dir, { withFileTypes: true })
	.filter((d) => d.isDirectory());

console.log("Total post directories:", subdirs.length);

const samples = [];
const step = Math.max(1, Math.floor(subdirs.length / 25));

for (let i = 0; i < subdirs.length; i += step) {
	const d = subdirs[i];
	const postHtml = fs.readFileSync(path.join(dir, d.name, "index.html"), "utf8");
	const titleMatch = postHtml.match(/<h1 class="post-title">([\s\S]*?)<\/h1>/);
	const metaMatch = postHtml.match(/<p class="post-meta">([\s\S]*?)<\/p>/);
	const textMatch = postHtml.match(/<article class="post-body">([\s\S]*?)<\/article>/);

	const title = titleMatch ? titleMatch[1].trim() : d.name;
	const meta = metaMatch ? metaMatch[1].replace(/<[^>]+>/g, " ").trim() : "";
	const bodyText = textMatch
		? textMatch[1]
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.slice(0, 400)
				.trim()
		: "";

	samples.push({ slug: d.name, title, meta, snippet: bodyText });
}

fs.writeFileSync("migration/samples_summary.json", JSON.stringify(samples, null, 2));
console.log("Extracted samples count:", samples.length);
