# Bugfix Requirements Document

## Introduction

This spec bundles three related changes in the `ai-shai-web-interface` application:

- **PART 1 (Bug)** — In the Forum, rich text formatting applied in the editor (bold, italic, underline, headings, lists, alignment, etc.) is not taken into account. The formatting the user applies while composing or editing a forum post/reply is lost or not rendered in the displayed post.
- **PART 2 (Rename)** — The prerequisites navigation menu currently labelled "Basics" must be renamed to "Context" (user-facing label).
- **PART 3 (New page)** — A new prerequisites page must be added that displays client environment, contact, and use-case scope information laid out as label/value rows, following the existing prerequisites page patterns. The listed values are pre-filled defaults.

Parts 2 and 3 are behavior-additive changes captured here as expected behavior so they are validated alongside the Forum formatting fix; they must not regress the existing prerequisites navigation and pages.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user applies formatting (bold, italic, underline, strikethrough, headings, ordered/unordered lists, alignment, horizontal rule, image, emoji) in the Forum editor and saves a new reply THEN the system does not render the applied formatting in the displayed post

1.2 WHEN a user edits an existing Forum post with formatting applied in the editor and saves the edit THEN the system does not render the applied formatting in the displayed post

1.3 WHEN a formatted Forum post is reloaded (topic reopened) THEN the system does not display the previously applied formatting

1.4 WHEN a user opens the prerequisites navigation menu THEN the system labels the static "Basics" entry as "Basics" (should read "Context")

1.5 WHEN a user navigates the prerequisites menu THEN the system does not provide the client environment / contacts / use-case scope page (it does not exist)

### Expected Behavior (Correct)

2.1 WHEN a user applies formatting in the Forum editor and saves a new reply THEN the system SHALL persist the formatted HTML content and render the formatting in the displayed post

2.2 WHEN a user edits an existing Forum post with formatting applied and saves the edit THEN the system SHALL persist the formatted HTML content and render the formatting in the displayed post

2.3 WHEN a formatted Forum post is reloaded (topic reopened) THEN the system SHALL display the previously applied formatting exactly as saved

2.4 WHEN a user opens the prerequisites navigation menu THEN the system SHALL display the label "Context" (French "Contexte") in place of "Basics" for that entry

2.5 WHEN a user navigates to the new Context/client-environment page THEN the system SHALL display the following label/value rows grouped into sections, with the defaults shown pre-filled:
- Client Environnement — Nom du client (empty), Type de deploiement (empty), Site 1 Location (empty), Site 2 Location (empty), Installation wish date (empty), Managed / Air-gapped ("Managed")
- Contacts — OVH PSMC Architecte: Nom ("Samuel LEPETRE"), Téléphone (empty), Email ("samuel.lepetre@ovhcloud.com"); Client: Nom (empty), Téléphone (empty), Email (empty)
- Use cases — VCF ("Within Scope"), SUSE Harvester ("Out of Scope"), Nutanix ("Out of Scope"), IA ("Out of Scope"), Kubernetes ("Out of Scope")

2.6 WHEN the new page is added THEN the system SHALL register it following the existing prerequisites patterns (route in `App.tsx`, entry in `PREREQ_NAV_ITEMS`, i18n labels in `translations.ts`)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user composes a plain-text (unformatted) Forum reply THEN the system SHALL CONTINUE TO save and display it correctly

3.2 WHEN a Forum post is deleted or a topic is locked THEN the system SHALL CONTINUE TO behave as before

3.3 WHEN the StaticContentPage (Basics/Network Flux) uses the RichTextEditor THEN the system SHALL CONTINUE TO save and render formatted content correctly

3.4 WHEN a user navigates to the existing prerequisites pages (How to use, Network Checklist, Core Control Plane, CloudStore, VCF, Network Flux) THEN the system SHALL CONTINUE TO route and render them unchanged

3.5 WHEN the "Basics" page route/slug (`/prerequisites/basics`, slug `basics`) is used THEN the system SHALL CONTINUE TO resolve, since only the visible menu label changes to "Context" (route/slug unchanged unless explicitly requested)

3.6 WHEN other menu labels and translations are rendered THEN the system SHALL CONTINUE TO display them unchanged in both French and English

## Deriving the Bug Condition

**Bug Condition Function** — identifies inputs that trigger the formatting defect (PART 1):

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ForumPostContent   // HTML produced by the RichTextEditor
  OUTPUT: boolean

  // Content contains rich-text markup that must survive the
  // compose -> save -> reload -> render round-trip.
  RETURN containsFormattingMarkup(X)   // e.g. <b>, <i>, <u>, <h1>, <ul>, alignment styles
END FUNCTION
```

**Property Specification — Fix Checking:**

```pascal
// Property: formatted content survives the save/reload/render round-trip
FOR ALL X WHERE isBugCondition(X) DO
  saved   ← savePost'(X)
  reloaded ← loadPost'(saved.id)
  ASSERT reloaded.content preserves the formatting markup of X
  ASSERT renderedOutput(reloaded.content) displays the applied formatting
END FOR
```

**Property Specification — Preservation Checking:**

```pascal
// Property: non-formatted inputs and unrelated flows are unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)   // plain-text posts, deletion, locking, StaticContentPage,
                        // and existing prerequisites navigation behave identically
END FOR
```

- **F**: The application before the changes (formatting lost in Forum; "Basics" label; no Context page).
- **F'**: The application after the changes (formatting preserved end-to-end; "Context" label; Context page present).
