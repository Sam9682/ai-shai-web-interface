import { describe, it, expect } from 'vitest';
import type { QuestionFormConfig, QuestionRow } from './types';
import { vcfConfig } from './configs';

// Content assertions for the real VCF customer-input parameters (task 8.3).
// These complement the structural property tests in configs.test.ts by
// pinning down the concrete section ids, the excluded CloudStore-provided
// params, the optional-vs-mandatory split, and a handful of known
// exampleValue/commentsHint mappings from the VCF reference document.
// _Requirements: 1.1, 1.2, 2.2, 2.3, 2.5, 3.1_

// Collect every row across all sections of a QuestionFormConfig.
const allRows = (config: QuestionFormConfig): QuestionRow[] =>
  config.sections.flatMap((section) => section.rows);

// Find a single row by id across all sections.
const findRow = (config: QuestionFormConfig, rowId: string): QuestionRow | undefined =>
  allRows(config).find((row) => row.id === rowId);

describe('vcfConfig content', () => {
  // Requirement 3.1: rows are grouped into the Management/Workload
  // sub-sections that reflect the reference document structure.
  it('exposes exactly the expected section ids in order', () => {
    const expectedSectionIds = [
      'vcf-mgmt-network',
      'vcf-mgmt-dns',
      'vcf-mgmt-auth',
      'vcf-mgmt-secrets',
      'vcf-mgmt-misc',
      'vcf-wld-general',
      'vcf-wld-network',
    ];
    expect(vcfConfig.sections.map((s) => s.id)).toEqual(expectedSectionIds);
  });

  // Requirement 1.2: CloudStore-provided params must be excluded.
  it('excludes CloudStore-provided params from every row id', () => {
    const ids = allRows(vcfConfig).map((row) => row.id);
    const excluded = ['node_uuids', 'bootstrap_node_uuids'];
    for (const param of excluded) {
      const offending = ids.filter((id) => id.includes(param));
      expect(offending, `no row id should reference "${param}"`).toEqual([]);
    }
  });

  // Requirement 2.5: mandatory flags reflect whether the deployment requires
  // the parameter. Exactly five rows are optional (four secrets rows plus the
  // ESXi setup script); every other row is mandatory.
  describe('mandatory flags', () => {
    const optionalRowIds = [
      'vcf-mgmt-master-password',
      'vcf-mgmt-esxi-root-password',
      'vcf-mgmt-appliance-password',
      'vcf-mgmt-appliance-xapikey',
      'vcf-mgmt-esxi-setup-script',
    ];

    it.each(optionalRowIds)('row "%s" is optional (mandatory=false)', (rowId) => {
      const row = findRow(vcfConfig, rowId);
      expect(row, `row ${rowId} should exist`).toBeDefined();
      expect(row!.mandatory).toBe(false);
    });

    it('marks exactly the five known optional rows as optional', () => {
      const actualOptional = allRows(vcfConfig)
        .filter((row) => row.mandatory === false)
        .map((row) => row.id)
        .sort();
      expect(actualOptional).toEqual([...optionalRowIds].sort());
    });

    it('marks every other row as mandatory (mandatory=true)', () => {
      const optionalSet = new Set(optionalRowIds);
      const others = allRows(vcfConfig).filter((row) => !optionalSet.has(row.id));
      for (const row of others) {
        expect(row.mandatory, `row ${row.id} should be mandatory`).toBe(true);
      }
    });
  });

  // Requirements 2.2 / 2.3: spot-check known exampleValue and commentsHint
  // mappings drawn from the VCF reference document.
  describe('known example/hint mappings', () => {
    it('sets vcf-mgmt-network-name exampleValue to "vcf_network"', () => {
      expect(findRow(vcfConfig, 'vcf-mgmt-network-name')?.exampleValue).toBe('vcf_network');
    });

    it('sets vcf-mgmt-dns-zone exampleValue to "staging.cloudstore.ovh"', () => {
      expect(findRow(vcfConfig, 'vcf-mgmt-dns-zone')?.exampleValue).toBe('staging.cloudstore.ovh');
    });

    it('sets vcf-mgmt-master-password commentsHint with the @!#$%?^ charset note', () => {
      const hint = findRow(vcfConfig, 'vcf-mgmt-master-password')?.commentsHint;
      expect(hint).toBeDefined();
      expect(hint).toContain('@!#$%?^');
    });

    it('sets vcf-mgmt-esxi-setup-script commentsHint mentioning Broadcom', () => {
      const hint = findRow(vcfConfig, 'vcf-mgmt-esxi-setup-script')?.commentsHint;
      expect(hint).toBeDefined();
      expect(hint).toContain('Broadcom');
    });
  });
});
