import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("blog landing page", () => {
	it("serves the newsletter-first landing page", async () => {
		const response = await SELF.fetch("https://example.com/");

		expect(response.status).toBe(200);
		expect(await response.text()).toContain("Never miss a post");
	});

	it("redirects to /blog/ when skip_landing cookie is present", async () => {
		const response = await SELF.fetch("https://example.com/", {
			headers: { cookie: "skip_landing=true" },
			redirect: "manual",
		});

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("https://example.com/blog/");
	});
});

describe("projects page", () => {
	it("lists only the chosen projects as compact cards", async () => {
		const response = await SELF.fetch("https://example.com/projects/");

		expect(response.status).toBe(200);
		const html = await response.text();
		const names = [...html.matchAll(/<h3 class="project-name">([^<]+)<\/h3>/g)].map((match) => match[1]);
		expect(names).toEqual(["orob", "Thrive Ever", "wasync", "Aaroha Academy", "Bilkool Ezee"]);
		expect(html).toContain("Apps for everyone");
		expect(html).toContain("Built for businesses");
	});

	it("drops the old build log, stats strip and filters", async () => {
		const html = await (await SELF.fetch("https://example.com/projects/")).text();

		for (const removed of ["Projects &amp; Systems", "Projects & Systems", "Tracked Builds", "filter-btn", "Narayaneeyam", "Xaurum", "<script"]) {
			expect(html).not.toContain(removed);
		}
	});

	it("serves every card logo", async () => {
		const html = await (await SELF.fetch("https://example.com/projects/")).text();
		const logos = [...html.matchAll(/<img src="(\/logos\/[^"]+)"/g)].map((match) => match[1]);

		expect(logos).toHaveLength(5);
		for (const logo of logos) {
			expect((await SELF.fetch(`https://example.com${logo}`)).status, logo).toBe(200);
		}
	});
});

describe("about page", () => {
	it("shows the consumer apps from the projects list", async () => {
		const response = await SELF.fetch("https://example.com/about/");

		expect(response.status).toBe(200);
		const html = await response.text();
		const section = html.slice(html.indexOf("<!-- apps:start"), html.indexOf("<!-- apps:end -->"));
		expect(section).toContain("Apps I’ve built");
		const names = [...section.matchAll(/<h3 class="project-name">([^<]+)<\/h3>/g)].map((match) => match[1]);
		expect(names).toEqual(["orob", "Thrive Ever", "wasync"]);
		expect(section).toContain('href="/projects/"');
	});
});
