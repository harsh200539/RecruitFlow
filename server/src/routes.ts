import express, { Express, Response } from 'express';
import { Prisma, Stage } from '@prisma/client';
import { z } from 'zod';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import {
  authenticate,
  roles,
  asyncRoute,
  fail,
  param,
  pagination,
  userSelect,
  transaction,
} from './lib.js';
const stages = z.enum(['ADDED', 'SCREENING', 'SUBMITTED', 'INTERVIEW', 'SELECTED', 'REJECTED']);
const candidateSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().email().toLowerCase(),
    phone: z.string().min(6).max(30),
    location: z.string().min(2).max(100),
    skills: z.array(z.string().trim().min(1).max(60)).max(30),
    experience: z.number().min(0).max(60),
    currentCompany: z.string().max(200).nullable().optional(),
    stage: stages.optional(),
  })
  .strict();
const jobSchema = z
  .object({
    title: z.string().min(2).max(150),
    company: z.string().min(2).max(150),
    description: z.string().min(10).max(10000),
    skills: z.array(z.string().min(1).max(60)).max(30),
    location: z.string().min(2),
    employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']),
    salaryMin: z.number().int().min(0),
    salaryMax: z.number().int().min(0),
    experienceRequired: z.number().min(0).max(60),
    status: z.enum(['OPEN', 'CLOSED', 'ON_HOLD', 'FILLED']).optional(),
    recruiterId: z.string().optional(),
    hiringManagerId: z.string().nullable().optional(),
  })
  .strict();
const submissionInclude = {
  candidate: true,
  job: true,
  recruiter: { select: userSelect },
  interviews: true,
} as const;
function candidateScope(res: Response): Prisma.CandidateWhereInput {
  const u = res.locals.user;
  return u.role === 'ADMIN'
    ? {}
    : u.role === 'RECRUITER'
      ? { recruiterId: u.id }
      : { submissions: { some: { job: { hiringManagerId: u.id } } } };
}
function jobScope(res: Response): Prisma.JobWhereInput {
  return res.locals.user.role === 'HIRING_MANAGER' ? { hiringManagerId: res.locals.user.id } : {};
}
function submissionScope(res: Response): Prisma.SubmissionWhereInput {
  const u = res.locals.user;
  return u.role === 'ADMIN'
    ? {}
    : u.role === 'RECRUITER'
      ? { recruiterId: u.id }
      : { job: { hiringManagerId: u.id } };
}
async function candidateAccess(id: string, res: Response) {
  const c = await db.candidate.findFirst({ where: { id, ...candidateScope(res) } });
  if (!c) fail(404, 'Candidate not found');
  return c;
}
async function submissionAccess(id: string, res: Response) {
  const s = await db.submission.findFirst({
    where: { id, ...submissionScope(res) },
    include: submissionInclude,
  });
  if (!s) fail(404, 'Submission not found');
  return s;
}
async function activity(
  res: Response,
  action: string,
  candidateId?: string,
  metadata: Prisma.InputJsonValue = {},
) {
  await db.activity.create({ data: { userId: res.locals.user.id, action, candidateId, metadata } });
}
const transitions: Record<Stage, Stage[]> = {
  ADDED: ['SCREENING', 'REJECTED'],
  SCREENING: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['INTERVIEW', 'SELECTED', 'REJECTED'],
  INTERVIEW: ['SELECTED', 'REJECTED'],
  SELECTED: [],
  REJECTED: ['SCREENING'],
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
});
export function installRoutes(app: Express) {
  const router = express.Router();
  router.use(authenticate);
  router.get(
    '/candidates',
    asyncRoute(async (req, res) => {
      const p = pagination(req);
      const q = z
        .object({
          search: z.string().max(100).optional(),
          location: z.string().optional(),
          skill: z.string().optional(),
          experienceMin: z.coerce.number().min(0).optional(),
          status: stages.optional(),
        })
        .parse(req.query);
      const where: Prisma.CandidateWhereInput = {
        ...candidateScope(res),
        ...(q.location ? { location: { contains: q.location, mode: 'insensitive' } } : {}),
        ...(q.skill ? { skills: { has: q.skill } } : {}),
        ...(q.experienceMin !== undefined ? { experience: { gte: q.experienceMin } } : {}),
        ...(q.status ? { stage: q.status } : {}),
        ...(q.search
          ? {
              OR: [
                { name: { contains: q.search, mode: 'insensitive' } },
                { email: { contains: q.search, mode: 'insensitive' } },
                { skills: { has: q.search } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        db.candidate.findMany({
          where,
          skip: p.skip,
          take: p.limit,
          orderBy: { createdAt: 'desc' },
        }),
        db.candidate.count({ where }),
      ]);
      res.json({ items, total, ...p });
    }),
  );
  router.post(
    '/candidates',
    roles('ADMIN', 'RECRUITER'),
    asyncRoute(async (req, res) => {
      const data = candidateSchema.parse(req.body);
      const c = await db.candidate.create({ data: { ...data, recruiterId: res.locals.user.id } });
      await activity(res, 'CANDIDATE_CREATED', c.id);
      res.status(201).json(c);
    }),
  );
  router.get(
    '/candidates/:id',
    asyncRoute(async (req, res) => {
      const c = await candidateAccess(param(req), res);
      res.json({
        ...c,
        submissions: await db.submission.findMany({
          where: { candidateId: c.id, ...submissionScope(res) },
          include: submissionInclude,
        }),
        activities: await db.activity.findMany({
          where: { candidateId: c.id },
          include: { user: { select: userSelect } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      });
    }),
  );
  router.patch(
    '/candidates/:id',
    roles('ADMIN', 'RECRUITER'),
    asyncRoute(async (req, res) => {
      const c = await candidateAccess(param(req), res);
      const data = candidateSchema.partial().parse(req.body);
      if (data.stage && data.stage !== c.stage && !transitions[c.stage].includes(data.stage))
        fail(409, 'Invalid pipeline transition');
      const updated = await db.candidate.update({ where: { id: c.id }, data });
      await activity(res, 'CANDIDATE_UPDATED', c.id);
      res.json(updated);
    }),
  );
  router.delete(
    '/candidates/:id',
    roles('ADMIN', 'RECRUITER'),
    asyncRoute(async (req, res) => {
      const c = await candidateAccess(param(req), res);
      await db.candidate.delete({ where: { id: c.id } });
      res.status(204).end();
    }),
  );
  router.post(
    '/candidates/:id/resume',
    roles('ADMIN', 'RECRUITER'),
    upload.single('resume'),
    asyncRoute(async (req, res) => {
      const c = await candidateAccess(param(req), res);
      if (!req.file || req.file.buffer.subarray(0, 5).toString() !== '%PDF-')
        fail(400, 'Upload a PDF resume, maximum 5 MB');
      const dir = path.resolve('uploads');
      await fs.mkdir(dir, { recursive: true });
      const name = randomUUID() + '.pdf';
      await fs.writeFile(path.join(dir, name), req.file.buffer);
      res.json(await db.candidate.update({ where: { id: c.id }, data: { resumeUrl: name } }));
    }),
  );
  router.get(
    '/candidates/:id/resume',
    asyncRoute(async (req, res) => {
      const c = await candidateAccess(param(req), res);
      if (!c.resumeUrl) fail(404, 'No resume uploaded');
      res.set('Content-Disposition', 'attachment; filename="resume.pdf"');
      res
        .type('application/pdf')
        .send(await fs.readFile(path.resolve('uploads', path.basename(c.resumeUrl))));
    }),
  );
  router.get(
    '/jobs',
    asyncRoute(async (req, res) => {
      const p = pagination(req);
      const q = z
        .object({
          search: z.string().optional(),
          status: z.enum(['OPEN', 'CLOSED', 'ON_HOLD', 'FILLED']).optional(),
        })
        .parse(req.query);
      const where: Prisma.JobWhereInput = {
        ...jobScope(res),
        ...(q.status ? { status: q.status } : {}),
        ...(q.search
          ? {
              OR: [
                { title: { contains: q.search, mode: 'insensitive' } },
                { company: { contains: q.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        db.job.findMany({
          where,
          skip: p.skip,
          take: p.limit,
          include: {
            recruiter: { select: userSelect },
            hiringManager: { select: userSelect },
            _count: { select: { submissions: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        db.job.count({ where }),
      ]);
      res.json({ items, total, ...p });
    }),
  );
  router.post(
    '/jobs',
    roles('ADMIN'),
    asyncRoute(async (req, res) => {
      const data = jobSchema.parse(req.body);
      if (data.salaryMax < data.salaryMin) fail(400, 'Maximum salary must exceed minimum');
      await validateAssignments(data);
      res
        .status(201)
        .json(
          await db.job.create({
            data: { ...data, recruiterId: data.recruiterId || res.locals.user.id },
          }),
        );
    }),
  );
  router.get(
    '/jobs/:id',
    asyncRoute(async (req, res) => {
      const j = await db.job.findFirst({
        where: { id: param(req), ...jobScope(res) },
        include: { recruiter: { select: userSelect }, hiringManager: { select: userSelect } },
      });
      if (!j) fail(404, 'Job not found');
      res.json({
        ...j,
        submissions: await db.submission.findMany({
          where: { jobId: j.id, ...submissionScope(res) },
          include: submissionInclude,
        }),
      });
    }),
  );
  router.patch(
    '/jobs/:id',
    roles('ADMIN'),
    asyncRoute(async (req, res) => {
      const data = jobSchema.partial().parse(req.body);
      const j = await db.job.findUnique({ where: { id: param(req) } });
      if (!j) fail(404, 'Job not found');
      if ((data.salaryMax ?? j.salaryMax) < (data.salaryMin ?? j.salaryMin))
        fail(400, 'Invalid salary range');
      await validateAssignments(data);
      res.json(await db.job.update({ where: { id: j.id }, data }));
    }),
  );
  router.delete(
    '/jobs/:id',
    roles('ADMIN'),
    asyncRoute(async (req, res) => {
      await db.job.delete({ where: { id: param(req) } });
      res.status(204).end();
    }),
  );
  router.get(
    '/submissions',
    asyncRoute(async (req, res) => {
      const p = pagination(req);
      const where = {
        ...submissionScope(res),
        ...(req.query.jobId ? { jobId: String(req.query.jobId) } : {}),
      };
      res.json({
        items: await db.submission.findMany({
          where,
          include: submissionInclude,
          skip: p.skip,
          take: p.limit,
          orderBy: { submittedAt: 'desc' },
        }),
        total: await db.submission.count({ where }),
        ...p,
      });
    }),
  );
  router.post(
    '/submissions',
    roles('ADMIN', 'RECRUITER'),
    asyncRoute(async (req, res) => {
      const data = z
        .object({
          candidateId: z.string(),
          jobId: z.string(),
          notes: z.string().max(5000).default(''),
        })
        .strict()
        .parse(req.body);
      await candidateAccess(data.candidateId, res);
      const result = await transaction(async (tx) => {
        const job = await tx.job.findUnique({ where: { id: data.jobId } });
        if (!job || job.status !== 'OPEN') fail(409, 'Job is not open');
        const s = await tx.submission.create({
          data: { ...data, recruiterId: res.locals.user.id },
        });
        await tx.candidate.update({
          where: { id: data.candidateId },
          data: { stage: 'SUBMITTED' },
        });
        await tx.activity.create({
          data: {
            userId: res.locals.user.id,
            candidateId: data.candidateId,
            action: 'CANDIDATE_SUBMITTED',
            metadata: { jobId: job.id },
          },
        });
        return s;
      });
      res.status(201).json(result);
    }),
  );
  router.patch(
    '/submissions/:id/status',
    asyncRoute(async (req, res) => {
      const s = await submissionAccess(param(req), res);
      const data = z
        .object({ status: stages, notes: z.string().max(5000).optional() })
        .strict()
        .parse(req.body);
      if (
        res.locals.user.role === 'HIRING_MANAGER' &&
        !['SELECTED', 'REJECTED'].includes(data.status)
      )
        fail(403, 'Managers can accept or reject submissions');
      if (data.status !== s.status && !transitions[s.status].includes(data.status))
        fail(409, 'Invalid pipeline transition');
      const result = await transaction(async (tx) => {
        const next = await tx.submission.update({ where: { id: s.id }, data });
        await tx.activity.create({
          data: {
            userId: res.locals.user.id,
            candidateId: s.candidateId,
            action: 'SUBMISSION_STATUS_CHANGED',
            metadata: { from: s.status, to: data.status, jobId: s.jobId },
          },
        });
        return next;
      });
      res.json(result);
    }),
  );
  router.get(
    '/interviews',
    asyncRoute(async (req, res) => {
      const p = pagination(req);
      res.json({
        items: await db.interview.findMany({
          where: { submission: submissionScope(res) },
          include: { submission: { include: submissionInclude } },
          orderBy: { scheduledAt: 'asc' },
          skip: p.skip,
          take: p.limit,
        }),
        total: await db.interview.count({ where: { submission: submissionScope(res) } }),
        ...p,
      });
    }),
  );
  const interviewSchema = z
    .object({
      submissionId: z.string(),
      scheduledAt: z.string().datetime(),
      type: z.enum(['VIDEO', 'PHONE', 'IN_PERSON']),
      interviewer: z.string().min(2),
      notes: z.string().max(5000).default(''),
      status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
    })
    .strict();
  router.post(
    '/interviews',
    roles('ADMIN', 'RECRUITER'),
    asyncRoute(async (req, res) => {
      const data = interviewSchema.parse(req.body);
      const s = await submissionAccess(data.submissionId, res);
      if (!['SUBMITTED', 'INTERVIEW'].includes(s.status))
        fail(409, 'Submission is not ready for interview');
      if (new Date(data.scheduledAt) <= new Date())
        fail(400, 'Interview must be scheduled in the future');
      res.status(201).json(
        await transaction(async (tx) => {
          const i = await tx.interview.create({ data });
          await tx.submission.update({ where: { id: s.id }, data: { status: 'INTERVIEW' } });
          await tx.activity.create({
            data: {
              userId: res.locals.user.id,
              candidateId: s.candidateId,
              action: 'INTERVIEW_SCHEDULED',
              metadata: { interviewId: i.id },
            },
          });
          return i;
        }),
      );
    }),
  );
  router.patch(
    '/interviews/:id',
    roles('ADMIN', 'RECRUITER'),
    asyncRoute(async (req, res) => {
      const i = await db.interview.findFirst({
        where: { id: param(req), submission: submissionScope(res) },
      });
      if (!i) fail(404, 'Interview not found');
      const data = interviewSchema.omit({ submissionId: true }).partial().parse(req.body);
      res.json(await db.interview.update({ where: { id: i.id }, data }));
    }),
  );
  router.get(
    '/dashboard/summary',
    asyncRoute(async (_req, res) => {
      const cs = candidateScope(res),
        js = jobScope(res),
        ss = submissionScope(res);
      const [candidates, openJobs, interviews, placements, pipeline, upcoming, activities] =
        await Promise.all([
          db.candidate.count({ where: cs }),
          db.job.count({ where: { ...js, status: 'OPEN' } }),
          db.interview.count({ where: { status: 'SCHEDULED', submission: ss } }),
          db.submission.count({ where: { ...ss, status: 'SELECTED' } }),
          db.submission.groupBy({ by: ['status'], where: ss, _count: { _all: true } }),
          db.interview.findMany({
            where: { status: 'SCHEDULED', scheduledAt: { gte: new Date() }, submission: ss },
            include: { submission: { include: { candidate: true, job: true } } },
            orderBy: { scheduledAt: 'asc' },
            take: 6,
          }),
          db.activity.findMany({
            where: { ...(res.locals.user.role === 'ADMIN' ? {} : { candidate: cs }) },
            include: { user: { select: userSelect }, candidate: true },
            orderBy: { createdAt: 'desc' },
            take: 8,
          }),
        ]);
      res.json({ candidates, openJobs, interviews, placements, pipeline, upcoming, activities });
    }),
  );
  app.use('/api', router);
}
async function validateAssignments(data: {
  recruiterId?: string;
  hiringManagerId?: string | null;
}) {
  if (data.recruiterId) {
    const u = await db.user.findUnique({ where: { id: data.recruiterId } });
    if (!u || !['ADMIN', 'RECRUITER'].includes(u.role)) fail(400, 'Invalid recruiter');
  }
  if (data.hiringManagerId) {
    const u = await db.user.findUnique({ where: { id: data.hiringManagerId } });
    if (!u || u.role !== 'HIRING_MANAGER') fail(400, 'Invalid hiring manager');
  }
}
