import { MinimalDashboard } from "@/components/minimal/MinimalDashboard";

export const metadata = {
  title: "S.K.Y.N.E.T. · cockpit (legacy)",
};

/**
 * Den oprindelige 4-col bento cockpit fra 2026-05-08. Bevaret som
 * fallback hvis Editorial-cockpittet på `/` ikke virker.
 * Tilgås manuelt via /legacy.
 */
export default function LegacyCockpit() {
  return <MinimalDashboard />;
}
