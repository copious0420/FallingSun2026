import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { getSimulatorState } from "@/lib/simulator";

interface DroneHistoryModalProps {
  open: boolean;
  onClose: () => void;
  breachLog: Array<{ droneId: string; zoneName: string; time: string; acknowledged: boolean }>;
}

export function DroneHistoryModal({ open, onClose, breachLog }: DroneHistoryModalProps) {
  const [drones, setDrones] = useState(getSimulatorState().drones);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      setDrones(getSimulatorState().drones);
    }, 500);
    return () => clearInterval(interval);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.45)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="w-[90vw] max-w-5xl max-h-[80vh] overflow-hidden rounded-xl"
            style={{
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 8px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div>
                <div className="text-white font-bold tracking-widest text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  DRONE HISTORY
                </div>
                <div className="text-white/40 text-[10px] tracking-widest mt-0.5">ALL TRACKS // POSITION LOG + BREACH EVENTS</div>
              </div>
              <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
            </div>

            <div className="overflow-y-auto max-h-[calc(80vh-80px)] p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* LEFT — Per-drone position history */}
              <div>
                <div className="text-white/50 text-[10px] tracking-widest mb-3 uppercase">Position Tracks</div>
                <div className="space-y-3">
                  {drones.map(drone => (
                    <div key={drone.id}
                      className="rounded-lg p-3"
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)'
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="text-[11px] font-bold tracking-wider"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            color: drone.friendly ? '#22c55e' : drone.id === 'MANUAL-01' ? '#22d3ee' : '#f97316'
                          }}
                        >
                          {drone.id}
                        </span>
                        {drone.friendly && <span className="text-[9px] text-green-400/60 border border-green-500/30 px-1.5">ALLY</span>}
                        {drone.id === 'MANUAL-01' && <span className="text-[9px] text-cyan-400/60 border border-cyan-500/30 px-1.5">OPERATOR</span>}
                      </div>
                      <div className="space-y-0.5 max-h-24 overflow-y-auto">
                        {[...drone.positionHistory].reverse().slice(0, 12).map((pt, i) => (
                          <div key={i} className="flex gap-3 text-[9px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            <span className="text-white/30 w-4">{i === 0 ? '▶' : `${i}`}</span>
                            <span className="text-white/60">LAT {pt.lat.toFixed(4)}</span>
                            <span className="text-white/60">LNG {pt.lng.toFixed(4)}</span>
                            {i === 0 && <span className="text-white/30 text-[8px]">CURRENT</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT — Breach event log */}
              <div>
                <div className="text-white/50 text-[10px] tracking-widest mb-3 uppercase">Breach Events</div>
                {breachLog.length === 0 ? (
                  <div className="text-white/25 text-[11px] tracking-widest text-center py-12" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    NO BREACH EVENTS RECORDED
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...breachLog].reverse().map((evt, i) => (
                      <div key={i}
                        className="rounded px-3 py-2 flex items-center gap-3"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.07)'
                        }}
                      >
                        <span className={`text-[9px] w-2 h-2 rounded-full inline-block ${evt.acknowledged ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                        <span className="text-white/40 text-[9px] w-16" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{evt.time}</span>
                        <span className="text-amber-400 text-[10px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{evt.droneId}</span>
                        <span className="text-white/50 text-[10px]">→ Zone {evt.zoneName}</span>
                        <span className={`ml-auto text-[9px] tracking-wider ${evt.acknowledged ? 'text-green-400/60' : 'text-red-400/60'}`}>
                          {evt.acknowledged ? 'ACK' : 'ACTIVE'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
