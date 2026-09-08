import { TrackingForm } from '../components/prerequisites/TrackingForm';
import { cloudStoreConfig } from '../components/prerequisites/configs';

export const CloudStorePage = () => (
  <TrackingForm title="CloudStore" storageKey="opcp_prereq_cloudstore" config={cloudStoreConfig} />
);
