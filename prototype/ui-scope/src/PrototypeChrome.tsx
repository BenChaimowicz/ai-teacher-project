import { SCENES, VARIANTS, type ProtoState, type SceneId, type VariantKey } from "./types";

type Props = {
  variant: VariantKey;
  scene: SceneId;
  state: ProtoState;
  onVariant: (v: VariantKey) => void;
  onScene: (s: SceneId) => void;
};

export function PrototypeChrome({ variant, scene, state, onVariant, onScene }: Props) {
  const i = VARIANTS.findIndex((v) => v.key === variant);
  const current = VARIANTS[i];

  return (
    <div className="proto-chrome">
      <div className="proto-bar">
        <button
          type="button"
          aria-label="Previous variant"
          onClick={() => onVariant(VARIANTS[(i + VARIANTS.length - 1) % VARIANTS.length].key)}
        >
          ←
        </button>
        <div className="label">
          {current.key} — {current.name}
        </div>
        <button
          type="button"
          aria-label="Next variant"
          onClick={() => onVariant(VARIANTS[(i + 1) % VARIANTS.length].key)}
        >
          →
        </button>
        <select
          aria-label="Jump to scene"
          value={scene}
          onChange={(e) => onScene(e.target.value as SceneId)}
        >
          {SCENES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <details className="proto-state">
        <summary>Prototype state (not part of the design)</summary>
        {JSON.stringify(
          {
            variant,
            scene,
            sequenceMode: state.sequenceMode,
            canceled: state.canceled,
            lessonsOpen: state.lessonsOpen,
            readingSection: state.readingSection,
            readingMarkedComplete: state.readingMarkedComplete,
            quizBest: state.quizBest,
            markedIrrelevant: state.markedIrrelevant,
          },
          null,
          2,
        )}
      </details>
    </div>
  );
}
