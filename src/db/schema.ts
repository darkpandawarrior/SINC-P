/**
 * SINC-P schema.
 *
 * Two rules govern everything here:
 *
 *  1. Every tenant-owned row carries `institutionId`. There is no such thing as a
 *     global grievance. Postgres RLS (see drizzle/0001_rls.sql) enforces this at the
 *     database, so an ORM bug cannot leak across institutions.
 *
 *  2. `grievanceEvents` is the source of truth for a grievance's history, and it is
 *     append-only and hash-chained. `grievances.status` is a *projection* kept for
 *     query speed. If the two ever disagree, the event log wins.
 *
 * Rule 2 is the whole reason this product can be sold as a compliance system rather
 * than a ticket tracker: a UGC/NAAC auditor can be handed a chain and verify that no
 * row was edited after the fact.
 */
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Role ladder, mapped to the UGC (Redressal of Grievances of Students)
 * Regulations 2023 bodies. The 2019 project had `student / admin / Director`;
 * `moderator` and `redressal_officer` are what "admin" actually did, split apart,
 * and `ombudsperson` is the statutory appeal tier that did not exist then.
 */
export const userRole = pgEnum('user_role', [
  'student',
  'moderator', // triages inbound, screens abuse, routes to an officer
  'redressal_officer', // SGRC member who actually resolves
  'ombudsperson', // hears appeals against SGRC decisions
  'institution_admin', // manages users, categories, SLA config for one institution
])

/**
 * Status values are a state machine, not free text. The 2019 schema stored
 * `varchar(50)` with values 'in process', 'closed' and NULL-means-pending, which is
 * why its dashboard had to query `status is null`.
 */
export const grievanceStatus = pgEnum('grievance_status', [
  'submitted',
  'under_review',
  'in_progress',
  'resolved',
  'closed',
  'rejected',
  'withdrawn',
  'appealed', // escalated to the Ombudsperson
])

export const grievanceKind = pgEnum('grievance_kind', [
  'grievance',
  'suggestion', // the SRS called for these; the 2019 code never built them
  'appeal',
])

export const eventType = pgEnum('event_type', [
  'submitted',
  'assigned',
  'status_changed',
  'remark_added',
  'attachment_added',
  'escalated',
  'appealed',
  'reopened',
  'sla_breached',
  'withdrawn',
])

export const visibility = pgEnum('visibility', [
  'public', // student who filed it can see
  'internal', // staff only — screening notes, routing rationale
])

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const institutions = pgTable(
  'institutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 63 }).notNull(),
    name: text('name').notNull(),
    // AISHE code — every recognised Indian HEI has one. Useful as an external key
    // during onboarding and it makes the tenant list verifiable against a real registry.
    aisheCode: varchar('aishe_code', { length: 16 }),

    /** Statutory clocks, in days. Defaults are the UGC 2023 figures. */
    slaResolutionDays: integer('sla_resolution_days').notNull().default(15),
    slaAppealWindowDays: integer('sla_appeal_window_days').notNull().default(15),
    slaOmbudspersonDays: integer('sla_ombudsperson_days').notNull().default(30),

    /** Students may file without revealing identity to the committee. */
    allowAnonymous: boolean('allow_anonymous').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('institutions_slug_uq').on(t.slug)],
)

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),

    email: varchar('email', { length: 255 }).notNull(),
    fullName: text('full_name').notNull(),
    /** Enrolment/employee number. Optional: staff invited by email may not have one. */
    rollNumber: varchar('roll_number', { length: 64 }),
    role: userRole('role').notNull().default('student'),

    /**
     * scrypt, stored as `scrypt$N$r$p$salt$hash`. The 2019 code used bare md5() with
     * no salt — the single worst line in the original repo.
     */
    passwordHash: text('password_hash').notNull(),

    department: text('department'),
    isActive: boolean('is_active').notNull().default(true),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Email is unique *per institution*, not globally. Two colleges may both have
    // a registrar@ address, and one college's user must never resolve another's.
    uniqueIndex('users_institution_email_uq').on(t.institutionId, t.email),
    index('users_institution_role_idx').on(t.institutionId, t.role),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the cookie token. The raw token is never stored, so a database
     *  dump does not hand the attacker live sessions. */
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }), // inet or ipv6 text
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

/**
 * Self-referencing instead of the original's separate `category`/`subcategory`
 * tables. One table, `parentId` null means top level. Campuses differ enough that a
 * fixed two-level taxonomy would not survive the second customer.
 */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    description: text('description'),
    /** Category-level override of the institution SLA — ragging must beat 15 days. */
    slaResolutionDays: integer('sla_resolution_days'),
    /** Ragging/harassment categories bypass triage and page the officer directly. */
    isSensitive: boolean('is_sensitive').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [index('categories_institution_idx').on(t.institutionId, t.parentId)],
)

// ---------------------------------------------------------------------------
// Grievances
// ---------------------------------------------------------------------------

export const grievances = pgTable(
  'grievances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),

    /** Human-facing, per-institution, e.g. "MANIT-2026-00042". Students quote this
     *  in person and on the phone; a UUID is unusable for that. */
    reference: varchar('reference', { length: 32 }).notNull(),

    submittedById: uuid('submitted_by_id').references(() => users.id, { onDelete: 'set null' }),
    /** When true the identity is withheld from staff UI but retained for audit. */
    isAnonymous: boolean('is_anonymous').notNull().default(false),

    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    kind: grievanceKind('kind').notNull().default('grievance'),
    subject: text('subject').notNull(),
    body: text('body').notNull(),

    status: grievanceStatus('status').notNull().default('submitted'),
    assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),

    /** Denormalised clock: when this grievance must be resolved by. Computed on
     *  submit from category override ?? institution default. Indexed because the
     *  compliance dashboard's only expensive query is "what is about to breach". */
    dueAt: timestamp('due_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),

    /** Set when an appeal is filed against this grievance's resolution. */
    appealOfId: uuid('appeal_of_id'),

    satisfactionRating: integer('satisfaction_rating'), // 1..5, set by student on close

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('grievances_institution_reference_uq').on(t.institutionId, t.reference),
    index('grievances_institution_status_idx').on(t.institutionId, t.status),
    index('grievances_submitter_idx').on(t.institutionId, t.submittedById),
    index('grievances_due_idx').on(t.institutionId, t.dueAt),
  ],
)

/**
 * The audit spine. Append-only: there is no UPDATE or DELETE path in the
 * application, and the RLS policy denies both.
 *
 * `seq` is per-grievance and gap-free; `prevHash`/`hash` chain the rows so any
 * retro-edit or deletion breaks verification. See src/lib/grievance/audit.ts.
 */
export const grievanceEvents = pgTable(
  'grievance_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    grievanceId: uuid('grievance_id')
      .notNull()
      .references(() => grievances.id, { onDelete: 'cascade' }),

    seq: integer('seq').notNull(),
    type: eventType('type').notNull(),
    /** Null for system-generated events such as an SLA breach. */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorRole: userRole('actor_role'),

    /** Free-text remark shown in the trail. */
    remark: text('remark'),
    visibility: visibility('visibility').notNull().default('public'),
    /** Type-specific payload: {from,to} for status_changed, {assigneeId} for assigned. */
    payload: jsonb('payload').$type<Record<string, unknown>>(),

    prevHash: varchar('prev_hash', { length: 64 }),
    hash: varchar('hash', { length: 64 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('grievance_events_seq_uq').on(t.grievanceId, t.seq),
    index('grievance_events_grievance_idx').on(t.grievanceId),
  ],
)

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    grievanceId: uuid('grievance_id')
      .notNull()
      .references(() => grievances.id, { onDelete: 'cascade' }),
    uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),

    /** Opaque storage key. Never the user's filename, and never inside the web root —
     *  the 2019 code did `move_uploaded_file(... "complaintdocs/".$name)`, which let
     *  anyone upload a .php file and then execute it. */
    storageKey: varchar('storage_key', { length: 255 }).notNull(),
    fileName: text('file_name').notNull(), // display only, always escaped
    contentType: varchar('content_type', { length: 127 }).notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('attachments_grievance_idx').on(t.grievanceId)],
)

// ---------------------------------------------------------------------------
// Pillar 2 — News   (specified in the 2019 SRS, never built)
// ---------------------------------------------------------------------------

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),

    title: text('title').notNull(),
    slug: varchar('slug', { length: 160 }).notNull(),
    summary: text('summary'),
    body: text('body').notNull(), // markdown, rendered through a sanitising pipeline
    /** society | sports | placement | academic | administrative */
    channel: varchar('channel', { length: 32 }).notNull().default('administrative'),
    isPinned: boolean('is_pinned').notNull().default(false),

    publishedAt: timestamp('published_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('announcements_institution_slug_uq').on(t.institutionId, t.slug),
    index('announcements_published_idx').on(t.institutionId, t.publishedAt),
  ],
)

// ---------------------------------------------------------------------------
// Pillar 1 — Information   (specified in the 2019 SRS, never built)
// ---------------------------------------------------------------------------

/**
 * The campus handbook. This exists to deflect grievances: roughly a third of what
 * arrives in a campus complaint box is a question with a documented answer. Linking
 * a handbook entry to a category lets the filing form answer before it accepts.
 */
export const handbookEntries = pgTable(
  'handbook_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),

    question: text('question').notNull(),
    slug: varchar('slug', { length: 160 }).notNull(),
    answer: text('answer').notNull(), // markdown
    /** Owning office, e.g. "Hostel Office" — so a wrong answer has an owner. */
    owningOffice: text('owning_office'),

    helpfulCount: integer('helpful_count').notNull().default(0),
    notHelpfulCount: integer('not_helpful_count').notNull().default(0),
    /** Stale policy is worse than no policy; the console flags entries past review. */
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    isPublished: boolean('is_published').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('handbook_institution_slug_uq').on(t.institutionId, t.slug),
    index('handbook_category_idx').on(t.institutionId, t.categoryId),
  ],
)

// ---------------------------------------------------------------------------
// Security audit (distinct from the grievance trail)
// ---------------------------------------------------------------------------

/** Login attempts, permission denials, exports. The 2019 `userlog` recorded logins
 *  and nothing else, and stored the IP in a `binary(16)` it wrote text into. */
export const authEvents = pgTable(
  'auth_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    institutionId: uuid('institution_id').references(() => institutions.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** login_success | login_failure | logout | denied | export | password_change */
    kind: varchar('kind', { length: 32 }).notNull(),
    email: varchar('email', { length: 255 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auth_events_lookup_idx').on(t.institutionId, t.kind, t.createdAt)],
)

export type Institution = typeof institutions.$inferSelect
export type User = typeof users.$inferSelect
export type Category = typeof categories.$inferSelect
export type Grievance = typeof grievances.$inferSelect
export type GrievanceEvent = typeof grievanceEvents.$inferSelect
export type Attachment = typeof attachments.$inferSelect
export type Announcement = typeof announcements.$inferSelect
export type HandbookEntry = typeof handbookEntries.$inferSelect
