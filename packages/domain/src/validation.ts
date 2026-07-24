import { z } from "zod";

export const teacherSchema = z.object({
  userId: z.string().optional().nullable(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  department: z.string().min(1),
  employmentStatus: z.enum(["Active", "OnLeave", "Inactive"]),
  subjectsTaught: z.array(z.string().min(1)).default([]),
  officeLocation: z.string().optional().nullable()
});

export const studentSchema = z.object({
  userId: z.string().optional().nullable(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  gradeLevel: z.number().int().min(1).max(12),
  enrollmentStatus: z.enum(["Active", "Probation", "Withdrawn", "Graduated"]),
  studentNumber: z.string().min(1),
  guardianName: z.string().min(1),
  guardianEmail: z.string().email(),
  advisorId: z.string().optional().nullable()
});

export const courseSchema = z.object({
  code: z.string().min(2),
  title: z.string().min(1),
  description: z.string().min(1),
  subject: z.string().min(1),
  gradeLevel: z.number().int().min(1).max(12),
  creditHours: z.number().positive(),
  status: z.enum(["Draft", "Active", "Archived"])
});

export const classSectionSchema = z.object({
  courseId: z.string().min(1),
  teacherId: z.string().min(1),
  academicTermId: z.string().optional().nullable(),
  term: z.string().min(1),
  room: z.string().min(1),
  schedule: z.record(z.unknown()),
  capacity: z.number().int().min(1),
  status: z.enum(["Planned", "Active", "Completed", "Cancelled"])
});

export const assignmentSchema = z.object({
  classSectionId: z.string().min(1),
  gradingPeriodId: z.string().optional().nullable(),
  title: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["Homework", "Quiz", "Exam", "Project", "Discussion", "Lab", "Other"]),
  status: z.enum(["Draft", "Published", "Closed"]),
  dueDate: z.coerce.date(),
  pointsPossible: z.number().positive(),
  createdByTeacherId: z.string().min(1)
});

export const submissionSchema = z.object({
  assignmentId: z.string().min(1),
  studentId: z.string().min(1),
  status: z.enum(["NotStarted", "Submitted", "Late", "Missing", "Graded", "Returned"]),
  submittedAt: z.coerce.date().optional().nullable(),
  contentText: z.string().optional().nullable(),
  attachmentUrl: z.string().optional().nullable(),
  score: z.number().nonnegative().optional().nullable(),
  feedback: z.string().optional().nullable(),
  gradedByTeacherId: z.string().optional().nullable(),
  gradedAt: z.coerce.date().optional().nullable()
});

export const attendanceSchema = z.object({
  studentId: z.string().min(1),
  classSectionId: z.string().min(1),
  academicTermId: z.string().optional().nullable(),
  date: z.coerce.date(),
  status: z.enum(["Present", "Absent", "Tardy", "Excused"]),
  notes: z.string().optional().nullable(),
  recordedByTeacherId: z.string().min(1)
});

export const supportNoteSchema = z.object({
  studentId: z.string().min(1),
  authorUserId: z.string().min(1),
  visibility: z.enum(["TeacherOnly", "AdvisorOnly", "AdminOnly", "Shared"]),
  noteType: z.enum(["Academic", "Attendance", "Behavior", "FamilyCommunication", "Other"]),
  content: z.string().min(1)
});

export const interventionPlanSchema = z.object({
  studentId: z.string().min(1),
  createdByUserId: z.string().min(1),
  status: z.enum(["Draft", "Active", "Completed", "Cancelled"]),
  riskArea: z.enum(["Grades", "Attendance", "Engagement", "Behavior", "Other"]),
  summary: z.string().min(1),
  recommendedActions: z.array(z.string().min(1)).min(1),
  followUpDate: z.coerce.date()
});

export type TeacherInput = z.infer<typeof teacherSchema>;
export type StudentInput = z.infer<typeof studentSchema>;
export type CourseInput = z.infer<typeof courseSchema>;
export type ClassSectionInput = z.infer<typeof classSectionSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type SubmissionInput = z.infer<typeof submissionSchema>;
export type AttendanceInput = z.infer<typeof attendanceSchema>;
export type SupportNoteInput = z.infer<typeof supportNoteSchema>;
export type InterventionPlanInput = z.infer<typeof interventionPlanSchema>;
