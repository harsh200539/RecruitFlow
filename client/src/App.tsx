import { useState } from 'react';
import { Routes, Route, Link, useParams } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  CalendarDays,
  Shield,
  ArrowUpRight,
  UserPlus,
  CheckCircle2,
  ArrowLeft,
  FileText,
  Upload,
  Trash2,
  PenLine,
  Send,
} from 'lucide-react';
import {
  api,
  useAuth,
  useData,
  useActions,
  Guard,
  Login,
  Shell,
  Heading,
  Stats,
  Loading,
  ErrorState,
  Empty,
  Badge,
  RecordForm,
  Field,
  SearchBox,
  Pager,
  Page,
  Row,
  AddButton,
  date,
  options,
} from './shared';
const nav = [
  { to: '/', label: 'Overview', icon: <LayoutDashboard size={17} /> },
  { to: '/candidates', label: 'Candidates', icon: <Users size={17} /> },
  { to: '/jobs', label: 'Job openings', icon: <Briefcase size={17} /> },
  { to: '/submissions', label: 'Submissions', icon: <Send size={17} /> },
  { to: '/interviews', label: 'Interviews', icon: <CalendarDays size={17} /> },
  { to: '/users', label: 'Team & access', icon: <Shield size={17} />, admin: true },
];
const stageList = ['ADDED', 'SCREENING', 'SUBMITTED', 'INTERVIEW', 'SELECTED', 'REJECTED'];
const candidateFields: Field[] = [
  { name: 'name', label: 'Full name', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'phone', label: 'Phone', required: true },
  { name: 'location', label: 'Location', required: true },
  { name: 'skills', label: 'Skills (comma separated)', required: true },
  {
    name: 'experience',
    label: 'Experience in years',
    type: 'number',
    min: 0,
    max: 60,
    step: '0.5',
    required: true,
  },
  { name: 'currentCompany', label: 'Current organisation' },
];
const jobFields: Field[] = [
  { name: 'title', label: 'Job title', required: true },
  { name: 'company', label: 'Company', required: true },
  { name: 'location', label: 'Location', required: true },
  { name: 'skills', label: 'Required skills (comma separated)', required: true },
  {
    name: 'employmentType',
    label: 'Employment',
    type: 'select',
    options: options(['FULL_TIME', 'PART_TIME', 'CONTRACT']),
    required: true,
  },
  {
    name: 'experienceRequired',
    label: 'Experience required',
    type: 'number',
    min: 0,
    step: '0.5',
    required: true,
  },
  { name: 'salaryMin', label: 'Minimum annual salary (₹)', type: 'number', min: 0, required: true },
  { name: 'salaryMax', label: 'Maximum annual salary (₹)', type: 'number', min: 0, required: true },
  {
    name: 'status',
    label: 'Job status',
    type: 'select',
    options: options(['OPEN', 'CLOSED', 'ON_HOLD', 'FILLED']),
    required: true,
  },
  { name: 'description', label: 'Job description', type: 'textarea', required: true },
];
const splitSkills = (s: string) =>
  s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
const salary = (n: number) => '₹' + new Intl.NumberFormat('en-IN').format(n);
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <Guard>
            <Shell nav={nav}>
              <Routes>
                <Route index element={<Dashboard />} />
                <Route path="candidates" element={<Candidates />} />
                <Route path="candidates/:id" element={<CandidateDetail />} />
                <Route path="jobs" element={<Jobs />} />
                <Route path="jobs/:id" element={<JobDetail />} />
                <Route path="submissions" element={<Submissions />} />
                <Route path="interviews" element={<Interviews />} />
                <Route
                  path="users"
                  element={
                    <Guard roles={['ADMIN']}>
                      <Team />
                    </Guard>
                  }
                />
                <Route path="*" element={<Empty title="Page not found" />} />
              </Routes>
            </Shell>
          </Guard>
        }
      />
    </Routes>
  );
}
function Dashboard() {
  const q = useData<Row>('/dashboard/summary');
  const { user } = useAuth();
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  const d = q.data;
  const counts = Object.fromEntries(d.pipeline.map((p: Row) => [p.status, p._count._all]));
  return (
    <>
      <Heading
        eyebrow="THE BIG PICTURE"
        title={`Good morning, ${user?.name.split(' ')[0]}`}
        subtitle="A clear view of your people, your pipeline, and what’s next."
        action={
          <Link className="primary" to="/candidates">
            View candidates <ArrowUpRight size={17} />
          </Link>
        }
      />
      <Stats
        items={[
          {
            label: 'Total candidates',
            value: d.candidates,
            note: 'People with possibilities',
            icon: <Users size={18} />,
          },
          {
            label: 'Open positions',
            value: d.openJobs,
            note: 'Opportunities waiting',
            icon: <Briefcase size={18} />,
          },
          {
            label: 'Scheduled interviews',
            value: d.interviews,
            note: 'The next conversation',
            icon: <CalendarDays size={18} />,
          },
          {
            label: 'Successful placements',
            value: d.placements,
            note: 'A new chapter started',
            icon: <CheckCircle2 size={18} />,
          },
        ]}
      />
      <div className="hero-strip">
        <div>
          <span className="eyebrow">PEOPLE FIRST, ALWAYS</span>
          <h2>Great teams start with a conversation.</h2>
          <p>Keep your pipeline moving with thoughtful follow-ups.</p>
        </div>
        <UserPlus size={50} strokeWidth={1} />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Your hiring pipeline</h2>
            <span>Submission stages</span>
          </div>
          {stageList.slice(2).map((s) => (
            <div className="pipeline-row" key={s}>
              <span>{s.toLowerCase()}</span>
              <div className="bar">
                <span
                  style={{
                    width: `${((counts[s] || 0) / Math.max(1, ...(Object.values(counts) as number[]))) * 100}%`,
                  }}
                />
              </div>
              <strong>{counts[s] || 0}</strong>
            </div>
          ))}
          <p className="muted section-space">
            A candidate may appear in more than one job pipeline.
          </p>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Up next</h2>
            <Link className="muted" to="/interviews">
              All interviews ↗
            </Link>
          </div>
          {d.upcoming.length ? (
            d.upcoming.map((i: Row) => (
              <Link to={'/candidates/' + i.submission.candidateId} className="list-row" key={i.id}>
                <div>
                  <strong>{i.submission.candidate.name}</strong>
                  <small>
                    {i.submission.job.title} · {i.type}
                  </small>
                </div>
                <small>{date(i.scheduledAt)}</small>
              </Link>
            ))
          ) : (
            <Empty title="A little breathing room" text="No upcoming interviews scheduled." />
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-header">
          <h2>Recent activity</h2>
          <span>Your workspace, in motion</span>
        </div>
        {d.activities.map((a: Row) => (
          <div className="timeline" key={a.id}>
            <div className="avatar">{a.user.name[0]}</div>
            <div>
              <strong>{a.user.name}</strong>
              <p>
                {a.action.replaceAll('_', ' ').toLowerCase()} {a.candidate?.name}
              </p>
              <small>{date(a.createdAt)}</small>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
function Candidates() {
  const { user } = useAuth();
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [location, setLocation] = useState(''),
    [page, setPage] = useState(1),
    [create, setCreate] = useState(false);
  const a = useActions();
  const q = useData<Page>(
    `/candidates?search=${encodeURIComponent(search)}&location=${encodeURIComponent(location)}&page=${page}${status ? '&status=' + status : ''}`,
  );
  return (
    <>
      <Heading
        eyebrow="YOUR TALENT NETWORK"
        title="People, with potential"
        subtitle="Find the right person. Make the right connection."
        action={
          user?.role !== 'HIRING_MANAGER' && (
            <AddButton onClick={() => setCreate(true)}>Add candidate</AddButton>
          )
        }
      />
      <div className="toolbar">
        <SearchBox
          value={search}
          onChange={(s) => {
            setSearch(s);
            setPage(1);
          }}
          placeholder="Search name, email or exact skill…"
        />
        <select
          aria-label="Filter status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All stages</option>
          {stageList.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input
          aria-label="Filter location"
          placeholder="Location"
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            setPage(1);
          }}
          style={{ width: 150 }}
        />
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : q.data.items.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Expertise</th>
                  <th>Experience</th>
                  <th>Location</th>
                  <th>Stage</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link className="cell-person" to={'/candidates/' + c.id}>
                        <span className="avatar">{c.name[0]}</span>
                        <div>
                          <strong>{c.name}</strong>
                          <small>{c.email}</small>
                        </div>
                      </Link>
                    </td>
                    <td>
                      {c.skills.slice(0, 3).map((s: string) => (
                        <span className="skill" key={s}>
                          {s}
                        </span>
                      ))}
                    </td>
                    <td>{c.experience} years</td>
                    <td>{c.location}</td>
                    <td>
                      <Badge value={c.stage} />
                    </td>
                    <td>
                      <Link aria-label={'View ' + c.name} to={'/candidates/' + c.id}>
                        <ArrowUpRight size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={q.data.total} onChange={setPage} />
        </>
      ) : (
        <Empty />
      )}
      {create && (
        <RecordForm
          title="Introduce a candidate"
          fields={candidateFields}
          onClose={() => setCreate(false)}
          onSave={(d) =>
            a.save(() => api.post('/candidates', { ...d, skills: splitSkills(d.skills) }))
          }
        />
      )}
    </>
  );
}
function CandidateDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const q = useData<Row>('/candidates/' + id);
  const jobs = useData<Page>('/jobs?status=OPEN&limit=100');
  const [edit, setEdit] = useState(false),
    [submit, setSubmit] = useState(false);
  const a = useActions();
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  const c = q.data,
    can = user?.role !== 'HIRING_MANAGER';
  return (
    <>
      <Link className="back" to="/candidates">
        <ArrowLeft size={15} />
        Talent network
      </Link>
      <Heading
        eyebrow="CANDIDATE PROFILE"
        title={c.name}
        subtitle={`${c.location} · ${c.experience} years of experience`}
        action={
          can && (
            <div className="actions">
              <button onClick={() => setEdit(true)}>
                <PenLine size={14} />
                Edit profile
              </button>
              <AddButton onClick={() => setSubmit(true)}>Submit to job</AddButton>
            </div>
          )
        }
      />
      {a.error && (
        <p role="alert" className="error">
          {a.error}
        </p>
      )}
      <div className="detail-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>The person behind the profile</h2>
            <Badge value={c.stage} />
          </div>
          <dl className="detail-list">
            {[
              ['Email', c.email],
              ['Phone', c.phone],
              ['Current organisation', c.currentCompany || '—'],
              ['Added', date(c.createdAt)],
            ].map(([label, v]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <h3 className="section-space">Expertise</h3>
          {c.skills.map((s: string) => (
            <span className="skill" key={s}>
              {s}
            </span>
          ))}
          <div className="section-space actions">
            {c.resumeUrl && (
              <button
                onClick={() =>
                  a.run(async () => {
                    const r = await api.get('/candidates/' + id + '/resume', {
                      responseType: 'blob',
                    });
                    const u = URL.createObjectURL(r.data);
                    const link = document.createElement('a');
                    link.href = u;
                    link.download = 'resume.pdf';
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(u), 1000);
                  })
                }
              >
                <FileText size={16} />
                Download resume
              </button>
            )}
            {can && (
              <label className="text-button" style={{ cursor: 'pointer' }}>
                <Upload size={16} />
                Upload PDF resume
                <input
                  type="file"
                  accept="application/pdf"
                  style={{ maxWidth: 230 }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      a.run(async () => {
                        const form = new FormData();
                        form.append('resume', f);
                        await api.post('/candidates/' + id + '/resume', form);
                      });
                  }}
                />
              </label>
            )}
          </div>
          {can && (
            <div className="section-space actions">
              <select
                aria-label="Candidate stage"
                value={c.stage}
                onChange={(e) =>
                  a.run(() => api.patch('/candidates/' + id, { stage: e.target.value }))
                }
              >
                {stageList.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <button
                className="danger"
                disabled={a.busy}
                onClick={() => {
                  if (confirm('Delete this candidate and their submissions?'))
                    a.run(async () => {
                      await api.delete('/candidates/' + id);
                      window.location.assign('/candidates');
                    });
                }}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>Journey so far</h2>
          {c.activities.map((a: Row) => (
            <div className="timeline" key={a.id}>
              <div>
                <strong>{a.action.replaceAll('_', ' ')}</strong>
                <small>
                  {a.user.name} · {date(a.createdAt)}
                </small>
              </div>
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <h2>Job submissions</h2>
        <SubmissionRows rows={c.submissions} />
      </section>
      {edit && (
        <RecordForm
          title="Edit candidate"
          fields={candidateFields}
          initial={{ ...c, skills: c.skills.join(', ') }}
          onClose={() => setEdit(false)}
          onSave={(d) =>
            a.save(() => api.patch('/candidates/' + id, { ...d, skills: splitSkills(d.skills) }))
          }
        />
      )}
      {submit && (
        <RecordForm
          title="A new opportunity"
          fields={[
            {
              name: 'jobId',
              label: 'Open job',
              type: 'select',
              required: true,
              options: jobs.data?.items.map((j) => ({
                value: j.id,
                label: j.title + ' · ' + j.company,
              })),
            },
            { name: 'notes', label: 'Submission notes', type: 'textarea' },
          ]}
          onClose={() => setSubmit(false)}
          onSave={(d) => a.save(() => api.post('/submissions', { ...d, candidateId: id }))}
        />
      )}
    </>
  );
}
function Jobs() {
  const { user } = useAuth();
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [create, setCreate] = useState(false);
  const q = useData<Page>(`/jobs?search=${encodeURIComponent(search)}&page=${page}`);
  const a = useActions();
  const team = useData<Row[]>(user?.role === 'ADMIN' ? '/users' : '');
  const assignments: Field[] = [
    {
      name: 'recruiterId',
      label: 'Assigned recruiter',
      type: 'select',
      options: team.data
        ?.filter((u) => ['RECRUITER', 'ADMIN'].includes(u.role))
        .map((u) => ({ value: u.id, label: u.name })),
    },
    {
      name: 'hiringManagerId',
      label: 'Hiring manager',
      type: 'select',
      options: team.data
        ?.filter((u) => u.role === 'HIRING_MANAGER')
        .map((u) => ({ value: u.id, label: u.name })),
    },
  ];
  return (
    <>
      <Heading
        eyebrow="THE NEXT OPPORTUNITY"
        title="Open doors"
        subtitle="Every role is someone’s next chapter."
        action={
          user?.role === 'ADMIN' && (
            <AddButton onClick={() => setCreate(true)}>Create job</AddButton>
          )
        }
      />
      <div className="toolbar">
        <SearchBox
          value={search}
          onChange={(s) => {
            setSearch(s);
            setPage(1);
          }}
          placeholder="Search roles or companies…"
        />
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <>
          <div className="cards">
            {q.data.items.map((j) => (
              <Link to={'/jobs/' + j.id} className="card" key={j.id}>
                <div className="panel-header">
                  <span className="eyebrow">{j.company}</span>
                  <Badge value={j.status} />
                </div>
                <h3>{j.title}</h3>
                <p>
                  {j.location} · {j.employmentType.replaceAll('_', ' ')}
                  <br />
                  {j.experienceRequired}+ years · {salary(j.salaryMin)}–{salary(j.salaryMax)}
                </p>
                {j.skills.slice(0, 4).map((s: string) => (
                  <span className="skill" key={s}>
                    {s}
                  </span>
                ))}
                <div className="card-bottom">
                  <small className="muted">{j._count.submissions} submissions</small>
                  <ArrowUpRight size={19} />
                </div>
              </Link>
            ))}
          </div>
          {!q.data.items.length && <Empty />}
          <Pager page={page} total={q.data.total} onChange={setPage} />
        </>
      )}
      {create && (
        <RecordForm
          title="Create an opportunity"
          fields={[...jobFields, ...assignments]}
          initial={{ status: 'OPEN', employmentType: 'FULL_TIME' }}
          onClose={() => setCreate(false)}
          onSave={(d) =>
            a.save(() =>
              api.post('/jobs', {
                ...d,
                skills: splitSkills(d.skills),
                recruiterId: d.recruiterId || undefined,
                hiringManagerId: d.hiringManagerId || null,
              }),
            )
          }
        />
      )}
    </>
  );
}
function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const q = useData<Row>('/jobs/' + id);
  const [edit, setEdit] = useState(false);
  const a = useActions();
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  const j = q.data;
  return (
    <>
      <Link className="back" to="/jobs">
        <ArrowLeft size={15} />
        Job openings
      </Link>
      <Heading
        eyebrow={j.company}
        title={j.title}
        subtitle={`${j.location} · ${salary(j.salaryMin)}–${salary(j.salaryMax)}`}
        action={
          user?.role === 'ADMIN' && (
            <div className="actions">
              <button onClick={() => setEdit(true)}>Edit job</button>
              <button
                className="danger"
                onClick={() => {
                  if (confirm('Delete this job and its submissions?'))
                    a.run(async () => {
                      await api.delete('/jobs/' + id);
                      window.location.assign('/jobs');
                    });
                }}
              >
                Delete
              </button>
            </div>
          )
        }
      />
      <section className="panel">
        <Badge value={j.status} />
        <p className="section-space" style={{ whiteSpace: 'pre-wrap' }}>
          {j.description}
        </p>
        {j.skills.map((s: string) => (
          <span className="skill" key={s}>
            {s}
          </span>
        ))}
        <p className="muted section-space">
          Recruiter: {j.recruiter.name} · Hiring manager: {j.hiringManager?.name || 'Unassigned'}
        </p>
      </section>
      <section className="panel">
        <h2>Candidate submissions</h2>
        <SubmissionRows rows={j.submissions} />
      </section>
      {a.error && <p className="error">{a.error}</p>}
      {edit && (
        <RecordForm
          title="Edit opportunity"
          fields={jobFields}
          initial={{ ...j, skills: j.skills.join(', ') }}
          onClose={() => setEdit(false)}
          onSave={(d) =>
            a.save(() => api.patch('/jobs/' + id, { ...d, skills: splitSkills(d.skills) }))
          }
        />
      )}
    </>
  );
}
function SubmissionRows({ rows }: { rows: Row[] }) {
  const { user } = useAuth();
  const a = useActions();
  return (
    <>
      {a.error && (
        <p role="alert" className="error">
          {a.error}
        </p>
      )}
      {!rows.length ? (
        <Empty title="No submissions yet" />
      ) : (
        rows.map((s) => (
          <div className="list-row" key={s.id}>
            <Link to={'/candidates/' + s.candidate.id}>
              <strong>{s.candidate.name}</strong>
              <small>
                {s.job.title} · {s.job.company}
              </small>
              <small>{s.notes}</small>
            </Link>
            <div className="actions">
              <Badge value={s.status} />
              <select
                aria-label={'Update ' + s.candidate.name + ' submission'}
                value={s.status}
                disabled={a.busy}
                onChange={(e) =>
                  a.run(() =>
                    api.patch('/submissions/' + s.id + '/status', { status: e.target.value }),
                  )
                }
              >
                {[
                  s.status,
                  ...(user?.role === 'HIRING_MANAGER' ? ['SELECTED', 'REJECTED'] : stageList),
                ]
                  .filter((v, i, all) => all.indexOf(v) === i)
                  .map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </select>
            </div>
          </div>
        ))
      )}
    </>
  );
}
function Submissions() {
  const [page, setPage] = useState(1);
  const q = useData<Page>('/submissions?page=' + page);
  return (
    <>
      <Heading
        eyebrow="FROM INTRODUCTION TO OFFER"
        title="The hiring journey"
        subtitle="Track every connection, one opportunity at a time."
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <>
          <section className="panel">
            <SubmissionRows rows={q.data.items} />
          </section>
          <Pager page={page} total={q.data.total} onChange={setPage} />
        </>
      )}
    </>
  );
}
function Interviews() {
  const { user } = useAuth();
  const [page, setPage] = useState(1),
    [modal, setModal] = useState<Row | null | false>(false);
  const q = useData<Page>('/interviews?page=' + page);
  const subs = useData<Page>('/submissions?limit=100');
  const a = useActions();
  const fields: Field[] = [
    { name: 'scheduledAt', label: 'Date and time', type: 'datetime-local', required: true },
    {
      name: 'type',
      label: 'Interview format',
      type: 'select',
      options: options(['VIDEO', 'PHONE', 'IN_PERSON']),
      required: true,
    },
    { name: 'interviewer', label: 'Interviewer', required: true },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  return (
    <>
      <Heading
        eyebrow="MAKE SPACE FOR A CONVERSATION"
        title="Meet the possibilities"
        subtitle="The next step in every great placement."
        action={
          user?.role !== 'HIRING_MANAGER' && (
            <AddButton onClick={() => setModal(null)}>Schedule interview</AddButton>
          )
        }
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <>
          <section className="panel">
            {q.data.items.map((i) => (
              <div className="list-row" key={i.id}>
                <div>
                  <strong>
                    {i.submission.candidate.name}{' '}
                    <span className="muted">· {i.submission.job.title}</span>
                  </strong>
                  <small>
                    {date(i.scheduledAt)} · {i.type} · {i.interviewer}
                  </small>
                  <small>{i.notes}</small>
                </div>
                <div className="actions">
                  <Badge value={i.status} />
                  {user?.role !== 'HIRING_MANAGER' && (
                    <button onClick={() => setModal(i)}>Edit</button>
                  )}
                </div>
              </div>
            ))}
            {!q.data.items.length && <Empty />}
          </section>
          <Pager page={page} total={q.data.total} onChange={setPage} />
        </>
      )}
      {modal !== false && (
        <RecordForm
          title={modal ? 'Edit interview' : 'Schedule interview'}
          fields={[
            ...(modal
              ? []
              : [
                  {
                    name: 'submissionId',
                    label: 'Candidate submission',
                    type: 'select' as const,
                    required: true,
                    options: subs.data?.items
                      .filter((s) => ['SUBMITTED', 'INTERVIEW'].includes(s.status))
                      .map((s) => ({ value: s.id, label: s.candidate.name + ' · ' + s.job.title })),
                  },
                ]),
            ...fields,
            ...(modal
              ? [
                  {
                    name: 'status',
                    label: 'Status',
                    type: 'select' as const,
                    options: options(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
                  },
                ]
              : []),
          ]}
          initial={
            modal
              ? {
                  ...modal,
                  scheduledAt: new Date(
                    new Date(modal.scheduledAt).getTime() - new Date().getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16),
                }
              : { type: 'VIDEO' }
          }
          onClose={() => setModal(false)}
          onSave={(d) =>
            a.save(() =>
              modal
                ? api.patch('/interviews/' + modal.id, {
                    ...d,
                    scheduledAt: new Date(d.scheduledAt).toISOString(),
                  })
                : api.post('/interviews', {
                    ...d,
                    scheduledAt: new Date(d.scheduledAt).toISOString(),
                  }),
            )
          }
        />
      )}
    </>
  );
}
function Team() {
  const q = useData<Row[]>('/users');
  const [create, setCreate] = useState(false);
  const a = useActions();
  return (
    <>
      <Heading
        eyebrow="THE PEOPLE BEHIND THE PIPELINE"
        title="Your recruiting team"
        subtitle="Clear roles. Thoughtful access. Better teamwork."
        action={<AddButton onClick={() => setCreate(true)}>Add team member</AddButton>}
      />
      {a.error && <div className="error">{a.error}</div>}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : (
        <section className="panel">
          {q.data.map((u) => (
            <div className="list-row" key={u.id}>
              <div className="cell-person">
                <div className="avatar">{u.name[0]}</div>
                <div>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                </div>
              </div>
              <select
                style={{ width: 180 }}
                aria-label={'Role for ' + u.name}
                value={u.role}
                disabled={a.busy}
                onChange={(e) => a.run(() => api.patch('/users/' + u.id, { role: e.target.value }))}
              >
                {options(['ADMIN', 'RECRUITER', 'HIRING_MANAGER']).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </section>
      )}
      {create && (
        <RecordForm
          title="Welcome a teammate"
          fields={[
            { name: 'name', label: 'Full name', required: true },
            { name: 'email', label: 'Email', type: 'email', required: true },
            {
              name: 'password',
              label: 'Temporary password (10+ characters)',
              type: 'password',
              required: true,
            },
            {
              name: 'role',
              label: 'Role',
              type: 'select',
              required: true,
              options: options(['ADMIN', 'RECRUITER', 'HIRING_MANAGER']),
            },
          ]}
          onClose={() => setCreate(false)}
          onSave={(d) => a.save(() => api.post('/users', d))}
        />
      )}
    </>
  );
}
