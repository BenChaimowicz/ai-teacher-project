import { useEffect, useState } from "react";
import { PrototypeChrome } from "./PrototypeChrome";
import {
  defaultState,
  SCENES,
  VARIANTS,
  type ProtoState,
  type SceneId,
  type VariantKey,
} from "./types";
import { CourseWorkspace } from "./variants/CourseWorkspace";
import { DocumentedPages } from "./variants/DocumentedPages";
import { GuideThread } from "./variants/GuideThread";

function isScene(v: string | null): v is SceneId {
  return SCENES.some((s) => s.id === v);
}

function isVariant(v: string | null): v is VariantKey {
  return VARIANTS.some((x) => x.key === v);
}

function readUrl(): { variant: VariantKey; scene: SceneId } {
  const q = new URLSearchParams(window.location.search);
  const v = q.get("variant");
  const s = q.get("scene");
  return {
    variant: isVariant(v) ? v : "B",
    scene: isScene(s) ? s : "home",
  };
}

function writeUrl(variant: VariantKey, scene: SceneId) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", variant);
  url.searchParams.set("scene", scene);
  window.history.replaceState(null, "", url);
}

export function App() {
  const initial = readUrl();
  const [variant, setVariant] = useState<VariantKey>(initial.variant);
  const [state, setState] = useState<ProtoState>({ ...defaultState(), scene: initial.scene });

  useEffect(() => {
    writeUrl(variant, state.scene);
  }, [variant, state.scene]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const i = VARIANTS.findIndex((v) => v.key === variant);
      if (e.key === "ArrowLeft") setVariant(VARIANTS[(i + VARIANTS.length - 1) % VARIANTS.length].key);
      if (e.key === "ArrowRight") setVariant(VARIANTS[(i + 1) % VARIANTS.length].key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant]);

  const go = (scene: SceneId) => setState((s) => ({ ...s, scene }));
  const patch = (p: Partial<ProtoState>) => setState((s) => ({ ...s, ...p }));
  const props = { scene: state.scene, state, setState: patch, go };

  return (
    <>
      {variant === "A" && <DocumentedPages {...props} />}
      {variant === "B" && <CourseWorkspace {...props} />}
      {variant === "C" && <GuideThread {...props} />}
      {import.meta.env.DEV && (
        <PrototypeChrome
          variant={variant}
          scene={state.scene}
          state={state}
          onVariant={setVariant}
          onScene={go}
        />
      )}
    </>
  );
}
