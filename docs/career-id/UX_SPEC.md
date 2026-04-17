# UX/UI Specification
# Career ID Government ID Verification
# Owner: Product Design / Frontend
# Status: Draft

## 1. Design Goal

The Career ID page should feel like a premium trust-building system, not a dry compliance workflow.

Identity verification should:
- feel valuable
- feel safe
- feel guided
- strengthen the visual trust ladder already present on the page

## 2. Existing Context

The page already includes a right-side credibility ladder:
- Self-reported
- Relationship-backed
- Document-backed
- Signature-backed
- Institution-verified

This feature activates `Document-backed` and gives it a concrete first workflow.

## 3. Primary Entry Point

### Document-backed row

When unlocked, show:
- title: `Document-backed`
- description: `Verify a government ID or upload trusted documents to strengthen your Career ID.`
- CTA: `Verify your identity`
- support copy: `About 2 minutes`

When locked, show:
- disabled treatment
- muted icon / node
- helper text: `Complete the earlier trust layers to unlock this phase.`

## 4. State Design

### Locked
- muted node
- low-contrast copy
- no active CTA
- explanation visible

### Not started
- active row hover
- primary CTA button
- subtle border emphasis

### In progress
- node glow or spinner
- status pill: `In review`
- copy: `We're checking your ID and live selfie.`

### Verified
- success state
- row becomes visually completed
- count increments
- artifact appears: `Government ID verified`

### Retry needed
- warm warning treatment
- copy focused on recovery, not blame
- CTA: `Try again`

### Manual review
- neutral pending state
- copy: `We're reviewing your verification. This can take a little longer.`

### Failed
- clear but non-alarmist
- CTA options:
  - `Try again`
  - `Contact support` (optional post-MVP)

## 5. Modal / Flow Structure

### Screen 1 — Why verify

Title:
- `Strengthen your Career ID`

Body:
- `Verify a government ID and complete a live selfie check to make your Career ID more credible.`

CTA:
- `Continue`

### Screen 2 — Consent

Title:
- `Before you begin`

Body:
- explain collection of government ID and live selfie
- explain purpose: identity verification
- explain privacy at a high level

Checkbox:
- `I consent to identity verification for Career ID.`

CTA:
- `Agree and continue`

### Screen 3 — ID front

Title:
- `Capture the front of your ID`

Guidance:
- good lighting
- all edges visible
- no glare
- original document only

### Screen 4 — ID back

Title:
- `Capture the back of your ID`

Same guidance pattern.

### Screen 5 — Live selfie

Title:
- `Take a live selfie`

Guidance:
- remove sunglasses
- face fully visible
- look straight ahead
- good lighting

### Screen 6 — Processing

Title:
- `Verifying your identity`

Body:
- `We're reviewing your ID and comparing it with your live selfie.`

### Screen 7 — Result

#### Success

Title:
- `Identity verified`

Body:
- `Your Career ID now includes a verified government ID artifact.`

CTA:
- `Back to Career ID`

#### Retry

Title:
- `We couldn't complete verification`

Body:
- `Try again with better lighting, a clearer photo of your ID, and your full face visible.`

CTA:
- `Try again`

#### Manual review

Title:
- `Verification under review`

Body:
- `Your submission is being reviewed. We'll update your Career ID when it's complete.`

#### Failed

Title:
- `Verification not completed`

Body:
- keep neutral and brief
- avoid exposing sensitive scoring language

## 6. On-Page Artifact Rendering

After success, add an artifact under Document-backed:
- icon: verified / check
- label: `Government ID verified`
- metadata:
  - `Verified`
  - optional date
  - optional provider-hidden internal status

Do not show raw vendor terms in the main artifact row.

## 7. Next Best Uploads

After government ID verification, update `Next best uploads` to push the next strongest proofs:
- diplomas and degrees
- certifications
- transcripts

This block should be dynamic based on what the user has already completed.

## 8. Copy Principles

Use:
- trust-building language
- plain English
- calm failure states
- clear next action

Avoid:
- provider jargon
- biometric scoring language
- accusatory tone
- raw technical error codes

## 9. Interaction Details

- modal width should match current premium UI language
- mobile handoff should be considered if desktop capture is poor
- progress indicator should show step completion
- returning from provider flow should not confuse the user
- page should refresh state cleanly after completion

## 10. Accessibility

- keyboard-navigable modal
- labels and helper text for all controls
- sufficient contrast on dark theme
- visible focus states
- avoid color-only status communication

## 11. Visual Notes

Maintain current style:
- dark premium background
- soft glow / accent color
- rounded cards
- structured hierarchy
- minimal clutter

The trust ladder remains the dominant interaction model.
