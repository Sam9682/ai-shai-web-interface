import type { FormConfig, QuestionFormConfig } from './types';

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

// ===========================================================================
// Question-archetype configs (QuestionFormConfig)
// ===========================================================================
// These four configs drive the new Question_Answer_Page archetype rendered by
// QuestionAnswerForm (a sibling of TrackingForm). Each row exposes two
// read-only question columns, a Mandatory/Optional marker, an example value,
// and a Comments/Details hint. The editable Client answer is persisted
// separately (see prerequisitesService / ClientAnswers).
//
// NOTE: All rows below are PLACEHOLDER/EXAMPLE scaffolding (Req 7.2). The
// definitive workbook question text and values will be supplied later and
// should replace these rows without changing the QuestionFormConfig shape.
// Row ids are stable and unique within each page (Req 7.3).
//
// NAMING NOTE: the legacy `cloudStoreConfig: FormConfig` above is still
// consumed by TrackingForm/CloudStorePage/TrackingForm.test.tsx and MUST keep
// its name until TrackingForm is retired (out of scope). The CloudStore
// question variant is therefore exported here as `cloudStoreQuestionConfig`.
// Task 8.2 retargets CloudStorePage to render QuestionAnswerForm with it.

// Network Checklist — access, power, network, services (IPs, VLANs, SFP).
export const networkChecklistConfig: QuestionFormConfig = {
  sections: [
    {
      id: 'nc-access',
      title: 'Accès & Alimentation',
      rows: [
        {
          id: 'nc-datacenter-access',
          questionPrimary: 'Accès au datacenter accordé ?',
          questionSecondary: 'Badges / escorte / fenêtre de maintenance',
          mandatory: true,
          exampleValue: 'ex. Badge #A123, 08h-18h',
          commentsHint: 'Précisez la procédure et les contacts sur site.',
        },
        {
          id: 'nc-rack-power',
          questionPrimary: 'Alimentation du rack disponible ?',
          questionSecondary: 'PDU redondées / ampérage',
          mandatory: true,
          exampleValue: 'ex. 2x PDU 32A',
          commentsHint: 'Indiquez la puissance disponible et la redondance.',
        },
      ],
    },
    {
      id: 'nc-network',
      title: 'Réseau & Services',
      rows: [
        {
          id: 'nc-uplink-vlan',
          questionPrimary: 'VLAN uplink attribué ?',
          questionSecondary: 'ID VLAN et trunk',
          mandatory: true,
          exampleValue: 'ex. VLAN 100',
          commentsHint: 'Fournissez le VLAN ID et la configuration du trunk.',
        },
        {
          id: 'nc-management-ips',
          questionPrimary: 'Plage IP de management réservée ?',
          questionSecondary: 'CIDR / passerelle',
          mandatory: true,
          exampleValue: 'ex. 10.0.10.0/24',
          commentsHint: 'Réservez au moins 10 IP consécutives.',
        },
        {
          id: 'nc-sfp-compatibility',
          questionPrimary: 'Compatibilité SFP validée ?',
          questionSecondary: 'Type de transceiver / fibre',
          mandatory: false,
          exampleValue: 'ex. SFP+ 10G LR',
          commentsHint: 'Précisez le modèle de SFP et le type de fibre.',
        },
      ],
    },
  ],
};

// Core Control Plane — network & service config (IPs, DNS, NTP, certs,
// backup, LDAP). Formerly "OPCP Core".
export const coreControlPlaneConfig: QuestionFormConfig = {
  sections: [
    {
      id: 'ccp-network',
      title: 'Réseau',
      rows: [
        {
          id: 'ccp-api-vip',
          questionPrimary: 'VIP du plan de contrôle ?',
          questionSecondary: 'IP statique / VLAN',
          mandatory: true,
          exampleValue: 'ex. 10.0.20.10',
          commentsHint: "L'IP doit être hors de la plage DHCP.",
        },
        {
          id: 'ccp-node-subnet',
          questionPrimary: 'Sous-réseau des nœuds ?',
          questionSecondary: 'CIDR / passerelle',
          mandatory: true,
          exampleValue: 'ex. 10.0.20.0/24',
          commentsHint: 'Indiquez la passerelle et le masque.',
        },
      ],
    },
    {
      id: 'ccp-services',
      title: 'Services',
      rows: [
        {
          id: 'ccp-dns-servers',
          questionPrimary: 'Serveurs DNS ?',
          questionSecondary: 'Primaire / secondaire',
          mandatory: true,
          exampleValue: 'ex. 10.0.0.53, 10.0.0.54',
          commentsHint: 'Fournissez au moins deux résolveurs.',
        },
        {
          id: 'ccp-ntp-servers',
          questionPrimary: 'Serveurs NTP ?',
          questionSecondary: 'IP ou nom DNS',
          mandatory: true,
          exampleValue: 'ex. ntp1.example.com',
          commentsHint: 'La synchronisation horaire est requise.',
        },
        {
          id: 'ccp-root-ca',
          questionPrimary: 'Certificat Root CA fourni ?',
          questionSecondary: 'Format PEM',
          mandatory: true,
          exampleValue: 'ex. root-ca.pem',
          commentsHint: 'Ne collez pas de clé privée ici.',
        },
        {
          id: 'ccp-backup-target',
          questionPrimary: 'Cible de sauvegarde disponible ?',
          questionSecondary: 'Endpoint S3 / bucket',
          mandatory: false,
          exampleValue: 'ex. s3://cs-backups',
          commentsHint: 'Précisez la région et le bucket.',
        },
        {
          id: 'ccp-ldap-endpoint',
          questionPrimary: 'Annuaire LDAP disponible ?',
          questionSecondary: 'URL / base DN',
          mandatory: false,
          exampleValue: 'ex. ldaps://ldap.example.com',
          commentsHint: 'Fournissez le base DN et le compte de service.',
        },
      ],
    },
  ],
};

// CloudStore (question variant) — network, server, DNS, NTP, certificates,
// backup, client actions. Exported as `cloudStoreQuestionConfig` to avoid a
// collision with the legacy `cloudStoreConfig: FormConfig` above.
export const cloudStoreQuestionConfig: QuestionFormConfig = {
  sections: [
    {
      id: 'cs-network',
      title: 'Réseau',
      rows: [
        {
          id: 'cs-subnet-cidr',
          questionPrimary: 'CIDR du sous-réseau ?',
          questionSecondary: 'Passerelle / VLAN',
          mandatory: true,
          exampleValue: 'ex. 10.0.30.0/24',
          commentsHint: 'Excluez 10 IP pour les VIP statiques.',
        },
        {
          id: 'cs-ingress-vip',
          questionPrimary: 'Ingress VIP réservée ?',
          questionSecondary: 'IP statique (Cilium L2)',
          mandatory: true,
          exampleValue: 'ex. 10.0.30.10',
          commentsHint: "Doit être hors plage DHCP.",
        },
      ],
    },
    {
      id: 'cs-servers',
      title: 'Serveurs',
      rows: [
        {
          id: 'cs-server-hostname',
          questionPrimary: "Nom d'hôte du serveur ?",
          questionSecondary: 'FQDN',
          mandatory: true,
          exampleValue: 'ex. cs-node-01',
          commentsHint: 'Respectez la convention de nommage.',
        },
      ],
    },
    {
      id: 'cs-dns-ntp',
      title: 'DNS & NTP',
      rows: [
        {
          id: 'cs-dns-zone',
          questionPrimary: 'Zone DNS déléguée ?',
          questionSecondary: 'Cible de délégation',
          mandatory: true,
          exampleValue: 'ex. cs.example.com',
          commentsHint: 'Pointez la délégation vers l’ingress VIP.',
        },
        {
          id: 'cs-ntp-server',
          questionPrimary: 'Serveur NTP ?',
          questionSecondary: 'IP ou nom DNS',
          mandatory: true,
          exampleValue: 'ex. ntp.example.com',
          commentsHint: 'La synchronisation horaire est requise.',
        },
      ],
    },
    {
      id: 'cs-security',
      title: 'Certificats & Sauvegarde',
      rows: [
        {
          id: 'cs-root-ca',
          questionPrimary: 'Certificat Root CA fourni ?',
          questionSecondary: 'Format PEM',
          mandatory: true,
          exampleValue: 'ex. root-ca.pem',
          commentsHint: 'Ne collez pas de secret ici.',
        },
        {
          id: 'cs-backup-bucket',
          questionPrimary: 'Bucket de sauvegarde S3 ?',
          questionSecondary: 'Endpoint / région',
          mandatory: false,
          exampleValue: 'ex. s3://cs-backups',
          commentsHint: 'Le bucket doit être joignable depuis l’edge.',
        },
      ],
    },
    {
      id: 'cs-client-actions',
      title: 'Actions côté client',
      rows: [
        {
          id: 'cs-bastion-provisioned',
          questionPrimary: 'Hôte bastion provisionné ?',
          questionSecondary: 'Accès fourni',
          mandatory: true,
          exampleValue: 'ex. Oui',
          commentsHint: 'Fournissez l’accès via un canal sécurisé.',
        },
      ],
    },
  ],
};

// VCF — real customer-input parameters extracted from
// `docs/to_publish/OPCP - CloudStore VCF parameters_0.2.pdf`.
// Grouped into the Management and Workload domain sub-sections. Row ids are
// domain-prefixed (`vcf-mgmt-*` / `vcf-wld-*`) so parameter names that repeat
// across domains stay unique page-wide and previously saved answers resolve.
// CloudStore-provided params (`node_uuids`, `bootstrap_node_uuids`) are excluded.
// `mandatory = false` only for the four Passwords & Secrets rows (generated
// when left empty) and `vcf-mgmt-esxi-setup-script` (non-Broadcom hardware only).
export const vcfConfig: QuestionFormConfig = {
  sections: [
    {
      id: 'vcf-mgmt-network',
      title: 'Domaine de management — Réseau',
      rows: [
        {
          id: 'vcf-mgmt-network-name',
          questionPrimary: 'Nom du réseau de management',
          mandatory: true,
          exampleValue: 'vcf_network',
        },
        {
          id: 'vcf-mgmt-subnet-name',
          questionPrimary: 'Nom du sous-réseau existant (/22 avec DHCP)',
          questionSecondary: 'Sous-réseau existant en /22 avec DHCP',
          mandatory: true,
          exampleValue: 'mgmt',
        },
        {
          id: 'vcf-mgmt-network-vlan-id',
          questionPrimary: 'VLAN ID du réseau de management',
          mandatory: true,
          exampleValue: '2040',
        },
        {
          id: 'vcf-mgmt-dhcp-ip',
          questionPrimary: 'IP DHCP du réseau de management',
          mandatory: true,
          exampleValue: '10.105.40.1',
        },
        {
          id: 'vcf-mgmt-customer-network-name',
          questionPrimary: 'Nom du réseau client',
          mandatory: true,
          exampleValue: 'customerapi-network',
        },
        {
          id: 'vcf-mgmt-customer-network-dhcp-ip',
          questionPrimary: 'IP DHCP du réseau client',
          mandatory: true,
        },
        {
          id: 'vcf-mgmt-external-network-id',
          questionPrimary: 'ID du réseau externe',
          mandatory: true,
        },
        {
          id: 'vcf-mgmt-vmotion-network-id',
          questionPrimary: 'ID du réseau vMotion',
          mandatory: true,
        },
        {
          id: 'vcf-mgmt-vmotion-subnet-id',
          questionPrimary: 'ID du sous-réseau vMotion',
          mandatory: true,
        },
        {
          id: 'vcf-mgmt-vmotion-subnet-range',
          questionPrimary: 'Plage du sous-réseau vMotion',
          mandatory: true,
          exampleValue: '10.105.44.0/24',
        },
        {
          id: 'vcf-mgmt-vmotion-vlan-id',
          questionPrimary: 'VLAN ID vMotion',
          mandatory: true,
          exampleValue: '2044',
        },
        {
          id: 'vcf-mgmt-vsan-network-id',
          questionPrimary: 'ID du réseau vSAN',
          mandatory: true,
        },
        {
          id: 'vcf-mgmt-vsan-subnet-id',
          questionPrimary: 'ID du sous-réseau vSAN',
          mandatory: true,
        },
        {
          id: 'vcf-mgmt-vsan-subnet-range',
          questionPrimary: 'Plage du sous-réseau vSAN',
          mandatory: true,
          exampleValue: '10.105.45.0/24',
        },
        {
          id: 'vcf-mgmt-vsan-vlan-id',
          questionPrimary: 'VLAN ID vSAN',
          mandatory: true,
          exampleValue: '2045',
        },
        {
          id: 'vcf-mgmt-overlay-network-id',
          questionPrimary: 'ID du réseau overlay',
          mandatory: true,
        },
        {
          id: 'vcf-mgmt-overlay-subnet-id',
          questionPrimary: 'ID du sous-réseau overlay',
          mandatory: true,
        },
        {
          id: 'vcf-mgmt-overlay-subnet-range',
          questionPrimary: 'Plage du sous-réseau overlay',
          mandatory: true,
          exampleValue: '10.105.46.0/24',
        },
        {
          id: 'vcf-mgmt-overlay-vlan-id',
          questionPrimary: 'VLAN ID overlay',
          mandatory: true,
          exampleValue: '2046',
        },
      ],
    },
    {
      id: 'vcf-mgmt-dns',
      title: 'Domaine de management — DNS',
      rows: [
        {
          id: 'vcf-mgmt-dns-zone',
          questionPrimary: 'Zone DNS',
          mandatory: true,
          exampleValue: 'staging.cloudstore.ovh',
        },
        {
          id: 'vcf-mgmt-dns-server',
          questionPrimary: 'Serveur DNS',
          mandatory: true,
        },
        {
          id: 'vcf-mgmt-bootstrap-dns-server',
          questionPrimary: 'Serveur DNS de bootstrap',
          mandatory: true,
        },
      ],
    },
    {
      id: 'vcf-mgmt-auth',
      title: 'Domaine de management — Authentification & OpenStack',
      rows: [
        {
          id: 'vcf-mgmt-image-name',
          questionPrimary: "Nom de l'image",
          mandatory: true,
          exampleValue: 'esxi-9.0.1-user-data',
        },
        {
          id: 'vcf-mgmt-flavor-name',
          questionPrimary: 'Nom du flavor',
          mandatory: true,
          exampleValue: 'vcf-flavor',
        },
        {
          id: 'vcf-mgmt-vcf-deployer-url',
          questionPrimary: 'URL du déployeur VCF (.ova)',
          mandatory: true,
          exampleValue: 'https://.../deployer.ova',
        },
        {
          id: 'vcf-mgmt-vcf-deployer-ip',
          questionPrimary: 'IP du déployeur VCF',
          mandatory: true,
        },
      ],
    },
    {
      id: 'vcf-mgmt-secrets',
      title: 'Domaine de management — Mots de passe & secrets',
      rows: [
        {
          id: 'vcf-mgmt-master-password',
          questionPrimary: 'Mot de passe maître VCF',
          mandatory: false,
          commentsHint:
            'Lettres, chiffres et au moins un caractère spécial parmi @!#$%?^. Généré si laissé vide.',
        },
        {
          id: 'vcf-mgmt-esxi-root-password',
          questionPrimary: 'Mot de passe root ESXi',
          mandatory: false,
          commentsHint: 'Généré si laissé vide.',
        },
        {
          id: 'vcf-mgmt-appliance-password',
          questionPrimary: "Mot de passe de l'appliance",
          mandatory: false,
          commentsHint: 'Généré si laissé vide.',
        },
        {
          id: 'vcf-mgmt-appliance-xapikey',
          questionPrimary: "Clé X-API de l'appliance",
          mandatory: false,
          commentsHint: 'Généré si laissé vide.',
        },
      ],
    },
    {
      id: 'vcf-mgmt-misc',
      title: 'Domaine de management — Divers',
      rows: [
        {
          id: 'vcf-mgmt-ntp-server',
          questionPrimary: 'Serveur NTP',
          mandatory: true,
          exampleValue: '10.3.2.11',
        },
        {
          id: 'vcf-mgmt-vcf-subdomain',
          questionPrimary: 'Sous-domaine VCF',
          mandatory: true,
          exampleValue: 'vcf',
        },
        {
          id: 'vcf-mgmt-esxi-setup-script',
          questionPrimary: 'Script de configuration ESXi',
          mandatory: false,
          commentsHint: 'Uniquement pour matériel non validé Broadcom.',
        },
        {
          id: 'vcf-mgmt-keycloak-clusterissuer',
          questionPrimary: 'ClusterIssuer Keycloak',
          mandatory: true,
          exampleValue: 'customer-issuer',
        },
      ],
    },
    {
      id: 'vcf-wld-general',
      title: 'Domaine workload — Général',
      rows: [
        {
          id: 'vcf-wld-workload-domain-num',
          questionPrimary: 'Rang du domaine workload (1..23)',
          mandatory: true,
          exampleValue: '1',
        },
      ],
    },
    {
      id: 'vcf-wld-network',
      title: 'Domaine workload — Réseau',
      rows: [
        {
          id: 'vcf-wld-external-network-id',
          questionPrimary: 'ID du réseau externe',
          mandatory: true,
        },
        {
          id: 'vcf-wld-vmotion-network-id',
          questionPrimary: 'ID du réseau vMotion',
          mandatory: true,
        },
        {
          id: 'vcf-wld-vmotion-subnet-id',
          questionPrimary: 'ID du sous-réseau vMotion',
          mandatory: true,
        },
        {
          id: 'vcf-wld-vmotion-subnet-range',
          questionPrimary: 'Plage du sous-réseau vMotion',
          mandatory: true,
          exampleValue: '10.105.47.0/24',
        },
        {
          id: 'vcf-wld-vmotion-vlan-id',
          questionPrimary: 'VLAN ID vMotion',
          mandatory: true,
          exampleValue: '2047',
        },
        {
          id: 'vcf-wld-vsan-network-id',
          questionPrimary: 'ID du réseau vSAN',
          mandatory: true,
        },
        {
          id: 'vcf-wld-vsan-subnet-id',
          questionPrimary: 'ID du sous-réseau vSAN',
          mandatory: true,
        },
        {
          id: 'vcf-wld-vsan-subnet-range',
          questionPrimary: 'Plage du sous-réseau vSAN',
          mandatory: true,
          exampleValue: '10.105.48.0/24',
        },
        {
          id: 'vcf-wld-vsan-vlan-id',
          questionPrimary: 'VLAN ID vSAN',
          mandatory: true,
        },
        {
          id: 'vcf-wld-overlay-network-id',
          questionPrimary: 'ID du réseau overlay',
          mandatory: true,
        },
        {
          id: 'vcf-wld-overlay-subnet-id',
          questionPrimary: 'ID du sous-réseau overlay',
          mandatory: true,
        },
        {
          id: 'vcf-wld-overlay-subnet-range',
          questionPrimary: 'Plage du sous-réseau overlay',
          mandatory: true,
          exampleValue: '10.105.49.0/24',
        },
        {
          id: 'vcf-wld-overlay-vlan-id',
          questionPrimary: 'VLAN ID overlay',
          mandatory: true,
          exampleValue: '2049',
        },
      ],
    },
  ],
};
