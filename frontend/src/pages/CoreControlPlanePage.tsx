import { QuestionAnswerForm } from '../components/prerequisites/QuestionAnswerForm';
import { coreControlPlaneConfig } from '../components/prerequisites/configs';

export const CoreControlPlanePage = () => (
  <QuestionAnswerForm slug="core-control-plane" title="Core Control Plane" config={coreControlPlaneConfig} />
);
