# Lytepic
A free image compressor that runs entirely in your browser. Nothing is
uploaded.
Live tool: https://tools.digitalghallamandi.online
## Features
- Compress JPG, PNG and WebP
- Target size mode: type 100 KB and it finds the best quality that fits
- Resize with locked aspect ratio
- Convert between JPG, PNG and WebP
- Transparent PNGs are filled with white when saved as JPG
## How it works
The image is drawn on an HTML canvas at the chosen size and exported again
with canvas.toBlob at a chosen quality. In target size mode it searches for
the highest quality that fits under the limit, and shrinks the dimensions
only if it has to.
## Guides
- Reduce image size to 100KB:
https://tools.digitalghallamandi.online/blog/reduce-image-size-to-100kb.html
- JPG vs PNG vs WebP: https://tools.digitalghallamandi.online/blog/jpg-vspng-vs-webp.html
Lytepic was previously called Squeeze.
