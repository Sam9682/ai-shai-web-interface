---
id: object-storage-on-cloud-store/runbooks-sov-751-radosgw-exporter-handover
type: runbook
diataxis: how-to
title: "Handover: SOV-751 — RGW per-bucket usage export for billing (radosgw-exporter)"
owner: sov-copilot
status: approved
publish_target: git
product: cloudstore
---

# Handover: SOV-751 — RGW per-bucket usage export for billing (radosgw-exporter)

**From:** Stephan Hohn · **For:** Boris, Jan · **Date:** 2026-07-08 · **Status: deployed and working on snc-demo**

## Goal (SOV-751)

Export Object Storage usage to Thanos so the billing consumer (SOV-1582, team Lukas/Sayed)
can bill by consumption:

- Metrics: `ceph_rgw_bucket_size_bytes`, `ceph_rgw_bucket_objects`
- Labels: `owner`, `bucket_name`, `bucket_id`
- Health: `ceph_rgw_exporter_success`, `ceph_rgw_exporter_buckets`, `..._last_run_timestamp_seconds`, `..._scrape_duration_seconds`

⚠️ **The exporter runs on every RGW node for HA — each emits identical cluster-global
series.** Consumers MUST dedup: `max by (owner, bucket_name, bucket_id) (ceph_rgw_bucket_size_bytes)`.
A naive `sum` multiplies every bucket by the number of RGW nodes.

Per-**user** usage stats (ops/bytes) are out of scope → separate sub-task under SOV-1627
(needs `rgw_enable_usage_log` + `usage=read` caps).

## The three code pieces

| Piece | Where | State |
|---|---|---|
| Go exporter | `~/mygit/ovh/GOR/radosgw-exporter` (Stash project GOR) | built by CDS; image `pu-snc-paas-docker.rt.ovhcloud.tools/radosgw/radosgw-exporter:0.1.0-3.sha.g750671c` |
| Library roles | `snc/ansible-library`, branch `dev/shohn/SOV-751-Export-Object-Storage-Usage-for-Billing` | **PR #149 open** — needs review/merge |
| Demo deployment | `gridscale/hosts-storage`, branch `snc-demo` (`paas-snc-storage-ansible/`) | deployed 2026-07-08 |

How the pieces fit:

1. `ansible-library/roles/ceph` (tag `rgw`) creates a **read-only admin S3 user**
   `radosgw-exporter` (caps `buckets=read`) with keys **from vault** (vault is the
   source of truth — deliberate, keeps the exporter role decoupled from the cluster;
   an assert in `rgw.yaml` fails loudly if the cluster user's keys ever drift from vault).
2. The prometheus-agent role (tag `radosgw-exporter`) deploys the exporter as a podman
   container on RGW nodes, scrapes it on `localhost:9138`, remote-writes to Thanos.
   Note: the demo repo uses a **local fork** `roles/ceph_prometheus_agent` (not the
   library role) — both got the same changes; keep them in sync or consolidate later.
3. The exporter queries the **RGW Admin Ops API** (`GET /admin/bucket?stats=true`) on the
   node-local admin-L2 RGW (port 7491) with a 15m TTL cache.

## Credentials

- Keys for the `radosgw-exporter` user are vault-encrypted in
  `paas-snc-storage-ansible/secret_vars_demo.yml`
  (`rgw_metrics_user_access_key` / `rgw_metrics_user_secret_key`,
  mapped to `radosgw_exporter_access_key/secret_key`).
- Vault id `paas-snc-storage-demo`; password file (on Stephan's machine):
  `~/.ansible/.paas-snc-storage-demo-vault-pass`. Get the password via the usual channel.
- On the nodes the keys live in `/etc/radosgw-exporter/env` (root, 0600).

## Deploy / redeploy

```bash
cd paas-snc-storage-ansible
# metrics user (idempotent, part of the rgw tag)
ansible-playbook deploy-ceph.yml -i paas-object-host.ini -e @secret_vars_demo.yml \
  --vault-id paas-snc-storage-demo@<pass-file> --tags rgw
# exporter + scrape config
ansible-playbook deploy-ceph.yml -i paas-object-host.ini -e @secret_vars_demo.yml \
  --vault-id paas-snc-storage-demo@<pass-file> --tags radosgw-exporter,prometheus
```

## Verify

On an RGW node (exporter listens on **loopback only**, `127.0.0.1:9138`):

```bash
curl -s http://127.0.0.1:9138/metrics | grep ^ceph_rgw
systemctl status radosgw-exporter-container
journalctl -u radosgw-exporter-container -f
```

From outside via jump host: `ssh -J debian@51.83.26.72 debian@198.18.90.47 "curl -s http://127.0.0.1:9138/metrics | grep ^ceph_rgw"`

Nodes: 01 = 198.18.90.135, 02 = 198.18.90.47, 03 = 198.18.89.208.
Expected on 02/03: `ceph_rgw_exporter_success 1` and per-bucket series. In Thanos:
`max by (owner, bucket_name, bucket_id) (ceph_rgw_bucket_size_bytes)`.

## Gotchas we hit (so you don't re-debug them)

1. **`NoSuchBucket` from the Admin API**: RGW vhost-routing parses the `Host:` header
   against `rgw_dns_name`, so `https://localhost:7491` is interpreted as bucket
   "localhost". Fix (in the roles): endpoint uses `rgw_dns_name_L2`
   (`s3.admin.region.demo.paas.pu-snc.ovh:7491`) and the container maps that name to
   `127.0.0.1` via podman `--add-host`. Traffic stays node-local.
2. **Registry auth**: `podman run` now uses `--authfile=/etc/ceph/podman-auth.json`
   (cephadm login file) so on-demand pulls authenticate; cached images still start when
   the registry is down.
3. **Empty creds guard**: the roles assert `radosgw_exporter_access_key/secret_key` are
   non-empty before deploying — an empty env file otherwise crash-loops the container.
4. **`/var/lib/prometheus` ownership**: agent mode needs to mkdir `data-agent` as user
   `prometheus`; a root-owned dir crash-loops the service. Ownership task now in both roles.
5. **Jinja trap**: RGW user-info JSON has a field named `keys` — use `['keys']` indexing,
   `.keys` resolves to the Python dict method.

## Open items

1. **Node 01 exports `success 0`** — it has **no `rgw` cephadm label** (`ceph orch host ls`),
   so no RGW daemons run there and the exporter has no local endpoint. Decide: add the
   label (cephadm then deploys admin-l2/user-l3) **or** set `radosgw_exporter_enabled=false`
   for that host. Related: node 01 logs **correctable L3-cache machine-check errors**
   (`MC255`, HPE DL325 Gen11, serial CZJ3331FZX) — syslog broadcasts of these randomly
   corrupt ansible module output (`Invalid control character` on fact gathering; retry
   works). The host likely needs a hardware check; possibly it was drained on purpose.
2. **Review/merge ansible-library PR #149**
   (https://stash.ovh.net/projects/SNC/repos/ansible-library/pull-requests/149).
3. **Answer SOV-751 comments**: Sayed asked how the ceph exporter works / if there's a
   fork like openstack-exporter → point him at `GOR/radosgw-exporter`. Lukas's ask for
   `domain_id`/`tenant_enabled` labels was already declined (info not available at object
   storage level).
4. **Consolidate roles**: `paas-snc-storage-ansible/roles/ceph_prometheus_agent` is a
   diverged copy of `ansible-library/roles/prometheus_agent`; changes currently need to be
   made twice.
5. Ceph image on demo was switched to
   `custom-ceph/ceph/ceph:gridscale-v20.2.1-sse-s3-kmip-v1` in `paas-object-host.ini` —
   takes effect on the next bootstrap/upgrade run only.

## Timeline / references

- Jira: SOV-751 (spec + prototype-build comment from 2026-07-01), consumer SOV-1582, follow-up SOV-1627
- CDS build: https://cds.ovhcloud.tools/project/GOR/run/064b7708-2457-4cb4-a4a5-cee7a3e2e81a
- Commits: ansible-library `a1a5187` (fixes above), hosts-storage `bd62ab3` (demo wiring), both pushed 2026-07-08
