import { randomUUID } from "node:crypto";
import { ActionError, defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import {
  FeeCategories,
  FeeStructureItems,
  FeeStructures,
  SchoolClasses,
  SchoolOrganizations,
  and,
  asc,
  db,
  desc,
  eq,
} from "astro:db";
import { requireUser } from "./_guards";

const MAX = { code: 24, name: 120, description: 300 };

const idSchema = z.object({ id: z.string().min(1) });
const categorySchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});
const structureSchema = z.object({
  classId: z.string().min(1),
  academicYearId: z.string().optional(),
  name: z.string().min(1),
  isActive: z.boolean().optional(),
});
const itemSchema = z.object({
  feeStructureId: z.string().min(1),
  feeCategoryId: z.string().min(1),
  amount: z.coerce.number().min(0),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid due date."),
  sortOrder: z.coerce.number().optional(),
});

const categoryUpdateSchema = idSchema.merge(categorySchema);
const structureUpdateSchema = idSchema.merge(structureSchema);
const itemUpdateSchema = idSchema.merge(itemSchema);

const requiredText = (value: string | undefined, label: string, maxLength = MAX.name) => {
  const clean = String(value ?? "").trim();
  if (!clean) throw new ActionError({ code: "BAD_REQUEST", message: `${label} is required.` });
  if (clean.length > maxLength) throw new ActionError({ code: "BAD_REQUEST", message: `${label} is too long.` });
  return clean;
};

const optionalText = (value: string | undefined, maxLength = MAX.name) => String(value ?? "").trim().slice(0, maxLength);
const toSortOrder = (value: number | undefined) => (Number.isFinite(value) ? Math.trunc(Number(value)) : 0);
const normalizeDate = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value ?? ""));
const normalizeDated = <T extends { createdAt: unknown; updatedAt: unknown }>(row: T) => ({
  ...row,
  createdAt: normalizeDate(row.createdAt),
  updatedAt: normalizeDate(row.updatedAt),
});

const getOwnedSchool = async (ownerUserId: string) => db
  .select()
  .from(SchoolOrganizations)
  .where(eq(SchoolOrganizations.ownerUserId, ownerUserId))
  .orderBy(desc(SchoolOrganizations.updatedAt))
  .get();

const requireOwnedSchool = async (ownerUserId: string) => {
  const school = await getOwnedSchool(ownerUserId);
  if (!school) {
    throw new ActionError({ code: "BAD_REQUEST", message: "Create your school organization before managing fees." });
  }
  return school;
};

const requireOwnedClass = async (schoolId: string, classId: string) => {
  const item = await db.select().from(SchoolClasses).where(and(eq(SchoolClasses.id, classId), eq(SchoolClasses.schoolId, schoolId))).get();
  if (!item) throw new ActionError({ code: "BAD_REQUEST", message: "Class is invalid for this school." });
  return item;
};

const requireOwnedCategory = async (schoolId: string, id: string) => {
  const item = await db.select().from(FeeCategories).where(and(eq(FeeCategories.id, id), eq(FeeCategories.schoolId, schoolId))).get();
  if (!item) throw new ActionError({ code: "BAD_REQUEST", message: "Fee category is invalid for this school." });
  return item;
};

const requireOwnedStructure = async (schoolId: string, id: string) => {
  const item = await db.select().from(FeeStructures).where(and(eq(FeeStructures.id, id), eq(FeeStructures.schoolId, schoolId))).get();
  if (!item) throw new ActionError({ code: "BAD_REQUEST", message: "Fee structure is invalid for this school." });
  return item;
};

const requireOwnedItem = async (schoolId: string, id: string) => {
  const item = await db.select().from(FeeStructureItems).where(and(eq(FeeStructureItems.id, id), eq(FeeStructureItems.schoolId, schoolId))).get();
  if (!item) throw new ActionError({ code: "BAD_REQUEST", message: "Fee item is invalid for this school." });
  return item;
};

export const listFeeCategories = defineAction({
  input: z.object({}).optional(),
  async handler(_input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const items = await db.select().from(FeeCategories).where(eq(FeeCategories.schoolId, school.id)).orderBy(asc(FeeCategories.name));
    return { items: items.map(normalizeDated) };
  },
});

export const createFeeCategory = defineAction({
  input: categorySchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const now = new Date();
    const [item] = await db.insert(FeeCategories).values({
      id: randomUUID(),
      schoolId: school.id,
      name: requiredText(input.name, "Category name"),
      code: optionalText(input.code, MAX.code),
      description: optionalText(input.description, MAX.description),
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return { item: normalizeDated(item) };
  },
});

export const updateFeeCategory = defineAction({
  input: categoryUpdateSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedCategory(school.id, input.id);
    const [item] = await db.update(FeeCategories).set({
      name: requiredText(input.name, "Category name"),
      code: optionalText(input.code, MAX.code),
      description: optionalText(input.description, MAX.description),
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    }).where(and(eq(FeeCategories.id, input.id), eq(FeeCategories.schoolId, school.id))).returning();
    return { item: normalizeDated(item) };
  },
});

export const deleteFeeCategory = defineAction({
  input: idSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedCategory(school.id, input.id);
    await db.delete(FeeCategories).where(and(eq(FeeCategories.id, input.id), eq(FeeCategories.schoolId, school.id)));
    return { ok: true };
  },
});

export const listFeeStructures = defineAction({
  input: z.object({ classId: z.string().optional() }).optional(),
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const classId = input?.classId;
    if (classId) await requireOwnedClass(school.id, classId);
    const query = db.select().from(FeeStructures).where(
      classId ? and(eq(FeeStructures.schoolId, school.id), eq(FeeStructures.classId, classId)) : eq(FeeStructures.schoolId, school.id),
    ).orderBy(desc(FeeStructures.updatedAt));
    const items = await query;
    return { items: items.map(normalizeDated) };
  },
});

export const createFeeStructure = defineAction({
  input: structureSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedClass(school.id, input.classId);
    const now = new Date();
    const [item] = await db.insert(FeeStructures).values({
      id: randomUUID(),
      schoolId: school.id,
      classId: input.classId,
      academicYearId: optionalText(input.academicYearId, 80) || undefined,
      name: requiredText(input.name, "Fee structure name"),
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return { item: normalizeDated(item) };
  },
});

export const updateFeeStructure = defineAction({
  input: structureUpdateSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedStructure(school.id, input.id);
    await requireOwnedClass(school.id, input.classId);
    const [item] = await db.update(FeeStructures).set({
      classId: input.classId,
      academicYearId: optionalText(input.academicYearId, 80) || undefined,
      name: requiredText(input.name, "Fee structure name"),
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    }).where(and(eq(FeeStructures.id, input.id), eq(FeeStructures.schoolId, school.id))).returning();
    return { item: normalizeDated(item) };
  },
});

export const deleteFeeStructure = defineAction({
  input: idSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedStructure(school.id, input.id);
    await db.delete(FeeStructureItems).where(and(eq(FeeStructureItems.schoolId, school.id), eq(FeeStructureItems.feeStructureId, input.id)));
    await db.delete(FeeStructures).where(and(eq(FeeStructures.id, input.id), eq(FeeStructures.schoolId, school.id)));
    return { ok: true };
  },
});

export const listFeeStructureItems = defineAction({
  input: z.object({ feeStructureId: z.string().min(1) }),
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedStructure(school.id, input.feeStructureId);
    const items = await db.select().from(FeeStructureItems)
      .where(and(eq(FeeStructureItems.schoolId, school.id), eq(FeeStructureItems.feeStructureId, input.feeStructureId)))
      .orderBy(asc(FeeStructureItems.sortOrder), asc(FeeStructureItems.dueDate));
    return { items: items.map(normalizeDated) };
  },
});

export const createFeeStructureItem = defineAction({
  input: itemSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedStructure(school.id, input.feeStructureId);
    await requireOwnedCategory(school.id, input.feeCategoryId);
    const now = new Date();
    const [item] = await db.insert(FeeStructureItems).values({
      id: randomUUID(),
      schoolId: school.id,
      feeStructureId: input.feeStructureId,
      feeCategoryId: input.feeCategoryId,
      amount: input.amount,
      dueDate: input.dueDate,
      sortOrder: toSortOrder(input.sortOrder),
      createdAt: now,
      updatedAt: now,
    }).returning();
    return { item: normalizeDated(item) };
  },
});

export const updateFeeStructureItem = defineAction({
  input: itemUpdateSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedItem(school.id, input.id);
    await requireOwnedStructure(school.id, input.feeStructureId);
    await requireOwnedCategory(school.id, input.feeCategoryId);
    const [item] = await db.update(FeeStructureItems).set({
      feeStructureId: input.feeStructureId,
      feeCategoryId: input.feeCategoryId,
      amount: input.amount,
      dueDate: input.dueDate,
      sortOrder: toSortOrder(input.sortOrder),
      updatedAt: new Date(),
    }).where(and(eq(FeeStructureItems.id, input.id), eq(FeeStructureItems.schoolId, school.id))).returning();
    return { item: normalizeDated(item) };
  },
});

export const deleteFeeStructureItem = defineAction({
  input: idSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    await requireOwnedItem(school.id, input.id);
    await db.delete(FeeStructureItems).where(and(eq(FeeStructureItems.id, input.id), eq(FeeStructureItems.schoolId, school.id)));
    return { ok: true };
  },
});

export const getFeeStructureDetail = defineAction({
  input: idSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const school = await requireOwnedSchool(user.id);
    const structure = await requireOwnedStructure(school.id, input.id);
    const items = await db.select().from(FeeStructureItems)
      .where(and(eq(FeeStructureItems.schoolId, school.id), eq(FeeStructureItems.feeStructureId, input.id)))
      .orderBy(asc(FeeStructureItems.sortOrder), asc(FeeStructureItems.dueDate));
    return { structure: normalizeDated(structure), items: items.map(normalizeDated) };
  },
});
