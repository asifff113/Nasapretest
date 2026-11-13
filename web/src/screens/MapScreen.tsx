// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Explore the planet (docs/04_UI.md §4.7, ADR-23): the globe explorer full screen. Any 1° square opens from a
// click, the URL keeps the record and the square (#/map?variable=…&region=cell:<row>_<col>), and the flat map
// with its keyboard cursor is one switch away. Always visible: "Screening map: exploration, not a verdict".
import { useEffect } from 'react';
import { useT } from '../i18n';
import { useCatalog } from '../data/hooks';
import { useView } from '../state/view';
import { BadLinkNotice } from '../components/LoadState';
import { GlobeExplorer } from '../explore/GlobeExplorer';

export default function MapScreen() {
  const t = useT();
  const { view, badLink, flagBadLink } = useView();
  const catalog = useCatalog();
  useEffect(() => {
    if (catalog.status === 'ok' && view.variable && !catalog.data?.variables.some((v) => v.id === view.variable)) flagBadLink();
  }, [catalog.status, catalog.data, view.variable, flagBadLink]);
  return (
    <>
      {badLink ? (
        <div className="mx-auto max-w-[1280px] px-4 pt-4 sm:px-6">
          <BadLinkNotice show />
        </div>
      ) : null}
      <GlobeExplorer
        mode="map"
        intro={
          <div className="flex flex-col gap-2">
            <p className="eyebrow">{t('site.map.eyebrow')}</p>
            <h1 className="text-[clamp(32px,2.6vw+12px,46px)] leading-[1.04]">{t('map.title')}</h1>
            <p className="text-[15px] leading-relaxed text-muted">{t('site.map.lead')}</p>
          </div>
        }
      />
    </>
  );
}
