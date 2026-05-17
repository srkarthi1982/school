import {
  createClass,
  createSection,
  createStudent,
  createSubject,
  createTeacher,
  getFoundationWorkspace,
  getSchoolOrganization,
  listClasses,
  listSections,
  listStudents,
  listSubjects,
  listTeachers,
  upsertSchoolOrganization,
} from "./schoolFoundation";

export const schoolFoundation = {
  getSchoolOrganization,
  upsertSchoolOrganization,
  listClasses,
  createClass,
  listSections,
  createSection,
  listSubjects,
  createSubject,
  listStudents,
  createStudent,
  listTeachers,
  createTeacher,
  getFoundationWorkspace,
};

export const server = {
  schoolFoundation,
};
