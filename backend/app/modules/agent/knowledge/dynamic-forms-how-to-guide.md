# Dynamic Forms — Admin User Guide

## Overview

The **Dynamic Forms** page lets administrators build, edit, and manage reusable table-based forms. Forms are stored server-side and can be used to collect structured data from staff, teachers, or students.

**Key capabilities:**

- Create table-based forms with resizable rows and columns
- Merge and unmerge cells for flexible layouts
- Save forms to the server with versioning (optimistic locking)
- Open existing forms for editing
- Delete forms that are no longer needed
- Import form definitions from a JSON file (legacy / migration support)

---

## Accessing Dynamic Forms

1. Log in with an **admin** account.
2. In the left sidebar, click **Dynamic Forms** (icon: dynamic form outline).
3. The page loads at `/admin/dynamic-forms`.

> **Required permissions:**
> - `FORM_READ` — to view and open forms
> - `FORM_WRITE` — to create and update forms
> - `FORM_DELETE` — to delete forms

---

## Page Layout

The page is organized into three main areas:

| Section | Purpose |
|---------|---------|
| **Form Selector Toolbar** | Choose an existing form, open it, or start a new form |
| **Form Info Card** | Set the form title and description |
| **Table Action Toolbar** | Add/remove rows and columns, merge/unmerge cells, save or cancel |
| **Table Editor** | The interactive grid where you build the form content |

---

## Creating a New Form

1. In the **Form Selector Toolbar**, click **New Form**.
   - If you have unsaved edits on another form, a confirmation dialog appears. Click **OK** to discard changes.
2. The table resets to the default size: **5 rows × 4 columns**.
3. Fill in the **Form Name** (required) and **Description** (optional) fields in the **Form Info Card**.
4. Edit the table structure and content as needed (see [Editing the Table](#editing-the-table)).
5. Click **Save** in the **Table Action Toolbar**.
   - The form is created on the server and appears in the **Form** dropdown.

> **Tip:** You cannot save a form without a title. The **Save** button is disabled until the **Form Name** field contains text.

---

## Opening an Existing Form

1. In the **Form Selector Toolbar**, select a form from the **Form** dropdown.
2. Click **Open Form**.
   - If you have unsaved edits, a confirmation dialog appears. Click **OK** to discard changes.
3. The table loads the form’s saved layout, column widths, row heights, and cell content.

---

## Editing the Table

### Adjusting Dimensions

Use the **Table Action Toolbar** buttons:

| Button | Action |
|--------|--------|
| **+ Row** | Adds a new row at the bottom |
| **– Row** | Removes the last row (disabled if only 1 row remains) |
| **+ Column** | Adds a new column at the right |
| **– Column** | Removes the last column (disabled if only 1 column remains) |

### Resizing Columns

- Hover over the right edge of any column header until a resize cursor appears.
- Drag left or right to adjust the column width.
- For the last column, dragging expands the entire table width.

### Resizing Rows

- Hover over the top border of any row until a resize cursor appears.
- Drag up or down to adjust the row height.

> **Note:** Textareas inside cells automatically adjust their height to fit the resized row.

### Editing Cell Content

- **Header row (top row):** Click a cell and type into the input field. Use this for column labels.
- **Data rows:** Click a cell and type into the textarea. Press `Enter` for line breaks.

---

## Merging and Unmerging Cells

Merging combines multiple cells in the **same row** into a single wider cell.

### Merge Cells

1. Click the first cell you want to merge.
2. Hold **Shift** and click the last cell in the same row, **or** drag across the cells.
   - Selected cells are highlighted with an active border.
3. Click the **Merge** button in the toolbar.

### Unmerge Cells

1. Click any cell that is part of a merged range.
2. Click the **Unmerge** button in the toolbar.

> **Important:** You can only merge cells horizontally (within the same row). Merging across multiple rows is not supported.

---

## Saving a Form

1. Make your edits.
2. Ensure the **Form Name** is filled in.
3. Click **Save**.

### For New Forms
- The form is created on the server.
- The form list refreshes automatically, and the newly created form is selected.

### For Existing Forms
- The system uses **optimistic locking** (versioning).
- If another admin edited the form while you had it open, a conflict error (`409`) is returned.
- If this happens, reload the form by selecting it again from the dropdown and clicking **Open Form**, then re-apply your changes.

---

## Canceling Edits

If you decide not to keep your changes:

1. Click **Cancel** in the **Table Action Toolbar**.
2. For a new form, the table resets to the default blank state.
3. For an existing form, the last saved version reloads from the server.

---

## Deleting a Form

1. Open the form you want to delete.
2. Make sure you are **not** in editing mode (click **Cancel** if you are).
3. Click **Delete** in the **Table Action Toolbar**.
4. Confirm the deletion in the dialog.

> **Warning:** Deletion is permanent and cannot be undone. The form is removed from the server immediately.

---

## Importing a Form from JSON

You can load a form definition from a local `.json` file. This is useful for migrating forms or restoring backups.

1. Click the hidden file input (accessible via the **Open Form** workflow if custom frontend integrations expose it).
2. Select a valid JSON file.
3. The table updates with the imported layout and content.

### Expected JSON Structure

```json
{
  "title": "Form Title",
  "description": "Optional description",
  "form_metadata": {
    "colCount": 4,
    "columnWidths": [150, 150, 150, 150],
    "headerCells": [
      { "value": "Name" },
      { "value": "Age" },
      { "value": "Grade" },
      { "value": "Notes" }
    ]
  },
  "data": {
    "rowCount": 5,
    "rowHeights": [40, 40, 40, 40, 40],
    "dataRows": [
      [
        { "value": "Alice" },
        { "value": "12" },
        { "value": "7th" },
        { "value": "" }
      ],
      [
        { "value": "Bob" },
        { "value": "13" },
        { "value": "8th" },
        { "value": "" }
      ]
    ]
  }
}
```

> **Note:** The JSON export was previously a file download (`table-data.json`). The current version saves directly to the server via API. The JSON structure remains compatible for import.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Shift + Click` | Extend selection for merging cells |
| `Enter` (in textarea) | Insert a line break inside a data cell |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Save button is disabled** | Ensure the **Form Name** field is not empty. |
| **Conflict error on save** | Another user modified the form. Reload it from the server and re-apply your changes. |
| **Cannot merge cells** | Selection must be within the **same row**. You cannot merge across rows. |
| **Form list is empty** | No forms have been created yet. Click **New Form** to create one. |
| **Import fails** | Verify the JSON file matches the expected structure and contains valid `rowCount`, `colCount`, `headerCells`, and `dataRows`. |

---

## Data Model (Reference)

Each dynamic form stores the following fields on the server:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `title` | Form name (required) |
| `description` | Optional short description |
| `form_metadata` | JSON string: column count, widths, and header cells |
| `data` | JSON string: row count, heights, and data rows |
| `version` | Optimistic locking version number |
| `created_by_id` / `updated_by_id` | Audit fields (user IDs) |
| `created_at` / `updated_at` | Audit timestamps |

---

## Related API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/forms/summary` | List all forms (id + title) |
| `GET` | `/api/v1/forms/{form_id}` | Get a full form by ID |
| `POST` | `/api/v1/forms/` | Create a new form |
| `PUT` | `/api/v1/forms/{form_id}` | Update an existing form (requires matching `version`) |
| `DELETE` | `/api/v1/forms/{form_id}` | Delete a form |

---

*Last updated: April 2026*
