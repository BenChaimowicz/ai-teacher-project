import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { ProfileView } from "@/components/profile-view.tsx";
import {
  answersFromEditor,
  blankEditorAnswers,
  editorFromSaved,
  QuestionnaireForm,
  type EditorAnswers,
} from "@/components/questionnaire-form.tsx";
import { useTeachingProfile } from "@/components/teaching-profile-provider.tsx";
import {
  PROFILE_INTRO,
  PROFILE_SKIP_NOTE,
  RESET_DISCLAIMER,
  SAVE_EXISTING_DISCLAIMER,
} from "@/lib/teaching-profile-copy.ts";

type Mode = "view" | "create" | "edit" | "reassess";

/**
 * Teaching Profile screen: Viewing, or Editing (first save, Edit, or Reassess).
 */
export function TeachingProfilePage() {
  const { loading, error, present, record, save, reset } = useTeachingProfile();
  const [mode, setMode] = useState<Mode | null>(null);
  const [draft, setDraft] = useState<EditorAnswers>(blankEditorAnswers);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!present) {
      setMode("create");
      return;
    }
    setMode((current) => (current === "edit" || current === "reassess" ? current : "view"));
  }, [loading, present]);

  /**
   * Opens Edit with the current saved answers.
   */
  function startEdit() {
    if (!record?.answers) return;
    setDraft(editorFromSaved(record.answers));
    setMode("edit");
    setFormError(null);
  }

  /**
   * Opens a blank retake. Saved answers stay until Save.
   */
  function startReassess() {
    setDraft(blankEditorAnswers());
    setMode("reassess");
    setFormError(null);
  }

  /**
   * Leaves Editing without writing.
   */
  function cancelEdit() {
    setDraft(blankEditorAnswers());
    setMode("view");
    setFormError(null);
    setSaveOpen(false);
  }

  /**
   * Writes the draft. Create saves immediately; Edit/Reassess confirm first.
   */
  async function commitSave() {
    setBusy(true);
    setFormError(null);
    try {
      await save(answersFromEditor(draft), mode === "reassess" ? "reassess" : "save");
      setSaveOpen(false);
      setMode("view");
    } catch (caught: unknown) {
      setFormError(caught instanceof Error ? caught.message : "Could not save Teaching Profile");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Reset after confirm.
   */
  async function commitReset() {
    setBusy(true);
    setFormError(null);
    try {
      await reset();
      setResetOpen(false);
      setDraft(blankEditorAnswers());
      setMode("create");
    } catch (caught: unknown) {
      setFormError(caught instanceof Error ? caught.message : "Could not reset Teaching Profile");
    } finally {
      setBusy(false);
    }
  }

  const editing = mode === "create" || mode === "edit" || mode === "reassess";
  const modeLabel =
    mode === "view"
      ? "Viewing"
      : mode === "edit"
        ? "Editing"
        : mode === "reassess"
          ? "Reassessing"
          : "Set up";

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <p className="text-sm text-muted-foreground">Teaching Profile</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Teaching Profile</h1>
        {mode ? (
          <p className="rounded-full border border-border px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {modeLabel}
          </p>
        ) : null}
      </div>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{PROFILE_INTRO}</p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{PROFILE_SKIP_NOTE}</p>

      {loading ? <p className="mt-10 text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="mt-10 text-sm text-red-400">{error}</p> : null}
      {formError ? <p className="mt-4 text-sm text-red-400">{formError}</p> : null}

      {!loading && !error && mode === "view" && record?.answers ? (
        <div className="mt-8">
          <div className="mb-6 flex flex-wrap gap-2">
            <Button type="button" onClick={startEdit}>
              Edit
            </Button>
            <Button type="button" variant="secondary" onClick={startReassess}>
              Reassess
            </Button>
            <Button type="button" variant="outline" onClick={() => setResetOpen(true)}>
              Reset to defaults
            </Button>
          </div>
          <ProfileView answers={record.answers} />
        </div>
      ) : null}

      {!loading && !error && editing ? (
        <div className="mt-8">
          {mode === "reassess" ? (
            <p className="mb-4 text-sm text-muted-foreground">
              This is a blank retake. Your previous answers stay saved until you save this one.
            </p>
          ) : null}
          <QuestionnaireForm value={draft} onChange={setDraft} />
          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="button" onClick={() => (mode === "create" ? void commitSave() : setSaveOpen(true))} disabled={busy}>
              Save
            </Button>
            {mode !== "create" ? (
              <Button type="button" variant="ghost" onClick={cancelEdit} disabled={busy}>
                Cancel
              </Button>
            ) : (
              <Button type="button" variant="ghost" asChild>
                <Link to="/">Home</Link>
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={saveOpen}
        title="Save Teaching Profile?"
        body={SAVE_EXISTING_DISCLAIMER}
        confirmLabel="Save"
        busy={busy}
        onConfirm={() => void commitSave()}
        onCancel={() => setSaveOpen(false)}
      />
      <ConfirmDialog
        open={resetOpen}
        title="Reset to defaults?"
        body={RESET_DISCLAIMER}
        confirmLabel="Reset"
        danger
        busy={busy}
        onConfirm={() => void commitReset()}
        onCancel={() => setResetOpen(false)}
      />
    </div>
  );
}
