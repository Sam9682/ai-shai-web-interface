import { QuestionAnswerForm } from '../components/prerequisites/QuestionAnswerForm';
import { vcfConfig } from '../components/prerequisites/configs';

export const VcfPage = () => (
  <QuestionAnswerForm slug="vcf" title="VCF" config={vcfConfig} />
);
