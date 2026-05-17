import { defineDb } from "astro:db";
import {
  AcademicYears,
  DailyAttendanceExceptions,
  FeeCategories,
  FeeStructureItems,
  FeeStructures,
  SchoolClasses,
  SchoolOrganizations,
  SchoolSections,
  Students,
  Subjects,
  Teachers,
} from "./tables";

export default defineDb({
  tables: {
    SchoolOrganizations,
    AcademicYears,
    SchoolClasses,
    SchoolSections,
    Subjects,
    Students,
    Teachers,
    DailyAttendanceExceptions,
    FeeCategories,
    FeeStructures,
    FeeStructureItems,
  },
});
