// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The IMERG sensitivity check beside a MERRA-2 rain verdict (S3). It never shows a grade; the lineage line
// says why it is a sensitivity check and not an independent confirmation.
import { useState } from 'react';
import { Scale } from 'lucide-react';
import { useT } from '../i18n';
import type { Verdict } from '../data/types';
import { useResult } from '../data/hooks';
import { useLang } from '../state/prefs';
import { Card } from '../ui/common/card';
import { Switch } from '../ui/common/switch';
import { StatusBadge } from './StatusBadge';
import { WithData } from './LoadState';
import { RateFigure } from './VerdictCard';

export function SensitivityPanel({ path }: { path: string }) {
  const t = useT();
  const lang = useLang();
  const [on, setOn] = useState(false);
  const res = useResult<Verdict>(on ? path : null);
  return (
    <Card className="p-4 sm:p-5" data-tour="sensitivity-toggle" data-testid="sensitivity-toggle">
      <Switch checked={on} onCheckedChange={setOn} label={t('sensitivity.toggle')} icon={<Scale className="size-5 text-exploration" aria-hidden="true" />} />
      {on ? (
        <div className="mt-4">
          <WithData res={res} path={path}>
            {(v) => {
              const text = v.text[lang] ?? v.text.en;
              return (
                <div className="flex flex-col gap-3">
                  <StatusBadge status={v.status} grade={v.grade} reason={v.reason} family={v.family} />
                  <p className="text-[17px] font-medium leading-snug" data-testid="sensitivity-headline">
                    {text.headline}
                  </p>
                  {v.stats.change ? (
                    <RateFigure
                      ratePerDecade={v.stats.change.ratePerDecade}
                      low={v.stats.change.rateLowPerDecade}
                      high={v.stats.change.rateHighPerDecade}
                      units={v.stats.change.units}
                      first={v.window.first}
                      last={v.window.last}
                      inDomain={v.domain.inDomain}
                    />
                  ) : null}
                  <p className="text-[15px] text-muted" data-testid="sensitivity-lineage">
                    {t('sensitivity.lineage')}
                  </p>
                </div>
              );
            }}
          </WithData>
        </div>
      ) : null}
    </Card>
  );
}
