import { describe, it, expect } from 'vitest';
import type { FormConfig } from './types';
import { cloudStoreConfig, opcpCoreConfig, landingZoneConfig } from './configs';

// Collect every row id in a config, in document order.
const allRowIds = (config: FormConfig): string[] =>
  config.sections.flatMap((section) => section.rows.map((row) => row.id));

// Find a single row by id across all sections of a config.
const findRow = (config: FormConfig, rowId: string) =>
  allRowIds(config).includes(rowId)
    ? config.sections.flatMap((s) => s.rows).find((r) => r.id === rowId)
    : undefined;

describe('cloudStoreConfig', () => {
  // The seven reference sub-sections from Requirement 4, with their
  // expected ids and the row ids each must expose.
  // _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  const expectedSections: Array<{ id: string; title: string; rowIds: string[] }> = [
    {
      id: 'network-configuration',
      title: 'Configuration réseau',
      rowIds: ['network-name', 'subnet-name', 'subnet-cidr', 'gateway-ip', 'vlan-id', 'dhcp-range'],
    },
    {
      id: 'server-standalone',
      title: 'Serveur (Standalone)',
      rowIds: [
        'server-role',
        'server-hostname',
        'server-ip-address',
        'server-node-uuid',
        'server-ingress-vip',
        'server-cluster-3-nodes',
        'server-cluster-endpoint-vip',
      ],
    },
    {
      id: 'dns-configuration',
      title: 'Configuration DNS',
      rowIds: [
        'dns-zone-name',
        'dns-delegation-target',
        'dns-primary-server-ip',
        'dns-fallback-server-ip',
      ],
    },
    {
      id: 'ntp-configuration',
      title: 'Configuration NTP',
      rowIds: ['ntp-server-1-ip', 'ntp-server-1-dns-name', 'ntp-server-2-ip', 'ntp-server-2-dns-name'],
    },
    {
      id: 'security-certificates',
      title: 'Sécurité & Certificats',
      rowIds: ['root-ca-certificate'],
    },
    {
      id: 'backup-s3',
      title: 'Sauvegarde (S3)',
      rowIds: [
        'backup-enabled',
        'backup-s3-endpoint-url',
        'backup-s3-region',
        'backup-s3-bucket',
        'backup-s3-access-key',
        'backup-s3-secret-key',
        'backup-path',
      ],
    },
    {
      id: 'client-side-actions',
      title: 'Actions côté client',
      rowIds: [
        'client-network-subnet-created',
        'client-networks-wired-rack-edge',
        'client-bastion-host-provisioned',
        'client-bastion-access-provided',
        'client-dns-zone-delegation-configured',
        'client-s3-backup-bucket-reachable',
      ],
    },
  ];

  it('exposes exactly the seven reference sub-sections in order', () => {
    expect(cloudStoreConfig.sections).toHaveLength(7);
    expect(cloudStoreConfig.sections.map((s) => s.id)).toEqual(
      expectedSections.map((s) => s.id),
    );
    expect(cloudStoreConfig.sections.map((s) => s.title)).toEqual(
      expectedSections.map((s) => s.title),
    );
  });

  it.each(expectedSections)('sub-section "$title" exposes the expected row ids', (expected) => {
    const section = cloudStoreConfig.sections.find((s) => s.id === expected.id);
    expect(section, `sub-section ${expected.id} should exist`).toBeDefined();
    expect(section!.rows.map((r) => r.id)).toEqual(expected.rowIds);
  });

  it('sets the S3 backup-path default value to "cs-backups"', () => {
    const backupPath = findRow(cloudStoreConfig, 'backup-path');
    expect(backupPath).toBeDefined();
    expect(backupPath!.defaultValue).toBe('cs-backups');
  });
});

describe('row id uniqueness', () => {
  // Row ids must be unique within each page so persisted state keys never collide.
  const configs: Array<{ name: string; config: FormConfig }> = [
    { name: 'cloudStoreConfig', config: cloudStoreConfig },
    { name: 'opcpCoreConfig', config: opcpCoreConfig },
    { name: 'landingZoneConfig', config: landingZoneConfig },
  ];

  it.each(configs)('$name has unique row ids', ({ config }) => {
    const ids = allRowIds(config);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
