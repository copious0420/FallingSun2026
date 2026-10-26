import type { TrajectoryPrediction } from "@/lib/simulator";
import { type GroqAssessment } from "@/lib/groq";

interface Props {
  prediction: TrajectoryPrediction | null;
  groqAssessment?: GroqAssessment | undefined;
  onAcknowledge: () => void;
}

export function TrajectoryAlertModal({ prediction, groqAssessment, onAcknowledge }: Props) {
  if (!prediction || !prediction.breachZone) return null;

  const isFriendly = prediction.friendly;
  const borderColor = isFriendly ? "#22c55e" : "#f59e0b";
  const textColor = isFriendly ? "text-green-400" : "text-amber-400";
  const headerText = isFriendly ? "FRIENDLY UNIT DETECTED" : "AREA BREACH PREDICTED";
  const iconColor = isFriendly ? "text-green-400" : "text-amber-400";

  const secs = prediction.breachInSeconds ?? 0;
  const timeStr = secs < 60 ? `~${secs}s` : `~${Math.floor(secs / 60)}m ${secs % 60}s`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className="p-6 max-w-md w-full mx-4"
        style={{ fontFamily: "'JetBrains Mono', monospace", border: `1px solid ${borderColor}`, background: "#0a0a0a" }}
        role="alertdialog"
        aria-label={headerText}
      >
        <div className="flex items-center gap-3 mb-4">
          <span className={`text-xl animate-pulse ${iconColor}`}>⚠</span>
          <span className={`font-bold tracking-widest text-sm ${textColor}`}>
            {headerText}
          </span>
        </div>

        <div className="text-white text-base mb-2">
          <span className={`font-bold ${textColor}`}>{prediction.droneId}</span>
          {isFriendly ? " is entering " : " will enter "}
          <span className="text-red-400 font-bold">Zone {prediction.breachZone.name}</span>
          {!isFriendly && <> in <span className={`font-bold ${textColor}`}>{timeStr}</span></>}
        </div>

        <div className={`text-xs tracking-widest mb-4 ${isFriendly ? "text-green-400" : "text-red-400"}`}>
          {isFriendly ? "— CLEARANCE VERIFIED — STAND DOWN —" : "— INTERCEPT RECOMMENDED —"}
        </div>

        {groqAssessment && (
          <div className="border border-gray-700 p-3 mb-4">
            <div className="text-[10px] text-gray-500 tracking-widest mb-1">AI ASSESSMENT</div>
            <div className="text-xs text-gray-300">{groqAssessment.assessment}</div>
            <div className={`text-xs mt-2 ${textColor}`}>
              BREACH PROBABILITY: <span className="font-bold">{prediction.breachProbability}%</span>
            </div>
          </div>
        )}

        {!groqAssessment && (
          <div className="text-xs text-gray-600 mb-4 tracking-widest">ANALYZING...</div>
        )}

        <button
          onClick={onAcknowledge}
          className={`w-full py-2 text-sm tracking-widest transition-colors ${
            isFriendly
              ? "border border-green-500 text-green-400 hover:bg-green-500/10"
              : "border border-amber-500 text-amber-400 hover:bg-amber-500/10"
          }`}
        >
          ACKNOWLEDGE
        </button>
      </div>
    </div>
  );
}
