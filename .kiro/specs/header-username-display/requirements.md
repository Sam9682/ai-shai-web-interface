# Requirements Document

## Introduction

This feature adds the logged-in user's identifier to the "OPCP" label in the shared top banner header. When a user is authenticated, the header displays the user's email in parentheses next to "OPCP" (for example, "OPCP (admin@opcp-psmc.com)"). When the email is unavailable, the user's full name is used instead. When no user is authenticated, the header shows "OPCP" alone with no parentheses. The behavior applies uniformly across the shared top banner, covering both desktop and mobile presentations.

## Glossary

- **Header_Component**: The shared top banner component (`frontend/src/components/Layout.tsx`) that renders the "OPCP" label and applies to both desktop and mobile layouts.
- **Current_User**: The authenticated user object stored as JSON in `localStorage` under the key `user`, containing the fields `id`, `email`, `first_name`, `last_name`, `role`, and `is_email_verified`.
- **User_Email**: The `email` field of the Current_User.
- **User_Full_Name**: The concatenation of the `first_name` and `last_name` fields of the Current_User, separated by a single space.
- **Authenticated_State**: The condition in which a Current_User exists in `localStorage` under the key `user`.
- **Header_Label**: The text rendered by the Header_Component for the "OPCP" link.

## Requirements

### Requirement 1

**User Story:** As a logged-in user, I want to see my email next to "OPCP" in the top banner, so that I can confirm which account I am signed in as.

#### Acceptance Criteria

1. WHILE the Authenticated_State is true AND a non-empty User_Email exists, THE Header_Component SHALL render the Header_Label as "OPCP (" followed by the User_Email followed by ")".
2. WHILE the Authenticated_State is true AND the User_Email is empty or absent AND a non-empty User_Full_Name exists, THE Header_Component SHALL render the Header_Label as "OPCP (" followed by the User_Full_Name followed by ")".

### Requirement 2

**User Story:** As a visitor who is not logged in, I want to see only "OPCP" in the top banner, so that the header stays clean when no account is active.

#### Acceptance Criteria

1. WHILE the Authenticated_State is false, THE Header_Component SHALL render the Header_Label as "OPCP" with no parentheses and no identifier.

### Requirement 3

**User Story:** As a user, I want the identifier to appear consistently across devices, so that the header behaves the same on desktop and mobile.

#### Acceptance Criteria

1. THE Header_Component SHALL apply the Header_Label rendering rules to both the desktop and mobile presentations of the shared top banner.

### Requirement 4

**User Story:** As a developer, I want a reliable way to read the current user, so that the header can determine which identifier to display.

#### Acceptance Criteria

1. WHEN the Header_Component requests the Current_User, THE authService SHALL return the Current_User object parsed from the `user` key in `localStorage`.
2. IF no value exists under the `user` key in `localStorage`, THEN THE authService SHALL return a null result.
3. IF the value stored under the `user` key in `localStorage` cannot be parsed as JSON, THEN THE authService SHALL return a null result.
