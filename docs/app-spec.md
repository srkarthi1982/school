# School Ansiversa App Spec

## School DB Foundation V1

School Ansiversa is a mini-app backend owned by the Ansiversa ecosystem.

The parent Ansiversa app owns authentication, global users, billing, and sessions. The School app owns only school business data. In V1, the logged-in Ansiversa user is treated as the school owner through `SchoolOrganizations.ownerUserId`.

## V1 Tables

- `SchoolOrganizations`
- `AcademicYears`
- `SchoolClasses`
- `SchoolSections`
- `Subjects`
- `Students`
- `Teachers`

Every school-owned table is scoped by `schoolId`. Owner-level access must first resolve the current user's `SchoolOrganizations` row through `ownerUserId`, then use that owned `schoolId` for all reads and writes.

## V1 Actions

- Create or update the current user's school organization.
- Get the current user's school organization.
- Create/list classes.
- Create/list sections.
- Create/list subjects.
- Create/list students.
- Create/list teachers.

Students and teachers are internal school records in V1. They are not Ansiversa global users and do not receive login access.

## V1 UI

The protected `/app` workspace provides a minimal foundation interface:

- School setup card.
- Classes section.
- Sections section.
- Subjects section.
- Students section.
- Teachers section.

The public landing page is outside this V1 foundation task and should not be rewritten for foundation CRUD work.

## Exclusions

Do not add these in DB Foundation V1:

- Attendance tables or workflows.
- Fees tables or workflows.
- Exams.
- Report cards.
- Transport.
- Library.
- Hostel.
- Communication.
- Student login.
- Teacher login.
- Parent portal.
- Fake/demo school data.
- Parent app changes.
- Billing or Stripe changes.
