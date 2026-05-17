import { column, defineTable, NOW } from "astro:db";

export const SchoolOrganizations = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ownerUserId: column.text(),
    name: column.text(),
    slug: column.text(),
    country: column.text(),
    timezone: column.text(),
    currency: column.text(),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
  indexes: [
    {
      name: "school_org_owner_idx",
      on: "ownerUserId",
      unique: true,
    },
    {
      name: "school_org_slug_idx",
      on: "slug",
    },
  ],
});

export const AcademicYears = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    schoolId: column.text({ references: () => SchoolOrganizations.columns.id }),
    name: column.text(),
    startsOn: column.text(),
    endsOn: column.text(),
    isActive: column.boolean({ default: false }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
  indexes: [
    {
      name: "academic_years_school_idx",
      on: "schoolId",
    },
  ],
});

export const SchoolClasses = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    schoolId: column.text({ references: () => SchoolOrganizations.columns.id }),
    name: column.text(),
    sortOrder: column.number({ default: 0 }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
  indexes: [
    {
      name: "school_classes_school_idx",
      on: "schoolId",
    },
  ],
});

export const SchoolSections = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    schoolId: column.text({ references: () => SchoolOrganizations.columns.id }),
    classId: column.text({ references: () => SchoolClasses.columns.id }),
    name: column.text(),
    sortOrder: column.number({ default: 0 }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
  indexes: [
    {
      name: "school_sections_school_idx",
      on: "schoolId",
    },
    {
      name: "school_sections_class_idx",
      on: "classId",
    },
  ],
});

export const Subjects = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    schoolId: column.text({ references: () => SchoolOrganizations.columns.id }),
    name: column.text(),
    code: column.text(),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
  indexes: [
    {
      name: "subjects_school_idx",
      on: "schoolId",
    },
  ],
});

export const Students = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    schoolId: column.text({ references: () => SchoolOrganizations.columns.id }),
    classId: column.text({ references: () => SchoolClasses.columns.id }),
    sectionId: column.text({ references: () => SchoolSections.columns.id }),
    admissionNumber: column.text(),
    rollNumber: column.text(),
    fullName: column.text(),
    gender: column.text(),
    dateOfBirth: column.text(),
    guardianName: column.text(),
    guardianPhone: column.text(),
    status: column.text(),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
  indexes: [
    {
      name: "students_school_idx",
      on: "schoolId",
    },
    {
      name: "students_class_section_idx",
      on: ["classId", "sectionId"],
    },
  ],
});

export const Teachers = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    schoolId: column.text({ references: () => SchoolOrganizations.columns.id }),
    employeeNumber: column.text(),
    fullName: column.text(),
    phone: column.text(),
    email: column.text(),
    primarySubjectId: column.text({ optional: true, references: () => Subjects.columns.id }),
    status: column.text(),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
  indexes: [
    {
      name: "teachers_school_idx",
      on: "schoolId",
    },
  ],
});

export const schoolTables = {
  SchoolOrganizations,
  AcademicYears,
  SchoolClasses,
  SchoolSections,
  Subjects,
  Students,
  Teachers,
} as const;
