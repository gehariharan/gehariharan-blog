"""Pull all posts from a Blogger Atom feed and emit a WordPress WXR (eXtended RSS)
file that can be imported directly into Substack (Settings -> Imports -> WordPress)."""
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import format_datetime
import html
import re
import sys

BLOG = "https://www.gehariharan.com"
FEED = BLOG + "/feeds/posts/default"
UA = {"User-Agent": "Mozilla/5.0"}
PAGE = 150

ATOM = "{http://www.w3.org/2005/Atom}"
LABEL_SCHEME = "http://www.blogger.com/atom/ns#kind"  # not used; labels use term+scheme below


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req).read().decode("utf-8", "replace")


def get_all_entries():
    entries = []
    start = 1
    while True:
        url = f"{FEED}?alt=atom&max-results={PAGE}&start-index={start}"
        xml = fetch(url)
        root = ET.fromstring(xml)
        batch = root.findall(f"{ATOM}entry")
        if not batch:
            break
        entries.extend(batch)
        if len(batch) < PAGE:
            break
        start += PAGE
    return entries


def parse_iso(s):
    # Blogger: 2021-03-28T10:15:00.000-07:00
    s = s.strip()
    s = re.sub(r"\.\d+", "", s)  # drop millis
    # normalize tz +HH:MM -> +HHMM
    m = re.match(r"(.*)([+-]\d{2}):(\d{2})$", s)
    if m:
        s = m.group(1) + m.group(2) + m.group(3)
        return datetime.strptime(s, "%Y-%m-%dT%H:%M:%S%z")
    if s.endswith("Z"):
        return datetime.strptime(s[:-1], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def slug_from(entry):
    for l in entry.findall(f"{ATOM}link"):
        if l.get("rel") == "alternate":
            href = l.get("href", "")
            seg = href.rstrip("/").split("/")[-1]
            seg = re.sub(r"\.html?$", "", seg)
            if seg:
                return seg
    return None


def alt_link(entry):
    for l in entry.findall(f"{ATOM}link"):
        if l.get("rel") == "alternate":
            return l.get("href", "")
    return BLOG


def is_post(entry):
    # Blogger marks kind via category scheme schemas.google.com/g/2005#kind
    for c in entry.findall(f"{ATOM}category"):
        if c.get("scheme", "").endswith("#kind"):
            if c.get("term", "").endswith("#post"):
                return True
            return False
    return True  # default: treat as post


def labels(entry):
    out = []
    for c in entry.findall(f"{ATOM}category"):
        sch = c.get("scheme", "")
        if "#kind" in sch:
            continue
        term = c.get("term")
        if term:
            out.append(term)
    return out


def cdata(s):
    return "<![CDATA[" + (s or "").replace("]]>", "]]]]><![CDATA[>") + "]]>"


def build_wxr(entries):
    author = "G E Hariharan"
    # find author name from first entry if present
    for e in entries:
        a = e.find(f"{ATOM}author/{ATOM}name")
        if a is not None and a.text:
            author = a.text
            break

    items = []
    used_slugs = set()
    n = 0
    for e in entries:
        if not is_post(e):
            continue
        title_el = e.find(f"{ATOM}title")
        title = (title_el.text or "").strip() if title_el is not None else ""
        if not title:
            title = "(untitled)"
        content_el = e.find(f"{ATOM}content")
        content = content_el.text if content_el is not None and content_el.text else ""
        pub_el = e.find(f"{ATOM}published")
        upd_el = e.find(f"{ATOM}updated")
        dt = parse_iso(pub_el.text) if pub_el is not None else None
        if dt is None and upd_el is not None:
            dt = parse_iso(upd_el.text)
        if dt is None:
            dt = datetime.now(timezone.utc)
        dt_gmt = dt.astimezone(timezone.utc)

        slug = slug_from(e) or re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or f"post-{n}"
        base = slug
        i = 2
        while slug in used_slugs:
            slug = f"{base}-{i}"
            i += 1
        used_slugs.add(slug)

        link = alt_link(e)
        a_el = e.find(f"{ATOM}author/{ATOM}name")
        creator = (a_el.text if a_el is not None and a_el.text else author)

        cats = ""
        for term in labels(e):
            t = html.escape(term)
            cats += (f'\n\t\t<category domain="category" nicename="'
                     + re.sub(r"[^a-z0-9]+", "-", term.lower()).strip("-")
                     + f'">{cdata(term)}</category>')

        item = f"""\t<item>
\t\t<title>{html.escape(title)}</title>
\t\t<link>{html.escape(link)}</link>
\t\t<pubDate>{format_datetime(dt)}</pubDate>
\t\t<dc:creator>{cdata(creator)}</dc:creator>
\t\t<guid isPermaLink="false">{html.escape(link)}</guid>
\t\t<description></description>
\t\t<content:encoded>{cdata(content)}</content:encoded>
\t\t<excerpt:encoded>{cdata('')}</excerpt:encoded>
\t\t<wp:post_id>{1000+n}</wp:post_id>
\t\t<wp:post_date>{cdata(dt.strftime('%Y-%m-%d %H:%M:%S'))}</wp:post_date>
\t\t<wp:post_date_gmt>{cdata(dt_gmt.strftime('%Y-%m-%d %H:%M:%S'))}</wp:post_date_gmt>
\t\t<wp:comment_status>closed</wp:comment_status>
\t\t<wp:ping_status>closed</wp:ping_status>
\t\t<wp:post_name>{cdata(slug)}</wp:post_name>
\t\t<wp:status>publish</wp:status>
\t\t<wp:post_parent>0</wp:post_parent>
\t\t<wp:menu_order>0</wp:menu_order>
\t\t<wp:post_type>post</wp:post_type>
\t\t<wp:post_password></wp:post_password>
\t\t<wp:is_sticky>0</wp:is_sticky>{cats}
\t</item>"""
        items.append(item)
        n += 1

    now = format_datetime(datetime.now(timezone.utc))
    head = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
\txmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
\txmlns:content="http://purl.org/rss/1.0/modules/content/"
\txmlns:wfw="http://wellformedweb.org/CommentAPI/"
\txmlns:dc="http://purl.org/dc/elements/1.1/"
\txmlns:wp="http://wordpress.org/export/1.2/">
<channel>
\t<title>Crystal Gaze</title>
\t<link>{BLOG}</link>
\t<description>Imported from Blogger</description>
\t<pubDate>{now}</pubDate>
\t<language>en-US</language>
\t<wp:wxr_version>1.2</wp:wxr_version>
\t<wp:base_site_url>{BLOG}</wp:base_site_url>
\t<wp:base_blog_url>{BLOG}</wp:base_blog_url>
\t<wp:author><wp:author_id>1</wp:author_id><wp:author_login>{cdata(author)}</wp:author_login><wp:author_email></wp:author_email><wp:author_display_name>{cdata(author)}</wp:author_display_name></wp:author>
"""
    tail = "\n</channel>\n</rss>\n"
    return head + "\n".join(items) + tail, n


def main():
    print("Fetching Blogger feed...", file=sys.stderr)
    entries = get_all_entries()
    print(f"Fetched {len(entries)} entries", file=sys.stderr)
    wxr, n = build_wxr(entries)
    out = sys.argv[1] if len(sys.argv) > 1 else "crystal-gaze-wordpress-export.xml"
    with open(out, "w", encoding="utf-8") as f:
        f.write(wxr)
    print(f"Wrote {n} posts to {out}")


if __name__ == "__main__":
    main()
