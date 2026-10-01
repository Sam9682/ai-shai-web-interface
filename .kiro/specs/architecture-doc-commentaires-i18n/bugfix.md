# Bugfix Requirements Document

## Introduction

On the OPCP installations page, the "Generate Architecture Document" button produces an HTML architecture document for a selected installation. The generated document has three defects:

1. It renders each question's example value (`exampleValue`, labeled "Exemple") instead of the intended comments/details value (`commentsHint`, labeled "Commentaires") that the web page shows alongside each question.
2. It is hardcoded in French (`<html lang="fr">`, French titles, headers, section names, footer, and credential labels), so it cannot be generated in English even when the user's active interface language is English.
3. Even beyond the document title/headers, several keywords remain French-only (for example the column header "Commentaires"), so they are never localized to English.

The document should render the comments/details value in place of the example value, be generated in the user's active interface language (English or French), and localize every previously hardcoded French keyword, header, section title, and label in both languages. The active language is persisted in the Language_Store (`localStorage` key `opcp.language`, normalized to `en` or `fr`), so the fix drives the document language from that value.

## Bug Analysis

### Current Behavior (Defect)

When the "Generate Architecture Document" button is clicked, the generated HTML document exhibits the following incorrect behavior:

1.1 WHEN a question row is rendered THEN the system renders the row's example value (`row.exampleValue`, under an "Exemple" column) instead of the comments/details value (`row.commentsHint`, "Commentaires")
1.2 WHEN the active interface language is English THEN the system still generates the document in French (`<html lang="fr">` and French title, meta, section titles, footer)
1.3 WHEN the QA section table header is rendered THEN the system emits French-only header text ("Paramètre / Question", "Valeur", "Exemple")
1.4 WHEN the servers section is rendered THEN the system emits French-only text ("Servers nodes", "Configuration OpenStack", "Inventaire des nœuds serveurs", "Certificat CA", "Enregistré (non exporté)", "Non configuré", "Aucune configuration OpenStack enregistrée.")
1.5 WHEN the document chrome (title, summary, meta, footer) is rendered THEN the system emits French-only text ("Document d'architecture", "Sommaire", "Projet", "Généré le", "Généré par ...")

### Expected Behavior (Correct)

2.1 WHEN a question row is rendered THEN the system SHALL render the row's comments/details value (`row.commentsHint`) under a column labeled "Commentaires" (FR) / "Comments / Details" (EN), and SHALL NOT render the example value
2.2 WHEN the active interface language is English THEN the system SHALL generate the document in English (`<html lang="en">` and English title, meta, section titles, footer); WHEN it is French THEN the system SHALL generate the document in French
2.3 WHEN the QA section table header is rendered THEN the system SHALL emit header text localized to the active language for "Parameter / Question", "Value", and "Comments / Details"
2.4 WHEN the servers section is rendered THEN the system SHALL emit text localized to the active language for the servers heading, OpenStack configuration heading, server-node inventory heading, credential labels, secret-stored/not-configured statuses, and the empty-configuration message
2.5 WHEN the document chrome (title, summary, meta, footer) is rendered THEN the system SHALL emit text localized to the active language for the document title, summary/table-of-contents heading, project label, generated-on label, and footer

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the active interface language is French THEN the system SHALL CONTINUE TO produce French text for all previously French labels that are unchanged in meaning (e.g. "Document d'architecture", "Sommaire")
3.2 WHEN a question row has an answer value THEN the system SHALL CONTINUE TO render that answer in the "Valeur"/"Value" cell, and SHALL CONTINUE TO render the em dash placeholder ("—") when the answer is empty
3.3 WHEN a question row is mandatory or optional THEN the system SHALL CONTINUE TO render the correct marker (🔴 mandatory, ⚪ optional)
3.4 WHEN any user-supplied value (answer, question text, comments, node fields, credentials) is rendered THEN the system SHALL CONTINUE TO HTML-escape it
3.5 WHEN the document is generated THEN the system SHALL CONTINUE TO include all QA sections and the servers/node inventory section, and SHALL CONTINUE TO download a self-contained HTML file named `{project}-architecture-{date}.html`
3.6 WHEN the servers section renders node rows and credentials THEN the system SHALL CONTINUE TO render the same node fields (Node UUID, Serial Number, Instance UUID, Power State, Provision State, Remark) and credential fields (Auth URL, Credential ID, Nova endpoint, CA certificate, Secret)

## Bug Condition and Properties

**Definitions**

- **F**: `buildArchitectureDocumentHtml` (and its helpers `renderRow`, `renderQaSection`, `renderServersSection`) as they exist before the fix — always French, and rendering `exampleValue`.
- **F'**: the fixed builder — language-parameterized (EN/FR) and rendering `commentsHint`.
- **Input X**: the generation context = `{ data: InstallationExport, language: 'en' | 'fr' }`, where `language` is the active interface language from the Language_Store.

**Bug Condition**

```pascal
FUNCTION isBugCondition(X)
  INPUT: X = { data, language }
  OUTPUT: boolean

  // The document is defective whenever it is generated at all:
  //  - it renders exampleValue instead of commentsHint (any language), AND/OR
  //  - it is emitted in French regardless of the active language.
  RETURN true
END FUNCTION
```

The defect is present for every generation: the example/comments swap is wrong in both languages, and the language is always French regardless of `X.language`.

**Property: Fix Checking**

```pascal
// Property: Fix Checking - comments rendered, correct language, localized labels
FOR ALL X WHERE isBugCondition(X) DO
  html ← buildArchitectureDocumentHtml'(X.data, X.language)
  ASSERT html renders commentsHint (not exampleValue) for each question row
  ASSERT html lang attribute = X.language
  ASSERT every chrome/header/section/credential label is in X.language
END FOR
```

**Property: Preservation Checking**

```pascal
// Property: Preservation Checking - French output and structure preserved
FOR ALL X WHERE X.language = 'fr' DO
  ASSERT unchanged-meaning French labels equal their original French text (3.1)
  ASSERT answer cells, markers, HTML-escaping, section set, node/credential
         fields, and download filename are identical to F (3.2 - 3.6)
END FOR
```

Because the example-to-comments change and the localization apply to all inputs, preservation is scoped to the structural and French-language behavior that must not regress rather than to a set of untouched inputs.
