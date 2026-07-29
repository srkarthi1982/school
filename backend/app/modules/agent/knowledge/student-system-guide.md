# Student — System User Guide

## Overview

This guide explains how students use the key features of the JAI Information System. It covers logging in, navigating the dashboard, checking schedules, taking quizzes, completing forms and surveys, viewing grades and attendance, and more.

---

## Logging In and Dashboard

1. Log in with your student credentials.
2. You land on the **Dashboard** at `/`.
3. The dashboard shows:
   - Welcome message
   - **My Activities** — progress bars for each enrolled course
   - **Start Training** — shows overall course progress
   - **Achievements** — earned badges/ribbons
   - **Announcements** — recent school/staff announcements
   - **Learning Path** (sidebar) — enrolled courses with checkmarks for completed items

> **Navigation:** The left sidebar contains links to all modules. Hover or click the menu icon to expand.

---

## Checking Your Schedule

**Route:** `/dashboard-scheduling/schedule-management`
**Permission:** `schedule_entry:read`

### Viewing the Calendar

1. Navigate to **Dashboard & Scheduling** in the left sidebar.
2. The schedule page loads with three view modes:

| View | Description |
|------|-------------|
| **Day** | Single-day column from midnight to midnight. Click a block to see lesson details. |
| **Week** | 7-column grid (Mon-Sun). Shows the full week at a glance. |
| **Month** | Classic monthly grid with small chips for each entry. |

3. Use **Today** to jump back to the current day. Use **<** and **>** to navigate by day, week, or month.

### What a Schedule Block Shows

- **Time** — `HH:MM-HH:MM` (24-hour format)
- **Title** — lesson number and lesson name (e.g., "1 · Introduction to Algorithms")
- **Importance badge** — a 1-10 priority rating, shown with a color icon
- **Color** — blocks are color-coded by importance level

### Viewing Lesson Details

1. Click any schedule block.
2. You are taken to the **Lesson Detail Page** at `/course-selection-schedules/{cid}/lessons/{lid}`.
3. The lesson page shows:
   - **Hero header:** course title, lesson number, environment, type, periods, instructor/student ratio, location
   - **Objectives & Teaching Points:** learning objectives and lesson conduct (Beginning / Middle / End sections)
   - **Resources:** teaching materials used
   - **Health & Safety notes**
   - **Right column — "To Take" items:** quizzes, forms, surveys, and downloadable materials assigned to this lesson

---

## Taking a Quiz

**Route:** `/assignment-assessment/quiz-bank`
**Permission:** `quiz:take`

### Entry Points

Students can start a quiz from two places:

1. **Quiz Bank page** — browse all approved quizzes, select one, and click **Take Quiz**.
2. **Lesson Detail Page** — under "Quizzes to take", click **Take** on a released quiz. You are auto-navigated to the quiz bank with the quiz pre-selected.

### Quiz Flow

**Step 1 — Select and start:**

- In the Quiz Bank page, approved quizzes appear in the left panel.
- Click a quiz to see its details on the right (name, description, question count, weight).
- Click the **Take Quiz** button. The quiz opens in a modal.

**Step 2 — Answer questions:**

- Questions are shown **3 per page** for focused answering.
- For each question you see:
  - Question number and description
  - Question type badge (Multiple Choice, Essay, True/False)
  - "Select All That Apply" badge if the question has multiple correct answers
- Answer UI depends on question type:

| Question Type | Input |
|---------------|-------|
| **Multiple Choice** (single answer) | Radio buttons |
| **Multiple Choice** (multiple answers) | Checkboxes |
| **True/False** | Toggle between True and False buttons |
| **Essay** | Textarea for typing your response |

- A counter displays **answered / total** questions.
- Use the **Next** button or a **Paginator** to move between pages.

> **Tip:** You can navigate freely between pages. Your answers are saved as you go — but the quiz is not submitted until you explicitly click **Submit**.

**Step 3 — Review answers (recommended):**

- On the last question page, click **Review Answers**.
- You see all questions with your selected answers displayed.
- Any **unanswered questions** are highlighted with a warning.
- Click **Edit Answers** to return to the answering phase.
- A pen icon lets you jump to any specific question.

**Step 4 — Submit:**

- Click **Submit**.
- If you have unanswered questions, a confirmation dialog warns you. Click **OK** to submit anyway or **Cancel** to continue editing.
- During submission, a loading indicator is shown.

**Step 5 — See results:**

After submission, the modal displays:

- **Score** — e.g., `8 / 10`
- **Percentage** — e.g., `80%`
- **Per-question breakdown** — each question shows whether it was correct, the points awarded, and the weight
- **Essay notice** — if any question is essay type, a note appears that those answers need human review

**Past Attempts:**

- Return to the Quiz Bank and click a past quiz to see previous attempts.
- Past attempts are listed with date, score, and status.

---

## Taking a Form

**Route:** `/grading-attendance/formnew`
**Permission:** `form:take`

### Discovering Forms

1. Navigate to **Grading & Attendance** > **Forms** in the left sidebar.
2. The Forms page shows cards for each available form.
3. Only **published** forms with a passed `scheduledAt` date are visible.
4. Each form card displays:
   - Title and description
   - Number of questions
   - Response status badge

**Response status badges:**

| Badge | Meaning | Button |
|-------|---------|--------|
| **Not Started** | You haven't begun | **Start Form** |
| **On Going — XX%** | You started but haven't finished | **Resume Form** |
| **Completed** | You finished the form | **Review Form** |

### Form Flow

**Step 1 — Start (or resume) the form:**

- Click **Start Form** (or **Resume Form** to continue where you left off).
- The form opens in a full-screen modal.

**Step 2 — Answer questions question-by-question:**

- One question is shown at a time with a progress bar.
- Progress bar shows "Question X of Y" with completion percentage.
- Answer widgets depend on question type:

| Question Type | Input |
|---------------|-------|
| **Text** | Textarea for free-text answers |
| **Multiple** (single select) | Radio buttons |
| **Multiple** (multi-select) | Checkboxes |
| **Rating** | Range slider (1-10) |
| **True/False** | Large toggle buttons for True / False |

- Each question may have a red asterisk (*) indicating it is **required**.
- On every answer change, your progress is **auto-saved** to the server. You can safely close the browser and return later.

**Step 3 — Navigate between questions:**

- **Next** — moves to the next question (validates required questions)
- **Previous** — goes back to the previous question

**Step 4 — Finish the form:**

- Click **Finish Form**.
- If required questions remain unanswered, a warning toast appears listing them. You can go back and answer them, or confirm submission.
- Your response is saved with a final grade (if applicable).
- A success toast confirms completion: *"Form completed. Thank you."*
- If launched from a lesson, the lesson content is automatically marked as complete and you are navigated back.

**Step 5 — Review (after submission):**

- Click **Review Form** from the form list.
- All questions are displayed read-only. Selected answers are highlighted in green.

---

## Taking a Survey

**Route:** `/grading-attendance/surveynew`
**Permission:** `survey:take`

The survey process is nearly identical to the form process.

### Discovering Surveys

1. Navigate to **Grading & Attendance** > **Surveys** in the left sidebar.
2. Published surveys appear as cards with title, description, question count, and response status.

### Survey Flow

The steps match the form flow exactly:

1. Click **Start Survey** (or **Resume Survey** / **Review Survey** depending on status).
2. Answer one question at an auto-saved modal. Additional question types available in surveys:

| Type | Input |
|------|-------|
| **Text** | Textarea |
| **Multiple** (single) | Radio buttons |
| **Multiple** (multi) | Checkboxes |
| **Rating** | Range slider (1-10) |
| **True/False** | Toggle buttons |
| **Rating with Text** | Range slider (1-10) **plus** a textarea for comments |

3. Navigate with **Next** / **Previous**.
4. Click **Finish Survey** to submit.
5. Review mode shows all responses read-only.

> **Note:** The primary difference between Forms and Surveys is the `rating_with_text` question type, which lets students rate on a scale AND leave written feedback.

---

## Viewing Grades and Attendance

**Route:** `/grading-attendance`
**Permission:** `student:*`, `teacher:*`, or `attendance:*`

### My Grades Tab

The main Grading & Attendance page displays:

| Stat Card | Meaning |
|-----------|---------|
| **Average Grade** | Your overall average across all subjects |
| **Present Rate** | Percentage of days/periods you were present |
| **Absences** | Total number of absences |
| **Late Count** | Total number of late arrivals |

Below the stats, subjects are listed in a table:

| Column | Meaning |
|--------|---------|
| **Subject Name** | The subject or course name |
| **Course Code** | Short identifier (e.g., "CS101") |
| **Progress Bar + %** | Current progress through the subject material |
| **Grade** | Numerical grade for the subject |
| **Trend** | Up arrow (green) = improving, Down arrow (red) = declining, Minus (gray) = unchanged |

### Attendance Month Tab

A full-month calendar grid shows attendance status at a glance:

| Color | Status |
|-------|--------|
| Green | Present |
| Yellow | Late |
| Red | Absent |
| Blue | Excused |
| Neutral | No record |

### Recent Records Tab

A table of recent attendance entries with columns: Subject, Date, Status badge, and optional Note.

### Daily / Class Attendance

Dedicated detailed views for daily and class-by-class attendance under the **Daily Attendance** and **Class Attendance** tabs.

---

## Assignments and Submissions

**Route:** `/assignment-assessment`
**Permission:** `quiz:*`

### Active Tasks

- Displays assignment cards in a grid.
- Each card shows: course name, title, status badge, progress bar, due date countdown, and a **Continue** button.

**Status badges:**

| Badge | Meaning |
|-------|---------|
| **Not Started** | Assignment not begun |
| **In Progress** | Partially completed |
| **Almost Done** | Nearly complete |

### My Submissions

A table of all submitted work:

| Column | Meaning |
|--------|---------|
| **Title** | Assignment name |
| **Course** | Course name |
| **Submitted At** | Date and time of submission |
| **Status** | Graded, Pending, or Returned |
| **Grade** | Score (if available, shown as "—" when pending) |

### Upcoming Tests

A list of scheduled tests with course, title, format badge (Multiple Choice / Essay / Mixed / Practical), date, and duration.

---

## Progress Tracker

**Route:** `/dashboard-scheduling/progress-tracker`
**Permission:** `progress_tracker:*`

1. Navigate to **Dashboard & Scheduling** > **Progress Tracker**.
2. The student overview shows:
   - Overall progress summary
   - Ability to drill down into **Attendance**, **Quiz Performance**, and **Materials Coverage**
3. Each drill-down gives detailed views of that specific area.

---

## Profile and Personal Information

**Route:** `/profile-general-info`
**Permission:** `student:read` or `teacher:read`

The profile page displays:

- **Avatar and name** with rank, qualification, and platforms
- **Basic Info:** date of birth, country, email, mobile, extension, limitation
- **Experience** table: platforms + hours completed
- **Progress Tracker Overview** — with a link to drill into the full progress tracker
- **AIRF Table** (Airman Instrument Rating Form or equivalent) — with status
- **Currency Table** — configurable columns with filtering
- **Day View** (right sidebar) — mini schedule for selected courses

Use **Edit Profile** to update personal details or **Change Password** to update your password.

---

## Virtual Classroom

**Route:** `/communication-reporting/virtual-classroom`
**Permission:** `class_session:*`

1. Navigate to **Communication & Reporting** > **Virtual Classroom**.
2. Scheduled and live sessions are displayed as cards with title, description, time range, and status badges.
3. Click a session to see details. If it is **live**, a **Join** button appears.
4. The live classroom includes video, screen sharing, picture-in-picture, hand raising, breakout rooms, recording, and docked/fullscreen modes.

---

## Notifications

**Route:** `/communication-reporting/notification`

1. Navigate to **Communication & Reporting** > **Notifications**.
2. Notifications are grouped by source/module.
3. Features:
   - Expand/collapse groups
   - Filter to show only unread
   - Mark individual or group as read
   - Mark all as read button

---

## Chat and Messaging

**Route:** `/communication-reporting/chat`

The Communication Hub provides a real-time chat panel with sidebar tabs:

| Tab | Purpose |
|-----|---------|
| **Inbox** | Direct messages |
| **Announcements** | Broadcast messages from staff |
| **Reports** | Generated reports |
| **Chat** | Persistent real-time chat via WebSocket |

---

## File Sharing

**Route:** `/communication-reporting/file-sharing`
**Permission:** `file:read`

1. Navigate to **Communication & Reporting** > **File Sharing**.
2. Browse folders and files organized in a tree.
3. Actions available:
   - **Upload** files
   - **Download** files
   - **Rename** items
   - **Delete** files/folders
   - **Breadcrumb** navigation for deep folders
4. File type icons indicate format (PDF, DOCX, PPT, video, images).

---

## IT Support Tickets

**Route:** `/communication-reporting/it-support`
**Permission:** `ticket:create`, `ticket:respond`, `ticket:view_all`, or `admin:full`

1. Navigate to **Communication & Reporting** > **IT Support**.
2. **Inbox tab** shows your tickets with status badges:
   | Badge | Meaning |
   |-------|---------|
   | Submitted | Ticket created |
   | Approved | Approved by staff |
   | In Progress | Being worked on |
   | Resolved | Issue fixed |
   | Cancelled | Cancelled by ticket owner |
3. Click a ticket to open a **detail modal** showing the full thread and conversation.
4. Click **New Ticket** to create a support request.

---

## Internal Requests

**Route:** `/communication-reporting/requests`

1. Navigate to **Communication & Reporting** > **Requests**.
2. Tabs: **Inbox** (received requests), **Sent** (your sent requests).
3. Click **Create Request** to open the request form modal.
4. View request details and status in the detail modal.
5. Use cases include study leave requests, formal academic requests, etc.

---

## Frequently Asked Questions

**Route:** `/communication-reporting/faq`
**Permission:** `faq:read`

1. Navigate to **Communication & Reporting** > **FAQ**.
2. Browse FAQ categories and search for keywords (search terms are highlighted).
3. Click to expand/collapse individual answers.

---

## My Courses

**Route:** `/course-management/my-courses`
**Permission:** `teacher:*` or `admin:full`

Shows enrolled courses as cards with course code, title, outline, student count, and a button to view the enrolled student list.

---

## Course Library

**Route:** `/course-management/library`
**Permission:** None required (open to all)

Browse course materials, resources, and reference documents.

---

## External Applications Portal

**Route:** `/external-link`
**Permission:** `teacher:*` or `student:*`

Displays a grid of external application cards with name, provider, description, logo, and a **Launch** button that opens the application in a new browser tab.

---

## Settings

**Routes:**

| Setting | Route |
|---------|-------|
| Account | `/settings/account` |
| Appearance (theme, colors) | `/settings/appearance` |
| Language | `/settings/language` |

---

## Quick Reference — Student Routes Summary

| Feature | Route | Permission |
|---------|-------|------------|
| Dashboard | `/` | `student:read` or `teacher:read` |
| Schedule | `/dashboard-scheduling/schedule-management` | `schedule_entry:read` |
| Progress Tracker | `/dashboard-scheduling/progress-tracker` | `progress_tracker:*` |
| Profile | `/profile-general-info` | `student:read` or `teacher:read` |
| Quizzes | `/assignment-assessment/quiz-bank` | `quiz:*` |
| Assignments | `/assignment-assessment` | `quiz:*` |
| Grades & Attendance | `/grading-attendance` | `student:*`, `teacher:*`, `attendance:*` |
| Forms | `/grading-attendance/formnew` | `form:*` |
| Surveys | `/grading-attendance/surveynew` | `survey:*` |
| Virtual Classroom | `/communication-reporting/virtual-classroom` | `class_session:*` |
| Notifications | `/communication-reporting/notification` | None |
| Chat | `/communication-reporting/chat` | None |
| File Sharing | `/communication-reporting/file-sharing` | `file:read` |
| IT Support | `/communication-reporting/it-support` | `ticket:*` or `admin:full` |
| Requests | `/communication-reporting/requests` | None |
| FAQ | `/communication-reporting/faq` | `faq:read` |
| Course Library | `/course-management/library` | None |
| External Apps | `/external-link` | `teacher:*` or `student:*` |
| Account Settings | `/settings/account` | None |
| Appearance Settings | `/settings/appearance` | None |
| Language Settings | `/settings/language` | None |

---

*Last updated: June 2026*
