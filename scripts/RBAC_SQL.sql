-- ============================================
-- RBAC SQL: Insert Roles & Role Permissions
-- Generated: 10/06/2026 12:43:19
-- ============================================

-- 0. DELETE existing role_permissions
-- --------------------------------------------------
DELETE FROM "role_permissions" WHERE "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'CDS Section Head'); -- CDS Section Head
DELETE FROM "role_permissions" WHERE "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'CDS'); -- CDS
DELETE FROM "role_permissions" WHERE "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'QCS Section Head'); -- QCS Section Head
DELETE FROM "role_permissions" WHERE "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'QCS'); -- QCS
DELETE FROM "role_permissions" WHERE "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'IT & Data Entry'); -- IT & Data Entry
DELETE FROM "role_permissions" WHERE "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'Admin Staff'); -- Admin Staff
DELETE FROM "role_permissions" WHERE "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'Student'); -- Student
DELETE FROM "role_permissions" WHERE "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'Instructor'); -- Instructor
DELETE FROM "role_permissions" WHERE "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'Course Officer'); -- Course Officer
DELETE FROM "role_permissions" WHERE "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'Training Wing Commander'); -- Training Wing Commander
DELETE FROM "role_permissions" WHERE "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'Training Commander'); -- Training Commander

-- 1. DELETE existing roles
-- --------------------------------------------------
DELETE FROM "roles" WHERE "name" = 'CDS Section Head'; -- CDS Section Head
DELETE FROM "roles" WHERE "name" = 'CDS'; -- CDS
DELETE FROM "roles" WHERE "name" = 'QCS Section Head'; -- QCS Section Head
DELETE FROM "roles" WHERE "name" = 'QCS'; -- QCS
DELETE FROM "roles" WHERE "name" = 'IT & Data Entry'; -- IT & Data Entry
DELETE FROM "roles" WHERE "name" = 'Admin Staff'; -- Admin Staff
DELETE FROM "roles" WHERE "name" = 'Student'; -- Student
DELETE FROM "roles" WHERE "name" = 'Instructor'; -- Instructor
DELETE FROM "roles" WHERE "name" = 'Course Officer'; -- Course Officer
DELETE FROM "roles" WHERE "name" = 'Training Wing Commander'; -- Training Wing Commander
DELETE FROM "roles" WHERE "name" = 'Training Commander'; -- Training Commander

-- 2. INSERT new roles
-- --------------------------------------------------
INSERT INTO "roles" ("name", "description", "is_system", "created_at", "updated_at") VALUES ('Training Commander', 'Training Commander', false, now(), now());
INSERT INTO "roles" ("name", "description", "is_system", "created_at", "updated_at") VALUES ('Training Wing Commander', 'Training Wing Commander', false, now(), now());
INSERT INTO "roles" ("name", "description", "is_system", "created_at", "updated_at") VALUES ('Course Officer', 'Course Officer', false, now(), now());
INSERT INTO "roles" ("name", "description", "is_system", "created_at", "updated_at") VALUES ('Instructor', 'Instructor', false, now(), now());
INSERT INTO "roles" ("name", "description", "is_system", "created_at", "updated_at") VALUES ('Student', 'Student', false, now(), now());
INSERT INTO "roles" ("name", "description", "is_system", "created_at", "updated_at") VALUES ('Admin Staff', 'Admin Staff', false, now(), now());
INSERT INTO "roles" ("name", "description", "is_system", "created_at", "updated_at") VALUES ('IT & Data Entry', 'IT & Data Entry', false, now(), now());
INSERT INTO "roles" ("name", "description", "is_system", "created_at", "updated_at") VALUES ('QCS', 'QCS', false, now(), now());
INSERT INTO "roles" ("name", "description", "is_system", "created_at", "updated_at") VALUES ('QCS Section Head', 'QCS Section Head', false, now(), now());
INSERT INTO "roles" ("name", "description", "is_system", "created_at", "updated_at") VALUES ('CDS', 'CDS', false, now(), now());
INSERT INTO "roles" ("name", "description", "is_system", "created_at", "updated_at") VALUES ('CDS Section Head', 'CDS Section Head', false, now(), now());

-- 3. INSERT role_permissions
-- (skipped if role or permission does not exist)
-- --------------------------------------------------
-- Role: Training Commander
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'role:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'teacher:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'student:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'schedule_entry:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'attendance:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'library:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'quiz:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'question:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'course:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'course:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'survey:creator';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'survey:take';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'survey:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'file:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'file:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'file:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'class_session:join';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'class_session:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'request:read_own';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'progress_tracker:teacher';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Commander'
  AND "p"."code" = 'faq:read';

-- Role: Training Wing Commander
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'role:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'teacher:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'student:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'schedule_entry:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'attendance:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'library:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'library:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'quiz:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'question:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'course:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'course:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'survey:creator';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'survey:take';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'survey:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'file:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'file:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'file:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'class_session:join';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'class_session:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'class_session:host';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'class_session:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'request:read_own';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'progress_tracker:teacher';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Training Wing Commander'
  AND "p"."code" = 'faq:read';

-- Role: Course Officer
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'role:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'teacher:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'student:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'schedule_entry:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'attendance:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'library:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'library:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'quiz:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'question:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'course:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'course:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'survey:creator';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'survey:take';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'survey:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'file:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'file:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'file:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'class_session:join';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'class_session:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'class_session:host';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'class_session:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'request:read_own';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'request:config';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'request:create';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'request:forward';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'request:read_own:respond';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'progress_tracker:admin';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'faq:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Course Officer'
  AND "p"."code" = 'faq:write';

-- Role: Instructor
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'role:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'teacher:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'student:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'schedule_entry:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'attendance:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'library:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'library:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'quiz:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'question:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'course:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'course:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'survey:creator';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'survey:take';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'survey:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'file:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'class_session:join';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'class_session:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'class_session:host';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'class_session:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'request:read_own';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'request:config';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'request:create';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'request:forward';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'request:read_own:respond';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'progress_tracker:admin';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Instructor'
  AND "p"."code" = 'faq:read';

-- Role: Student
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'schedule_entry:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'attendance:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'library:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'quiz:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'question:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'course:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'survey:creator';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'survey:take';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'survey:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'file:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'class_session:join';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'class_session:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'request:read_own';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'request:config';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'request:create';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'request:forward';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'request:read_own:respond';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'progress_tracker:student';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Student'
  AND "p"."code" = 'faq:read';

-- Role: Admin Staff
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'schedule_entry:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'attendance:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'library:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'quiz:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'question:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'course:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'course:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'survey:creator';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'survey:take';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'survey:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'file:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'class_session:join';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'class_session:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'request:read_own';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'progress_tracker:admin';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'Admin Staff'
  AND "p"."code" = 'faq:read';

-- Role: IT & Data Entry
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'role:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'teacher:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'student:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'schedule_entry:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'attendance:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'library:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'library:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'quiz:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'question:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'quiz:approve';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'quiz:reject';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'course:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'course:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'survey:creator';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'survey:take';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'survey:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'file:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'file:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'file:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'class_session:join';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'class_session:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'request:read_own';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'request:config';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'request:create';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'request:forward';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'request:read_own:respond';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'progress_tracker:admin';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'faq:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'IT & Data Entry'
  AND "p"."code" = 'faq:write';

-- Role: QCS
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'role:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'teacher:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'student:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'schedule_entry:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'attendance:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'library:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'quiz:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'question:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'quiz:approve';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'quiz:reject';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'course:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'course:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'survey:creator';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'survey:take';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'survey:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'file:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'class_session:join';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'class_session:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'class_session:host';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'class_session:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'course_master:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'course_master:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'course_info:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'course_info:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'material:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'material:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'material:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'form_builder:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'form_builder:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'form_builder:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'evaluation:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'evaluation:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'evaluation:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'request:read_own';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'request:config';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'request:create';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'request:forward';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'request:read_own:respond';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'progress_tracker:admin';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS'
  AND "p"."code" = 'faq:read';

-- Role: QCS Section Head
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'role:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'teacher:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'student:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'schedule_entry:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'quiz:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'question:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'quiz:approve';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'quiz:reject';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'course:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'course:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'survey:creator';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'survey:take';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'survey:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'file:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'class_session:join';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'class_session:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'class_session:host';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'class_session:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'course_master:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'course_master:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'course_info:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'course_info:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'material:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'material:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'material:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'form_builder:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'form_builder:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'form_builder:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'evaluation:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'evaluation:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'evaluation:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'request:read_own';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'request:config';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'request:create';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'request:forward';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'QCS Section Head'
  AND "p"."code" = 'request:read_own:respond';

-- Role: CDS
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'role:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'teacher:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'student:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'schedule_entry:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'attendance:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'library:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'quiz:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'question:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'course:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'course:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'survey:creator';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'survey:take';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'survey:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'file:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'class_session:join';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'class_session:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'class_session:host';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'class_session:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'course_master:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'course_master:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'course_info:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'course_info:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'material:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'material:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'material:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'form_builder:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'form_builder:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'form_builder:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'evaluation:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'evaluation:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'evaluation:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'request:read_own';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'request:config';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'request:create';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'request:forward';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'request:read_own:respond';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'progress_tracker:admin';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS'
  AND "p"."code" = 'faq:read';

-- Role: CDS Section Head
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'role:manage';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'teacher:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'student:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'schedule_entry:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'attendance:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'library:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'quiz:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'question:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'course:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'course:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'survey:creator';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'survey:take';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'survey:view';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'file:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'class_session:join';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'class_session:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'class_session:host';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'class_session:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'course_master:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'course_master:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'course_info:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'course_info:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'material:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'material:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'material:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'form_builder:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'form_builder:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'form_builder:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'evaluation:read';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'evaluation:write';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'evaluation:delete';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'request:read_own';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'request:config';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'request:create';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'request:forward';
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "r"."id", "p"."id"
FROM "roles" "r" CROSS JOIN "permissions" "p"
WHERE "r"."name" = 'CDS Section Head'
  AND "p"."code" = 'request:read_own:respond';

