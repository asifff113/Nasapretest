// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Screening map (docs/04_UI.md §4.7). Loaded lazily, so it stays out of the first bundle. Always visible: the
// label "Screening map: exploration, not a verdict" and the number of tests.
import { useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import { pick, useT } from '../i18n';
import { int, rate as fmtRate } from '../i18n/format';
import { loadMapLayer, paths, type MapLayer } from '../data/results';
import { useAsync, useBuild, useCatalog, usePrereg, useRegionIndex } from '../data/hooks';
import { useLang } from '../state/prefs';
import { useView } from '../state/view';
import { BadLinkNotice, WithData } from '../components/LoadState';
import { Page, PageHeader } from '../components/Page';
import { ScreeningMap } from '../map/ScreeningMap';
import { loadOutlines, type Outlines } from '../map/outlines';
import { diverging } from '../map/colours';
import { SegmentedControl } from '../ui/common/toggle-group';

function Legend({ layer, colormap }: { layer: MapLayer; colormap: string | undefined }) {
  const t = useT();
  const lang = useLang();
  const interp = diverging(colormap);
  const stops = Array.from({ length: 11 }, (_, i) => `${interp(i / 10)} ${i * 10}%`).join(', ');
  const lim = layer.meta.colourLimit;
  return (
    <div className="grid gap-4 rounded-[10px] border border-line bg-surface p-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" data-testid="map-legend">
      <div>
        <p className="mb-2 text-sm font-medium">{t('map.legend_rate', { units: layer.meta.units })}</p>
        <div className="h-3 rounded-full" style={{ background: `linear-gradient(to right, ${stops})` }} aria-hidden="true" />
        <div className="mt-1 flex justify-between text-xs text-muted tabular">
          <span>{fmtRate(-lim, lang)}</span>
          <span>0</span>
          <span>{fmtRate(lim, lang)}</span>
        </div>
        <p className="mt-2 text-xs text-muted">{t('site.map.lighter')}</p>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex items-start gap-2">
          <span className="mt-1 inline-block size-3 shrink-0 rounded-full bg-ink/70" aria-hidden="true" />
          <span>{t('map.legend_dot', { n_tests: int(layer.meta.nTestable, lang) })}</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="hatch mt-0.5 inline-block size-4 shrink-0 rounded-[3px] border border-line-strong" aria-hidden="true" />
          <span>{t('map.legend_hatch')}</span>
        </li>
      </ul>
    </div>
  );
}

export default function MapScreen() {
  const t = useT();
  const lang = useLang();
  const { view, badLink, flagBadLink, patch, navigate } = useView();
  const build = useBuild();
  const catalog = useCatalog();
  const prereg = usePrereg();
  const index = useRegionIndex();
  const [outlines, setOutlines] = useState<Outlines | null>(null);
  useEffect(() => {
    void loadOutlines().then(setOutlines);
  }, []);

  const analysed = (catalog.data?.variables ?? []).filter((v) => v.status === 'analysed');
  const seasons = prereg.data ? [prereg.data.seasons.main, ...prereg.data.seasons.secondary] : ['ANN'];
  const variable = analysed.find((v) => v.id === view.variable) ?? analysed[0];
  const season = view.season && seasons.includes(view.season) ? view.season : 'ANN';
  const root = build.data?.root;
  const key = root !== undefined && variable ? `map|${root}|${variable.id}|${season}` : null;
  const layer = useAsync<MapLayer>(key, () => loadMapLayer(root ?? '', variable?.id ?? '', season));
  useEffect(() => {
    if (catalog.status === 'ok' && view.variable && !analysed.some((v) => v.id === view.variable)) flagBadLink();
  }, [catalog.status, view.variable, analysed, flagBadLink]);

  const home = index.data?.regions.find((r) => r.role === 'home');
  const g = layer.data?.meta.grid;
  // The cursor starts at the home region's centre (layout only).
  const start =
    home && g
      ? { row: Math.round((home.centroid[1] - g.lat0) / g.dlat), col: Math.round((home.centroid[0] - g.lon0) / g.dlon) }
      : undefined;

  return (
    <Page>
      <BadLinkNotice show={badLink} />
      <PageHeader eyebrow={t('site.map.eyebrow')} title={t('map.title')} lead={t('site.map.lead')} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {analysed.length > 1 ? (
          <SegmentedControl
            label={t('site.common.variable')}
            value={variable?.id ?? ''}
            onValueChange={(v) => patch({ variable: v }, { replace: true })}
            options={analysed.map((v) => ({ value: v.id, label: pick(v.name, lang) }))}
          />
        ) : null}
        <SegmentedControl
          label={t('site.common.season')}
          value={season}
          onValueChange={(s) => patch({ season: s }, { replace: true })}
          options={seasons.map((s) => ({ value: s, label: t(`season.${s}.long`) }))}
        />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-exploration/50 bg-surface px-4 py-3" data-testid="map-label">
        <span className="inline-flex items-center gap-2 font-semibold">
          <Compass className="size-5 text-exploration" aria-hidden="true" />
          {t('map.label')}
        </span>
        {layer.data ? (
          <span className="text-[15px] text-muted tabular" data-testid="map-tests">
            {t('site.map.tests', { n: int(layer.data.meta.nTestable, lang) })}
          </span>
        ) : null}
      </div>
      <WithData res={layer} path={variable ? paths.mapMeta(variable.id, season) : undefined}>
        {(l) => (
          <div className="flex flex-col gap-4">
            <ScreeningMap
              layer={l}
              colormap={variable?.colormap?.trend}
              outlines={outlines}
              lang={lang}
              start={start}
              label={`${t('map.title')} ${t('map.label')} ${t('map.click_hint')}`}
              onOpen={(row, col) => navigate({ screen: 'place', region: `cell:${row}_${col}`, variable: variable?.id, season })}
            />
            <Legend layer={l} colormap={variable?.colormap?.trend} />
            <p className="text-sm text-muted">{t('map.click_hint')}</p>
          </div>
        )}
      </WithData>
    </Page>
  );
}
