import { TrackingForm } from '../components/prerequisites/TrackingForm';
import { opcpCoreConfig } from '../components/prerequisites/configs';

export const OPCPCorePage = () => (
  <TrackingForm title="OPCP Core" storageKey="opcp_prereq_core" config={opcpCoreConfig} />
);
