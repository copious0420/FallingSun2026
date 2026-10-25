import type { TrajectoryPrediction } from "@/lib/simulator";

interface Props {
  prediction: TrajectoryPrediction | null;
  onAcknowledge: () => void;
}

export function TrajectoryAlertModal({ prediction, onAcknowledge }: Props) {
  if (!prediction || !prediction.breachZone) return null;

  const secs = prediction.breachInSeconds ?? 0;
  const timeStr = secs < 60 ? `~${secs}s` : `~${Math.floor(secs / 60)}m ${secs % 60}s`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className="mx-4 w-full max-w-md border border-amber-500 bg-[#0a0a0a] p-6"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
        role="alertdialog"
        aria-label="Area breach predicted"
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="animate-pulse text-xl text-amber-400">⚠</span>
          <span className="text-sm font-bold tracking-widest text-amber-400">
            {prediction.inside ? "RESTRICTED AREA BREACH" : "AREA BREACH PREDICTED"}
          </span>
        </div>

        <div className="mb-2 text-base text-white">
          {prediction.inside ? (
            <>
              <span className="font-bold text-amber-300">{prediction.droneId}</span> is in the{" "}
              <span className="font-bold text-red-400">RESTRICTED space</span> (Zone {prediction.breachZone.name})
            </>
          ) : (
            <>
              <span className="font-bold text-amber-300">{prediction.droneId}</span> will enter{" "}
              <span className="font-bold text-red-400">Zone {prediction.breachZone.name}</span> in{" "}
              <span className="font-bold text-amber-300">{timeStr}</span>
            </>
          )}
        </div>

        <div className="mb-6 text-xs tracking-widest text-red-400">— INTERCEPT RECOMMENDED —</div>

        {prediction.breachProbability !== null && (
          <div className="text-amber-400 text-xs tracking-widest mb-4">
            BREACH PROBABILITY: <span className="font-bold text-lg">{prediction.breachProbability}%</span>
          </div>
        )}

        <div className="mb-6 text-xs text-gray-400">
          Trajectory analysis based on last 10-second movement pattern. Predicted path extrapolated using velocity
          vector algorithm.
        </div>

        <button
          onClick={onAcknowledge}
          className="w-full border border-amber-500 py-2 text-sm tracking-widest text-amber-400 transition-colors hover:bg-amber-500/10"
        >
          ACKNOWLEDGE
        </button>
      </div>
    </div>
  );
}
