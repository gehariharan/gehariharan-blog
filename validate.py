import xml.etree.ElementTree as ET

ns = {
    "content": "http://purl.org/rss/1.0/modules/content/",
    "wp": "http://wordpress.org/export/1.2/",
}
t = ET.parse("crystal-gaze-wordpress-export.xml")
r = t.getroot()
items = r.findall(".//item")
print("well-formed XML: yes")
print("items:", len(items))

ds = []
img = empty = total = 0
for i in items:
    d = i.find("wp:post_date", ns).text or ""
    ds.append(d)
    c = i.find("content:encoded", ns).text or ""
    total += len(c)
    if ("<img" in c) or ("blogspot" in c) or ("googleusercontent" in c):
        img += 1
    if len(c.strip()) < 5:
        empty += 1

ds.sort()
print("earliest:", ds[0])
print("latest:", ds[-1])
print("posts with images:", img)
print("empty/near-empty posts:", empty)
print("avg content chars:", total // len(items))
print("first title:", items[0].find("title").text)
print("last title:", items[-1].find("title").text)
