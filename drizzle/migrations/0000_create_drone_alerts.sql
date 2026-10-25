CREATE TABLE public.drone_alerts (
  id uuid primary key default gen_random_uuid(),
  drone_id text not null,
  threat_level text not null check (threat_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  timestamp timestamptz not null default now(),
  coordinates jsonb not null default '{"x":0,"y":0}'::jsonb,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT ON public.drone_alerts TO anon;
GRANT SELECT, INSERT ON public.drone_alerts TO authenticated;
GRANT ALL ON public.drone_alerts TO service_role;

ALTER TABLE public.drone_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read drone alerts"
  ON public.drone_alerts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can log drone alerts"
  ON public.drone_alerts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE INDEX idx_drone_alerts_timestamp ON public.drone_alerts (timestamp DESC);
CREATE INDEX idx_drone_alerts_drone_id ON public.drone_alerts (drone_id);