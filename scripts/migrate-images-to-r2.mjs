// Migrates Blogger-hosted images (blogger.googleusercontent.com) referenced in
// the generated post pages to Cloudflare R2, so the site no longer hotlinks
// Google's infrastructure.
//
// This is a three-phase, re-runnable pipeline:
//
//   node scripts/migrate-images-to-r2.mjs extract   -- scan public/blog/**, write migration/images/manifest.json
//   node scripts/migrate-images-to-r2.mjs download   -- download every unique image into migration/images/files/
//   node scripts/migrate-images-to-r2.mjs upload     -- upload downloaded files to the R2 bucket via `wrangler r2 object put`
//   node scripts/migrate-images-to-r2.mjs rewrite     -- rewrite public/blog/**/index.html to point at /media/<file> instead of Google
//
// Prerequisites for "upload": R2 must be enabled on the Cloudflare account
// (dashboard > R2 > Enable R2), then create the bucket once:
//   npx wrangler r2 bucket create gehariharan-blog-media
// and add the binding to wrangler.jsonc (see README).

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BLOG_DIR = path.join(ROOT, "public", "blog");
const IMAGES_DIR = path.join(ROOT, "migration", "images");
const FILES_DIR = path.join(IMAGES_DIR, "files");
const MANIFEST_PATH = path.join(IMAGES_DIR, "manifest.json");
const R2_BUCKET = "gehariharan-blog-media";
const MEDIA_PREFIX = "/media/";

const IMAGE_URL_PATTERN = /https:\/\/blogger\.googleusercontent\.com\/[^"'\s)>]+/g;

function listPostFiles() {
	if (!existsSync(BLOG_DIR)) return [];
	return readdirSync(BLOG_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(BLOG_DIR, entry.name, "index.html"))
		.filter((file) => existsSync(file));
}

function filenameFor(url) {
	const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 10);
	const extMatch = url.match(/\.([a-zA-Z0-9]{2,4})(?:[?#]|$)/);
	const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
	return `${hash}.${ext}`;
}

function extract() {
	const files = listPostFiles();
	const urls = new Set();

	for (const file of files) {
		const content = readFileSync(file, "utf8");
		const matches = content.match(IMAGE_URL_PATTERN) || [];
		for (const url of matches) urls.add(url);
	}

	const manifest = [...urls].sort().map((url) => ({ url, file: filenameFor(url), downloaded: false, uploaded: false }));

	mkdirSync(IMAGES_DIR, { recursive: true });
	writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

	console.log(`Found ${manifest.length} unique Blogger image URLs across ${files.length} post files.`);
	console.log(`Manifest written to ${path.relative(ROOT, MANIFEST_PATH)}`);
}

function loadManifest() {
	if (!existsSync(MANIFEST_PATH)) {
		throw new Error(`No manifest found. Run "node scripts/migrate-images-to-r2.mjs extract" first.`);
	}
	return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function saveManifest(manifest) {
	writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

async function download() {
	const manifest = loadManifest();
	mkdirSync(FILES_DIR, { recursive: true });

	let downloaded = 0;
	let failed = 0;

	for (const entry of manifest) {
		const destPath = path.join(FILES_DIR, entry.file);
		if (entry.downloaded && existsSync(destPath)) continue;

		try {
			const response = await fetch(entry.url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const buffer = Buffer.from(await response.arrayBuffer());
			writeFileSync(destPath, buffer);
			entry.downloaded = true;
			downloaded += 1;
		} catch (error) {
			console.warn(`Failed to download ${entry.url}: ${error.message}`);
			failed += 1;
		}
	}

	saveManifest(manifest);
	console.log(`Downloaded ${downloaded} images (${failed} failed) into ${path.relative(ROOT, FILES_DIR)}`);
}

function upload() {
	const manifest = loadManifest();
	let uploaded = 0;
	let skipped = 0;

	for (const entry of manifest) {
		if (entry.uploaded) {
			skipped += 1;
			continue;
		}
		const filePath = path.join(FILES_DIR, entry.file);
		if (!existsSync(filePath)) {
			console.warn(`Skipping ${entry.file}: not downloaded yet.`);
			continue;
		}

		execFileSync(
			"npx",
			["wrangler", "r2", "object", "put", `${R2_BUCKET}/${entry.file}`, `--file=${filePath}`, "--remote"],
			{ stdio: "inherit", shell: true },
		);
		entry.uploaded = true;
		uploaded += 1;
	}

	saveManifest(manifest);
	console.log(`Uploaded ${uploaded} images to R2 bucket "${R2_BUCKET}" (${skipped} already uploaded).`);
}

function rewrite() {
	const manifest = loadManifest();
	const urlToNewPath = new Map(manifest.filter((e) => e.uploaded).map((e) => [e.url, `${MEDIA_PREFIX}${e.file}`]));

	if (urlToNewPath.size === 0) {
		throw new Error(`No uploaded images found in manifest. Run "upload" first.`);
	}

	const files = listPostFiles();
	let changedFiles = 0;
	let replacedUrls = 0;

	for (const file of files) {
		const content = readFileSync(file, "utf8");
		let updated = content;
		for (const [oldUrl, newPath] of urlToNewPath) {
			if (updated.includes(oldUrl)) {
				updated = updated.split(oldUrl).join(newPath);
				replacedUrls += 1;
			}
		}
		if (updated !== content) {
			writeFileSync(file, updated);
			changedFiles += 1;
		}
	}

	console.log(`Rewrote ${replacedUrls} image references across ${changedFiles} post files to use ${MEDIA_PREFIX}<file>.`);
}

const phase = process.argv[2];
const phases = { extract, download, upload, rewrite };

if (!phases[phase]) {
	console.error(`Usage: node scripts/migrate-images-to-r2.mjs <extract|download|upload|rewrite>`);
	process.exit(1);
}

await phases[phase]();
