import type { FormConfig } from './types';

// CloudStore page configuration.
// Derived directly from Requirement 4's seven reference sub-sections.
// Labels are in French; row `id`s are stable slugs, unique within the page.
export const cloudStoreConfig: FormConfig = {
  sections: [
    {
      id: 'network-configuration',
      title: 'Configuration réseau',
      rows: [
        { id: 'network-name', label: 'Nom du réseau' },
        { id: 'subnet-name', label: 'Nom du sous-réseau' },
        { id: 'subnet-cidr', label: 'CIDR du sous-réseau' },
        { id: 'gateway-ip', label: 'IP passerelle' },
        { id: 'vlan-id', label: 'VLAN ID' },
        { id: 'dhcp-range', label: 'Plage DHCP (10 IP exclues)' },
      ],
    },
    {
      id: 'server-standalone',
      title: 'Serveur (Standalone)',
      rows: [
        { id: 'server-role', label: 'Rôle' },
        { id: 'server-hostname', label: "Nom d'hôte" },
        { id: 'server-ip-address', label: 'Adresse IP' },
        { id: 'server-node-uuid', label: 'Node UUID' },
        { id: 'server-ingress-vip', label: 'Ingress VIP (Cilium L2, statique)' },
        { id: 'server-cluster-3-nodes', label: 'Cluster 3 nœuds (optionnel)' },
        { id: 'server-cluster-endpoint-vip', label: 'VIP endpoint cluster' },
      ],
    },
    {
      id: 'dns-configuration',
      title: 'Configuration DNS',
      rows: [
        { id: 'dns-zone-name', label: 'Nom de zone DNS' },
        { id: 'dns-delegation-target', label: 'Cible de délégation (ingress VIP)' },
        { id: 'dns-primary-server-ip', label: 'IP serveur DNS primaire' },
        { id: 'dns-fallback-server-ip', label: 'IP serveur DNS de secours' },
      ],
    },
    {
      id: 'ntp-configuration',
      title: 'Configuration NTP',
      rows: [
        { id: 'ntp-server-1-ip', label: 'IP serveur NTP 1' },
        { id: 'ntp-server-1-dns-name', label: 'Nom DNS serveur NTP 1' },
        { id: 'ntp-server-2-ip', label: 'IP serveur NTP 2' },
        { id: 'ntp-server-2-dns-name', label: 'Nom DNS serveur NTP 2' },
      ],
    },
    {
      id: 'security-certificates',
      title: 'Sécurité & Certificats',
      rows: [{ id: 'root-ca-certificate', label: 'Certificat Root CA' }],
    },
    {
      id: 'backup-s3',
      title: 'Sauvegarde (S3)',
      rows: [
        { id: 'backup-enabled', label: 'Sauvegarde activée' },
        { id: 'backup-s3-endpoint-url', label: 'URL endpoint S3' },
        { id: 'backup-s3-region', label: 'Région' },
        { id: 'backup-s3-bucket', label: 'Bucket' },
        { id: 'backup-s3-access-key', label: "Clé d'accès" },
        { id: 'backup-s3-secret-key', label: 'Clé secrète' },
        { id: 'backup-path', label: 'Chemin de sauvegarde', defaultValue: 'cs-backups' },
      ],
    },
    {
      id: 'client-side-actions',
      title: 'Actions côté client',
      rows: [
        { id: 'client-network-subnet-created', label: 'Réseau/sous-réseau créé' },
        { id: 'client-networks-wired-rack-edge', label: "Réseaux câblés vers l'edge du rack OPCP" },
        { id: 'client-bastion-host-provisioned', label: 'Hôte bastion provisionné' },
        { id: 'client-bastion-access-provided', label: 'Accès bastion fourni' },
        { id: 'client-dns-zone-delegation-configured', label: 'Délégation de zone DNS configurée' },
        {
          id: 'client-s3-backup-bucket-reachable',
          label: 'Bucket de sauvegarde S3 fourni et joignable',
        },
      ],
    },
  ],
};

// OPCP Core page configuration.
// PLACEHOLDER: inferred starter fields to be refined once the exact
// OPCP Core prerequisites are finalized (see design.md). Structurally
// identical to cloudStoreConfig so it reuses the shared TrackingForm.
export const opcpCoreConfig: FormConfig = {
  sections: [
    {
      id: 'opcp-core-general-configuration',
      title: 'Configuration générale',
      rows: [
        { id: 'opcp-core-parameter-1', label: 'Paramètre 1' },
        { id: 'opcp-core-parameter-2', label: 'Paramètre 2' },
        { id: 'opcp-core-parameter-3', label: 'Paramètre 3' },
      ],
    },
  ],
};

// LandingZone page configuration.
// PLACEHOLDER: inferred starter fields to be refined once the exact
// LandingZone prerequisites are finalized (see design.md). Structurally
// identical to cloudStoreConfig so it reuses the shared TrackingForm.
export const landingZoneConfig: FormConfig = {
  sections: [
    {
      id: 'landingzone-configuration',
      title: 'Configuration Landing Zone',
      rows: [
        { id: 'landingzone-parameter-1', label: 'Paramètre 1' },
        { id: 'landingzone-parameter-2', label: 'Paramètre 2' },
        { id: 'landingzone-parameter-3', label: 'Paramètre 3' },
      ],
    },
  ],
};
