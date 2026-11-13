// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// AI use (docs/04_UI.md §4.13): the statement of docs/AI_USE.md §1. The product itself makes no AI call.
import { Bot, ShieldCheck } from 'lucide-react';
import { useT } from '../i18n';
import { Body } from '../components/Page';
import { Hero } from '../components/atlas/Hero';
import { Card } from '../ui/common/card';

export default function AiUseScreen() {
  const t = useT();
  return (
    <>
      <Hero
        wide={false}
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Bot className="size-4" aria-hidden="true" />
            {t('app.name')}
          </span>
        }
        title={t('nav.ai_use')}
        lead={t('site.ai.lead')}
      />
      <Body wide={false}>
      <div className="flex flex-col gap-6" data-testid="ai-statement">
        <section>
          <h2 className="text-chapter">{t('site.ai.how_title')}</h2>
          <div className="mt-3 flex flex-col gap-3 text-[17px] leading-relaxed">
            <p>{t('site.ai.how_1')}</p>
            <p>{t('site.ai.how_2')}</p>
            <p>{t('site.ai.how_3')}</p>
            <p>{t('site.ai.how_4')}</p>
            <p>{t('site.ai.how_5')}</p>
          </div>
        </section>
        <Card className="flex gap-3 border-strong/40 p-5">
          <ShieldCheck className="mt-0.5 size-6 shrink-0 text-strong" aria-hidden="true" />
          <div>
            <h2 className="text-h3">{t('site.ai.product_title')}</h2>
            <p className="mt-1 text-[17px]">{t('site.ai.product_body')}</p>
          </div>
        </Card>
        <section>
          <h2 className="text-h3">{t('site.ai.media_title')}</h2>
          <p className="mt-1 text-[17px]">{t('site.ai.media_body')}</p>
        </section>
        <section>
          <h2 className="text-h3">{t('site.ai.record_title')}</h2>
          <p className="mt-1 text-[17px]">{t('site.ai.record_body')}</p>
        </section>
      </div>
    </Body>
    </>
  );
}
