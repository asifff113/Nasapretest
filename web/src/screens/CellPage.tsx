// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Cell page (docs/04_UI.md §4.8): the cell's yearly values from its tile, and from the map file its rate,
// range, p and q. The status is always "Exploration": no verdict words, no grade, no trend line.
// The 5 × 5 neighbourhood used for its memory check is outlined on the mini-map.
import { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Compass } from 'lucide-react';
import { pick, tOr, useT } from '../i18n';
import { int, p as fmtP, rate as fmtRate } from '../i18n/format';
import { loadCellSeries, loadMapLayer, type CellSeries, type MapLayer } from '../data/results';
import { useAsync, useBuild, useCatalog, usePrereg } from '../data/hooks';
import { useLang } from '../state/prefs';
import { href, useView } from '../state/view';
import { useSpineClaim } from '../state/spine';
import { useTokens } from '../charts/tokens';
import { SeriesChart } from '../charts/SeriesChart';
import { diverging, scalePos } from '../map/colours';
import { cellInfo, latLon } from '../map/ScreeningMap';
import { BadLinkNotice, Loading, WithData } from '../components/LoadState';
import { Page, PageHeader } from '../components/Page';
import { Badge } from '../ui/common/badge';
import { Card } from '../ui/common/card';
import { MissingPanel } from '../components/LoadState';

function MiniMap({ layer, row, col, colormap }: { layer: MapLayer; row: number; col: number; colormap: string | undefined }) {
  const tokens = useTokens();
  const ref = useRef<HTMLCanvasElement>(null);
  const t = useT();
  const R = 7; // cells shown on each side
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const n = 2 * R + 1;
    const px = 16;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = n * px * dpr;
    cv.height = n * px * dpr;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = layer.meta.grid;
    const interp = diverging(colormap);
    for (let dr = -R; dr <= R; dr++) {
      for (let dc = -R; dc <= R; dc++) {
        const r = row + dr;
        const c = (col + dc + g.nlon) % g.nlon;
        const x = (dc + R) * px;
        const y = (dr + R) * px;
        if (r < 0 || r >= g.nlat) continue;
        const info = cellInfo(layer, r, c);
        if (info.testable && info.rate !== null) {
          ctx.globalAlpha = info.significant ? 1 : 0.45;
          ctx.fillStyle = interp(scalePos(info.rate, layer.meta.colourLimit));
          ctx.fillRect(x, y, px, px);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = tokens.surface;
          ctx.fillRect(x, y, px, px);
          ctx.strokeStyle = tokens.muted;
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.moveTo(x, y + px);
          ctx.lineTo(x + px, y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
    // The 5 × 5 neighbourhood and the cell itself.
    ctx.strokeStyle = tokens.ink;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect((R - 2) * px, (R - 2) * px, 5 * px, 5 * px);
    ctx.setLineDash([]);
    ctx.strokeStyle = tokens.accent;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(R * px, R * px, px, px);
  }, [layer, row, col, colormap, tokens]);
  return (
    <figure className="m-0">
      <canvas ref={ref} className="block size-[240px] rounded-[8px] border border-line" role="img" aria-label={t('site.cell.neighbourhood')} data-testid="cell-minimap" />
      <figcaption className="mt-2 max-w-[240px] text-sm text-muted">{t('site.cell.neighbourhood')}</figcaption>
    </figure>
  );
}

export default function CellPage() {
  const t = useT();
  const lang = useLang();
  const { view, badLink, flagBadLink } = useView();
  const build = useBuild();
  const catalog = useCatalog();
  const prereg = usePrereg();
  const m = view.region?.match(/^cell:(\d{1,3})_(\d{1,3})$/);
  const row = m ? Number(m[1]) : -1;
  const col = m ? Number(m[2]) : -1;
  const analysed = (catalog.data?.variables ?? []).filter((v) => v.status === 'analysed');
  const variable = analysed.find((v) => v.id === view.variable) ?? analysed[0];
  const seasons = prereg.data ? [prereg.data.seasons.main, ...prereg.data.seasons.secondary] : ['ANN'];
  const season = view.season && seasons.includes(view.season) ? view.season : 'ANN';
  const root = build.data?.root;
  const ready = root !== undefined && variable;
  const layer = useAsync<MapLayer>(ready ? `map|${root}|${variable.id}|${season}` : null, () => loadMapLayer(root ?? '', variable?.id ?? '', season));
  const series = useAsync<CellSeries | null>(ready ? `cell|${root}|${variable.id}|${row}|${col}|${season}` : null, () => loadCellSeries(root ?? '', variable?.id ?? '', row, col, season));
  const g = layer.data?.meta.grid;
  const valid = g ? row >= 0 && col >= 0 && row < g.nlat && col < g.nlon : true;
  useEffect(() => {
    if (!valid) flagBadLink();
  }, [valid, flagBadLink]);
  const info = useMemo(() => (layer.data && valid ? cellInfo(layer.data, row, col) : null), [layer.data, valid, row, col]);
  const i = g ? row * g.nlon + col : -1;
  const low = layer.data?.fields.rate_low?.[i];
  const high = layer.data?.fields.rate_high?.[i];
  const pv = layer.data?.fields.p?.[i];
  const qv = layer.data?.fields.q?.[i];
  const place = info ? latLon(info.lat, info.lon, lang) : '';
  const units = layer.data?.meta.units ?? '';

  // The spine shows the cell as exploration (it never gets a verdict).
  useSpineClaim(
    info && layer.data
      ? {
          about: place,
          spine: {
            status: 'no_verdict',
            grade: null,
            reason: 'exploration',
            ratePerDecade: info.rate,
            rateLowPerDecade: low !== undefined && Number.isFinite(low) ? low : null,
            rateHighPerDecade: high !== undefined && Number.isFinite(high) ? high : null,
            units,
            family: 'exploration',
            familySize: layer.data.meta.nTestable,
            inDomain: info.testable,
          },
        }
      : null,
  );

  return (
    <Page>
      <BadLinkNotice show={badLink} />
      <a href={href({ screen: 'map', variable: variable?.id, season })} className="mb-4 inline-flex min-h-11 items-center gap-2 font-medium">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('site.cell.back_to_map')}
      </a>
      <PageHeader
        eyebrow={variable ? `${pick(variable.name, lang)} · ${t(`season.${season}.long`)}` : undefined}
        title={t('cell.title', { lat: place.split(', ')[0] || '…', lon: place.split(', ')[1] || '…' })}
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="exploration" data-testid="cell-status">
            <Compass aria-hidden="true" />
            {t('family.exploration')}
          </Badge>
          <p className="text-[15px] text-muted">{t('cell.exploration')}</p>
        </div>
      </PageHeader>
      <WithData res={layer}>
        {(l) =>
          info ? (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" data-testid="cell-page">
              <Card className="p-4 sm:p-5">
                <p className="text-[15px] font-semibold">{t('site.cell.yearly')}</p>
                <p className="mb-2 text-sm text-muted">{t('site.cell.no_line')}</p>
                {series.status === 'loading' ? (
                  <Loading />
                ) : series.status === 'ok' && series.data ? (
                  <SeriesChart x={series.data.years} y={series.data.values} units={series.data.units} lang={lang} label={t('site.cell.chart_alt', { place })} testId="cell-chart" height={280} />
                ) : (
                  <MissingPanel />
                )}
              </Card>
              <div className="flex flex-col gap-4">
                <Card className="p-4 sm:p-5">
                  <p className="mb-3 text-[15px] font-semibold">{t('site.cell.from_map')}</p>
                  {info.testable ? (
                    <dl className="m-0 grid gap-2 text-[15px] tabular" data-testid="cell-stats">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">{t('lineup.col_rate')}</dt>
                        <dd className="m-0 font-semibold">{info.rate === null ? '–' : `${fmtRate(info.rate, lang)} ${units}`}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">{t('verdict.labels.ci')}</dt>
                        <dd className="m-0">
                          {low !== undefined && high !== undefined && Number.isFinite(low) && Number.isFinite(high) && info.rate !== null
                            ? `${fmtRate(low, lang, info.rate)} … ${fmtRate(high, lang, info.rate)}`
                            : '–'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">p</dt>
                        <dd className="m-0">{pv !== undefined && Number.isFinite(pv) ? fmtP(pv, lang) : '–'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">{t('site.cell.q')}</dt>
                        <dd className="m-0">{qv !== undefined && Number.isFinite(qv) ? fmtP(qv, lang) : '–'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">{t('site.cell.stands_out')}</dt>
                        <dd className="m-0">{info.significant ? t('site.common.yes') : t('site.common.no')}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-[15px]" data-testid="cell-untestable">
                      {t('site.map.status_untestable')}
                      {info.reasons.length ? `: ${info.reasons.map((r) => tOr(t, `site.map.flag_${r}`, r)).join('; ')}` : ''}
                    </p>
                  )}
                  <p className="mt-3 text-sm text-muted">{t('site.cell.tests_note', { n: int(l.meta.nTestable, lang) })}</p>
                </Card>
                <Card className="p-4 sm:p-5">
                  <MiniMap layer={l} row={row} col={col} colormap={variable?.colormap?.trend} />
                </Card>
              </div>
            </div>
          ) : (
            <MissingPanel />
          )
        }
      </WithData>
    </Page>
  );
}
