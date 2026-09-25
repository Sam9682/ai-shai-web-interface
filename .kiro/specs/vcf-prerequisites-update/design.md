# Design Document

## Overview

This feature delivers two related changes to the OPCP installation prerequisites area.

**Part A — Real VCF parameters.** The VCF prerequisites page is driven by `vcfConfig: QuestionFormConfig` in `frontend/src/components/prerequisites/configs.ts` and rendered by `QuestionAnswerForm`. Today `vcfConfig` holds placeholder rows (management VLAN, vMotion VLAN, DNS/NTP servers, certificates, automation script). Part A replaces those placeholders with the real customer-input parameters extracted from `docs/to_publish/OPCP - CloudStore VCF parameters_0.2.pdf`, keeping the `QuestionFormConfig`/`QuestionAnswerForm` archetype and the French labeling convention. Only parameters with a customer-supplied `Value:` field are included; parameters marked "Provided by the CloudStore / keep default" are excluded.

**Part B — Fix the create-Installation failure.** The frontend (`prerequisitesService.ts` + `InstallationListPage.tsx`) already calls installation-scoped backend paths, but the backend was never brought in line with the parent spec `multi-instance-opcp-prerequisites`. The migration `migrations/versions/20260223_0000_multi_instance_opcp_prerequisites_...py` already created the `installations` table and re-scoped content/answers by `installation_id` (dropping `user_id` from answers — answers are now shared per installation, last-write-wins). The backend code, however, still uses slug-PK content, `user_id`-scoped answers, and exposes only single-instance routes. There is no `app/models/installation.py`, no Installation schemas, and no installations router. Part B implements the backend to **match the existing migration schema** — it does **not** add a new migration.

The scanner log noise in the environment (PostgreSQL "invalid startup packet", nginx malformed-TLS 400, uvicorn "Invalid HTTP request received") is internet port-scanner traffic and is **out of scope**.

## Architecture

```
Part A (frontend only)
  configs.ts  ── vcfConfig: QuestionFormConfig ──▶ QuestionAnswerForm (unchanged contract)

Part B (backend only — frontend already done)
  InstallationListPage.tsx ─┐
  prerequisitesService.ts ──┤  HTTP  /api/prerequisites/installations[/{id}[/{slug}/...]]
                            ▼
  app/prerequisites/router.py ──▶ schemas.py ──▶ app/models/{installation,prerequisite}.py
                            │
                            ▼
  installations / prerequisite_content / prerequisite_answers  (tables from existing migration)
```

- **Part A is frontend-only.** No backend, schema, or rendering-contract change. `QuestionAnswerForm` already consumes `QuestionFormConfig`.
- **Part B is backend-only.** The frontend is already implemented: `InstallationListPage.tsx` and `prerequisitesService.ts` already call the installation-scoped paths. Only the backend needs work to satisfy that contract.
- Part B **matches** the parent spec `multi-instance-opcp-prerequisites` design and the schema already created by its migration. It does **not** duplicate or re-create the migration.

---

## Part A — VCF Configuration (`vcfConfig`)

### Design rules

- Type stays `QuestionFormConfig`; each row conforms to the `QuestionRow` contract: `id`, `questionPrimary`, optional `questionSecondary`, `mandatory`, optional `exampleValue`, optional `commentsHint`.
- Labels are French, consistent with the existing configs.
- Row `id`s are prefixed by domain (`vcf-mgmt-*`, `vcf-wld-*`) because some parameter names repeat across the Management and Workload domains; this guarantees page-wide uniqueness and keeps saved answers resolvable.
- `mandatory = true` for all rows **except** the four Passwords & Secrets rows (generated when left empty) and `esxi_setup_script` (only relevant for non-Broadcom-validated hardware) → `mandatory = false`.
- Excluded (CloudStore-provided / keep default): `node_uuids` and `bootstrap_node_uuids` (Management/Hosts), `node_uuids` (Workload/General).

### Sections

| Section id | Title (FR) | Domain |
|---|---|---|
| `vcf-mgmt-network` | Domaine de management — Réseau | Management |
| `vcf-mgmt-dns` | Domaine de management — DNS | Management |
| `vcf-mgmt-auth` | Domaine de management — Authentification & OpenStack | Management |
| `vcf-mgmt-secrets` | Domaine de management — Mots de passe & secrets | Management |
| `vcf-mgmt-misc` | Domaine de management — Divers | Management |
| `vcf-wld-general` | Domaine workload — Général | Workload |
| `vcf-wld-network` | Domaine workload — Réseau | Workload |

### Row-by-row configuration

#### Section `vcf-mgmt-network` — Domaine de management — Réseau

| Row id | questionPrimary (FR) | mandatory | exampleValue |
|---|---|---|---|
| `vcf-mgmt-network-name` | Nom du réseau de management | true | `vcf_network` |
| `vcf-mgmt-subnet-name` | Nom du sous-réseau existant (/22 avec DHCP) | true | `mgmt` |
| `vcf-mgmt-network-vlan-id` | VLAN ID du réseau de management | true | `2040` |
| `vcf-mgmt-dhcp-ip` | IP DHCP du réseau de management | true | `10.105.40.1` |
| `vcf-mgmt-customer-network-name` | Nom du réseau client | true | `customerapi-network` |
| `vcf-mgmt-customer-network-dhcp-ip` | IP DHCP du réseau client | true | — |
| `vcf-mgmt-external-network-id` | ID du réseau externe | true | — |
| `vcf-mgmt-vmotion-network-id` | ID du réseau vMotion | true | — |
| `vcf-mgmt-vmotion-subnet-id` | ID du sous-réseau vMotion | true | — |
| `vcf-mgmt-vmotion-subnet-range` | Plage du sous-réseau vMotion | true | `10.105.44.0/24` |
| `vcf-mgmt-vmotion-vlan-id` | VLAN ID vMotion | true | `2044` |
| `vcf-mgmt-vsan-network-id` | ID du réseau vSAN | true | — |
| `vcf-mgmt-vsan-subnet-id` | ID du sous-réseau vSAN | true | — |
| `vcf-mgmt-vsan-subnet-range` | Plage du sous-réseau vSAN | true | `10.105.45.0/24` |
| `vcf-mgmt-vsan-vlan-id` | VLAN ID vSAN | true | `2045` |
| `vcf-mgmt-overlay-network-id` | ID du réseau overlay | true | — |
| `vcf-mgmt-overlay-subnet-id` | ID du sous-réseau overlay | true | — |
| `vcf-mgmt-overlay-subnet-range` | Plage du sous-réseau overlay | true | `10.105.46.0/24` |
| `vcf-mgmt-overlay-vlan-id` | VLAN ID overlay | true | `2046` |

#### Section `vcf-mgmt-dns` — Domaine de management — DNS

| Row id | questionPrimary (FR) | mandatory | exampleValue |
|---|---|---|---|
| `vcf-mgmt-dns-zone` | Zone DNS | true | `staging.cloudstore.ovh` |
| `vcf-mgmt-dns-server` | Serveur DNS | true | — |
| `vcf-mgmt-bootstrap-dns-server` | Serveur DNS de bootstrap | true | — |

#### Section `vcf-mgmt-auth` — Domaine de management — Authentification & OpenStack

| Row id | questionPrimary (FR) | mandatory | exampleValue |
|---|---|---|---|
| `vcf-mgmt-image-name` | Nom de l'image | true | `esxi-9.0.1-user-data` |
| `vcf-mgmt-flavor-name` | Nom du flavor | true | `vcf-flavor` |
| `vcf-mgmt-vcf-deployer-url` | URL du déployeur VCF (.ova) | true | `https://.../deployer.ova` |
| `vcf-mgmt-vcf-deployer-ip` | IP du déployeur VCF | true | — |

#### Section `vcf-mgmt-secrets` — Domaine de management — Mots de passe & secrets

All rows `mandatory = false` (generated when left empty).

| Row id | questionPrimary (FR) | mandatory | commentsHint (FR) |
|---|---|---|---|
| `vcf-mgmt-master-password` | Mot de passe maître VCF | false | Lettres, chiffres et au moins un caractère spécial parmi `@!#$%?^`. Généré si laissé vide. |
| `vcf-mgmt-esxi-root-password` | Mot de passe root ESXi | false | Généré si laissé vide. |
| `vcf-mgmt-appliance-password` | Mot de passe de l'appliance | false | Généré si laissé vide. |
| `vcf-mgmt-appliance-xapikey` | Clé X-API de l'appliance | false | Généré si laissé vide. |

#### Section `vcf-mgmt-misc` — Domaine de management — Divers

| Row id | questionPrimary (FR) | mandatory | exampleValue |
|---|---|---|---|
| `vcf-mgmt-ntp-server` | Serveur NTP | true | `10.3.2.11` |
| `vcf-mgmt-vcf-subdomain` | Sous-domaine VCF | true | `vcf` |
| `vcf-mgmt-esxi-setup-script` | Script de configuration ESXi | false | — (uniquement pour matériel non validé Broadcom) |
| `vcf-mgmt-keycloak-clusterissuer` | ClusterIssuer Keycloak | true | `customer-issuer` |

#### Section `vcf-wld-general` — Domaine workload — Général

| Row id | questionPrimary (FR) | mandatory | exampleValue |
|---|---|---|---|
| `vcf-wld-workload-domain-num` | Rang du domaine workload (1..23) | true | `1` |

#### Section `vcf-wld-network` — Domaine workload — Réseau

| Row id | questionPrimary (FR) | mandatory | exampleValue |
|---|---|---|---|
| `vcf-wld-external-network-id` | ID du réseau externe | true | — |
| `vcf-wld-vmotion-network-id` | ID du réseau vMotion | true | — |
| `vcf-wld-vmotion-subnet-id` | ID du sous-réseau vMotion | true | — |
| `vcf-wld-vmotion-subnet-range` | Plage du sous-réseau vMotion | true | `10.105.47.0/24` |
| `vcf-wld-vmotion-vlan-id` | VLAN ID vMotion | true | `2047` |
| `vcf-wld-vsan-network-id` | ID du réseau vSAN | true | — |
| `vcf-wld-vsan-subnet-id` | ID du sous-réseau vSAN | true | — |
| `vcf-wld-vsan-subnet-range` | Plage du sous-réseau vSAN | true | `10.105.48.0/24` |
| `vcf-wld-vsan-vlan-id` | VLAN ID vSAN | true | — |
| `vcf-wld-overlay-network-id` | ID du réseau overlay | true | — |
| `vcf-wld-overlay-subnet-id` | ID du sous-réseau overlay | true | — |
| `vcf-wld-overlay-subnet-range` | Plage du sous-réseau overlay | true | `10.105.49.0/24` |
| `vcf-wld-overlay-vlan-id` | VLAN ID overlay | true | `2049` |

`questionSecondary` and `commentsHint` are populated from the reference document's descriptive guidance where available (e.g. "sous-réseau existant en /22 avec DHCP" for `vcf-mgmt-subnet-name`, the charset note for `vcf-mgmt-master-password`, and the hardware caveat for `vcf-mgmt-esxi-setup-script`).

---

## Part B — Backend (installation-scoped)

The frontend contract is fixed; the backend must satisfy it. All code below matches the existing migration schema — no new migration is created.

### Data models

#### `app/models/installation.py` (new)

```python
class Installation(Base):
    __tablename__ = "installations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
                server_default=text("gen_random_uuid()"))
    project_name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(),
                        onupdate=func.now(), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    content = relationship("PrerequisiteContent", back_populates="installation",
                           cascade="all, delete-orphan")
    answers = relationship("PrerequisiteAnswer", back_populates="installation",
                           cascade="all, delete-orphan")
```

Exported via `app/models/__init__.py` alongside the existing models.

#### `app/models/prerequisite.py` (revised — must match migration)

`PrerequisiteContent`:
- surrogate `id` UUID primary key (was slug-PK)
- `installation_id` UUID FK → `installations.id`, `NOT NULL`, `ON DELETE CASCADE`, indexed
- `UniqueConstraint(installation_id, slug)`
- keep `slug`, `content`, `updated_at`, `updated_by`
- `installation = relationship("Installation", back_populates="content")`

`PrerequisiteAnswer`:
- **drop** `user_id` and the `uq_prerequisite_answers_user_slug_row` constraint
- add `installation_id` UUID FK → `installations.id`, `NOT NULL`, `ON DELETE CASCADE`, indexed
- `UniqueConstraint(installation_id, slug, row_id)`
- `Index(installation_id, slug)`
- keep `answer`, `updated_at`, `updated_by`
- `installation = relationship("Installation", back_populates="answers")`

Answers are **shared per installation** (no per-user scoping); saves are last-write-wins, recording `updated_by`/`updated_at`.

### Schemas (`app/prerequisites/schemas.py`)

```python
class InstallationCreateRequest(BaseModel):
    project_name: str = Field(min_length=1)

    @field_validator("project_name")
    @classmethod
    def _strip_non_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("project_name must not be blank")
        return v

class InstallationUpdateRequest(InstallationCreateRequest):
    pass

class InstallationResponse(BaseModel):
    id: UUID
    project_name: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class InstallationListResponse(BaseModel):
    installations: list[InstallationResponse]
```

### Endpoints (`app/prerequisites/router.py`)

All under `/api/prerequisites` (router already registered in `app/main.py`).

| Method & path | Auth dependency | Request | Response |
|---|---|---|---|
| `GET /installations` | `get_current_user` | — | `InstallationListResponse` `{installations:[...]}` |
| `POST /installations` | `get_administrator` | `InstallationCreateRequest` | `InstallationResponse` |
| `PUT /installations/{installation_id}` | `get_administrator` | `InstallationUpdateRequest` | `InstallationResponse` |
| `DELETE /installations/{installation_id}` | `get_administrator` | — | 204 (cascade content + answers) |
| `GET /installations/{installation_id}/{slug}/content` | `get_current_user` | — | content payload |
| `PUT /installations/{installation_id}/{slug}/content` | `get_administrator` | content body | persisted content |
| `GET /installations/{installation_id}/{slug}/answers` | `get_current_user` | — | `{ row_id: answer }` |
| `PUT /installations/{installation_id}/{slug}/answers/{row_id}` | `get_answering_member` | answer body | persisted answer |

- Helper `_get_installation_or_404(installation_id, db)` loads the Installation or raises a structured `INSTALLATION_NOT_FOUND` error via `ErrorResponse.create(code, message, details)`.
- The existing `PREREQUISITE_SLUG_NOT_FOUND` check is preserved for unrecognized slugs.
- Answer upsert keys on `(installation_id, slug, row_id)` and sets `updated_by`/`updated_at`.
- Content upsert keys on `(installation_id, slug)`.
- Roles reuse existing dependencies: `get_current_user` (read), `get_administrator` (installations + static content mutations), `get_answering_member` (answer writes). Admins manage installations and static content; members save answers; visitors are read-only.

### Test-migration consideration (not a regression)

The existing `basics-prerequisites-404-fix` tests reference single-instance `/api/prerequisites/{slug}/content` and `/{slug}/answers` paths and `user_id`-scoped answers. The parent spec **intentionally** re-scoped these to installation-scoped paths. Those tests must be updated to the installation-scoped contract (`/installations/{id}/{slug}/...`). This is a known, expected test migration — not a behavior regression to avoid. The 404 semantics (`PREREQUISITE_SLUG_NOT_FOUND`) are preserved, now nested under a valid installation.

---

## Error Handling

All errors use the shared `ErrorResponse.create(code, message, details)` contract.

| Condition | HTTP | Error code | Notes |
|---|---|---|---|
| Empty / whitespace `project_name` on POST/PUT | 422 | validation error | rejected by `field_validator`; no record created |
| Unknown `installation_id` on PUT/DELETE/content/answers | 404 | `INSTALLATION_NOT_FOUND` | via `_get_installation_or_404` |
| Unrecognized slug | 404 | `PREREQUISITE_SLUG_NOT_FOUND` | preserved from existing behavior |
| Non-admin create/update/delete installation or static content | 403 | authorization error | enforced by `get_administrator` |
| Unauthenticated request | 401 | auth error | enforced by `get_current_user` |
| Non-member answer write | 403 | authorization error | enforced by `get_answering_member` |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — a formal statement about what the system should do.*

### Property 1: VCF rows satisfy the QuestionRow contract

*For any* row in `vcfConfig`, the row SHALL have a non-empty string `id`, a non-empty string `questionPrimary`, and a boolean `mandatory`, with `questionSecondary`, `exampleValue`, and `commentsHint` each either absent or a string.

**Validates: Requirements 1.3, 2.1**

### Property 2: VCF row ids are unique within the page

*For any* two distinct rows in `vcfConfig` across all sections, their `id` values SHALL differ.

**Validates: Requirements 3.2**

### Property 3: VCF section ids are unique within the page

*For any* two distinct sections in `vcfConfig`, their `id` values SHALL differ.

**Validates: Requirements 3.3**

### Property 4: Installation create round-trip

*For any* non-blank `project_name`, creating an Installation via `POST /installations` SHALL return an Installation whose `project_name` equals the submitted value (after trimming) and whose `id`, `created_at`, and `updated_at` are populated, and that Installation SHALL subsequently appear in `GET /installations`.

**Validates: Requirements 6.1, 6.2**

### Property 5: Installation update round-trip

*For any* existing Installation and non-blank new `project_name`, `PUT /installations/{id}` followed by a read SHALL return the Installation with `project_name` equal to the new value and the same `id`.

**Validates: Requirements 6.3**

### Property 6: Blank project names are rejected

*For any* string consisting solely of whitespace, `POST /installations` and `PUT /installations/{id}` SHALL return a validation error and SHALL NOT create or modify an Installation.

**Validates: Requirements 6.5**

### Property 7: Installation-scoped content round-trip

*For any* existing Installation, known static slug, and content value, `PUT .../{id}/{slug}/content` followed by `GET .../{id}/{slug}/content` SHALL return the same content value.

**Validates: Requirements 7.1, 7.2, 7.5**

### Property 8: Installation-scoped answer round-trip

*For any* existing Installation, known question slug, `row_id`, and answer value, `PUT .../{id}/{slug}/answers/{row_id}` followed by `GET .../{id}/{slug}/answers` SHALL include that `row_id` mapped to the same answer value.

**Validates: Requirements 7.3, 7.4, 7.5**

### Property 9: Installation data isolation

*For any* two distinct Installations, content and answers written under one Installation SHALL NOT appear in reads scoped to the other Installation.

**Validates: Requirements 7.5**

### Property 10: Mutations are admin-only

*For any* principal lacking the ADMINISTRATOR role, `POST`, `PUT`, and `DELETE` on installations (and `PUT` on static content) SHALL be rejected with an authorization error and SHALL NOT change stored state.

**Validates: Requirements 6.7, 8.3**

### Property 11: Delete cascades to content and answers

*For any* existing Installation with associated content and answers, `DELETE /installations/{id}` SHALL remove the Installation and all of its content and answer records, after which reads for that Installation return not-found.

**Validates: Requirements 6.4**

---

## Testing Strategy

Both example-based and property-based tests are used. Property tests run a minimum of 100 iterations and are tagged **Feature: vcf-prerequisites-update, Property {n}: {property text}**.

### Backend (pytest)

- **Installations CRUD**: create → list membership (Property 4), update round-trip (Property 5), delete + cascade to content/answers (Property 11).
- **Installation-scoped content/answers**: content round-trip (Property 7), answer round-trip (Property 8), cross-installation isolation (Property 9).
- **Empty `project_name` rejection**: whitespace-only inputs return validation error, no record created (Property 6).
- **Authorization**: non-admin `POST`/`PUT`/`DELETE` rejected with 403 (Property 10); unauthenticated requests rejected 401.
- **Not-found paths**: unknown `installation_id` → `INSTALLATION_NOT_FOUND`; unrecognized slug → `PREREQUISITE_SLUG_NOT_FOUND`.
- **Route registration smoke**: installation routes resolve under `/api/prerequisites`.
- **Existing 404 tests** are migrated to the installation-scoped contract (documented above) and must pass post-migration.

### Frontend (vitest)

- **vcfConfig structure**: every row satisfies the `QuestionRow` contract (Property 1); row ids unique (Property 2); section ids unique (Property 3); expected section ids present; excluded params (`node_uuids`, `bootstrap_node_uuids`) absent; the five optional rows (four secrets + `esxi_setup_script`) have `mandatory = false` and all others `true`; spot-check known `exampleValue`/`commentsHint` mappings.
- **Installation create flow**: `InstallationListPage`/`prerequisitesService` create flow issues `POST /api/prerequisites/installations` and renders the created Installation (already-implemented frontend, verified against the now-matching backend contract).
