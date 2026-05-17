import {
  createClass,
  createSection,
  createStudent,
  createSubject,
  createTeacher,
  deleteClass,
  deleteSection,
  deleteStudent,
  deleteSubject,
  deleteTeacher,
  getFoundationWorkspace,
  getSchoolOrganization,
  listClasses,
  listSections,
  listStudents,
  listSubjects,
  listTeachers,
  updateClass,
  updateSection,
  updateStudent,
  updateSubject,
  updateTeacher,
  upsertSchoolOrganization,
} from "./schoolFoundation";
import {
  getDailyAttendanceGrid,
  getDailyAttendanceSummary,
  listRecentDailyAttendanceSessions,
  saveDailyAttendance,
} from "./schoolAttendance";

export const schoolFoundation = {
  getSchoolOrganization,
  upsertSchoolOrganization,
  listClasses,
  createClass,
  updateClass,
  deleteClass,
  listSections,
  createSection,
  updateSection,
  deleteSection,
  listSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  listTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  getFoundationWorkspace,
};

export const schoolAttendance = {
  getDailyAttendanceGrid,
  saveDailyAttendance,
  listRecentDailyAttendanceSessions,
  getDailyAttendanceSummary,
};

export const server = {
  schoolFoundation,
  schoolAttendance,
};
