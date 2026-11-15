// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// "Challenge this conclusion": every way the result file lets a reader try to break the answer, in one place.
// Each challenge reads the engine's own robustness block, doubts and cross-check (docs/03_SCIENCE.md §6);
// its mark comes from the engine's status (pass, doubt, note, skip), never from a value the site compares.
// The site computes nothing here: it lists, formats and counts rows.
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleAlert,
  Info,
  Minus,
  Swords,
} from "lucide-react";
import type { ReactNode } from "react";
import { pick, useT } from "../i18n";
import { int, num, p as pText, rate } from "../i18n/format";
import { useCatalog, useResult } from "../data/hooks";
import type {
  Contrast,
  ContrastSensitivity,
  Robustness,
  Verdict,
} from "../data/types";
import { useLang } from "../state/prefs";
import { Card } from "../ui/common/card";
import { cn } from "../ui/common/utils";
import { undatedBreaks } from "./ChecksList";
import { StatusBadge } from "./StatusBadge";

export type Mark = "holds" | "weakens" | "note" | "skip";

export interface Challenge {
  id:
    | "loo"
    | "windows"
    | "jump"
    | "breaks"
    | "coverage"
    | "crosscheck"
    | "doubts";
  mark: Mark;
}

/** The marks of the challenges a result supports, from the engine's statuses only. */
export function challengeMarks(
  r: Robustness,
  doubts: string[],
  undated: number,
  crossCheck: { sameSign: boolean | null } | "verdict" | null,
): Challenge[] {
  const out: Challenge[] = [];
  const fromStatus = (s: string | undefined): Mark =>
    s === "pass"
      ? "holds"
      : s === "doubt"
        ? "weakens"
        : s === "note"
          ? "note"
          : "skip";
  out.push({ id: "loo", mark: fromStatus(r.loo?.status) });
  out.push({ id: "windows", mark: fromStatus(r.windows?.status) });
  out.push({
    id: "jump",
    mark: r.pettitt ? (r.pettitt.flagged ? "weakens" : "holds") : "skip",
  });
  const dated = r.breaks;
  out.push({
    id: "breaks",
    mark: dated.some((b) => b.status !== "reviewed")
      ? "weakens"
      : undated > 0
        ? "note"
        : dated.length
          ? "note"
          : "holds",
  });
  out.push({ id: "coverage", mark: fromStatus(r.coverage.status) });
  if (crossCheck === "verdict") out.push({ id: "crosscheck", mark: "note" });
  else if (crossCheck)
    out.push({
      id: "crosscheck",
      mark:
        crossCheck.sameSign === null
          ? "note"
          : crossCheck.sameSign
            ? "holds"
            : "weakens",
    });
  out.push({ id: "doubts", mark: doubts.length ? "weakens" : "holds" });
  return out;
}

const ICON = {
  holds: Check,
  weakens: CircleAlert,
  note: Info,
  skip: Minus,
} as const;
const COLOUR = {
  holds: "text-strong",
  weakens: "text-noverdict",
  note: "text-accent-ink",
  skip: "text-muted",
} as const;

function Row({
  c,
  title,
  children,
}: {
  c: Challenge;
  title: string;
  children: ReactNode;
}) {
  const t = useT();
  const Icon = ICON[c.mark];
  return (
    <li
      className="flex items-start gap-3 border-t border-line pt-3 first:border-t-0 first:pt-0"
      data-testid={`challenge-${c.id}`}
      data-mark={c.mark}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-current/40",
          COLOUR[c.mark],
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 text-[14.5px] leading-relaxed">
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 font-semibold">
          {title}
          <span
            className={cn(
              "text-[12px] font-medium uppercase tracking-[0.08em]",
              COLOUR[c.mark],
            )}
          >
            {t(`site.challenge.mark_${c.mark}`)}
          </span>
        </p>
        <div className="mt-0.5 flex flex-col gap-1 text-muted">{children}</div>
      </div>
    </li>
  );
}

function Arrow({ x }: { x: number | null | undefined }) {
  if (x === null || x === undefined || x === 0) return null;
  const I = x > 0 ? ArrowUp : ArrowDown;
  return <I className="inline size-3.5 align-[-2px]" aria-hidden="true" />;
}

/** The IMERG cross-check of a single-place verdict: its own result file, read when present. */
function VerdictCrossCheck({
  path,
  main,
  units,
}: {
  path: string;
  main: Verdict;
  units: string;
}) {
  const t = useT();
  const lang = useLang();
  const res = useResult<Verdict>(path);
  const s = res.data;
  if (!s) return <p className="m-0">{t("site.challenge.loading")}</p>;
  const mainRate = main.stats.change?.ratePerDecade ?? null;
  const sRate = s.stats.change?.ratePerDecade ?? null;
  return (
    <>
      <p className="m-0 tabular">
        <Arrow x={mainRate} />{" "}
        {t("site.challenge.cross_main", {
          rate: rate(mainRate, lang),
          units,
          from: int(main.window.first, lang),
          to: int(main.window.last, lang),
        })}
      </p>
      <p className="m-0 tabular">
        <Arrow x={sRate} />{" "}
        {t("site.challenge.cross_other", {
          rate: rate(sRate, lang, mainRate),
          units: s.stats.change?.units ?? units,
          from: int(s.window.first, lang),
          to: int(s.window.last, lang),
        })}{" "}
        <StatusBadge
          status={s.status}
          grade={s.grade}
          reason={s.reason}
          family={s.family}
        />
      </p>
      <p className="m-0">{t("site.challenge.cross_note")}</p>
    </>
  );
}

function ContrastCrossCheck({
  s,
  units,
}: {
  s: ContrastSensitivity;
  units: string;
}) {
  const t = useT();
  const lang = useLang();
  const w = { from: int(s.window.first, lang), to: int(s.window.last, lang) };
  return (
    <>
      <p className="m-0 tabular">
        <Arrow x={s.rateMerraPerDecade} />{" "}
        {t("site.challenge.cross_contrast_main", {
          rate: rate(s.rateMerraPerDecade, lang),
          units,
          ...w,
        })}
      </p>
      <p className="m-0 tabular">
        <Arrow x={s.rateImergPerDecade} />{" "}
        {t("site.challenge.cross_contrast_other", {
          rate: rate(s.rateImergPerDecade, lang, s.rateMerraPerDecade),
          units,
          ...w,
        })}
      </p>
      {s.sameSign !== null ? (
        <p className="m-0">
          {t(
            s.sameSign
              ? "site.challenge.cross_same"
              : "site.challenge.cross_opposite",
          )}
        </p>
      ) : null}
      <p className="m-0">{t("site.challenge.cross_note")}</p>
    </>
  );
}

export function ChallengePanel({ result }: { result: Verdict | Contrast }) {
  const t = useT();
  const lang = useLang();
  const catalog = useCatalog();
  const isContrast = typeof result.variable === "string";
  const variable =
    typeof result.variable === "string" ? result.variable : result.variable.id;
  const units =
    "difference" in result ? result.difference.units : result.variable.units;
  const r = result.robustness;
  const undated = undatedBreaks(catalog.data, variable);
  const sens = result.sensitivity;
  const cross =
    sens === null || sens === undefined
      ? null
      : typeof sens === "string"
        ? ("verdict" as const)
        : { sameSign: sens.sameSign };
  const list = challengeMarks(r, result.doubts, undated.length, cross);
  const weak = list.filter((c) => c.mark === "weakens").length;
  const ran = list.filter((c) => c.mark !== "skip").length;
  // A result without checks (a "no verdict" outside the tested range, say) has nothing to challenge.
  const none = result.text.en.checks.length === 0;
  const label = isContrast
    ? t("site.challenge.trend_diff")
    : t("site.challenge.trend");
  const body = (c: Challenge): ReactNode => {
    switch (c.id) {
      case "loo":
        return r.loo && r.loo.status !== "skip" ? (
          <>
            <p className="m-0 tabular">
              {t("site.challenge.loo_range", {
                pmin: pText(r.loo.pMin, lang),
                pmax: pText(r.loo.pMax, lang),
              })}
            </p>
            {r.loo.year !== null ? (
              <p className="m-0">
                {t("site.challenge.loo_year", { year: int(r.loo.year, lang) })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="m-0">{t("site.challenge.not_run")}</p>
        );
      case "windows":
        return r.windows && r.windows.status !== "skip" ? (
          <>
            <p className="m-0">
              {t("site.challenge.windows_count", {
                agree: int(r.windows.agree, lang),
                ran: int(r.windows.ran, lang),
              })}
            </p>
            <ul
              className="m-0 flex list-none flex-col gap-0.5 p-0 tabular"
              data-testid="challenge-windows-list"
            >
              {r.windows.items.map((w) => (
                <li key={w.id} className="flex flex-wrap gap-x-2">
                  <span className="text-ink">{`${int(w.first, lang)}–${int(w.last, lang)}`}</span>
                  {w.ran ? (
                    <>
                      <span>{`${rate(w.ratePerDecade, lang)} ${units} ${t("site.challenge.per_decade")}`}</span>
                      <span
                        className={w.agrees ? "text-strong" : "text-noverdict"}
                      >
                        {t(
                          w.agrees
                            ? "site.challenge.agrees"
                            : "site.challenge.disagrees",
                        )}
                      </span>
                    </>
                  ) : (
                    <span>{t("site.challenge.not_run")}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="m-0">{t("site.challenge.not_run")}</p>
        );
      case "jump":
        return r.pettitt ? (
          r.pettitt.flagged && r.pettitt.year !== null ? (
            <>
              <p className="m-0">
                {t("site.challenge.jump_yes", {
                  year: int(r.pettitt.year, lang),
                })}
              </p>
              {undated.length && !r.breaks.length ? (
                <p className="m-0">{t("site.challenge.jump_undated")}</p>
              ) : null}
            </>
          ) : (
            <p className="m-0">{t("site.challenge.jump_no")}</p>
          )
        ) : (
          <p className="m-0">{t("site.challenge.not_run")}</p>
        );
      case "breaks":
        return (
          <>
            {r.breaks.map((b) => (
              <p key={b.id} className="m-0">
                {t(
                  `site.challenge.break_${b.status === "reviewed" ? "reviewed" : b.status === "step" ? "step" : "unreviewed"}`,
                  {
                    year: b.year !== null ? int(b.year, lang) : "–",
                    label: pick(b.label, lang),
                  },
                )}
              </p>
            ))}
            {undated.length ? (
              <>
                <p className="m-0">{t("site.challenge.breaks_undated")}</p>
                <ul className="m-0 list-disc pl-5">
                  {undated.map((b) => (
                    <li key={b.id}>{pick(b.label, lang)}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {!r.breaks.length && !undated.length ? (
              <p className="m-0">{t("site.challenge.breaks_none")}</p>
            ) : null}
          </>
        );
      case "coverage":
        return r.coverage.status === "skip" ? (
          <p className="m-0">{t("site.challenge.coverage_skip")}</p>
        ) : (
          <p className="m-0 tabular">
            {t(
              r.coverage.status === "pass"
                ? "site.challenge.coverage_pass"
                : "site.challenge.coverage_doubt",
              {
                cmin: num(r.coverage.cmin, lang, 2),
                cmax: num(r.coverage.cmax, lang, 2),
              },
            )}
          </p>
        );
      case "crosscheck":
        return typeof sens === "string" && !isContrast ? (
          <VerdictCrossCheck
            path={sens}
            main={result as Verdict}
            units={units}
          />
        ) : sens && typeof sens !== "string" ? (
          <ContrastCrossCheck s={sens} units={units} />
        ) : null;
      case "doubts":
        return result.doubts.length ? (
          <ul className="m-0 list-disc pl-5">
            {result.doubts.map((d) => (
              <li key={d}>{t(`site.challenge.doubt_${d}`)}</li>
            ))}
          </ul>
        ) : (
          <p className="m-0">{t("site.challenge.doubts_none")}</p>
        );
    }
  };
  return (
    <Card className="p-4 sm:p-5" data-testid="challenge-panel">
      <div className="flex items-start gap-3">
        <Swords
          className="mt-1 size-5 shrink-0 text-accent-ink"
          aria-hidden="true"
        />
        <div>
          <h3 className="m-0 font-display text-[22px] font-normal leading-tight">
            {t("site.challenge.title")}
          </h3>
          <p className="m-0 mt-1 text-[14px] text-muted">
            {t("site.challenge.lead", { what: label })}
          </p>
          <p
            className="m-0 mt-2 text-[14px] font-medium"
            data-testid="challenge-summary"
          >
            {none
              ? t("site.checks.none_ran")
              : t(
                  weak
                    ? "site.challenge.summary_some"
                    : "site.challenge.summary_none",
                  { weak: int(weak, lang), all: int(ran, lang) },
                )}
          </p>
        </div>
      </div>
      {none ? null : (
        <ul className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
          {list.map((c) => (
            <Row key={c.id} c={c} title={t(`site.challenge.${c.id}_title`)}>
              {body(c)}
            </Row>
          ))}
        </ul>
      )}
      <p className="m-0 mt-4 text-[13px] text-muted">
        {t("site.challenge.footer")}
      </p>
    </Card>
  );
}
