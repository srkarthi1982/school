import { randomUUID } from "node:crypto";
import { ActionError, defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import {
  DailyAttendanceExceptions,
  SchoolClasses,
  SchoolOrganizations,
  SchoolSections,
  Students,
  and,
  asc,
  db,
  desc,
  eq,
  inArray,
} from "astro:db";
import { requireUser } from "./_guards";

const exceptionStatuses = ["absent", "late", "excused"] as const;
const attendanceStatuses = ["present", ...exceptionStatuses] as const;

type AttendanceStatus = (typeof attendanceStatuses)[number];
type ExceptionStatus = (typeof exceptionStatuses)[number];

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid attendance date.");

const attendanceFilterSchema = z.object({
  classId: z.string().min(1),
  sectionId: z.string().min(1),
  attendanceDate: dateSchema,
});

const attendanceEntrySchema = z.object({
  status: z.enum(attendanceStatuses),
  remarks: z.string().optional(),
});

const saveAttendanceSchema = attendanceFilterSchema.extend({
  attendance: z.record(z.string(), attendanceEntrySchema),
});

const summarySchema = z.object({
  attendanceDate: dateSchema,
});

const optionalText = (value: string | undefined, maxLength = 240) => {
  const clean = String(value ?? "").trim();
  return clean.slice(0, maxLength);
};

const normalizeDate = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
};

const normalizeDated = <T extends { createdAt: unknown; updatedAt: unknown }>(row: T) => ({
  ...row,
  createdAt: normalizeDate(row.createdAt),
  updatedAt: normalizeDate(row.updatedAt),
});

const getOwnedSchool = async (ownerUserId: string) => {
  return db
    .select()
    .from(SchoolOrganizations)
    .where(eq(SchoolOrganizations.ownerUserId, ownerUserId))
    .orderBy(desc(SchoolOrganizations.updatedAt))
    .get();
};

const requireOwnedSchool = async (ownerUserId: string) => {
  const school = await getOwnedSchool(ownerUserId);
  if (!school) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: "Create your school organization before taking attendance.",
    });
  }
  return school;
};

const requireOwnedClass = async (schoolId: string, classId: string) => {
  const schoolClass = await db
    .select()
    .from(SchoolClasses)
    .where(and(eq(SchoolClasses.id, classId), eq(SchoolClasses.schoolId, schoolId)))
    .get();
  if (!schoolClass) {
    throw new ActionError({ code: "BAD_REQUEST", message: "Class is invalid for this school." });
  }
  return schoolClass;
};

const requireOwnedSection = async (schoolId: string, sectionId: string, classId: string) => {
  const section = await db
    .select()
    .from(SchoolSections)
    .where(and(eq(SchoolSections.id, sectionId), eq(SchoolSections.schoolId, schoolId), eq(SchoolSections.classId, classId)))
    .get();
  if (!section) {
    throw new ActionError({ code: "BAD_REQUEST", message: "Section is invalid for this class." });
  }
  return section;
};

const requireAttendanceScope = async (ownerUserId: string, input: z.infer<typeof attendanceFilterSchema>) => {
  const school = await requireOwnedSchool(ownerUserId);
  const [schoolClass, section] = await Promise.all([
    requireOwnedClass(school.id, input.classId),
    requireOwnedSection(school.id, input.sectionId, input.classId),
  ]);
  return { school, schoolClass, section };
};

const listActiveStudents = async (schoolId: string, classId: string, sectionId: string) => {
  return db
    .select()
    .from(Students)
    .where(
      and(
        eq(Students.schoolId, schoolId),
        eq(Students.classId, classId),
        eq(Students.sectionId, sectionId),
        eq(Students.status, "active"),
      ),
    )
    .orderBy(asc(Students.rollNumber), asc(Students.fullName));
};

const listExceptionsForSectionDate = async (schoolId: string, classId: string, sectionId: string, attendanceDate: string) => {
  return db
    .select()
    .from(DailyAttendanceExceptions)
    .where(
      and(
        eq(DailyAttendanceExceptions.schoolId, schoolId),
        eq(DailyAttendanceExceptions.classId, classId),
        eq(DailyAttendanceExceptions.sectionId, sectionId),
        eq(DailyAttendanceExceptions.attendanceDate, attendanceDate),
      ),
    );
};

const summarizeRows = (activeStudentCount: number, exceptions: Array<typeof DailyAttendanceExceptions.$inferSelect>) => {
  const summary = {
    present: Math.max(activeStudentCount - exceptions.length, 0),
    absent: 0,
    late: 0,
    excused: 0,
    exceptions: exceptions.length,
  };

  for (const row of exceptions) {
    if (row.status === "absent") summary.absent += 1;
    if (row.status === "late") summary.late += 1;
    if (row.status === "excused") summary.excused += 1;
  }

  return summary;
};

export const getDailyAttendanceGrid = defineAction({
  input: attendanceFilterSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const { school, schoolClass, section } = await requireAttendanceScope(user.id, input);
    const students = await listActiveStudents(school.id, input.classId, input.sectionId);
    const exceptions = await listExceptionsForSectionDate(school.id, input.classId, input.sectionId, input.attendanceDate);
    const exceptionByStudent = new Map(exceptions.map((row) => [row.studentId, row]));

    return {
      class: schoolClass,
      section,
      attendanceDate: input.attendanceDate,
      students: students.map((student) => {
        const exception = exceptionByStudent.get(student.id);
        return {
          ...normalizeDated(student),
          attendanceStatus: (exception?.status ?? "present") as AttendanceStatus,
          attendanceRemarks: exception?.remarks ?? "",
          exceptionId: exception?.id ?? null,
        };
      }),
      summary: summarizeRows(students.length, exceptions),
    };
  },
});

export const saveDailyAttendance = defineAction({
  input: saveAttendanceSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const { school } = await requireAttendanceScope(user.id, input);
    const activeStudents = await listActiveStudents(school.id, input.classId, input.sectionId);
    const activeStudentIds = new Set(activeStudents.map((student) => student.id));
    const submittedStudentIds = Object.keys(input.attendance);

    for (const studentId of submittedStudentIds) {
      if (!activeStudentIds.has(studentId)) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Attendance contains a student outside the selected class and section.",
        });
      }
    }

    const now = new Date();

    for (const student of activeStudents) {
      const entry = input.attendance[student.id] ?? { status: "present" as const, remarks: "" };
      const status = entry.status;
      const remarks = optionalText(entry.remarks);

      const existingRows = await db
        .select()
        .from(DailyAttendanceExceptions)
        .where(
          and(
            eq(DailyAttendanceExceptions.schoolId, school.id),
            eq(DailyAttendanceExceptions.studentId, student.id),
            eq(DailyAttendanceExceptions.attendanceDate, input.attendanceDate),
          ),
        );

      if (status === "present") {
        if (existingRows.length > 0) {
          await db
            .delete(DailyAttendanceExceptions)
            .where(
              and(
                eq(DailyAttendanceExceptions.schoolId, school.id),
                eq(DailyAttendanceExceptions.studentId, student.id),
                eq(DailyAttendanceExceptions.attendanceDate, input.attendanceDate),
              ),
            );
        }
        continue;
      }

      if (!exceptionStatuses.includes(status as ExceptionStatus)) {
        throw new ActionError({ code: "BAD_REQUEST", message: "Attendance status is invalid." });
      }

      if (existingRows.length > 1) {
        await db
          .delete(DailyAttendanceExceptions)
          .where(
            and(
              eq(DailyAttendanceExceptions.schoolId, school.id),
              eq(DailyAttendanceExceptions.studentId, student.id),
              eq(DailyAttendanceExceptions.attendanceDate, input.attendanceDate),
            ),
          );
      }

      if (existingRows.length === 1) {
        await db
          .update(DailyAttendanceExceptions)
          .set({
            classId: input.classId,
            sectionId: input.sectionId,
            status,
            remarks,
            updatedAt: now,
          })
          .where(and(eq(DailyAttendanceExceptions.id, existingRows[0].id), eq(DailyAttendanceExceptions.schoolId, school.id)));
        continue;
      }

      await db.insert(DailyAttendanceExceptions).values({
        id: randomUUID(),
        schoolId: school.id,
        classId: input.classId,
        sectionId: input.sectionId,
        studentId: student.id,
        attendanceDate: input.attendanceDate,
        status,
        remarks,
        createdAt: now,
        updatedAt: now,
      });
    }

    const exceptions = await listExceptionsForSectionDate(school.id, input.classId, input.sectionId, input.attendanceDate);

    return {
      ok: true,
      summary: summarizeRows(activeStudents.length, exceptions),
    };
  },
});

export const listRecentDailyAttendanceSessions = defineAction({
  input: z.object({}).optional(),
  async handler(_input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const exceptions = await db
      .select()
      .from(DailyAttendanceExceptions)
      .where(eq(DailyAttendanceExceptions.schoolId, school.id))
      .orderBy(desc(DailyAttendanceExceptions.attendanceDate), desc(DailyAttendanceExceptions.updatedAt));

    const classIds = Array.from(new Set(exceptions.map((row) => row.classId)));
    const sectionIds = Array.from(new Set(exceptions.map((row) => row.sectionId)));
    const [classes, sections] = await Promise.all([
      classIds.length > 0
        ? db.select().from(SchoolClasses).where(and(eq(SchoolClasses.schoolId, school.id), inArray(SchoolClasses.id, classIds)))
        : [],
      sectionIds.length > 0
        ? db.select().from(SchoolSections).where(and(eq(SchoolSections.schoolId, school.id), inArray(SchoolSections.id, sectionIds)))
        : [],
    ]);
    const classById = new Map(classes.map((item) => [item.id, item.name]));
    const sectionById = new Map(sections.map((item) => [item.id, item.name]));
    const sessionByKey = new Map<string, { attendanceDate: string; classId: string; sectionId: string; className: string; sectionName: string; exceptionCount: number }>();

    for (const row of exceptions) {
      const key = `${row.attendanceDate}:${row.classId}:${row.sectionId}`;
      const current = sessionByKey.get(key);
      if (current) {
        current.exceptionCount += 1;
      } else {
        sessionByKey.set(key, {
          attendanceDate: row.attendanceDate,
          classId: row.classId,
          sectionId: row.sectionId,
          className: classById.get(row.classId) ?? "-",
          sectionName: sectionById.get(row.sectionId) ?? "-",
          exceptionCount: 1,
        });
      }
    }

    return { sessions: Array.from(sessionByKey.values()).slice(0, 8) };
  },
});

export const getDailyAttendanceSummary = defineAction({
  input: summarySchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const [activeStudents, exceptions] = await Promise.all([
      db
        .select()
        .from(Students)
        .where(and(eq(Students.schoolId, school.id), eq(Students.status, "active"))),
      db
        .select()
        .from(DailyAttendanceExceptions)
        .where(and(eq(DailyAttendanceExceptions.schoolId, school.id), eq(DailyAttendanceExceptions.attendanceDate, input.attendanceDate))),
    ]);

    return { attendanceDate: input.attendanceDate, summary: summarizeRows(activeStudents.length, exceptions) };
  },
});
