import { PROFILE_QUESTIONS, oneLiner, summarize, type ProfileDraft, type ProfileField } from "@/components/make-course/profile-questions.tsx";
import { cn } from "@/lib/utils";

type PanelProps = {
  draft: ProfileDraft;
  /** The question being asked now. */
  current?: ProfileField | null;
  /** The line that just changed, to flash it. */
  fresh?: ProfileField | null;
  /** Lines can be tapped to change them (once every answer is in). */
  onChange?: ((field: ProfileField) => void) | null;
};

/**
 * The live summary beside the questions: each answer as it lands, then tap a line to change it (SEN-56).
 */
export function ProfileSummaryPanel({ draft, current = null, fresh = null, onChange = null }: PanelProps) {
  const editable = Boolean(onChange);
  return (
    <aside className="mk-panel" aria-label="Your answers so far">
      <div className="k">{editable ? "your settings" : "building as you go"}</div>
      <h3>How you like to learn</h3>
      <div className="hint">{editable ? "tap a line to change it" : "you can change any of this later"}</div>
      <ul className="mk-plines">
        {PROFILE_QUESTIONS.map((question) => {
          const summary = summarize(question, draft[question.field]);
          const now = question.field === current;
          return (
            <li key={question.field}>
              <button
                type="button"
                className={cn("mk-pline", summary && (summary.tag ? "def" : "set"), now && "now", fresh === question.field && "fresh")}
                disabled={!editable}
                onClick={() => onChange?.(question.field)}
                aria-label={editable ? `Change ${question.short}: ${summary?.chip ?? "not answered"}` : undefined}
              >
                <span className="pk">{question.short}</span>
                <span className="pv">
                  <span>{summary ? summary.chip : now ? "…" : "–"}</span>
                  {summary?.tag ? <span className="mk-defaulttag"> · {summary.tag}</span> : null}
                </span>
                <span className="pe" aria-hidden="true">change</span>
              </button>
            </li>
          );
        })}
      </ul>
      {editable ? <div className="mk-oneliner"><b>In short:</b> {oneLiner(draft)}</div> : null}
    </aside>
  );
}

type CardProps = {
  draft: ProfileDraft;
  fresh?: ProfileField | null;
  busy?: boolean;
  onChange: (field: ProfileField) => void;
};

/**
 * The returning view's list: every setting with what it means and a change button.
 */
export function ProfileSettingsCard({ draft, fresh = null, busy = false, onChange }: CardProps) {
  return (
    <ul className="mk-bigcard" aria-label="Your settings">
      {PROFILE_QUESTIONS.map((question) => {
        const summary = summarize(question, draft[question.field]);
        return (
          <li key={question.field} className={cn("mk-bline", fresh === question.field && "fresh")}>
            <span className="ic" aria-hidden="true">{question.icon}</span>
            <span className="bk">{question.short}</span>
            <span className="bv">
              <span>{summary?.chip ?? question.defaultChip}</span>
              {summary?.tag ? <span className="mk-defaulttag"> · {summary.tag}</span> : null}
              <small>{question.about}</small>
            </span>
            <button type="button" className="chg" disabled={busy} onClick={() => onChange(question.field)} aria-label={`Change ${question.short}`}>
              change
            </button>
          </li>
        );
      })}
    </ul>
  );
}
