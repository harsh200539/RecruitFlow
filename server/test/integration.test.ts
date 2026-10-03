import 'dotenv/config';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app.js';
import { db } from '../src/db.js';
import { token } from '../src/lib.js';
const tag = Date.now().toString();
let admin: any,
  recruiter: any,
  manager: any,
  outsider: any,
  candidate: any,
  job: any,
  submission: any;
let hash: string;
const users: string[] = [];
const as = (u: any) => ({ Authorization: 'Bearer ' + token(u), 'X-App-Request': '1' });
const candidateData = {
  name: 'Test Nurse',
  email: 'candidate-' + tag + '@example.com',
  phone: '+919000000001',
  location: 'Vadodara',
  skills: ['Patient care'],
  experience: 3,
  currentCompany: 'Test Hospital',
};
beforeAll(async () => {
  hash = await bcrypt.hash('test-password-123', 4);
  for (const [email, role] of [
    ['admin', 'ADMIN'],
    ['recruiter', 'RECRUITER'],
    ['manager', 'HIRING_MANAGER'],
    ['other', 'RECRUITER'],
  ]) {
    const u = await db.user.create({
      data: {
        name: email,
        email: email + '-' + tag + '@example.com',
        passwordHash: hash,
        role: role as any,
      },
    });
    users.push(u.id);
    if (email === 'admin') admin = u;
    if (email === 'recruiter') recruiter = u;
    if (email === 'manager') manager = u;
    if (email === 'other') outsider = u;
  }
});
afterAll(async () => {
  await db.activity.deleteMany({ where: { userId: { in: users } } });
  await db.candidate.deleteMany({ where: { recruiterId: { in: users } } });
  await db.job.deleteMany({ where: { recruiterId: { in: users } } });
  await db.user.deleteMany({
    where: { OR: [{ id: { in: users } }, { email: { contains: tag } }] },
  });
  await db.$disconnect();
});
describe('RecruitFlow real database integration', () => {
  it('rejects unauthenticated and invalid JWT requests', async () => {
    expect((await request(app).get('/api/candidates')).status).toBe(401);
    expect(
      (await request(app).get('/api/candidates').set('Authorization', 'Bearer bad')).status,
    ).toBe(401);
  });
  it('registers with a safe role and rejects injected admin role', async () => {
    const body = {
      name: 'New User',
      email: 'new-' + tag + '@example.com',
      password: 'test-password-123',
    };
    expect(
      (
        await request(app)
          .post('/api/auth/register')
          .set('X-App-Request', '1')
          .send({ ...body, role: 'ADMIN' })
      ).status,
    ).toBe(400);
    const r = await request(app).post('/api/auth/register').set('X-App-Request', '1').send(body);
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe('RECRUITER');
    expect(
      (await request(app).post('/api/auth/register').set('X-App-Request', '1').send(body)).status,
    ).toBe(409);
  });
  it('logs in without exposing hashes and rejects wrong passwords', async () => {
    const ok = await request(app)
      .post('/api/auth/login')
      .set('X-App-Request', '1')
      .send({ email: recruiter.email, password: 'test-password-123' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.passwordHash).toBeUndefined();
    expect(ok.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .set('X-App-Request', '1')
          .send({ email: recruiter.email, password: 'wrong-password-123' })
      ).status,
    ).toBe(401);
  });
  it('requires the CSRF request header', async () => {
    expect(
      (
        await request(app)
          .post('/api/candidates')
          .set('Authorization', 'Bearer ' + token(recruiter))
          .send(candidateData)
      ).status,
    ).toBe(403);
  });
  it('validates candidate input', async () => {
    expect(
      (
        await request(app)
          .post('/api/candidates')
          .set(as(recruiter))
          .send({ ...candidateData, experience: -1 })
      ).status,
    ).toBe(400);
  });
  it('creates candidate and enforces recruiter ownership', async () => {
    const r = await request(app).post('/api/candidates').set(as(recruiter)).send(candidateData);
    expect(r.status).toBe(201);
    candidate = r.body;
    expect(
      (
        await request(app)
          .get('/api/candidates/' + candidate.id)
          .set(as(outsider))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .get('/api/candidates/' + candidate.id)
          .set(as(manager))
      ).status,
    ).toBe(404);
  });
  it('edits candidate and disallows skipped workflow stages', async () => {
    expect(
      (
        await request(app)
          .patch('/api/candidates/' + candidate.id)
          .set(as(recruiter))
          .send({ stage: 'SELECTED' })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .patch('/api/candidates/' + candidate.id)
          .set(as(recruiter))
          .send({ stage: 'SCREENING', location: 'Ahmedabad' })
      ).status,
    ).toBe(200);
  });
  it('restricts job creation to admin and validates salaries', async () => {
    const body = {
      title: 'Clinical Nurse',
      company: 'Test Clinic',
      description: 'Provide excellent clinical care in our team.',
      skills: ['Patient care'],
      location: 'Ahmedabad',
      employmentType: 'FULL_TIME',
      salaryMin: 300000,
      salaryMax: 600000,
      experienceRequired: 2,
      recruiterId: recruiter.id,
      hiringManagerId: manager.id,
    };
    expect((await request(app).post('/api/jobs').set(as(recruiter)).send(body)).status).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/jobs')
          .set(as(admin))
          .send({ ...body, salaryMax: 1 })
      ).status,
    ).toBe(400);
    const r = await request(app).post('/api/jobs').set(as(admin)).send(body);
    expect(r.status).toBe(201);
    job = r.body;
  });
  it('creates unique submissions and grants assigned-manager access', async () => {
    const body = { candidateId: candidate.id, jobId: job.id };
    const r = await request(app).post('/api/submissions').set(as(recruiter)).send(body);
    expect(r.status).toBe(201);
    submission = r.body;
    expect((await request(app).post('/api/submissions').set(as(recruiter)).send(body)).status).toBe(
      409,
    );
    expect(
      (
        await request(app)
          .get('/api/candidates/' + candidate.id)
          .set(as(manager))
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .patch('/api/candidates/' + candidate.id)
          .set(as(manager))
          .send({ name: 'Changed' })
      ).status,
    ).toBe(403);
  });
  it('schedules an interview and advances the submission', async () => {
    const r = await request(app)
      .post('/api/interviews')
      .set(as(recruiter))
      .send({
        submissionId: submission.id,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        type: 'VIDEO',
        interviewer: 'Hiring Manager',
      });
    expect(r.status).toBe(201);
    expect((await db.submission.findUnique({ where: { id: submission.id } }))?.status).toBe(
      'INTERVIEW',
    );
    expect(
      (
        await request(app)
          .patch('/api/interviews/' + r.body.id)
          .set(as(outsider))
          .send({ status: 'COMPLETED' })
      ).status,
    ).toBe(404);
  });
  it('lets assigned manager select a candidate, denies outsiders', async () => {
    expect(
      (
        await request(app)
          .patch('/api/submissions/' + submission.id + '/status')
          .set(as(outsider))
          .send({ status: 'SELECTED' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch('/api/submissions/' + submission.id + '/status')
          .set(as(manager))
          .send({ status: 'SELECTED' })
      ).status,
    ).toBe(200);
  });
  it('validates resume signatures and protects downloads', async () => {
    expect(
      (
        await request(app)
          .post('/api/candidates/' + candidate.id + '/resume')
          .set(as(recruiter))
          .attach('resume', Buffer.from('not a PDF'), {
            filename: 'bad.pdf',
            contentType: 'application/pdf',
          })
      ).status,
    ).toBe(400);
    const upload = await request(app)
      .post('/api/candidates/' + candidate.id + '/resume')
      .set(as(recruiter))
      .attach('resume', Buffer.from('%PDF-1.7\nfixture'), {
        filename: 'resume.pdf',
        contentType: 'application/pdf',
      });
    expect(upload.status).toBe(200);
    expect(
      (
        await request(app)
          .get('/api/candidates/' + candidate.id + '/resume')
          .set(as(outsider))
      ).status,
    ).toBe(404);
  });
  it('paginates and returns scoped dashboard totals', async () => {
    const r = await request(app).get('/api/candidates?limit=1&search=Test').set(as(recruiter));
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(1);
    expect((await request(app).get('/api/candidates?page=0').set(as(recruiter))).status).toBe(400);
    const d = await request(app).get('/api/dashboard/summary').set(as(manager));
    expect(d.body.placements).toBe(1);
    expect(d.body.candidates).toBe(1);
  });
  it('deletes candidates and revokes sessions after logout', async () => {
    expect(
      (
        await request(app)
          .delete('/api/candidates/' + candidate.id)
          .set(as(outsider))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete('/api/candidates/' + candidate.id)
          .set(as(recruiter))
      ).status,
    ).toBe(204);
    const old = as(recruiter);
    expect((await request(app).post('/api/auth/logout').set(old)).status).toBe(204);
    expect((await request(app).get('/api/auth/me').set(old)).status).toBe(401);
  });
});
