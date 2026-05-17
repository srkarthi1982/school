import type { Alpine } from "alpinejs";
import { AvBaseStore } from "@ansiversa/components/alpine";
import { actions } from "astro:actions";

declare global {
  interface Window {
    AvDialog?: {
      open?: (id: string) => void;
      close?: (id: string) => void;
    };
  }
}

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
type FoundationRecordType = "class" | "section" | "subject" | "student" | "teacher";
type FoundationFormMode = "create" | "edit";

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

const toId = (value: unknown) => String(value ?? "");

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
  foundationFormMode: FoundationFormMode = "create";
  editingClassId: string | null = null;
  editingSectionId: string | null = null;
  editingSubjectId: string | null = null;
  editingStudentId: string | null = null;
  editingTeacherId: string | null = null;
  pendingDelete: { type: FoundationRecordType; id: string; label: string } | null = null;
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

  private openConfirmDialog(dialogId: string) {
    if (typeof window === "undefined") return;
    window.AvDialog?.open?.(dialogId);
  }

  private resetFoundationEditState() {
    this.foundationFormMode = "create";
    this.editingClassId = null;
    this.editingSectionId = null;
    this.editingSubjectId = null;
    this.editingStudentId = null;
    this.editingTeacherId = null;
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
    this.resetFoundationEditState();
    this.classForm = defaultClassForm();
  }

  openClassEditDrawer(item: ClassDTO) {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.resetFoundationEditState();
    this.foundationFormMode = "edit";
    this.editingClassId = item.id;
    this.classForm = {
      name: item.name ?? "",
      sortOrder: item.sortOrder ?? 0,
    };
  }

  openSectionDrawer() {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.resetFoundationEditState();
    this.sectionForm = defaultSectionForm();
  }

  openSectionEditDrawer(item: SectionDTO) {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.resetFoundationEditState();
    this.foundationFormMode = "edit";
    this.editingSectionId = item.id;
    this.sectionForm = {
      classId: item.classId ?? "",
      name: item.name ?? "",
      sortOrder: item.sortOrder ?? 0,
    };
  }

  openSubjectDrawer() {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.resetFoundationEditState();
    this.subjectForm = defaultSubjectForm();
  }

  openSubjectEditDrawer(item: SubjectDTO) {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.resetFoundationEditState();
    this.foundationFormMode = "edit";
    this.editingSubjectId = item.id;
    this.subjectForm = {
      name: item.name ?? "",
      code: item.code ?? "",
    };
  }

  openStudentDrawer() {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.resetFoundationEditState();
    this.studentForm = defaultStudentForm();
  }

  openStudentEditDrawer(item: StudentDTO) {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.resetFoundationEditState();
    this.foundationFormMode = "edit";
    this.editingStudentId = item.id;
    const classId = toId(item.classId);
    const sectionId = toId(item.sectionId);
    this.studentForm = {
      classId,
      sectionId: "",
      admissionNumber: item.admissionNumber ?? "",
      rollNumber: item.rollNumber ?? "",
      fullName: item.fullName ?? "",
      gender: (item.gender as StudentGender) || "unspecified",
      dateOfBirth: item.dateOfBirth ?? "",
      guardianName: item.guardianName ?? "",
      guardianPhone: item.guardianPhone ?? "",
      status: (item.status as RecordStatus) || "active",
    };
    queueMicrotask(() => {
      if (this.editingStudentId !== item.id) return;
      this.studentForm.sectionId = this.sectionsForClass(classId).some((section) => toId(section.id) === sectionId)
        ? sectionId
        : "";
    });
  }

  openTeacherDrawer() {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.resetFoundationEditState();
    this.teacherForm = defaultTeacherForm();
  }

  openTeacherEditDrawer(item: TeacherDTO) {
    this.error = null;
    this.success = null;
    this.foundationDrawerError = null;
    this.resetFoundationEditState();
    this.foundationFormMode = "edit";
    this.editingTeacherId = item.id;
    this.teacherForm = {
      employeeNumber: item.employeeNumber ?? "",
      fullName: item.fullName ?? "",
      phone: item.phone ?? "",
      email: item.email ?? "",
      primarySubjectId: item.primarySubjectId ?? "",
      status: (item.status as RecordStatus) || "active",
    };
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

  setStudentClass(classId: string) {
    const nextClassId = toId(classId);
    this.studentForm.classId = nextClassId;
    if (!this.sectionsForClass(nextClassId).some((section) => toId(section.id) === this.studentForm.sectionId)) {
      this.studentForm.sectionId = "";
    }
  }

  async saveClass() {
    if (this.loading) return;
    if (!this.requireSchoolForDrawer()) return;
    if (!this.classForm.name.trim()) {
      this.foundationDrawerError = "Class name is required.";
      return;
    }

    this.begin();
    this.foundationDrawerError = null;
    try {
      if (this.foundationFormMode === "edit") {
        if (!this.editingClassId) throw new Error("Select a class to edit.");
        await actions.schoolFoundation.updateClass({ id: this.editingClassId, ...this.classForm });
      } else {
        await actions.schoolFoundation.createClass({ ...this.classForm });
      }
      await this.refreshClasses();
      this.classForm = defaultClassForm();
      const wasEdit = this.foundationFormMode === "edit";
      this.resetFoundationEditState();
      this.success = wasEdit ? "Class updated." : "Class added.";
      this.closeDrawer();
    } catch (err: any) {
      this.foundationDrawerError = err?.message || "Unable to save class.";
    } finally {
      this.finish();
    }
  }

  async saveSection() {
    if (this.loading) return;
    if (!this.requireSchoolForDrawer()) return;
    if (!this.sectionForm.classId || !this.sectionForm.name.trim()) {
      this.foundationDrawerError = "Class and section name are required.";
      return;
    }

    this.begin();
    this.foundationDrawerError = null;
    try {
      if (this.foundationFormMode === "edit") {
        if (!this.editingSectionId) throw new Error("Select a section to edit.");
        await actions.schoolFoundation.updateSection({ id: this.editingSectionId, ...this.sectionForm });
      } else {
        await actions.schoolFoundation.createSection({ ...this.sectionForm });
      }
      await this.refreshSections();
      this.sectionForm = defaultSectionForm();
      const wasEdit = this.foundationFormMode === "edit";
      this.resetFoundationEditState();
      this.success = wasEdit ? "Section updated." : "Section added.";
      this.closeDrawer();
    } catch (err: any) {
      this.foundationDrawerError = err?.message || "Unable to save section.";
    } finally {
      this.finish();
    }
  }

  async saveSubject() {
    if (this.loading) return;
    if (!this.requireSchoolForDrawer()) return;
    if (!this.subjectForm.name.trim()) {
      this.foundationDrawerError = "Subject name is required.";
      return;
    }

    this.begin();
    this.foundationDrawerError = null;
    try {
      if (this.foundationFormMode === "edit") {
        if (!this.editingSubjectId) throw new Error("Select a subject to edit.");
        await actions.schoolFoundation.updateSubject({ id: this.editingSubjectId, ...this.subjectForm });
      } else {
        await actions.schoolFoundation.createSubject({ ...this.subjectForm });
      }
      await this.refreshSubjects();
      this.subjectForm = defaultSubjectForm();
      const wasEdit = this.foundationFormMode === "edit";
      this.resetFoundationEditState();
      this.success = wasEdit ? "Subject updated." : "Subject added.";
      this.closeDrawer();
    } catch (err: any) {
      this.foundationDrawerError = err?.message || "Unable to save subject.";
    } finally {
      this.finish();
    }
  }

  async saveStudent() {
    if (this.loading) return;
    if (!this.requireSchoolForDrawer()) return;
    if (!this.studentForm.classId || !this.studentForm.sectionId || !this.studentForm.admissionNumber.trim() || !this.studentForm.fullName.trim()) {
      this.foundationDrawerError = "Class, section, admission number, and student name are required.";
      return;
    }

    this.begin();
    this.foundationDrawerError = null;
    try {
      if (this.foundationFormMode === "edit") {
        if (!this.editingStudentId) throw new Error("Select a student to edit.");
        await actions.schoolFoundation.updateStudent({ id: this.editingStudentId, ...this.studentForm });
      } else {
        await actions.schoolFoundation.createStudent({ ...this.studentForm });
      }
      await this.refreshStudents();
      this.studentForm = defaultStudentForm();
      const wasEdit = this.foundationFormMode === "edit";
      this.resetFoundationEditState();
      this.success = wasEdit ? "Student updated." : "Student added.";
      this.closeDrawer();
    } catch (err: any) {
      this.foundationDrawerError = err?.message || "Unable to save student.";
    } finally {
      this.finish();
    }
  }

  async saveTeacher() {
    if (this.loading) return;
    if (!this.requireSchoolForDrawer()) return;
    if (!this.teacherForm.employeeNumber.trim() || !this.teacherForm.fullName.trim()) {
      this.foundationDrawerError = "Employee number and teacher name are required.";
      return;
    }

    this.begin();
    this.foundationDrawerError = null;
    try {
      if (this.foundationFormMode === "edit") {
        if (!this.editingTeacherId) throw new Error("Select a teacher to edit.");
        await actions.schoolFoundation.updateTeacher({ id: this.editingTeacherId, ...this.teacherForm });
      } else {
        await actions.schoolFoundation.createTeacher({ ...this.teacherForm });
      }
      await this.refreshTeachers();
      this.teacherForm = defaultTeacherForm();
      const wasEdit = this.foundationFormMode === "edit";
      this.resetFoundationEditState();
      this.success = wasEdit ? "Teacher updated." : "Teacher added.";
      this.closeDrawer();
    } catch (err: any) {
      this.foundationDrawerError = err?.message || "Unable to save teacher.";
    } finally {
      this.finish();
    }
  }

  openDeleteConfirm(type: FoundationRecordType, id: string, label: string) {
    this.error = null;
    this.success = null;
    this.pendingDelete = { type, id, label };
    this.openConfirmDialog("school-foundation-delete-dialog");
  }

  async confirmDelete() {
    if (this.loading || !this.pendingDelete) return;
    const pending = this.pendingDelete;
    this.begin();
    try {
      if (pending.type === "class") {
        await actions.schoolFoundation.deleteClass({ id: pending.id });
        await this.refreshClasses();
        await this.refreshSections();
        await this.refreshStudents();
      }
      if (pending.type === "section") {
        await actions.schoolFoundation.deleteSection({ id: pending.id });
        await this.refreshSections();
        await this.refreshStudents();
      }
      if (pending.type === "subject") {
        await actions.schoolFoundation.deleteSubject({ id: pending.id });
        await this.refreshSubjects();
        await this.refreshTeachers();
      }
      if (pending.type === "student") {
        await actions.schoolFoundation.deleteStudent({ id: pending.id });
        await this.refreshStudents();
      }
      if (pending.type === "teacher") {
        await actions.schoolFoundation.deleteTeacher({ id: pending.id });
        await this.refreshTeachers();
      }
      this.pendingDelete = null;
      this.success = `${pending.label} deleted.`;
    } catch (err: any) {
      this.fail(err, `Unable to delete ${pending.label.toLowerCase()}.`);
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
