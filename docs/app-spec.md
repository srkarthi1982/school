# School Ansiversa App Spec

## School DB Foundation V1 + Daily Attendance V1 + Fee Structure V1

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
- `DailyAttendanceExceptions`
- `FeeCategories`
- `FeeStructures`
- `FeeStructureItems`

Every school-owned table is scoped by `schoolId`. Owner-level access must first resolve the current user's `SchoolOrganizations` row through `ownerUserId`, then use that owned `schoolId` for all reads and writes.

## V1 Actions

- Create or update the current user's school organization.
- Get the current user's school organization.
- Create/list/edit/delete classes.
- Create/list/edit/delete sections.
- Create/list/edit/delete subjects.
- Create/list/edit/delete students.
- Create/list/edit/delete teachers.
- Get daily attendance grid by class, section, and date.
- Save daily attendance exceptions for class, section, and date.
- List recent daily attendance sessions grouped by date/class/section.
- Get daily attendance summary for a selected date.
- Create/list/edit/delete fee categories.
- Create/list/edit/delete class-wise fee structures.
- Create/list/edit/delete fee structure items.
- Get fee structure detail with category amount and due date rows.

Students and teachers are internal school records in V1. They are not Ansiversa global users and do not receive login access.

## Daily Attendance V1

Daily Attendance V1 uses exception-only storage for student daily attendance.

- Default effective status is `present`.
- No row in `DailyAttendanceExceptions` means the student is present.
- Stored exception statuses are only `absent`, `late`, and `excused`.
- `present` must not be stored.
- Changing a student back to Present deletes that student's exception row for the selected date.
- Duplicate exception rows for the same `schoolId + studentId + attendanceDate` are prevented.

Attendance is scoped by owned school, class, section, student, and date. Students must belong to the selected school/class/section before attendance can be read or saved.

Daily Attendance V1 does not include class/period attendance, timetables, teacher login, student login, parent portal, or other school modules.

## Fee Structure V1

Fee Structure V1 manages fee planning only. It does not collect payments.

- Fee categories define reusable fee heads such as tuition, transport, exam, books, uniform, hostel, and miscellaneous.
- Fee structures are class-wise plans with optional academic year linkage for future use.
- Fee structure items define category amount, due date, and sort order.
- All fee records are owned by the current user's school through `schoolId`.
- Class and category references must belong to the same owned school.

Fee Structure V1 does not include payments, receipts, payment gateways, parent portal, discounts/concessions, late fee calculations, or accounting/ledger workflows.

## V1 UI

The protected `/app` workspace provides a minimal foundation interface with stacked tab sections: a header/action card followed by a separate list/empty-state card.

- School organization summary card with drawer-based create/edit setup.
- Classes section with drawer-based create/edit flow and confirmed delete.
- Sections section with drawer-based create/edit flow and confirmed delete.
- Subjects section with drawer-based create/edit flow and confirmed delete.
- Students section with drawer-based create/edit flow and confirmed delete.
- Teachers section with drawer-based create/edit flow and confirmed delete.
- Attendance section with stacked filter/action card, direct virtual classroom marking grid, and compact recent attendance sessions.
- Fees section with stacked fee categories, class-wise fee structures, and fee structure detail/items. Fee create/edit flows use drawers and delete uses confirmation.

Foundation update and delete actions must resolve the current owner's school before writing, and related references must remain school-scoped.

The public landing page is outside this V1 foundation task and should not be rewritten for foundation CRUD work.

## Exclusions

Do not add these in V1:

- Class/period attendance.
- Timetable.
- Fee payments.
- Fee receipts.
- Payment gateways.
- Discounts or concessions.
- Late fee calculations.
- Accounting or ledger workflows.
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
