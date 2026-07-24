# Domain Model Guide

## Users And Roles

Users represent local development identities. Roles include Admin, School Manager, Teacher, Student, Advisor, Parent/Guardian, and Viewer.

## Teachers

Teachers have employment status, department, subjects, sections, assignments, grading activity, attendance records, and workload signals.

Rule: inactive or on-leave teachers cannot be assigned to new sections.

## Students

Students have grade level, enrollment status, guardian information, advisor, enrollments, submissions, attendance, support notes, and interventions.

Rule: withdrawn and graduated students cannot receive new enrollments.

## Courses And Sections

Courses are catalog entries. Class sections are scheduled offerings with teacher, room, term, schedule, capacity, and status.

Rule: completed or cancelled sections do not accept new enrollments.

## Enrollments

Enrollments connect students to sections. Status can be enrolled, dropped, completed, or waitlisted.

Rules: prevent duplicate active enrollment, enforce capacity, and allow waitlisting when requested.

## Assignments And Submissions

Assignments belong to class sections. Submissions belong to assignments and students. Scores and feedback live on submissions.

Rules: only published assignments are student-visible, closed assignments require override, and scores cannot exceed points possible.

## Grades

Grade summaries are calculated from submissions. Missing work counts against possible points and affects risk.

Performance bands:

- Excellent: 90+
- Good: 80-89
- Warning: 70-79
- At Risk: below 70

## Attendance

Attendance records are unique per student, section, and date. Absences and tardies feed attendance concern levels and risk scoring.

## Support Notes

Support notes have visibility boundaries: teacher-only, advisor-only, admin-only, or shared.

## Intervention Plans

Intervention plans are human-approved support workflows. Agents can recommend them but do not automatically create them.

## Jobs, Logs, Audit Events

Jobs model background work. Logs model operational telemetry. Audit events model important state changes.

## Agent Runs

Agent runs persist deterministic analysis with input snapshot, output, confidence, trace, status, and creator.
