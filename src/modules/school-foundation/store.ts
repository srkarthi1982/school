import type { Alpine } from "alpinejs";
import { AvBaseStore } from "@ansiversa/components/alpine";
import { actions } from "astro:actions";

type SchoolOrganizationDTO = {
  id: string;
  ownerUserId: string;
  name: string;
  slug: string;
  country: string;
  timezone: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

type ClassDTO = {
  id: string;
  schoolId: string;
  name: string;
  sortOrder: number;
};

type SectionDTO = ClassDTO & {
  classId: string;
};

type SubjectDTO = {
  id: string;
  schoolId: string;
  name: string;
  code: string;
};

type StudentDTO = {
  id: string;
  schoolId: string;
  classId: string;
  sectionId: string;
  admissionNumber: string;
  rollNumber: string;
  fullName: string;
  gender: string;
  dateOfBirth: string;
  guardianName: string;
  guardianPhone: string;
  status: string;
};

type TeacherDTO = {
  id: string;
  schoolId: string;
  employeeNumber: string;
  fullName: string;
  phone: string;
  email: string;
  primarySubjectId?: string | null;
  status: string;
};

type StudentGender = "female" | "male" | "other" | "unspecified";
type RecordStatus = "active" | "inactive";

type StudentForm = {
  classId: string;
  sectionId: string;
  admissionNumber: string;
  rollNumber: string;
  fullName: string;
  gender: StudentGender;
  dateOfBirth: string;
  guardianName: string;
  guardianPhone: string;
  status: RecordStatus;
};

type TeacherForm = {
  employeeNumber: string;
  fullName: string;
  phone: string;
  email: string;
  primarySubjectId: string;
  status: RecordStatus;
};

type WorkspaceState = {
  school: SchoolOrganizationDTO | null;
  classes: ClassDTO[];
  sections: SectionDTO[];
  subjects: SubjectDTO[];
  students: StudentDTO[];
  teachers: TeacherDTO[];
};

const defaultSchoolForm = () => ({
  name: "",
  slug: "",
  country: "",
  timezone: "Asia/Dubai",
  currency: "AED",
});

const defaultClassForm = () => ({
  name: "",
  sortOrder: 0,
});

const defaultSectionForm = () => ({
  classId: "",
  name: "",
  sortOrder: 0,
});

const defaultSubjectForm = () => ({
  name: "",
  code: "",
});

const defaultStudentForm = (): StudentForm => ({
  classId: "",
  sectionId: "",
  admissionNumber: "",
  rollNumber: "",
  fullName: "",
  gender: "unspecified",
  dateOfBirth: "",
  guardianName: "",
  guardianPhone: "",
  status: "active",
});

const defaultTeacherForm = (): TeacherForm => ({
  employeeNumber: "",
  fullName: "",
  phone: "",
  email: "",
  primarySubjectId: "",
  status: "active",
});

const emptyState = (): WorkspaceState => ({
  school: null,
  classes: [],
  sections: [],
  subjects: [],
  students: [],
  teachers: [],
});

export class SchoolFoundationStore extends AvBaseStore {
  school: SchoolOrganizationDTO | null = null;
  classes: ClassDTO[] = [];
  sections: SectionDTO[] = [];
  subjects: SubjectDTO[] = [];
  students: StudentDTO[] = [];
  teachers: TeacherDTO[] = [];
  activeTab = "classes";
  loading = false;
  error: string | null = null;
  success: string | null = null;
  schoolDrawerError: string | null = null;
  foundationDrawerError: string | null = null;
  schoolForm = defaultSchoolForm();
  classForm = defaultClassForm();
  sectionForm = defaultSectionForm();
  subjectForm = defaultSubjectForm();
  studentForm = defaultStudentForm();
  teacherForm = defaultTeacherForm();

  init(initial?: Partial<WorkspaceState>) {
    this.applyState({ ...emptyState(), ...(initial ?? {}) });
    this.resetSchoolForm();
  }

  get hasSchool() {
    return Boolean(this.school?.id);
  }

  get schoolRequiredMessage() {
    return "Create the school organization before adding records.";
  }

  private unwrap<T>(result: any): T {
    if (result?.error) {
      throw new Error(result.error?.message || "Request failed.");
    }
    return (result?.data ?? result) as T;
  }

  private applyState(state: WorkspaceState) {
    this.school = state.school ?? null;
    this.classes = state.classes ?? [];
    this.sections = state.sections ?? [];
    this.subjects = state.subjects ?? [];
    this.students = state.students ?? [];
    this.teachers = state.teachers ?? [];
  }

  private begin() {
    this.loading = true;
    this.error = null;
    this.success = null;
  }

  private finish() {
    this.loading = false;
  }

  private fail(err: any, fallback: string) {
    this.error = err?.message || fallback;
  }

  private closeDrawer() {
    const appDrawer = typeof window !== "undefined" ? (window.Alpine?.store("appDrawer") as any) : null;
    appDrawer?.close?.();
  }

  private requireSchoolForDrawer() {
    if (!this.hasSchool) {
      this.foundationDrawerError = this.schoolRequiredMessage;
      return false;
    }
    return true;
  }

  resetSchoolForm() {
    this.schoolForm = {
      ...defaultSchoolForm(),
      name: this.school?.name ?? "",
      slug: this.school?.slug ?? "",
      country: this.school?.country ?? "",
      timezone: this.school?.timezone ?? "Asia/Dubai",
      currency: this.school?.currency ?? "AED",
    };
  }

  openSchoolDrawer() {
    this.error = null;
    this.success = null;
    this.schoolDrawerError = null;
    this.resetSchoolForm();
  }

  openClassDrawer() {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.classForm = defaultClassForm();
  }

  openSectionDrawer() {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.sectionForm = defaultSectionForm();
  }

  openSubjectDrawer() {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.subjectForm = defaultSubjectForm();
  }

  openStudentDrawer() {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.studentForm = defaultStudentForm();
  }

  openTeacherDrawer() {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.teacherForm = defaultTeacherForm();
  }

  private async refreshClasses() {
    const result = await actions.schoolFoundation.listClasses({});
    const data = this.unwrap<{ items: ClassDTO[] }>(result);
    this.classes = data.items ?? [];
  }

  private async refreshSections() {
    const result = await actions.schoolFoundation.listSections({});
    const data = this.unwrap<{ items: SectionDTO[] }>(result);
    this.sections = data.items ?? [];
  }

  private async refreshSubjects() {
    const result = await actions.schoolFoundation.listSubjects({});
    const data = this.unwrap<{ items: SubjectDTO[] }>(result);
    this.subjects = data.items ?? [];
  }

  private async refreshStudents() {
    const result = await actions.schoolFoundation.listStudents({});
    const data = this.unwrap<{ items: StudentDTO[] }>(result);
    this.students = data.items ?? [];
  }

  private async refreshTeachers() {
    const result = await actions.schoolFoundation.listTeachers({});
    const data = this.unwrap<{ items: TeacherDTO[] }>(result);
    this.teachers = data.items ?? [];
  }

  async reload() {
    this.begin();
    try {
      const result = await actions.schoolFoundation.getFoundationWorkspace({});
      this.applyState(this.unwrap<WorkspaceState>(result));
      this.resetSchoolForm();
    } catch (err: any) {
      this.fail(err, "Unable to load School workspace.");
    } finally {
      this.finish();
    }
  }

  async saveSchool() {
    if (this.loading) return;
    if (
      !this.schoolForm.name.trim()
      || !this.schoolForm.country.trim()
      || !this.schoolForm.timezone.trim()
      || !this.schoolForm.currency.trim()
    ) {
      this.schoolDrawerError = "School name, country, timezone, and currency are required.";
      return;
    }

    this.begin();
    this.schoolDrawerError = null;
    try {
      await actions.schoolFoundation.upsertSchoolOrganization({ ...this.schoolForm });
      const workspaceResult = await actions.schoolFoundation.getFoundationWorkspace({});
      this.applyState(this.unwrap<WorkspaceState>(workspaceResult));
      this.resetSchoolForm();
      this.success = "School organization saved.";
      this.closeDrawer();
    } catch (err: any) {
      const message = err?.message || "Unable to save school organization.";
      this.schoolDrawerError = message;
      this.error = null;
    } finally {
      this.finish();
    }
  }

  async createClass() {
    if (this.loading) return;
    if (!this.requireSchoolForDrawer()) return;
    if (!this.classForm.name.trim()) {
      this.foundationDrawerError = "Class name is required.";
      return;
    }

    this.begin();
    this.foundationDrawerError = null;
    try {
      await actions.schoolFoundation.createClass({ ...this.classForm });
      await this.refreshClasses();
      this.classForm = defaultClassForm();
      this.success = "Class added.";
      this.closeDrawer();
    } catch (err: any) {
      this.foundationDrawerError = err?.message || "Unable to add class.";
    } finally {
      this.finish();
    }
  }

  async createSection() {
    if (this.loading) return;
    if (!this.requireSchoolForDrawer()) return;
    if (!this.sectionForm.classId || !this.sectionForm.name.trim()) {
      this.foundationDrawerError = "Class and section name are required.";
      return;
    }

    this.begin();
    this.foundationDrawerError = null;
    try {
      await actions.schoolFoundation.createSection({ ...this.sectionForm });
      await this.refreshSections();
      this.sectionForm = defaultSectionForm();
      this.success = "Section added.";
      this.closeDrawer();
    } catch (err: any) {
      this.foundationDrawerError = err?.message || "Unable to add section.";
    } finally {
      this.finish();
    }
  }

  async createSubject() {
    if (this.loading) return;
    if (!this.requireSchoolForDrawer()) return;
    if (!this.subjectForm.name.trim()) {
      this.foundationDrawerError = "Subject name is required.";
      return;
    }

    this.begin();
    this.foundationDrawerError = null;
    try {
      await actions.schoolFoundation.createSubject({ ...this.subjectForm });
      await this.refreshSubjects();
      this.subjectForm = defaultSubjectForm();
      this.success = "Subject added.";
      this.closeDrawer();
    } catch (err: any) {
      this.foundationDrawerError = err?.message || "Unable to add subject.";
    } finally {
      this.finish();
    }
  }

  async createStudent() {
    if (this.loading) return;
    if (!this.requireSchoolForDrawer()) return;
    if (!this.studentForm.classId || !this.studentForm.sectionId || !this.studentForm.admissionNumber.trim() || !this.studentForm.fullName.trim()) {
      this.foundationDrawerError = "Class, section, admission number, and student name are required.";
      return;
    }

    this.begin();
    this.foundationDrawerError = null;
    try {
      await actions.schoolFoundation.createStudent({ ...this.studentForm });
      await this.refreshStudents();
      this.studentForm = defaultStudentForm();
      this.success = "Student added.";
      this.closeDrawer();
    } catch (err: any) {
      this.foundationDrawerError = err?.message || "Unable to add student.";
    } finally {
      this.finish();
    }
  }

  async createTeacher() {
    if (this.loading) return;
    if (!this.requireSchoolForDrawer()) return;
    if (!this.teacherForm.employeeNumber.trim() || !this.teacherForm.fullName.trim()) {
      this.foundationDrawerError = "Employee number and teacher name are required.";
      return;
    }

    this.begin();
    this.foundationDrawerError = null;
    try {
      await actions.schoolFoundation.createTeacher({ ...this.teacherForm });
      await this.refreshTeachers();
      this.teacherForm = defaultTeacherForm();
      this.success = "Teacher added.";
      this.closeDrawer();
    } catch (err: any) {
      this.foundationDrawerError = err?.message || "Unable to add teacher.";
    } finally {
      this.finish();
    }
  }

  getClassName(classId: string) {
    return this.classes.find((item) => item.id === classId)?.name || "-";
  }

  getSectionName(sectionId: string) {
    return this.sections.find((item) => item.id === sectionId)?.name || "-";
  }

  getSubjectName(subjectId?: string | null) {
    if (!subjectId) return "-";
    return this.subjects.find((item) => item.id === subjectId)?.name || "-";
  }

  sectionsForClass(classId: string) {
    return this.sections.filter((section) => section.classId === classId);
  }
}

export const registerSchoolFoundationStore = (Alpine: Alpine) => {
  Alpine.store("schoolFoundation", new SchoolFoundationStore());
};
