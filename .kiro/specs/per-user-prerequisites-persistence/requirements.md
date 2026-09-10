# Requirements Document

## Introduction

The OPCP installation prerequisites pages present Question-and-Answer (Q&A) forms on a set of "qa" slugs (network-checklist, core-control-plane, cloudstore, vcf). Today, answers are persisted with a `(slug, row_id)` unique key and served to every authenticated user, so all members share a single answer set. This feature makes Q&A answers fully isolated per user: each member sees and edits only the answers they themselves submitted. Static content pages (Basics, Network Flux) remain shared/global and are out of scope for isolation. Administrators remain blocked from submitting Q&A answers. Existing shared answer data is treated as placeholder and discarded during the schema change.

## Glossary

- **Prerequisites_API**: The backend route family mounted at `/api/prerequisites/*` (`app/prerequisites/router.py`) that serves prerequisite static content and Q&A answers.
- **Q&A_Slug**: A recognized prerequisite slug that renders a Question-and-Answer form. The set is `network-checklist`, `core-control-plane`, `cloudstore`, `vcf`.
- **Static_Slug**: A recognized prerequisite slug that renders editable static content. The set is `basics`, `network-flux`.
- **Answer_Record**: A persisted row in the `prerequisite_answers` table representing one member's answer for a given slug and row.
- **User_Id**: The unique identifier of the authenticated user, derived from the Bearer token by the `get_current_user` dependency.
- **Row_Id**: The identifier of a single question row within a Q&A_Slug's question set.
- **Member**: An authenticated user whose role is not administrator.
- **Administrator**: An authenticated user whose role is `UserRole.ADMINISTRATOR`.
- **Answer_Form**: The frontend Question-and-Answer component (`frontend/src/components/prerequisites/QuestionAnswerForm.tsx`) that loads and saves answers for a Q&A_Slug.

## Requirements

### Requirement 1: Per-user answer storage schema

**User Story:** As a member, I want my prerequisite answers stored against my own identity, so that my answers are kept separate from other members' answers.

#### Acceptance Criteria

1. THE Prerequisites_API SHALL persist each Answer_Record with a User_Id that identifies the Member who submitted the answer.
2. THE Prerequisites_API SHALL enforce uniqueness of Answer_Records on the combination of User_Id, slug, and Row_Id.
3. WHEN a Member submits an answer for a Q&A_Slug and Row_Id that has no existing Answer_Record for that Member, THE Prerequisites_API SHALL create a new Answer_Record associated with that Member's User_Id.
4. WHEN a Member submits an answer for a Q&A_Slug and Row_Id that already has an Answer_Record for that Member, THE Prerequisites_API SHALL update that Member's existing Answer_Record without altering any other Member's Answer_Record.

### Requirement 2: Per-user answer retrieval

**User Story:** As a member, I want to see only my own answers when I open a prerequisites Q&A page, so that other members' answers do not appear in my form.

#### Acceptance Criteria

1. WHEN a Member requests answers for a Q&A_Slug, THE Prerequisites_API SHALL return only the Answer_Records whose User_Id matches the requesting Member's User_Id.
2. WHEN a Member requests answers for a Q&A_Slug for which that Member has no Answer_Records, THE Prerequisites_API SHALL return an empty answer set.
3. THE Prerequisites_API SHALL exclude Answer_Records belonging to other Members from every answer-retrieval response.

### Requirement 3: Administrator restriction retained

**User Story:** As a system owner, I want administrators to remain unable to submit Q&A answers, so that answer authorship stays limited to members.

#### Acceptance Criteria

1. IF an Administrator attempts to submit an answer for a Q&A_Slug, THEN THE Prerequisites_API SHALL reject the request with an HTTP 403 status.
2. WHEN a Member submits an answer for a Q&A_Slug, THE Prerequisites_API SHALL accept the request and persist the Answer_Record.

### Requirement 4: Static content remains shared

**User Story:** As a member, I want the Basics and Network Flux static pages to show the same shared content to everyone, so that shared reference material stays consistent across users.

#### Acceptance Criteria

1. WHEN any authenticated user requests content for a Static_Slug, THE Prerequisites_API SHALL return the single shared content value for that Static_Slug independent of User_Id.
2. THE Prerequisites_API SHALL persist Static_Slug content without associating it to a per-user answer scope.

### Requirement 5: Answer scope resolved from authentication

**User Story:** As a member, I want the system to determine whose answers to load and save from my authenticated session, so that I do not need to pass my identity explicitly.

#### Acceptance Criteria

1. WHEN the Answer_Form loads answers for a Q&A_Slug, THE Prerequisites_API SHALL resolve the requesting User_Id from the Bearer token supplied on the request.
2. WHEN the Answer_Form saves an answer for a Q&A_Slug and Row_Id, THE Prerequisites_API SHALL resolve the submitting User_Id from the Bearer token supplied on the request.
3. IF a request to retrieve or save Q&A answers arrives without a valid authenticated User_Id, THEN THE Prerequisites_API SHALL reject the request with an HTTP 401 status.

### Requirement 6: Migration of existing answer data

**User Story:** As a system operator, I want the schema change applied cleanly, so that the new per-user answer structure is in place without carrying over unusable shared data.

#### Acceptance Criteria

1. WHEN the per-user answer schema migration is applied, THE Prerequisites_API SHALL provide an answer schema keyed by User_Id, slug, and Row_Id.
2. WHEN the per-user answer schema migration is applied, THE Prerequisites_API SHALL discard pre-existing shared Answer_Records that were stored without a User_Id.
3. WHEN the per-user answer schema migration is reversed, THE Prerequisites_API SHALL restore the prior answer schema keyed by slug and Row_Id.
