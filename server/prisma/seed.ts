import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
const db = new PrismaClient();
async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10)
    throw new Error('Set SEED_PASSWORD to at least 10 characters');
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await db.user.upsert({
    where: { email: 'admin@recruitflow.demo' },
    update: {},
    create: { name: 'Alex Morgan', email: 'admin@recruitflow.demo', passwordHash, role: 'ADMIN' },
  });
  const recruiter = await db.user.upsert({
    where: { email: 'recruiter@recruitflow.demo' },
    update: {},
    create: {
      name: 'Riya Shah',
      email: 'recruiter@recruitflow.demo',
      passwordHash,
      role: 'RECRUITER',
    },
  });
  const manager = await db.user.upsert({
    where: { email: 'manager@recruitflow.demo' },
    update: {},
    create: {
      name: 'Daniel Reed',
      email: 'manager@recruitflow.demo',
      passwordHash,
      role: 'HIRING_MANAGER',
    },
  });
  const jobs = [];
  for (const [i, title] of [
    'ICU Registered Nurse',
    'Clinical Research Coordinator',
    'Healthcare Data Analyst',
    'Senior Physiotherapist',
    'Hospital Operations Lead',
    'Frontend Developer — HealthTech',
  ].entries()) {
    jobs.push(
      await db.job.upsert({
        where: { id: 'demo-job-' + i },
        update: {},
        create: {
          id: 'demo-job-' + i,
          title,
          company: ['Cedar Health', 'Meridian Medical', 'Nova HealthTech'][i % 3],
          description:
            'Join a thoughtful team delivering better healthcare outcomes. Collaborate across departments, maintain quality standards, and bring a patient-first approach to your work. We value experience, clear communication, and curiosity.',
          skills:
            i === 5
              ? ['React', 'TypeScript', 'Accessibility']
              : ['Patient care', 'Communication', 'Clinical expertise'],
          location: ['Vadodara', 'Ahmedabad', 'Remote'][i % 3],
          employmentType: i === 2 ? 'CONTRACT' : 'FULL_TIME',
          salaryMin: 450000,
          salaryMax: 1200000,
          experienceRequired: 2 + (i % 3),
          recruiterId: recruiter.id,
          hiringManagerId: manager.id,
          status: i === 4 ? 'ON_HOLD' : 'OPEN',
        },
      }),
    );
  }
  const names = [
    'Sarah Mitchell',
    'Arjun Desai',
    'Priya Nair',
    'James Wilson',
    'Meera Joshi',
    'Omar Hassan',
    'Ananya Patel',
    'David Chen',
    'Nisha Rao',
    'Emma Collins',
    'Karan Shah',
    'Sofia Reyes',
  ];
  for (const [i, name] of names.entries()) {
    const c = await db.candidate.upsert({
      where: { email: 'candidate' + i + '@example.com' },
      update: {},
      create: {
        name,
        email: 'candidate' + i + '@example.com',
        phone: '+91 90000000' + String(i).padStart(2, '0'),
        location: ['Vadodara', 'Ahmedabad', 'Mumbai'][i % 3],
        skills:
          i % 3 === 0
            ? ['React', 'TypeScript', 'Healthcare']
            : ['Patient care', 'Clinical expertise', 'Communication'],
        experience: 2 + (i % 6),
        currentCompany: ['Cedar Health', 'Independent', 'Meridian Medical'][i % 3],
        recruiterId: recruiter.id,
        stage: i < 2 ? 'SCREENING' : 'SUBMITTED',
      },
    });
    if (i >= 2) {
      const s = await db.submission.upsert({
        where: { candidateId_jobId: { candidateId: c.id, jobId: jobs[i % 4].id } },
        update: {},
        create: {
          candidateId: c.id,
          jobId: jobs[i % 4].id,
          recruiterId: recruiter.id,
          status: i < 6 ? 'SUBMITTED' : i < 9 ? 'INTERVIEW' : i === 9 ? 'SELECTED' : 'REJECTED',
          notes: 'Strong fit for the team; screening completed.',
        },
      });
      if (i >= 6 && i < 9)
        await db.interview.upsert({
          where: { id: 'demo-interview-' + i },
          update: {},
          create: {
            id: 'demo-interview-' + i,
            submissionId: s.id,
            scheduledAt: new Date(Date.now() + (i - 5) * 86400000),
            type: 'VIDEO',
            interviewer: 'Daniel Reed',
            notes: 'Discuss clinical background and team collaboration.',
          },
        });
    }
    await db.activity.upsert({
      where: { id: 'demo-activity-' + i },
      update: {},
      create: {
        id: 'demo-activity-' + i,
        userId: recruiter.id,
        candidateId: c.id,
        action: 'CANDIDATE_CREATED',
      },
    });
  }
  console.log('RecruitFlow seeded. Accounts: admin / recruiter / manager @recruitflow.demo');
}
main().finally(() => db.$disconnect());
