import { defineDb } from "astro:db";
import {
  AcademicYears,
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
  },
});
