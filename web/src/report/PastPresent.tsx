// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// Past against present for one place, from its exploration file: every record's tested trend and its first-against-
// last ten years (the dashboard), and one record in depth (then and now). Every number is the file's own: the
// engine's trend statistics, the pipeline's anomalies, decade means and 10-year means. The screen places them and
// never computes a mean, a difference or a test. Exploration only: no verdict words.
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { pick, useT } from "../i18n";
import { int, num, p as pText, rate } from "../i18n/format";
import type { Catalog, CatalogVariable } from "../data/types";
import type { ExploreTrend, ExploreVariable } from "../data/explore";
import { useLang } from "../state/prefs";
import { ClimateStripes } from "../charts/ClimateStripes";
import { YearsChart } from "../charts/YearsChart";
import {
  AnomalyBars,
  ClimographThenNow,
  DecadeDumbbell,
  MonthHeatmap,
  MonthTrendBars,
} from "../charts/PastCharts";
import { Badge } from "../ui/common/badge";
import { cn } from "../ui/common/utils";

function catVar(
  catalog: Catalog | undefined,
  id: string,
): CatalogVariable | undefined {
  return catalog?.variables.find((v) => v.id === id);
}

function Panel({
  title,
  lead,
  children,
  testId,
  className,
}: {
  title?: string;
  lead?: string;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "atlas-panel flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-5",
        className,
      )}
      data-testid={testId}
    >
      {title ? (
        <h3 className="m-0 font-display text-[22px] font-normal leading-tight">
          {title}
        </h3>
      ) : null}
      {lead ? (
        <p className="m-0 max-w-[75ch] text-[14px] leading-relaxed text-muted">
          {lead}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function useMonths(): string[] {
  const t = useT();
  return Array.from({ length: 12 }, (_, i) => t(`site.month_short.${i + 1}`));
}

/** The engine's trend for one place and record, in words (exploration). */
export function TrendLine({
  trend,
  units,
  compact = false,
}: {
  trend: ExploreTrend | undefined;
  units: string;
  compact?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  if (!trend)
    return <span className="text-muted">{t("site.past.no_trend_file")}</span>;
  if (!trend.testable || trend.ratePerDecade === null) {
    return (
      <span className="text-muted" data-testid="trend-reason">
        {t(`site.past.reason_${trend.reason ?? "not_finite"}`)}
      </span>
    );
  }
  const r = trend.ratePerDecade;
  const Icon = r > 0 ? ArrowUp : r < 0 ? ArrowDown : Minus;
  return (
    <span className="flex flex-col gap-1">
      <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Icon className="size-3.5 self-center" aria-hidden="true" />
        <b className="font-semibold tabular">
          {t("site.past.rate", { rate: rate(r, lang), units })}
        </b>
        <span className="text-[13px] text-muted tabular">
          {t("site.past.range", {
            lo: rate(trend.lowPerDecade, lang, r),
            hi: rate(trend.highPerDecade, lang, r),
          })}
        </span>
      </span>
      <span>
        <Badge
          tone={trend.standsOut ? "exploration" : "noverdict"}
          data-testid="trend-standsout"
        >
          {trend.standsOut ? t("site.past.stands_out") : t("site.past.not_out")}
        </Badge>
      </span>
      {!compact ? (
        <span className="text-[13px] text-muted tabular">
          {t("site.past.p_line", {
            p: pText(trend.p, lang),
            q: pText(trend.q, lang),
            n: int(trend.n, lang),
            from: int(trend.first ?? 0, lang),
            to: int(trend.last ?? 0, lang),
          })}
          {trend.exploratory ? ` ${t("site.past.exploratory")}` : ""}
          {trend.jumpYear
            ? ` ${t("site.past.jump", { year: int(trend.jumpYear, lang) })}`
            : ""}
        </span>
      ) : null}
    </span>
  );
}

/** Every record of the place: tested trend, first against last ten years, and its years against the baseline. */
export function ChangeDashboard({
  variables,
  ids,
  catalog,
  onPick,
}: {
  variables: Record<string, ExploreVariable>;
  ids: string[];
  catalog: Catalog | undefined;
  onPick: (id: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const rows = ids.filter((id) => variables[id]?.trend);
  if (!rows.length)
    return <p className="m-0 text-muted">{t("site.past.no_trend_file")}</p>;
  return (
    <div className="overflow-x-auto" data-testid="change-dashboard">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-line text-left text-[12px] uppercase tracking-[0.08em] text-muted">
            <th className="py-2 pr-3 font-medium">
              {t("site.past.col_record")}
            </th>
            <th className="py-2 pr-3 font-medium">
              {t("site.past.col_trend")}
            </th>
            <th className="py-2 pr-3 font-medium">
              {t("site.past.col_decades")}
            </th>
            <th className="w-[28%] py-2 font-medium">
              {t("site.past.col_stripes")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((id) => {
            const v = variables[id]!;
            const cv = catVar(catalog, id);
            const d = v.decades;
            return (
              <tr
                key={id}
                className="border-b border-line align-top"
                data-testid={`change-row-${id}`}
              >
                <td className="py-3 pr-3">
                  <button
                    type="button"
                    onClick={() => onPick(id)}
                    className="text-left font-medium text-link hover:underline"
                  >
                    {cv ? pick(cv.name, lang) : id}
                  </button>
                  <span className="block text-[12px] text-muted">
                    {t("site.past.record_years", {
                      from: int(v.years[0] ?? 0, lang),
                      to: int(v.years[v.years.length - 1] ?? 0, lang),
                    })}
                  </span>
                </td>
                <td className="py-3 pr-3">
                  <TrendLine
                    trend={v.trend}
                    units={t("site.past.per_decade_units", { units: v.units })}
                    compact
                  />
                </td>
                <td className="py-3 pr-3 tabular">
                  {d && d.change !== null ? (
                    <span className="flex flex-col">
                      <b className="font-semibold">{`${rate(d.change, lang)} ${v.units}`}</b>
                      <span className="text-[12px] text-muted">
                        {t("site.past.decades_short", {
                          e1: int(d.early.from, lang),
                          e2: int(d.early.to, lang),
                          l1: int(d.late.from, lang),
                          l2: int(d.late.to, lang),
                        })}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted">–</span>
                  )}
                </td>
                <td className="py-3">
                  {v.annualAnomaly ? (
                    <ClimateStripes
                      years={v.years}
                      values={v.annualAnomaly}
                      units={v.units}
                      colormap={cv?.colormap?.trend}
                      lang={lang}
                      label={t("site.report.stripes_alt", {
                        record: cv ? pick(cv.name, lang) : id,
                      })}
                      height={26}
                      bare
                      testId={`change-stripes-${id}`}
                    />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        {t("site.past.dash_note")}
      </p>
    </div>
  );
}

/** One record of one place in depth: its tested trend, each year and its 10-year mean, anomalies, months, decades. */
export function ThenAndNow({
  v,
  id,
  place,
  catalog,
  temp,
  rain,
}: {
  v: ExploreVariable;
  id: string;
  place: string;
  catalog: Catalog | undefined;
  temp?: ExploreVariable;
  rain?: ExploreVariable;
}) {
  const t = useT();
  const lang = useLang();
  const months = useMonths();
  const cv = catVar(catalog, id);
  const record = cv ? pick(cv.name_mid ?? cv.name, lang) : id;
  const cmap = cv?.colormap?.trend;
  const base = v.baseline;
  const d = v.decades;
  const earlyLabel = d
    ? `${int(d.early.from, lang)}–${int(d.early.to, lang)}`
    : "";
  const lateLabel = d
    ? `${int(d.late.from, lang)}–${int(d.late.to, lang)}`
    : "";
  if (!v.trend)
    return <p className="m-0 text-muted">{t("site.past.no_trend_file")}</p>;
  return (
    <div className="flex flex-col gap-5" data-testid="then-and-now">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title={t("site.past.values_title")}
          lead={t("site.past.values_lead")}
          testId="then-values"
        >
          <YearsChart
            series={[
              {
                label: t("site.past.series_year"),
                years: v.years,
                values: v.annual,
                tone: "a",
              },
              ...(v.rolling10
                ? [
                    {
                      label: t("site.past.series_rolling"),
                      years: v.years,
                      values: v.rolling10,
                      tone: "b" as const,
                    },
                  ]
                : []),
            ]}
            units={v.units}
            lang={lang}
            label={t("site.past.values_alt", { record, place })}
            height={280}
          />
        </Panel>
        <Panel
          title={t("site.past.trend_title")}
          lead={t("site.past.trend_method")}
          testId="then-trend"
        >
          <TrendLine
            trend={v.trend}
            units={t("site.past.per_decade_units", { units: v.units })}
          />
          {d && d.change !== null ? (
            <p className="m-0 text-[14px] leading-relaxed">
              {t("site.past.decade_sentence", {
                record,
                place,
                early: earlyLabel,
                late: lateLabel,
                a: num(
                  d.early.mean,
                  lang,
                  Math.abs(d.early.mean ?? 0) < 1000 ? 2 : 0,
                ),
                b: num(
                  d.late.mean,
                  lang,
                  Math.abs(d.late.mean ?? 0) < 1000 ? 2 : 0,
                ),
                change: rate(d.change, lang),
                units: v.units,
              })}
            </p>
          ) : null}
        </Panel>
      </div>

      {base && v.annualAnomaly ? (
        <Panel
          title={t("site.past.anomaly_title", {
            from: int(base[0], lang),
            to: int(base[1], lang),
          })}
          lead={t("site.past.anomaly_lead")}
          testId="then-anomaly"
        >
          <AnomalyBars
            years={v.years}
            anomaly={v.annualAnomaly}
            baseline={base}
            units={v.units}
            colormap={cmap}
            lang={lang}
            label={t("site.past.anomaly_alt", { record, place })}
          />
        </Panel>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        {base && v.monthlyAnomaly ? (
          <Panel
            title={t("site.past.heatmap_title", {
              from: int(base[0], lang),
              to: int(base[1], lang),
            })}
            lead={t("site.past.heatmap_lead")}
            testId="then-heatmap"
          >
            <MonthHeatmap
              years={v.years}
              values={v.monthlyAnomaly}
              months={months}
              units={v.unitsMonthly}
              colormap={cmap}
              lang={lang}
              label={t("site.past.heatmap_alt", { record, place })}
            />
          </Panel>
        ) : null}
        <div className="flex flex-col gap-5">
          {d ? (
            <Panel
              title={t("site.past.dumbbell_title", {
                early: earlyLabel,
                late: lateLabel,
              })}
              lead={t("site.past.dumbbell_lead")}
              testId="then-dumbbell"
            >
              <DecadeDumbbell
                rows={months.map((m, i) => ({
                  label: m,
                  early: d.early.monthly[i] ?? null,
                  late: d.late.monthly[i] ?? null,
                }))}
                early={earlyLabel}
                late={lateLabel}
                units={v.unitsMonthly}
                lang={lang}
                label={t("site.past.dumbbell_alt", { record, place })}
              />
            </Panel>
          ) : null}
          {v.monthTrends ? (
            <Panel
              title={t("site.past.months_title")}
              lead={t("site.past.months_lead")}
              testId="then-months"
            >
              {v.monthTrends.some((m) => m.testable) ? (
                <MonthTrendBars
                  months={months}
                  rows={v.monthTrends.map((m) => ({
                    rate: m.ratePerDecade,
                    standsOut: m.standsOut,
                  }))}
                  units={t("site.past.per_decade_units", {
                    units: v.unitsMonthly,
                  })}
                  colormap={cmap}
                  lang={lang}
                  label={t("site.past.months_alt", { record, place })}
                />
              ) : (
                <p className="m-0 text-muted">
                  {t(
                    `site.past.reason_${v.monthTrends[0]?.reason ?? "not_finite"}`,
                  )}
                </p>
              )}
            </Panel>
          ) : null}
        </div>
      </div>

      {temp?.decades && rain?.decades ? (
        <Panel
          title={t("site.past.climograph_title")}
          lead={t("site.past.climograph_lead")}
          testId="then-climograph"
        >
          <ClimographThenNow
            months={months}
            temp={{
              early: temp.decades.early.monthly,
              late: temp.decades.late.monthly,
            }}
            rain={{
              early: rain.decades.early.monthly,
              late: rain.decades.late.monthly,
            }}
            early={`${int(temp.decades.early.from, lang)}–${int(temp.decades.early.to, lang)}`}
            late={`${int(temp.decades.late.from, lang)}–${int(temp.decades.late.to, lang)}`}
            tempUnits={temp.unitsMonthly}
            rainUnits={rain.unitsMonthly}
            lang={lang}
            label={t("site.past.climograph_alt", { place })}
          />
        </Panel>
      ) : null}
    </div>
  );
}
