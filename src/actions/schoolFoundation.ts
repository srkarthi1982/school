import { randomUUID } from "node:crypto";
import { ActionError, defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import {
  SchoolClasses,
  SchoolOrganizations,
  SchoolSections,
  Students,
  Subjects,
  Teachers,
  and,
  asc,
  db,
  desc,
  eq,
} from "astro:db";
import { requireUser } from "./_guards";

const MAX = {
  short: 40,
  name: 120,
  phone: 40,
  email: 160,
  code: 24,
};

const statusValues = ["active", "inactive"] as const;
const genderValues = ["female", "male", "other", "unspecified"] as const;

const requiredText = (value: string | undefined, label: string, maxLength = MAX.name) => {
  const clean = String(value ?? "").trim();
  if (!clean) {
    throw new ActionError({ code: "BAD_REQUEST", message: `${label} is required.` });
  }
  if (clean.length > maxLength) {
    throw new ActionError({ code: "BAD_REQUEST", message: `${label} is too long.` });
  }
  return clean;
};

const optionalText = (value: string | undefined, maxLength = MAX.name) => {
  const clean = String(value ?? "").trim();
  return clean.slice(0, maxLength);
};

const toSortOrder = (value: number | undefined) => {
  if (value === undefined || value === null) return 0;
  return Number.isFinite(value) ? Math.trunc(value) : 0;
};

const toSlug = (value: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `school-${randomUUID().slice(0, 8)}`;
};

const normalizeDate = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
};

const normalizeOrganization = (row: typeof SchoolOrganizations.$inferSelect) => ({
  ...row,
  createdAt: normalizeDate(row.createdAt),
  updatedAt: normalizeDate(row.updatedAt),
});

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
      message: "Create your school organization before adding school records.",
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

const requireOwnedSection = async (schoolId: string, sectionId: string, classId?: string) => {
  const conditions = [eq(SchoolSections.id, sectionId), eq(SchoolSections.schoolId, schoolId)];
  if (classId) conditions.push(eq(SchoolSections.classId, classId));
  const section = await db
    .select()
    .from(SchoolSections)
    .where(and(...conditions))
    .get();
  if (!section) {
    throw new ActionError({ code: "BAD_REQUEST", message: "Section is invalid for this school." });
  }
  return section;
};

const requireOwnedSubject = async (schoolId: string, subjectId: string) => {
  const subject = await db
    .select()
    .from(Subjects)
    .where(and(eq(Subjects.id, subjectId), eq(Subjects.schoolId, schoolId)))
    .get();
  if (!subject) {
    throw new ActionError({ code: "BAD_REQUEST", message: "Subject is invalid for this school." });
  }
  return subject;
};

const requireOwnedStudent = async (schoolId: string, studentId: string) => {
  const student = await db
    .select()
    .from(Students)
    .where(and(eq(Students.id, studentId), eq(Students.schoolId, schoolId)))
    .get();
  if (!student) {
    throw new ActionError({ code: "BAD_REQUEST", message: "Student is invalid for this school." });
  }
  return student;
};

const requireOwnedTeacher = async (schoolId: string, teacherId: string) => {
  const teacher = await db
    .select()
    .from(Teachers)
    .where(and(eq(Teachers.id, teacherId), eq(Teachers.schoolId, schoolId)))
    .get();
  if (!teacher) {
    throw new ActionError({ code: "BAD_REQUEST", message: "Teacher is invalid for this school." });
  }
  return teacher;
};

const organizationSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  country: z.string().min(1),
  timezone: z.string().min(1),
  currency: z.string().min(1),
});

const idSchema = z.object({
  id: z.string().min(1),
});

const classSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.coerce.number().optional(),
});

const sectionSchema = z.object({
  classId: z.string().min(1),
  name: z.string().min(1),
  sortOrder: z.coerce.number().optional(),
});

const subjectSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
});

const studentSchema = z.object({
  classId: z.string().min(1),
  sectionId: z.string().min(1),
  admissionNumber: z.string().min(1),
  rollNumber: z.string().optional(),
  fullName: z.string().min(1),
  gender: z.enum(genderValues).optional(),
  dateOfBirth: z.string().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  status: z.enum(statusValues).optional(),
});

const teacherSchema = z.object({
  employeeNumber: z.string().min(1),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  primarySubjectId: z.string().optional(),
  status: z.enum(statusValues).optional(),
});

const classUpdateSchema = idSchema.merge(classSchema);
const sectionUpdateSchema = idSchema.merge(sectionSchema);
const subjectUpdateSchema = idSchema.merge(subjectSchema);
const studentUpdateSchema = idSchema.merge(studentSchema);
const teacherUpdateSchema = idSchema.merge(teacherSchema);

const listBySchool = async (schoolId: string) => {
  const [classes, sections, subjects, students, teachers] = await Promise.all([
    db
      .select()
      .from(SchoolClasses)
      .where(eq(SchoolClasses.schoolId, schoolId))
      .orderBy(asc(SchoolClasses.sortOrder), asc(SchoolClasses.name)),
    db
      .select()
      .from(SchoolSections)
      .where(eq(SchoolSections.schoolId, schoolId))
      .orderBy(asc(SchoolSections.sortOrder), asc(SchoolSections.name)),
    db
      .select()
      .from(Subjects)
      .where(eq(Subjects.schoolId, schoolId))
      .orderBy(asc(Subjects.name)),
    db
      .select()
      .from(Students)
      .where(eq(Students.schoolId, schoolId))
      .orderBy(desc(Students.createdAt)),
    db
      .select()
      .from(Teachers)
      .where(eq(Teachers.schoolId, schoolId))
      .orderBy(desc(Teachers.createdAt)),
  ]);

  return {
    classes: classes.map(normalizeDated),
    sections: sections.map(normalizeDated),
    subjects: subjects.map(normalizeDated),
    students: students.map(normalizeDated),
    teachers: teachers.map(normalizeDated),
  };
};

export const getSchoolOrganization = defineAction({
  input: z.object({}).optional(),
  async handler(_input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await getOwnedSchool(user.id);
    return {
      school: school ? normalizeOrganization(school) : null,
    };
  },
});

export const upsertSchoolOrganization = defineAction({
  input: organizationSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const now = new Date();
    const name = requiredText(input.name, "School name");
    const schoolInput = {
      name,
      slug: toSlug(optionalText(input.slug, 80) || name),
      country: requiredText(input.country, "Country", MAX.short),
      timezone: requiredText(input.timezone, "Timezone", MAX.short),
      currency: requiredText(input.currency, "Currency", 12).toUpperCase(),
      updatedAt: now,
    };

    const existing = await getOwnedSchool(user.id);
    if (existing) {
      const [school] = await db
        .update(SchoolOrganizations)
        .set(schoolInput)
        .where(and(eq(SchoolOrganizations.id, existing.id), eq(SchoolOrganizations.ownerUserId, user.id)))
        .returning();
      return {
        school: normalizeOrganization(school),
      };
    }

    const [school] = await db
      .insert(SchoolOrganizations)
      .values({
        id: randomUUID(),
        ownerUserId: user.id,
        createdAt: now,
        ...schoolInput,
      })
      .returning();

    return {
      school: normalizeOrganization(school),
    };
  },
});

export const listClasses = defineAction({
  input: z.object({}).optional(),
  async handler(_input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const items = await db
      .select()
      .from(SchoolClasses)
      .where(eq(SchoolClasses.schoolId, school.id))
      .orderBy(asc(SchoolClasses.sortOrder), asc(SchoolClasses.name));
    return { items: items.map(normalizeDated) };
  },
});

export const createClass = defineAction({
  input: classSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const now = new Date();
    const [item] = await db
      .insert(SchoolClasses)
      .values({
        id: randomUUID(),
        schoolId: school.id,
        name: requiredText(input.name, "Class name"),
        sortOrder: toSortOrder(input.sortOrder),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { item: normalizeDated(item) };
  },
});

export const updateClass = defineAction({
  input: classUpdateSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedClass(school.id, input.id);
    const [item] = await db
      .update(SchoolClasses)
      .set({
        name: requiredText(input.name, "Class name"),
        sortOrder: toSortOrder(input.sortOrder),
        updatedAt: new Date(),
      })
      .where(and(eq(SchoolClasses.id, input.id), eq(SchoolClasses.schoolId, school.id)))
      .returning();
    return { item: normalizeDated(item) };
  },
});

export const deleteClass = defineAction({
  input: idSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedClass(school.id, input.id);
    await db
      .delete(SchoolClasses)
      .where(and(eq(SchoolClasses.id, input.id), eq(SchoolClasses.schoolId, school.id)));
    return { ok: true };
  },
});

export const listSections = defineAction({
  input: z.object({}).optional(),
  async handler(_input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const items = await db
      .select()
      .from(SchoolSections)
      .where(eq(SchoolSections.schoolId, school.id))
      .orderBy(asc(SchoolSections.sortOrder), asc(SchoolSections.name));
    return { items: items.map(normalizeDated) };
  },
});

export const createSection = defineAction({
  input: sectionSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedClass(school.id, input.classId);
    const now = new Date();
    const [item] = await db
      .insert(SchoolSections)
      .values({
        id: randomUUID(),
        schoolId: school.id,
        classId: input.classId,
        name: requiredText(input.name, "Section name", MAX.short),
        sortOrder: toSortOrder(input.sortOrder),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { item: normalizeDated(item) };
  },
});

export const updateSection = defineAction({
  input: sectionUpdateSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedSection(school.id, input.id);
    await requireOwnedClass(school.id, input.classId);
    const [item] = await db
      .update(SchoolSections)
      .set({
        classId: input.classId,
        name: requiredText(input.name, "Section name", MAX.short),
        sortOrder: toSortOrder(input.sortOrder),
        updatedAt: new Date(),
      })
      .where(and(eq(SchoolSections.id, input.id), eq(SchoolSections.schoolId, school.id)))
      .returning();
    return { item: normalizeDated(item) };
  },
});

export const deleteSection = defineAction({
  input: idSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedSection(school.id, input.id);
    await db
      .delete(SchoolSections)
      .where(and(eq(SchoolSections.id, input.id), eq(SchoolSections.schoolId, school.id)));
    return { ok: true };
  },
});

export const listSubjects = defineAction({
  input: z.object({}).optional(),
  async handler(_input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const items = await db
      .select()
      .from(Subjects)
      .where(eq(Subjects.schoolId, school.id))
      .orderBy(asc(Subjects.name));
    return { items: items.map(normalizeDated) };
  },
});

export const createSubject = defineAction({
  input: subjectSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const now = new Date();
    const [item] = await db
      .insert(Subjects)
      .values({
        id: randomUUID(),
        schoolId: school.id,
        name: requiredText(input.name, "Subject name"),
        code: optionalText(input.code, MAX.code),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { item: normalizeDated(item) };
  },
});

export const updateSubject = defineAction({
  input: subjectUpdateSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedSubject(school.id, input.id);
    const [item] = await db
      .update(Subjects)
      .set({
        name: requiredText(input.name, "Subject name"),
        code: optionalText(input.code, MAX.code),
        updatedAt: new Date(),
      })
      .where(and(eq(Subjects.id, input.id), eq(Subjects.schoolId, school.id)))
      .returning();
    return { item: normalizeDated(item) };
  },
});

export const deleteSubject = defineAction({
  input: idSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedSubject(school.id, input.id);
    await db
      .delete(Subjects)
      .where(and(eq(Subjects.id, input.id), eq(Subjects.schoolId, school.id)));
    return { ok: true };
  },
});

export const listStudents = defineAction({
  input: z.object({}).optional(),
  async handler(_input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const items = await db
      .select()
      .from(Students)
      .where(eq(Students.schoolId, school.id))
      .orderBy(desc(Students.createdAt));
    return { items: items.map(normalizeDated) };
  },
});

export const createStudent = defineAction({
  input: studentSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedClass(school.id, input.classId);
    await requireOwnedSection(school.id, input.sectionId, input.classId);
    const now = new Date();
    const [item] = await db
      .insert(Students)
      .values({
        id: randomUUID(),
        schoolId: school.id,
        classId: input.classId,
        sectionId: input.sectionId,
        admissionNumber: requiredText(input.admissionNumber, "Admission number", MAX.short),
        rollNumber: optionalText(input.rollNumber, MAX.short),
        fullName: requiredText(input.fullName, "Student name"),
        gender: input.gender ?? "unspecified",
        dateOfBirth: optionalText(input.dateOfBirth, MAX.short),
        guardianName: optionalText(input.guardianName),
        guardianPhone: optionalText(input.guardianPhone, MAX.phone),
        status: input.status ?? "active",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { item: normalizeDated(item) };
  },
});

export const updateStudent = defineAction({
  input: studentUpdateSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedStudent(school.id, input.id);
    await requireOwnedClass(school.id, input.classId);
    await requireOwnedSection(school.id, input.sectionId, input.classId);
    const [item] = await db
      .update(Students)
      .set({
        classId: input.classId,
        sectionId: input.sectionId,
        admissionNumber: requiredText(input.admissionNumber, "Admission number", MAX.short),
        rollNumber: optionalText(input.rollNumber, MAX.short),
        fullName: requiredText(input.fullName, "Student name"),
        gender: input.gender ?? "unspecified",
        dateOfBirth: optionalText(input.dateOfBirth, MAX.short),
        guardianName: optionalText(input.guardianName),
        guardianPhone: optionalText(input.guardianPhone, MAX.phone),
        status: input.status ?? "active",
        updatedAt: new Date(),
      })
      .where(and(eq(Students.id, input.id), eq(Students.schoolId, school.id)))
      .returning();
    return { item: normalizeDated(item) };
  },
});

export const deleteStudent = defineAction({
  input: idSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedStudent(school.id, input.id);
    await db
      .delete(Students)
      .where(and(eq(Students.id, input.id), eq(Students.schoolId, school.id)));
    return { ok: true };
  },
});

export const listTeachers = defineAction({
  input: z.object({}).optional(),
  async handler(_input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const items = await db
      .select()
      .from(Teachers)
      .where(eq(Teachers.schoolId, school.id))
      .orderBy(desc(Teachers.createdAt));
    return { items: items.map(normalizeDated) };
  },
});

export const createTeacher = defineAction({
  input: teacherSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const primarySubjectId = optionalText(input.primarySubjectId, 80);
    if (primarySubjectId) {
      await requireOwnedSubject(school.id, primarySubjectId);
    }
    const now = new Date();
    const [item] = await db
      .insert(Teachers)
      .values({
        id: randomUUID(),
        schoolId: school.id,
        employeeNumber: requiredText(input.employeeNumber, "Employee number", MAX.short),
        fullName: requiredText(input.fullName, "Teacher name"),
        phone: optionalText(input.phone, MAX.phone),
        email: optionalText(input.email, MAX.email),
        primarySubjectId: primarySubjectId || undefined,
        status: input.status ?? "active",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { item: normalizeDated(item) };
  },
});

export const updateTeacher = defineAction({
  input: teacherUpdateSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedTeacher(school.id, input.id);
    const primarySubjectId = optionalText(input.primarySubjectId, 80);
    if (primarySubjectId) {
      await requireOwnedSubject(school.id, primarySubjectId);
    }
    const [item] = await db
      .update(Teachers)
      .set({
        employeeNumber: requiredText(input.employeeNumber, "Employee number", MAX.short),
        fullName: requiredText(input.fullName, "Teacher name"),
        phone: optionalText(input.phone, MAX.phone),
        email: optionalText(input.email, MAX.email),
        primarySubjectId: primarySubjectId || undefined,
        status: input.status ?? "active",
        updatedAt: new Date(),
      })
      .where(and(eq(Teachers.id, input.id), eq(Teachers.schoolId, school.id)))
      .returning();
    return { item: normalizeDated(item) };
  },
});

export const deleteTeacher = defineAction({
  input: idSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedTeacher(school.id, input.id);
    await db
      .delete(Teachers)
      .where(and(eq(Teachers.id, input.id), eq(Teachers.schoolId, school.id)));
    return { ok: true };
  },
});

export const getFoundationWorkspace = defineAction({
  input: z.object({}).optional(),
  async handler(_input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await getOwnedSchool(user.id);
    if (!school) {
      return {
        school: null,
        classes: [],
        sections: [],
        subjects: [],
        students: [],
        teachers: [],
      };
    }

    return {
      school: normalizeOrganization(school),
      ...(await listBySchool(school.id)),
    };
  },
});
