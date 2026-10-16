# Lytepic

SQUEEZE — SITE SETUP
======================

WHAT'S IN THIS FOLDER
----------------------
index.html      homepage + the image compressor tool
about.html      about page
privacy.html    privacy policy (needed for AdSense)
terms.html      terms of use (needed for AdSense)
contact.html    contact page
style.css       shared styling for every page
script.js       the compressor's logic (only used by index.html)
sitemap.xml     tells search engines what pages exist
robots.txt      tells search engines they're allowed to crawl
SEO-GUIDE.txt   full step-by-step traffic + monetization walkthrough — read this

BEFORE YOU UPLOAD
------------------
1. Replace every "yourdomain.com" with your real domain
   (index.html, about.html, privacy.html, terms.html, contact.html,
   sitemap.xml, robots.txt).
2. Replace "hello@yourdomain.com" in contact.html with your real email.
3. Replace "[DATE]" in privacy.html and terms.html with today's date.
4. Make a 1200x630px "og-image.png" (used when the site is shared on
   social media) and drop it in this folder.

UPLOAD
------
Upload everything in this folder into public_html via cPanel File
Manager (same as before — no PHP, no API, no backend needed anywhere
on this site).

AFTER IT'S LIVE
----------------
Follow SEO-GUIDE.txt from Part 2 onward — it walks through Google
Search Console, keywords, backlinks, and applying for AdSense.

ADDING YOUR NEXT TOOL
-----------------------
1. Build it as its own page (e.g. qr-generator.html), reusing
   style.css so it matches this site's design.
2. Add it to the nav if you want it prominent, or just update the
   "More free tools" card on index.html to link to it instead of
   showing "coming soon".
3. Add its URL to sitemap.xml.
4. Give it its own <title> and meta description in <head>.
Send it over any time and I'll build it to match this design.
