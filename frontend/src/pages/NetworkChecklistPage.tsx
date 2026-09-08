import { QuestionAnswerForm } from '../components/prerequisites/QuestionAnswerForm';
import { networkChecklistConfig } from '../components/prerequisites/configs';

export const NetworkChecklistPage = () => (
  <QuestionAnswerForm slug="network-checklist" title="Network Checklist" config={networkChecklistConfig} />
);
