import { QuestionAnswerForm } from '../components/prerequisites/QuestionAnswerForm';
import { cloudStoreQuestionConfig } from '../components/prerequisites/configs';

export const CloudStorePage = () => (
  <QuestionAnswerForm slug="cloudstore" title="CloudStore" config={cloudStoreQuestionConfig} />
);
