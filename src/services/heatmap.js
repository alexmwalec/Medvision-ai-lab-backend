// Generates a Grad-CAM-style heatmap overlay for the simulation: colored
// "hot spots" are composited onto the real uploaded X-ray at the location of
// each AI finding's bounding box, with intensity scaled to probability.
//
// When a real model is wired in later, swap this out for the model's actual
// class-activation map - the controller only needs generateHeatmap() to keep
// returning a filename saved under /uploads.

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const uploadDir = path.join(__dirname, '..', 'uploads');

function severityColors(probability) {
  if (probability >= 70) return { core: '#FF3B30', mid: '#FF7A1A' }; // red -> orange
  if (probability >= 40) return { core: '#FF9500', mid: '#FFD60A' }; // orange -> yellow
  return { core: '#34C759', mid: '#9EF01A' }; // green -> lime
}

function buildOverlaySvg(width, height, findings) {
  const relevant = (findings || []).filter(
    (f) => f.name !== 'No Significant Findings' && f.boundingBox && f.boundingBox.width
  );

  if (relevant.length === 0) return null;

  const defs = [];
  const shapes = [];

  relevant.forEach((f, i) => {
    const { x, y, width: bw, height: bh } = f.boundingBox;
    const cx = ((x + bw / 2) / 100) * width;
    const cy = ((y + bh / 2) / 100) * height;
    const rx = Math.max((bw / 100) * width * 0.6, width * 0.06);
    const ry = Math.max((bh / 100) * height * 0.6, height * 0.06);

    const { core, mid } = severityColors(f.probability);
    const gradId = `heat-${i}`;
    const opacity = Math.min(0.85, 0.35 + f.probability / 150);

    defs.push(`
      <radialGradient id="${gradId}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${core}" stop-opacity="${opacity}" />
        <stop offset="55%" stop-color="${mid}" stop-opacity="${opacity * 0.55}" />
        <stop offset="100%" stop-color="${mid}" stop-opacity="0" />
      </radialGradient>
    `);

    shapes.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${gradId})" />`);

    const labelY = Math.max(cy - ry - 8, 16);
    const fontSize = Math.max(width * 0.022, 14);
    shapes.push(`
      <text x="${cx}" y="${labelY}" text-anchor="middle" font-family="Arial, sans-serif"
            font-size="${fontSize}" font-weight="700" fill="#ffffff"
            stroke="#111827" stroke-width="3" paint-order="stroke">
        ${f.name.replace(/_/g, ' ')} · ${f.probability}%
      </text>
    `);
  });

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>${defs.join('')}</defs>
      ${shapes.join('')}
    </svg>
  `;
}

/**
 * @param {string} originalPath - absolute path to the uploaded scan on disk
 * @param {Array} findings - AI findings, each with a boundingBox {x,y,width,height} in %
 * @returns {Promise<string|null>} filename of the generated heatmap image (saved in /uploads)
 */
async function generateHeatmap(originalPath, findings) {
  const outFilename = `heatmap-${uuidv4()}.jpg`;
  const outPath = path.join(uploadDir, outFilename);

  try {
    const image = sharp(originalPath);
    const metadata = await image.metadata();
    const width = metadata.width || 1024;
    const height = metadata.height || 1024;

    const svg = buildOverlaySvg(width, height, findings);

    if (!svg) {
      // No notable findings - ship a clean copy, no overlay needed.
      await sharp(originalPath).jpeg({ quality: 90 }).toFile(outPath);
      return outFilename;
    }

    await sharp(originalPath)
      .ensureAlpha()
      .composite([{ input: Buffer.from(svg), top: 0, left: 0, blend: 'screen' }])
      .flatten({ background: '#000000' })
      .jpeg({ quality: 90 })
      .toFile(outPath);

    return outFilename;
  } catch (error) {
    console.error('Heatmap generation failed, falling back to original image:', error.message);
    try {
      await fs.promises.copyFile(originalPath, outPath);
      return outFilename;
    } catch {
      return null;
    }
  }
}

module.exports = { generateHeatmap };
