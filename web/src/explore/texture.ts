// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The globe's surface: NASA's Blue Marble image (public domain, bundled in public/textures/), the chosen map layer
// drawn over it as translucent 1° squares, cells that cannot be tested hatched, and country borders on top.
// Colour is decided by the map file's own rate and flag bits; nothing is computed here but pixel positions.
import type { MapLayer } from '../data/results';
import type { CountryFeature } from '../data/places';
import { cached } from '../data/cache';
import { diverging, rgb, scalePos } from '../map/colours';

export const TEX_W = 4096;
export const TEX_H = 2048;

export function loadEarthImage(): Promise<HTMLImageElement> {
  return cached('earth-image', async () => {
    const img = new Image();
    img.decoding = 'async';
    img.src = './textures/earth-blue-marble.jpg';
    await img.decode();
    return img;
  });
}

export function loadCountries(): Promise<CountryFeature[]> {
  return cached('countries', async () => {
    try {
      const res = await fetch('./outlines/countries_110m.json', { credentials: 'same-origin' });
      if (!res.ok) return [];
      const json = (await res.json()) as { features: CountryFeature[] };
      return json.features;
    } catch {
      return [];
    }
  });
}

type Ring = [number, number][];

function rings(f: CountryFeature): Ring[] {
  const g = f.geometry;
  if (g.type === 'Polygon') return g.coordinates as Ring[];
  if (g.type === 'MultiPolygon') return (g.coordinates as Ring[][]).flat();
  return [];
}

/** Draws the composite and returns it as an image URL for the globe material. */
export function composeTexture(base: HTMLImageElement, layer: MapLayer | null, colormap: string | undefined, opacity: number, countries: CountryFeature[]): string {
  const cv = document.createElement('canvas');
  cv.width = TEX_W;
  cv.height = TEX_H;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(base, 0, 0, TEX_W, TEX_H);

  if (layer && opacity > 0) {
    const g = layer.meta.grid;
    const n = g.nlat * g.nlon;
    const small = document.createElement('canvas');
    small.width = g.nlon;
    small.height = g.nlat;
    const sctx = small.getContext('2d');
    if (sctx) {
      const img = sctx.createImageData(g.nlon, g.nlat);
      const interp = diverging(colormap);
      const lut = Array.from({ length: 256 }, (_, i) => rgb(interp(i / 255)));
      const tb = layer.meta.flagBits.testable ?? 1;
      const sb = layer.meta.flagBits.significant ?? 2;
      const rate = layer.fields.rate;
      for (let i = 0; i < n; i++) {
        const f = layer.flags[i] ?? 0;
        const r = rate ? rate[i] : Number.NaN;
        if ((f & tb) !== 0 && r !== undefined && Number.isFinite(r)) {
          const [cr, cg, cb] = lut[Math.round(scalePos(r, layer.meta.colourLimit) * 255)] ?? [128, 128, 128];
          img.data[i * 4] = cr;
          img.data[i * 4 + 1] = cg;
          img.data[i * 4 + 2] = cb;
          img.data[i * 4 + 3] = Math.round(255 * opacity * ((f & sb) !== 0 ? 1 : 0.45));
        }
      }
      sctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, TEX_W, TEX_H);
      // Hatch the squares that cannot be tested.
      const cw = TEX_W / g.nlon;
      const ch = TEX_H / g.nlat;
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + 0.45 * opacity})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (((layer.flags[i] ?? 0) & tb) === 0) {
          const x = (i % g.nlon) * cw;
          const y = Math.floor(i / g.nlon) * ch;
          ctx.moveTo(x, y + ch);
          ctx.lineTo(x + cw, y);
        }
      }
      ctx.stroke();
    }
  }

  // Country borders (equirectangular: x from longitude, y from latitude).
  ctx.strokeStyle = 'rgba(255,255,255,0.62)';
  ctx.lineWidth = 1.7;
  ctx.lineJoin = 'round';
  for (const f of countries) {
    for (const ring of rings(f)) {
      ctx.beginPath();
      ring.forEach(([lon, lat], i) => {
        const x = ((lon + 180) / 360) * TEX_W;
        const y = ((90 - lat) / 180) * TEX_H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }
  return cv.toDataURL('image/jpeg', 0.9);
}

/** Which country holds a point (ray casting on the 1:110m outlines; for naming only). */
export function countryAt(countries: CountryFeature[], lat: number, lon: number): string | null {
  for (const f of countries) {
    for (const ring of rings(f)) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i] ?? [0, 0];
        const [xj, yj] = ring[j] ?? [0, 0];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
      }
      if (inside) return f.properties.name;
    }
  }
  return null;
}
