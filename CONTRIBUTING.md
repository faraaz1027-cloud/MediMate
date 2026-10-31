# Team workflow
1. Accept the repository invitation and clone the repository.
2. Use your own GitHub account and accurate Git author identity for your work.
3. Create a feature branch from current main, for example feature/a1-prescription-review.
4. Link work to its Jira task and function ID.
5. Make focused commits describing the change. Review and understand any AI-assisted code.
6. Open a pull request with the problem, behaviour, validation and remaining limitations.
7. Ask another team member to review before merging.
8. Resolve conflicts, run relevant checks, then merge and update Jira.
9. Update requirements when scope changes and record meaningful changes in CHANGELOG.md.

## Responsibilities
- Ihfaz Rashid Sadat: A1–A4.
- Faraaz Jamil Chowdhury: B1–B4.
- Sahir Jawad Chowdhury: C1–C5.
- Shared: authentication, integration, documentation and final demonstration.

GitHub handles for Sadat and Sahir and invitation acceptance are not yet verified. Do not attribute assistant-generated setup commits to individual members as evidence of their implementation.

## Definition of done
A feature is done when its acceptance criteria work, data persists, backend permissions and failure states are checked, relevant documentation is current, and its owner can explain and modify the code.

## Repository hygiene
Do not commit real prescriptions, patient/contact data, credentials, API tokens or .env files. Use synthetic examples and .env.example placeholders. Preserve historical records and avoid destructive changes to shared data.
