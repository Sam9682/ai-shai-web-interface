import { TrackingForm } from '../components/prerequisites/TrackingForm';
import { landingZoneConfig } from '../components/prerequisites/configs';

export const LandingZonePage = () => (
  <TrackingForm title="LandingZone" storageKey="opcp_prereq_landingzone" config={landingZoneConfig} />
);
