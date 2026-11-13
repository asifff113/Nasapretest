// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The globe's surface: NASA's Blue Marble image (public domain, bundled in public/textures/), the chosen map layer
// drawn over it as translucent 1° squares, cells that cannot be tested hatched, and country borders on top.
// Colour is decided by the map file's own rate and flag bits; nothing is computed here but pixel positions.
import type { MapLayer } from '../data/results';
import type { CountryFeature } from '../data/places';
import { cached } from '../data/cache';
import { diverging, rangePos, rgb, scalePos } from '../map/colours';
import { yearValue, type MapYears } from '../data/explore';

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
export interface TextureFocus {
  feature: CountryFeature;
  /** Square indices inside the country (row · nlon + col). */
  cells: Set<number>;
}

const xOf = (lon: number) => ((lon + 180) / 360) * TEX_W;
const yOf = (lat: number) => ((90 - lat) / 180) * TEX_H;

function tracePath(ctx: CanvasRenderingContext2D, f: CountryFeature): void {
  for (const ring of rings(f)) {
    ring.forEach(([lon, lat], i) => {
      if (i === 0) ctx.moveTo(xOf(lon), yOf(lat));
      else ctx.lineTo(xOf(lon), yOf(lat));
    });
    ctx.closePath();
  }
}

export function composeTexture(
  base: HTMLImageElement,
  layer: MapLayer | null,
  colormap: string | undefined,
  opacity: number,
  countries: CountryFeature[],
  focus: TextureFocus | null = null,
): string {
  const cv = document.createElement('canvas');
  cv.width = TEX_W;
  cv.height = TEX_H;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(base, 0, 0, TEX_W, TEX_H);
  // Everything outside a focused country fades back.
  fadeOutside(ctx, focus);

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
        if (focus && !focus.cells.has(i)) continue;
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
        if (((layer.flags[i] ?? 0) & tb) === 0 && (!focus || focus.cells.has(i))) {
          const x = (i % g.nlon) * cw;
          const y = Math.floor(i / g.nlon) * ch;
          ctx.moveTo(x, y + ch);
          ctx.lineTo(x + cw, y);
        }
      }
      ctx.stroke();
    }
  }

  drawBorders(ctx, countries, focus);
  return cv.toDataURL('image/jpeg', 0.9);
}

/** Country borders (equirectangular: x from longitude, y from latitude), and the focused country's outline. */
function drawBorders(ctx: CanvasRenderingContext2D, countries: CountryFeature[], focus: TextureFocus | null): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.62)';
  ctx.lineWidth = 1.7;
  ctx.lineJoin = 'round';
  for (const f of countries) {
    for (const ring of rings(f)) {
      ctx.beginPath();
      ring.forEach(([lon, lat], i) => {
        if (i === 0) ctx.moveTo(xOf(lon), yOf(lat));
        else ctx.lineTo(xOf(lon), yOf(lat));
      });
      ctx.stroke();
    }
  }
  if (focus) {
    ctx.beginPath();
    tracePath(ctx, focus.feature);
    ctx.strokeStyle = '#e9b44c';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function fadeOutside(ctx: CanvasRenderingContext2D, focus: TextureFocus | null): void {
  if (!focus) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, TEX_W, TEX_H);
  tracePath(ctx, focus.feature);
  ctx.fillStyle = 'rgba(3,10,24,0.66)';
  ctx.fill('evenodd');
  ctx.restore();
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/**
 * Paints the yearly frames for the time-lapse: the Earth (faded outside a focused country) and the borders are
 * drawn once; each frame only recolours the 1° squares from the file's own yearly values. The colour runs from the
 * low to the high end of the file's `range`; nothing is computed but positions and colours.
 */
export class YearPainter {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly under: HTMLCanvasElement;
  private readonly over: HTMLCanvasElement;
  private readonly small: HTMLCanvasElement;
  private readonly sctx: CanvasRenderingContext2D | null;
  private readonly img: ImageData | null;

  constructor(
    base: HTMLImageElement,
    countries: CountryFeature[],
    private readonly focus: TextureFocus | null,
    private readonly years: MapYears,
  ) {
    [this.canvas, this.ctx] = canvas(TEX_W, TEX_H);
    const [under, uctx] = canvas(TEX_W, TEX_H);
    if (uctx) {
      uctx.drawImage(base, 0, 0, TEX_W, TEX_H);
      fadeOutside(uctx, focus);
    }
    this.under = under;
    const [over, octx] = canvas(TEX_W, TEX_H);
    if (octx) drawBorders(octx, countries, focus);
    this.over = over;
    const g = years.meta.grid;
    [this.small, this.sctx] = canvas(g.nlon, g.nlat);
    this.img = this.sctx ? this.sctx.createImageData(g.nlon, g.nlat) : null;
  }

  paint(frame: number, interp: (t: number) => string, opacity: number): HTMLCanvasElement {
    const { ctx, sctx, img } = this;
    if (!ctx || !sctx || !img) return this.canvas;
    const g = this.years.meta.grid;
    const n = g.nlat * g.nlon;
    const [lo, hi] = this.years.meta.range ?? [0, 1];
    const lut = Array.from({ length: 256 }, (_, i) => rgb(interp(i / 255)));
    const a = Math.round(255 * opacity);
    img.data.fill(0);
    for (let i = 0; i < n; i++) {
      if (this.focus && !this.focus.cells.has(i)) continue;
      const v = yearValue(this.years, frame, i);
      if (!Number.isFinite(v)) continue;
      const [r, gg, b] = lut[Math.round(rangePos(v, lo, hi) * 255)] ?? [128, 128, 128];
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = gg;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = a;
    }
    sctx.putImageData(img, 0, 0);
    ctx.drawImage(this.under, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.small, 0, 0, TEX_W, TEX_H);
    ctx.drawImage(this.over, 0, 0);
    return this.canvas;
  }
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
