import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity, ArrowRight, Bell, BookOpenCheck, BrainCircuit, Check, ChevronDown,
  ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Download, FileBarChart,
  FileText, Filter, GraduationCap, LayoutDashboard, LogOut, Menu, RefreshCw,
  Search, Settings2, ShieldCheck, Sparkles, UsersRound, X,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

type Role = 'admin' | 'faculty' | 'advisor'
type Page = 'Dashboard' | 'Students' | 'Performance analytics' | 'Risk predictions' | 'Interventions' | 'Reports' | 'Settings'
type Risk = { prediction_id?: number; model_version: string; risk_level: 'High' | 'Medium' | 'Low'; risk_score: number; predicted_at?: string }
type Student = {
  student_id: string; semester: string; section: string; academic_year: number
  average_grade_point: number | null; theory_average: number | null; lab_average: number | null
  credit_weighted_score: number | null; low_grade_count: number | null
  failed_subject_count: number | null; passed_subject_count: number | null; risk: Risk | null
  dm_grade?: string; ai_grade?: string; fods_grade?: string; ds_grade?: string
  oops_grade?: string; dpco_grade?: string; data_science_lab_grade?: string; oops_lab_grade?: string
}
type Intervention = {
  source_prediction_id: number; student_id: string; risk_level: string; risk_score: number
  action_type: string; workflow_status: string; notification_status: string
  follow_up_due_at: string | null; created_at: string
}
type Dashboard = {
  total_students: number; scored_students: number; average_grade_point: number | null
  students_requiring_attention: number; risk_distribution: Record<string, number>
  subject_averages: { subject: string; average: number | null }[]
  recent_high_risk: Student[]; recent_interventions: Intervention[]
  prediction_activity: { date: string; predictions: number }[]
}
type StudentResult = { items: Student[]; total: number; page: number; page_size: number }
type Performance = {
  total_students: number; average_grade_point: number | null; students_below_five: number
  subject_averages: { subject: string; average: number | null }[]
  grade_distribution: Record<string, number>
  failed_subject_distribution: { failed_subjects: number; students: number }[]
  theory_average: number | null; lab_average: number | null
}
type IconType = typeof UsersRound

const API_BASE = import.meta.env.VITE_API_URL ?? ''
const RISK_COLORS: Record<string, string> = { High: '#e65b56', Medium: '#e4a43a', Low: '#2a9c72' }
const SUBJECT_GRADES: { key: keyof Student; label: string }[] = [
  { key: 'dm_grade', label: 'Discrete Mathematics' }, { key: 'ai_grade', label: 'Artificial Intelligence' },
  { key: 'fods_grade', label: 'Foundations of Data Science' }, { key: 'ds_grade', label: 'Data Structures' },
  { key: 'oops_grade', label: 'Object-Oriented Programming' }, { key: 'dpco_grade', label: 'Digital Principles' },
  { key: 'data_science_lab_grade', label: 'Data Science Lab' }, { key: 'oops_lab_grade', label: 'OOPS Lab' },
]
const NAVIGATION: { page: Page; icon: IconType; group: string }[] = [
  { page: 'Dashboard', icon: LayoutDashboard, group: 'Workspace' },
  { page: 'Students', icon: UsersRound, group: 'Workspace' },
  { page: 'Performance analytics', icon: Activity, group: 'Insights' },
  { page: 'Risk predictions', icon: BrainCircuit, group: 'Insights' },
  { page: 'Interventions', icon: ClipboardList, group: 'Support' },
  { page: 'Reports', icon: FileBarChart, group: 'Support' },
  { page: 'Settings', icon: Settings2, group: 'System' },
]

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`)
  return body as T
}

function number(value: number | null | undefined, digits = 1) {
  return value == null || Number.isNaN(value) ? '—' : value.toFixed(digits)
}
function percent(value: number | null | undefined) { return value == null ? '—' : `${Math.round(value * 100)}%` }
function riskLabel(value?: string | null) {
  if (!value) return 'Not scored'
  return value === 'High' ? 'Requires attention' : value === 'Medium' ? 'Monitoring' : 'Low risk'
}
function shortDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('edurisk.token') ?? '')
  const [user, setUser] = useState<{ email: string; role: Role } | null>(null)
  const [page, setPage] = useState<Page>('Dashboard')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [students, setStudents] = useState<StudentResult | null>(null)
  const [performance, setPerformance] = useState<Performance | null>(null)
  const [interventions, setInterventions] = useState<Intervention[]>([])
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [studentPage, setStudentPage] = useState(1)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState('')

  const allowedPages = useMemo(() => {
    if (user?.role === 'faculty') return NAVIGATION.filter((item) => item.page !== 'Interventions').map((item) => item.page)
    if (user?.role === 'advisor') return NAVIGATION.filter((item) => item.page !== 'Performance analytics').map((item) => item.page)
    return NAVIGATION.map((item) => item.page)
  }, [user?.role])

  useEffect(() => {
    if (!token) return
    let active = true
    request<{ email: string; role: Role }>('/api/auth/me', token)
      .then((profile) => { if (active) setUser(profile) })
      .catch(() => {
        localStorage.removeItem('edurisk.token')
        if (active) { setToken(''); setUser(null) }
      })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    if (!token || !user || page === 'Settings') return
    let active = true
    setLoading(true)
    setError('')
    const load = async () => {
      try {
        if (page === 'Dashboard') setDashboard(await request<Dashboard>('/api/dashboard', token))
        if (page === 'Students') {
          const query = new URLSearchParams({ page: String(studentPage), page_size: '15' })
          if (activeSearch) query.set('search', activeSearch)
          if (riskFilter) query.set('risk_level', riskFilter)
          if (sectionFilter) query.set('section', sectionFilter)
          setStudents(await request<StudentResult>(`/api/students?${query}`, token))
        }
        if (page === 'Performance analytics') setPerformance(await request<Performance>('/api/performance', token))
        if (page === 'Risk predictions') setStudents(await request<StudentResult>('/api/risk-predictions', token))
        if (page === 'Interventions') {
          const result = await request<{ items: Intervention[] }>('/api/interventions', token)
          setInterventions(result.items)
        }
        if (page === 'Reports') {
          setDashboard(await request<Dashboard>('/api/dashboard', token))
          const report = await request<Performance>('/api/performance', token).catch(() => null)
          if (active) setPerformance(report)
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load this view.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [token, user, page, studentPage, activeSearch, riskFilter, sectionFilter, refreshKey])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 4200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  async function signIn(email: string, password: string) {
    setLoginBusy(true); setError('')
    try {
      const result = await request<{ access_token: string; user: { email: string; role: Role } }>('/api/auth/login', undefined, {
        method: 'POST', body: JSON.stringify({ email, password }),
      })
      localStorage.setItem('edurisk.token', result.access_token)
      setToken(result.access_token); setUser(result.user); setPage('Dashboard')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.')
    } finally { setLoginBusy(false) }
  }

  function signOut() {
    localStorage.removeItem('edurisk.token'); setToken(''); setUser(null)
    setDashboard(null); setStudents(null); setPerformance(null); setInterventions([])
  }

  async function runProfile() {
    if (!token) return
    setLoading(true); setError('')
    try {
      const result = await request<{ saved: number }>('/api/risk-predictions/run', token, { method: 'POST' })
      setNotice(`${result.saved} new risk profile${result.saved === 1 ? '' : 's'} saved.`)
      setRefreshKey((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Risk profiling failed.')
    } finally { setLoading(false) }
  }

  async function updateIntervention(row: Intervention, status: 'follow_up_due' | 'closed') {
    const label = status === 'closed' ? 'close this intervention' : 'mark follow-up due'
    if (!window.confirm(`Confirm: ${label} for ${row.student_id}?`)) return
    try {
      await request(`/api/interventions/${row.source_prediction_id}`, token, { method: 'PATCH', body: JSON.stringify({ workflow_status: status }) })
      setNotice(`Intervention updated for ${row.student_id}.`); setRefreshKey((value) => value + 1)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update intervention.') }
  }

  function navigate(nextPage: Page) { setPage(nextPage); setMobileNav(false); setError('') }
  if (!token || !user) return <LoginScreen busy={loginBusy} error={error} onSignIn={signIn} />

  const title = page === 'Dashboard' ? 'Student early-warning dashboard' : page
  const visibleNavigation = NAVIGATION.filter((item) => allowedPages.includes(item.page))

  return <div className="app-shell">
    <Sidebar page={page} navigation={visibleNavigation} mobileOpen={mobileNav} onNavigate={navigate} onClose={() => setMobileNav(false)} />
    <div className="workspace">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={19} /></button>
        <div className="breadcrumbs"><span>EduRisk</span><ChevronRight size={14} /><strong>{page}</strong></div>
        <form className="global-search" onSubmit={(event) => { event.preventDefault(); setActiveSearch(search); setStudentPage(1); navigate('Students') }}>
          <Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a student by ID" aria-label="Find a student by ID" /><kbd>↵</kbd>
        </form>
        <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><span /></button>
        <div className="account-menu"><div className="avatar">{user.email.slice(0, 1).toUpperCase()}</div><div className="account-copy"><strong>{user.email.split('@')[0]}</strong><span>{user.role}</span></div><button className="icon-button account-logout" aria-label="Sign out" onClick={signOut}><LogOut size={16} /></button></div>
      </header>
      <main className="main-content">
        <div className="page-heading"><div><div className="overline">SEMESTER III <span>·</span> 2026</div><h1>{title}</h1><p>Performance-based risk profiling and early-warning</p></div>
          {page === 'Dashboard' && user.role !== 'advisor' && <button className="button button-primary" onClick={runProfile} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Run risk profile</button>}
        </div>
        {error && <div className="notice notice-error" role="alert"><CircleHelp size={17} />{error}<button className="icon-button" onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        {loading && <LoadingState />}
        {!loading && !error && page === 'Dashboard' && dashboard && <DashboardView data={dashboard} onStudent={setSelectedStudent} onNavigate={navigate} />}
        {!loading && !error && page === 'Students' && students && <StudentsView data={students} page={studentPage} search={search} activeSearch={activeSearch} riskFilter={riskFilter} sectionFilter={sectionFilter} onSearch={setSearch} onApplySearch={() => { setActiveSearch(search); setStudentPage(1) }} onRiskFilter={(value) => { setRiskFilter(value); setStudentPage(1) }} onSectionFilter={(value) => { setSectionFilter(value); setStudentPage(1) }} onPage={setStudentPage} onStudent={setSelectedStudent} />}
        {!loading && !error && page === 'Performance analytics' && performance && <PerformanceView data={performance} />}
        {!loading && !error && page === 'Risk predictions' && students && <RiskView data={students} onStudent={setSelectedStudent} onRun={runProfile} role={user.role} />}
        {!loading && !error && page === 'Interventions' && <InterventionsView rows={interventions} onUpdate={updateIntervention} />}
        {!loading && !error && page === 'Reports' && dashboard && <ReportsView dashboard={dashboard} performance={performance} token={token} />}
        {!loading && !error && page === 'Settings' && <SettingsView user={user} />}
        <footer className="page-footer"><span><ShieldCheck size={14} /> Protected academic workspace</span><span>Scores are cohort-relative anomaly percentiles, not probabilities of future failure.</span></footer>
      </main>
    </div>
    {selectedStudent && <StudentDrawer student={selectedStudent} onClose={() => setSelectedStudent(null)} />}
    {notice && <div className="toast" role="status"><Check size={17} />{notice}</div>}
  </div>
}

function Sidebar({ page, navigation, mobileOpen, onNavigate, onClose }: {
  page: Page; navigation: typeof NAVIGATION; mobileOpen: boolean; onNavigate: (page: Page) => void; onClose: () => void
}) {
  const groups = [...new Set(navigation.map((item) => item.group))]
  return <>
    <div className={`sidebar-scrim ${mobileOpen ? 'visible' : ''}`} onClick={onClose} />
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand-row"><div className="brand-mark"><GraduationCap size={22} /></div><span>Edu<strong>Risk</strong></span><button className="icon-button sidebar-close" aria-label="Close navigation" onClick={onClose}><X size={18} /></button></div>
      <div className="cohort-chip"><span className="status-dot" />Semester III <span>·</span> 2026</div>
      <nav aria-label="Main navigation">{groups.map((group) => <div className="nav-group" key={group}><div className="nav-label">{group}</div>{navigation.filter((item) => item.group === group).map(({ page: itemPage, icon: Icon }) => <button key={itemPage} className={`nav-item ${page === itemPage ? 'active' : ''}`} onClick={() => onNavigate(itemPage)}><Icon size={18} strokeWidth={1.8} /><span>{itemPage}</span>{page === itemPage && <span className="nav-active-dot" />}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="support-mark"><Sparkles size={17} /><span>DATA <b>→</b> PROFILE <b>→</b> SUPPORT</span></div><span className="sidebar-version">EDURISK ANALYTICS · 1.0</span></div>
    </aside>
  </>
}

function LoginScreen({ busy, error, onSignIn }: { busy: boolean; error: string; onSignIn: (email: string, password: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return <main className="login-shell"><section className="login-aside"><div className="login-brand"><span className="brand-mark"><GraduationCap size={21} /></span>Edu<strong>Risk</strong></div><div className="login-message"><span className="overline">ACADEMIC INSIGHT, WITH CONTEXT</span><h1>See the signals.<br /><em>Support the student.</em></h1><p>Semester performance becomes a clear starting point for timely, human academic support.</p><div className="process-line"><div><span>01</span><b>Academic record</b></div><i /><div><span>02</span><b>Risk profile</b></div><i /><div><span>03</span><b>Early support</b></div></div></div><span className="login-footnote">For authorized faculty, advisors, and administrators</span></section>
    <section className="login-panel"><div className="login-form-wrap"><div className="login-mobile-brand"><GraduationCap size={22} /> Edu<strong>Risk</strong></div><span className="overline">SECURE SIGN IN</span><h2>Welcome back</h2><p>Use your institutional account to continue.</p><form onSubmit={(event) => { event.preventDefault(); onSignIn(email, password) }}><label htmlFor="email">Institutional email</label><div className="input-wrap"><input id="email" type="email" autoComplete="username" placeholder="name@college.edu" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><label htmlFor="password">Password</label><div className="input-wrap"><input id="password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>{error && <div className="login-error" role="alert">{error}</div>}<button className="button button-primary login-submit" disabled={busy}>{busy ? <><RefreshCw size={16} className="spin" /> Signing in</> : <>Sign in <ArrowRight size={16} /></>}</button></form><div className="login-security"><ShieldCheck size={16} /><span>Access is verified by your EduRisk account role.</span></div></div><div className="login-bottom">EduRisk <span>·</span> Performance-based risk profiling and early-warning</div></section></main>
}

function LoadingState() { return <div className="loading-grid" aria-label="Loading dashboard"><div className="skeleton-row">{[1, 2, 3, 4].map((item) => <div className="skeleton metric-skeleton" key={item} />)}</div><div className="skeleton-row"><div className="skeleton chart-skeleton" /><div className="skeleton chart-skeleton" /></div><div className="skeleton table-skeleton" /></div> }
function Card({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) { return <section className={`panel ${className}`}><header className="panel-heading"><h2>{title}</h2>{action}</header>{children}</section> }
function MetricCard({ label, value, icon: Icon, tone, footnote }: { label: string; value: string | number; icon: IconType; tone: string; footnote?: string }) { return <article className={`metric-card tone-${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={18} /></span></div><div className="metric-value">{value}</div>{footnote && <div className="metric-footnote">{footnote}</div>}</article> }

function DashboardView({ data, onStudent, onNavigate }: { data: Dashboard; onStudent: (student: Student) => void; onNavigate: (page: Page) => void }) {
  const riskData = ['High', 'Medium', 'Low'].map((name) => ({ name, value: data.risk_distribution[name] ?? 0 })).filter((item) => item.value > 0)
  const subjectData = data.subject_averages.map((item) => ({ ...item, subject: item.subject.replace('Foundations of ', '').replace('Object-Oriented Programming', 'OOP') }))
  const unscored = Math.max(0, data.total_students - data.scored_students)
  return <div className="view-stack">
    {unscored > 0 && <div className="inline-callout"><BrainCircuit size={17} /><span><strong>{unscored} students are not yet profiled.</strong> Run the risk model after confirming the latest cohort is in Supabase.</span></div>}
    <div className="metric-grid"><MetricCard label="Students" value={data.total_students} icon={UsersRound} tone="blue" footnote="Current Semester III cohort" /><MetricCard label="Requires attention" value={data.risk_distribution.High ?? 0} icon={Activity} tone="red" footnote="High anomaly percentile" /><MetricCard label="Monitoring" value={data.risk_distribution.Medium ?? 0} icon={ShieldCheck} tone="amber" footnote="Continue regular check-ins" /><MetricCard label="Low risk" value={data.risk_distribution.Low ?? 0} icon={Check} tone="green" footnote="No current risk signal" /></div>
    <div className="dashboard-chart-grid">
      <Card title="Risk distribution" action={<span className="card-period">{data.scored_students} scored</span>}>{riskData.length ? <div className="donut-layout"><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={riskData} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="91%" paddingAngle={3} stroke="none">{riskData.map((entry) => <Cell key={entry.name} fill={RISK_COLORS[entry.name]} />)}</Pie><Tooltip formatter={(value) => [`${value} students`, 'Cohort']} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{data.scored_students}</strong><span>profiled</span></div></div><div className="legend-list">{riskData.map((entry) => <div className="legend-row" key={entry.name}><span className="legend-dot" style={{ background: RISK_COLORS[entry.name] }} /><span>{riskLabel(entry.name)}</span><strong>{entry.value}</strong></div>)}</div></div> : <EmptyState icon={BrainCircuit} title="No saved risk profiles" detail="Run a cohort profile to populate risk distribution." />}</Card>
      <Card title="Subject performance" action={<span className="card-period">Grade points · /10</span>}><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={subjectData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8edf4" /><XAxis dataKey="subject" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#76859a' }} interval={0} angle={-16} textAnchor="end" height={48} /><YAxis domain={[0, 10]} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#76859a' }} /><Tooltip formatter={(value) => [`${number(Number(value), 2)} / 10`, 'Average']} /><Bar dataKey="average" fill="#3985d8" radius={[4, 4, 0, 0]} maxBarSize={29} /></BarChart></ResponsiveContainer></div></Card>
      <Card title="Prediction activity" action={<span className="card-period">Saved runs</span>}>{data.prediction_activity.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.prediction_activity} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8edf4" /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#76859a' }} tickFormatter={(value) => value.slice(5)} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#76859a' }} /><Tooltip /><Line type="monotone" dataKey="predictions" name="Saved predictions" stroke="#2a9c72" strokeWidth={2.4} dot={{ r: 3, fill: '#2a9c72' }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div> : <EmptyState icon={Activity} title="No saved run history" detail="Prediction activity appears after profiles are saved." />}</Card>
    </div>
    <div className="dashboard-lower-grid"><Card title="Students requiring attention" action={<button className="text-button" onClick={() => onNavigate('Risk predictions')}>View all <ArrowRight size={14} /></button>}>{data.recent_high_risk.length ? <StudentTable rows={data.recent_high_risk} onStudent={onStudent} compact /> : <EmptyState icon={Check} title="No high-risk profiles" detail="Newly scored students will appear here." />}</Card><Card title="Recent interventions" action={<button className="text-button" onClick={() => onNavigate('Interventions')}>Open queue <ArrowRight size={14} /></button>}>{data.recent_interventions.length ? <InterventionList rows={data.recent_interventions} /> : <EmptyState icon={ClipboardList} title="No interventions logged" detail="The n8n workflow adds entries for new profiles." />}</Card></div>
    <div className="data-note"><CircleHelp size={15} /><span>Risk scores rank academic anomalies within the current cohort; they are not validated predictions of future failure.</span></div>
  </div>
}

function EmptyState({ icon: Icon, title, detail }: { icon: IconType; title: string; detail: string }) { return <div className="empty-state"><span className="empty-icon"><Icon size={20} /></span><strong>{title}</strong><p>{detail}</p></div> }
function RiskBadge({ level }: { level?: string | null }) { return <span className={`risk-badge risk-${level?.toLowerCase() ?? 'none'}`}><span />{riskLabel(level)}</span> }

function StudentTable({ rows, onStudent, compact = false }: { rows: Student[]; onStudent: (student: Student) => void; compact?: boolean }) {
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Student ID</th><th>Average</th><th>Risk score</th><th>Risk status</th>{!compact && <th>Section</th>}<th aria-label="Actions" /></tr></thead><tbody>{rows.map((row) => <tr key={row.student_id} onClick={() => onStudent(row)} className="clickable-row"><td><strong className="student-id">{row.student_id}</strong></td><td>{number(row.average_grade_point, 2)}</td><td>{row.risk ? percent(row.risk.risk_score) : '—'}</td><td><RiskBadge level={row.risk?.risk_level} /></td>{!compact && <td>{row.section}</td>}<td><button className="row-action" aria-label={`View ${row.student_id}`}><ArrowRight size={15} /></button></td></tr>)}</tbody></table></div>
}

function StudentsView({ data, page, search, activeSearch, riskFilter, sectionFilter, onSearch, onApplySearch, onRiskFilter, onSectionFilter, onPage, onStudent }: {
  data: StudentResult; page: number; search: string; activeSearch: string; riskFilter: string; sectionFilter: string
  onSearch: (value: string) => void; onApplySearch: () => void; onRiskFilter: (value: string) => void; onSectionFilter: (value: string) => void
  onPage: (page: number) => void; onStudent: (student: Student) => void
}) {
  const pages = Math.max(1, Math.ceil(data.total / data.page_size))
  return <div className="view-stack"><div className="filter-toolbar"><form className="table-search" onSubmit={(event) => { event.preventDefault(); onApplySearch() }}><Search size={16} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search student ID" aria-label="Search student ID" /><button className="button button-small">Search</button></form><label className="select-filter"><Filter size={15} /><select value={riskFilter} onChange={(event) => onRiskFilter(event.target.value)} aria-label="Filter by risk"><option value="">All risk levels</option><option value="High">Requires attention</option><option value="Medium">Monitoring</option><option value="Low">Low risk</option></select><ChevronDown size={14} /></label><label className="select-filter"><select value={sectionFilter} onChange={(event) => onSectionFilter(event.target.value)} aria-label="Filter by section"><option value="">All sections</option><option value="A">Section A</option><option value="B">Section B</option></select><ChevronDown size={14} /></label><span className="result-count">{data.total} students{activeSearch ? ` · “${activeSearch}”` : ''}</span></div>
    <Card title="Student performance" action={<span className="card-period">Semester III · 2026</span>}><StudentTable rows={data.items} onStudent={onStudent} /><div className="pagination"><span>Showing {data.total ? (page - 1) * data.page_size + 1 : 0}–{Math.min(page * data.page_size, data.total)} of {data.total}</span><div><button className="icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={17} /></button><span className="page-index">{page} / {pages}</span><button className="icon-button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={17} /></button></div></div></Card>
  </div>
}

function PerformanceView({ data }: { data: Performance }) {
  const subjects = data.subject_averages.map((item) => ({ ...item, subject: item.subject.replace('Foundations of ', '').replace('Object-Oriented Programming', 'OOP') }))
  const grades = Object.entries(data.grade_distribution).map(([grade, count]) => ({ grade, count }))
  return <div className="view-stack"><div className="metric-grid metric-grid-three"><MetricCard label="Cohort average" value={number(data.average_grade_point, 2)} icon={BookOpenCheck} tone="blue" footnote="Grade points out of 10" /><MetricCard label="Theory average" value={number(data.theory_average, 2)} icon={FileBarChart} tone="green" footnote="Across six theory subjects" /><MetricCard label="Lab average" value={number(data.lab_average, 2)} icon={Activity} tone="amber" footnote="Across two lab subjects" /></div>
    <div className="analytics-grid"><Card title="Subject-wise performance"><div className="chart-area chart-tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={subjects} layout="vertical" margin={{ top: 4, right: 22, left: 24, bottom: 4 }}><CartesianGrid horizontal={false} stroke="#e8edf4" /><XAxis type="number" domain={[0, 10]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#76859a' }} /><YAxis type="category" dataKey="subject" width={142} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#586a82' }} /><Tooltip formatter={(value) => [`${number(Number(value), 2)} / 10`, 'Average']} /><Bar dataKey="average" fill="#3985d8" radius={[0, 4, 4, 0]} maxBarSize={22} /></BarChart></ResponsiveContainer></div></Card>
      <Card title="Observed grade distribution" action={<span className="card-period">Subject results</span>}><div className="chart-area chart-tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={grades} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}><CartesianGrid vertical={false} stroke="#e8edf4" /><XAxis dataKey="grade" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#76859a' }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#76859a' }} /><Tooltip /><Bar dataKey="count" name="Recorded grades" fill="#2a9c72" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card></div>
    <Card title="Students by failed-subject count"><div className="chart-area chart-medium"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.failed_subject_distribution} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8edf4" /><XAxis dataKey="failed_subjects" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#76859a' }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#76859a' }} /><Tooltip /><Bar dataKey="students" name="Students" fill="#e4a43a" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
    <div className="data-note"><CircleHelp size={15} /><span>Grade distribution describes recorded Semester III results; it does not represent a future outcome.</span></div></div>
}

function RiskView({ data, onStudent, onRun, role }: { data: StudentResult; onStudent: (student: Student) => void; onRun: () => void; role: Role }) {
  const counts = { High: 0, Medium: 0, Low: 0 }
  data.items.forEach((student) => { const level = student.risk?.risk_level; if (level && level in counts) counts[level as keyof typeof counts] += 1 })
  return <div className="view-stack"><div className="metric-grid metric-grid-three"><MetricCard label="Requires attention" value={counts.High} icon={Activity} tone="red" /><MetricCard label="Monitoring" value={counts.Medium} icon={ShieldCheck} tone="amber" /><MetricCard label="Low risk" value={counts.Low} icon={Check} tone="green" /></div><Card title="Risk profiles" action={role !== 'advisor' ? <button className="button button-small" onClick={onRun}><RefreshCw size={14} /> Recalculate cohort</button> : <span className="card-period">Read-only</span>}><p className="panel-intro">Ranked by cohort anomaly score. High percentiles merit human review, not an automatic outcome.</p>{data.items.length ? <StudentTable rows={data.items} onStudent={onStudent} /> : <EmptyState icon={BrainCircuit} title="No risk profiles yet" detail="A profile can be run after importing the Semester III cohort." />}</Card></div>
}

function InterventionsView({ rows, onUpdate }: { rows: Intervention[]; onUpdate: (row: Intervention, status: 'follow_up_due' | 'closed') => void }) {
  const [status, setStatus] = useState('')
  const filtered = status ? rows.filter((row) => row.workflow_status === status) : rows
  return <div className="view-stack"><div className="inline-callout"><ShieldCheck size={17} /><span>n8n creates these records. The workspace tracks follow-up status only; it never sends student messages.</span></div><div className="filter-toolbar"><label className="select-filter"><Filter size={15} /><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter intervention status"><option value="">All workflow statuses</option><option value="intervention_pending">Intervention pending</option><option value="monitoring">Monitoring</option><option value="follow_up_due">Follow-up due</option><option value="closed">Closed</option></select><ChevronDown size={14} /></label><span className="result-count">{filtered.length} records</span></div><Card title="Intervention queue" action={<span className="card-period">Synced from Supabase</span>}>{filtered.length ? <div className="table-scroll"><table className="data-table intervention-table"><thead><tr><th>Student</th><th>Risk</th><th>Action</th><th>Workflow</th><th>Notification</th><th>Follow-up</th><th>Created</th><th /></tr></thead><tbody>{filtered.map((row) => <tr key={row.source_prediction_id}><td><strong className="student-id">{row.student_id}</strong></td><td><RiskBadge level={row.risk_level} /></td><td>{row.action_type === 'human_check_in' ? 'Human check-in' : 'Monitor'}</td><td><StatusBadge status={row.workflow_status} /></td><td>{row.notification_status === 'needs_contact_data' ? <span className="text-warning">Needs contact data</span> : row.notification_status.replaceAll('_', ' ')}</td><td>{shortDate(row.follow_up_due_at)}</td><td>{shortDate(row.created_at)}</td><td><div className="action-group">{row.workflow_status !== 'closed' && <button className="button button-small" onClick={() => onUpdate(row, 'follow_up_due')}>Mark follow-up</button>}{row.workflow_status !== 'closed' && <button className="icon-button" aria-label={`Close intervention for ${row.student_id}`} onClick={() => onUpdate(row, 'closed')}><Check size={15} /></button>}</div></td></tr>)}</tbody></table></div> : <EmptyState icon={ClipboardList} title="No matching interventions" detail="The workflow has not created matching records yet." />}</Card></div>
}

function StatusBadge({ status }: { status: string }) { return <span className={`status-badge status-${status}`}>{status.replaceAll('_', ' ')}</span> }
function InterventionList({ rows }: { rows: Intervention[] }) { return <div className="intervention-list">{rows.slice(0, 5).map((row) => <div className="intervention-row" key={row.source_prediction_id}><span className={`mini-risk mini-risk-${row.risk_level.toLowerCase()}`} /><div><strong>{row.student_id}</strong><span>{row.action_type === 'human_check_in' ? 'Human check-in' : 'Monitoring'} · {shortDate(row.created_at)}</span></div><StatusBadge status={row.workflow_status} /></div>)}</div> }

function StudentDrawer({ student, onClose }: { student: Student; onClose: () => void }) {
  const grades = SUBJECT_GRADES.filter(({ key }) => student[key]).map(({ key, label }) => ({ label, grade: student[key] as string }))
  return <div className="drawer-layer drawer-visible" role="dialog" aria-modal="true" aria-label={`Student ${student.student_id}`}><button className="drawer-scrim" aria-label="Close student profile" onClick={onClose} /><aside className="student-drawer"><header className="drawer-header"><div><span className="overline">STUDENT PROFILE</span><h2>{student.student_id}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close profile"><X size={19} /></button></header><div className="drawer-cohort">Semester {student.semester} <span>·</span> Section {student.section} <span>·</span> {student.academic_year}</div><div className="drawer-risk"><RiskBadge level={student.risk?.risk_level} /><strong>{percent(student.risk?.risk_score)}</strong><span>cohort anomaly percentile</span></div><div className="detail-metrics"><div><span>Average grade point</span><strong>{number(student.average_grade_point, 2)} / 10</strong></div><div><span>Credit-weighted</span><strong>{number(student.credit_weighted_score, 2)} / 10</strong></div><div><span>Theory average</span><strong>{number(student.theory_average, 2)}</strong></div><div><span>Lab average</span><strong>{number(student.lab_average, 2)}</strong></div><div><span>Low grades</span><strong>{student.low_grade_count ?? '—'}</strong></div><div><span>Failed subjects</span><strong>{student.failed_subject_count ?? '—'}</strong></div></div><section className="subject-list"><h3>Subject results</h3>{grades.length ? grades.map(({ label, grade }) => <div key={label}><span>{label}</span><strong className={grade === 'U' || grade === 'UA' ? 'text-danger' : ''}>{grade}</strong></div>) : <p>Subject grades are not available for this record.</p>}</section><div className="drawer-note"><CircleHelp size={15} /><span>Review the underlying record with the student before taking action.</span></div></aside></div>
}

function ReportsView({ dashboard, performance, token }: { dashboard: Dashboard; performance: Performance | null; token: string }) {
  const [busy, setBusy] = useState(false)
  async function exportCsv() {
    setBusy(true)
    try {
      const result = await request<StudentResult>('/api/students?page_size=100', token)
      const headers = ['student_id', 'semester', 'section', 'academic_year', 'average_grade_point', 'theory_average', 'lab_average', 'credit_weighted_score', 'failed_subject_count', 'risk_level', 'risk_score']
      const rows = result.items.map((student) => [student.student_id, student.semester, student.section, student.academic_year, student.average_grade_point, student.theory_average, student.lab_average, student.credit_weighted_score, student.failed_subject_count, student.risk?.risk_level ?? '', student.risk?.risk_score ?? ''])
      const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a'); link.href = url; link.download = 'edurisk-semester-iii-summary.csv'; link.click(); URL.revokeObjectURL(url)
    } finally { setBusy(false) }
  }
  const riskRows = ['High', 'Medium', 'Low'].map((level) => ({ level, count: dashboard.risk_distribution[level] ?? 0 }))
  return <div className="view-stack"><div className="report-header"><div><span className="overline">SEMESTER III · 2026</span><h2>Cohort summary</h2><p>Prepared from current Supabase academic and risk records.</p></div><div className="report-actions"><button className="button button-secondary" onClick={() => window.print()}><FileText size={16} /> Print / PDF</button><button className="button button-primary" disabled={busy} onClick={exportCsv}><Download size={16} /> Export CSV</button></div></div><div className="metric-grid metric-grid-three"><MetricCard label="Students" value={dashboard.total_students} icon={UsersRound} tone="blue" /><MetricCard label="Cohort average" value={number(dashboard.average_grade_point, 2)} icon={BookOpenCheck} tone="green" /><MetricCard label="Requires attention" value={dashboard.students_requiring_attention} icon={Activity} tone="red" /></div><div className="analytics-grid"><Card title="Risk summary"><div className="report-risk-list">{riskRows.map(({ level, count }) => <div key={level}><span className={`mini-risk mini-risk-${level.toLowerCase()}`} /><span>{riskLabel(level)}</span><strong>{count}</strong></div>)}</div></Card><Card title="Academic indicators"><div className="report-indicators"><div><span>Mean grade point</span><strong>{number(performance?.average_grade_point, 2)} / 10</strong></div><div><span>Mean theory grade point</span><strong>{number(performance?.theory_average, 2)} / 10</strong></div><div><span>Mean lab grade point</span><strong>{number(performance?.lab_average, 2)} / 10</strong></div><div><span>Scored students</span><strong>{dashboard.scored_students} / {dashboard.total_students}</strong></div></div></Card></div><div className="data-note"><CircleHelp size={15} /><span>PDF export uses your browser print dialog. No future-semester outcomes or prediction accuracy are included.</span></div></div>
}

function SettingsView({ user }: { user: { email: string; role: Role } }) {
  return <div className="settings-layout"><Card title="Account and access"><div className="settings-list"><div><span>Signed in as</span><strong>{user.email}</strong></div><div><span>EduRisk role</span><strong className="role-value">{user.role}</strong></div><div><span>Authentication</span><strong>Supabase Auth</strong></div><div><span>Session handling</span><strong>Verified by API per request</strong></div></div></Card><Card title="Risk model"><div className="settings-model"><span className="model-icon"><BrainCircuit size={19} /></span><div><strong>Isolation Forest cohort percentile</strong><p>Ranks anomalous feature patterns in the loaded cohort. It is not a calibrated probability and has no validated future-outcome target.</p></div></div><div className="settings-list compact-settings"><div><span>Input data</span><strong>Semester III grades and aggregates</strong></div><div><span>Future outcomes</span><strong>Not available</strong></div><div><span>Intervention automation</span><strong>n8n · 15-minute schedule</strong></div></div></Card><div className="inline-callout"><ShieldCheck size={17} /><span>Supabase service credentials remain server-side. The browser receives only a verified access token.</span></div></div>
}

export default App