/**
 * Single source of truth for all content.
 * - The Astro build parses every JSON file through these schemas, so invalid content fails CI.
 * - The admin dashboard imports the exact same schemas for its forms.
 */
import { z } from 'zod';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/;

export const slugSchema = z
  .string()
  .min(1, 'Slug is required')
  .max(80, 'Keep the slug under 80 characters')
  .regex(SLUG_RE, 'Use lowercase letters, numbers and single hyphens');

export const idSchema = z.string().regex(ID_RE, 'IDs must be alphanumeric (dashes and underscores allowed)');

const isHttp = (value: string) => /^https?:\/\//i.test(value);

export const httpUrl = z
  .string()
  .trim()
  .url('Enter a full URL (https://…)')
  .refine(isHttp, 'Only http(s) URLs are allowed');

/** Accepts an absolute https URL or a site-relative path such as /demos/foo/1.0.0/index.html */
export const linkSchema = z
  .string()
  .trim()
  .min(1)
  .refine((v) => (v.startsWith('/') && !v.startsWith('//')) || isHttp(v), 'Use https://… or a path starting with /')
  .refine((v) => !v.startsWith('/') || !v.includes('..'), 'Relative paths cannot contain ".."');

export const imageSchema = z.object({
  src: linkSchema,
  alt: z.string().trim().min(1, 'Alt text is required').max(180, 'Alt text is too long'),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** e.g. "/images/a-640.webp 640w, /images/a-1600.webp 1600w" */
  srcset: z.string().trim().optional(),
  caption: z.string().trim().max(200).optional(),
});

export const demoTypeSchema = z.enum(['live', 'embed', 'video', 'static-build']);
export const demoStatusSchema = z.enum(['stable', 'beta', 'archived']);

export const demoSchema = z
  .object({
    id: idSchema,
    label: z.string().trim().min(1, 'Demo label is required').max(60),
    type: demoTypeSchema,
    /** Used by live/embed/video. Video may be a YouTube/Vimeo URL or a local .mp4/.webm path. */
    url: z.string().trim().optional(),
    /** Used by static-build, e.g. /demos/edge-metrics/1.4.0/index.html */
    path: z.string().trim().optional(),
    description: z.string().trim().max(280).optional(),
    status: demoStatusSchema.default('stable'),
    date: z.string().regex(DATE_RE, 'Use YYYY-MM or YYYY-MM-DD').optional(),
    /** Video poster image (required for local video files for a decent LCP) */
    poster: z.string().trim().optional(),
    /** Optional WebVTT caption track */
    captions: z.string().trim().optional(),
  })
  .superRefine((demo, ctx) => {
    const target = demo.type === 'static-build' ? demo.path : demo.url;
    if (!target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [demo.type === 'static-build' ? 'path' : 'url'],
        message: demo.type === 'static-build' ? 'A path is required (e.g. /demos/slug/1.0.0/)' : 'A URL is required',
      });
      return;
    }
    if (demo.type === 'static-build') {
      if (demo.path && !demo.path.startsWith('/demos/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['path'],
          message: 'Static builds must live under /demos/<slug>/<version>/',
        });
      }
      return;
    }
    if (demo.type === 'live' || demo.type === 'embed') {
      if (demo.url && !isHttp(demo.url) && !(demo.url.startsWith('/') && !demo.url.startsWith('//'))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Use https://… or a site-relative path' });
      }
    }
    if (demo.type === 'video' && demo.url) {
      const isVideoFile = /\.(mp4|webm|ogv)(\?.*)?$/i.test(demo.url);
      const isYouTube = /(?:youtube\.com|youtu\.be)\//i.test(demo.url);
      const isVimeo = /vimeo\.com\//i.test(demo.url);
      if (!isVideoFile && !isYouTube && !isVimeo && !demo.url.startsWith('/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['url'],
          message: 'Use a YouTube/Vimeo URL or an .mp4/.webm file',
        });
      }
    }
  });

export const metricSchema = z.object({
  label: z.string().trim().min(1).max(40),
  value: z.string().trim().min(1).max(24),
});

export const projectLinksSchema = z.object({
  repo: httpUrl.optional().or(z.literal('')),
  live: linkSchema.optional().or(z.literal('')),
  caseStudy: linkSchema.optional().or(z.literal('')),
});

export const projectSeoSchema = z.object({
  title: z.string().trim().max(70).optional().or(z.literal('')),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  ogImage: linkSchema.optional().or(z.literal('')),
});

export const projectSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  title: z.string().trim().min(1, 'Title is required').max(90),
  summary: z.string().trim().min(1, 'Summary is required').max(240),
  /** Short, structured case-study blocks shown above the long description. */
  problem: z.string().trim().max(800).optional().or(z.literal('')),
  solution: z.string().trim().max(800).optional().or(z.literal('')),
  /** Markdown. Rendered with `marked` and sanitized with a strict allow-list. */
  description: z.string().trim().min(1, 'Description is required').max(20000),
  status: z.enum(['draft', 'published', 'archived']),
  featured: z.boolean(),
  order: z.number().int().min(0).max(9999),
  startDate: z.string().regex(DATE_RE, 'Use YYYY-MM or YYYY-MM-DD'),
  endDate: z.string().regex(DATE_RE, 'Use YYYY-MM or YYYY-MM-DD').optional().or(z.literal('')),
  role: z.string().trim().min(1, 'Role is required').max(120),
  client: z.string().trim().max(80).optional().or(z.literal('')),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  stack: z.array(z.string().trim().min(1).max(40)).max(24).default([]),
  links: projectLinksSchema.default({}),
  metrics: z.array(metricSchema).max(6).default([]),
  cover: imageSchema,
  /** Optional architecture diagram rendered in the case study body. */
  architecture: imageSchema.optional(),
  gallery: z.array(imageSchema).max(12).default([]),
  demos: z.array(demoSchema).max(12).default([]),
  seo: projectSeoSchema.default({}),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type Project = z.infer<typeof projectSchema>;
export type Demo = z.infer<typeof demoSchema>;
export type DemoType = z.infer<typeof demoTypeSchema>;
export type DemoStatus = z.infer<typeof demoStatusSchema>;
export type ProjectImage = z.infer<typeof imageSchema>;
export type Metric = z.infer<typeof metricSchema>;

export const serviceSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(400),
  deliverables: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
});

export const skillGroupSchema = z.object({
  group: z.string().trim().min(1).max(40),
  items: z.array(z.string().trim().min(1).max(40)).max(40),
});

export const experienceSchema = z.object({
  company: z.string().trim().min(1).max(80),
  role: z.string().trim().min(1).max(80),
  period: z.string().trim().min(1).max(40),
  summary: z.string().trim().max(400).optional().or(z.literal('')),
  highlights: z.array(z.string().trim().min(1).max(160)).max(6).default([]),
  url: linkSchema.optional().or(z.literal('')),
  current: z.boolean().default(false),
});

export const testimonialSchema = z.object({
  id: idSchema,
  quote: z.string().trim().min(1).max(600),
  author: z.string().trim().min(1).max(80),
  role: z.string().trim().max(80).optional().or(z.literal('')),
  company: z.string().trim().max(80).optional().or(z.literal('')),
});

export const socialsSchema = z.object({
  github: httpUrl.optional().or(z.literal('')),
  linkedin: httpUrl.optional().or(z.literal('')),
  x: httpUrl.optional().or(z.literal('')),
  telegram: httpUrl.optional().or(z.literal('')),
  whatsapp: httpUrl.optional().or(z.literal('')),
  calendly: httpUrl.optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
});

export const contactSchema = z.object({
  provider: z.enum(['web3forms', 'formspree', 'mailto']),
  /** Public form key / form id. Never a secret. */
  key: z.string().trim().max(120).optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  bookingUrl: httpUrl.optional().or(z.literal('')),
  responseTime: z.string().trim().max(80).optional().or(z.literal('')),
  /** Optional endpoint override (self-hosted Formspree-compatible endpoint) */
  endpoint: httpUrl.optional().or(z.literal('')),
});

export const analyticsSchema = z.object({
  provider: z.enum(['none', 'goatcounter', 'umami']).default('none'),
  /** GoatCounter site code (e.g. "yourname") or Umami website ID */
  siteId: z.string().trim().max(80).optional().or(z.literal('')),
  /** Required for self-hosted Umami */
  endpoint: httpUrl.optional().or(z.literal('')),
});

export const themeSchema = z.object({
  accent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour such as #5eead4'),
  mode: z.enum(['dark', 'light', 'system']).default('dark'),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(80),
  tagline: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(80),
  timezone: z.string().trim().min(1).max(40),
  availability: z.object({
    available: z.boolean(),
    label: z.string().trim().min(1).max(80),
  }),
  yearsExperience: z.number().int().min(0).max(60).optional(),
  /** Short one-paragraph intro used in the About section. */
  about: z.string().trim().min(1).max(2000),
  /** Optional path to a CV PDF in /public, e.g. /cv.pdf */
  cv: z.string().trim().optional().or(z.literal('')),
  avatar: z.string().trim().optional().or(z.literal('')),
  terminalLines: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
});

export const repoConfigSchema = z.object({
  owner: z.string().trim().min(1),
  name: z.string().trim().min(1),
  branch: z.string().trim().min(1).default('main'),
  /** Where the site settings live in the repo. */
  siteFile: z.string().trim().default('src/content/site.json'),
  /** Where project JSON files live in the repo. */
  contentDir: z.string().trim().default('src/content/projects'),
  /** Where uploaded images are committed. */
  imagesDir: z.string().trim().default('public/images/projects'),
  /** Public path prefix that maps to imagesDir. */
  imagesPublicPath: z.string().trim().default('/images/projects'),
  /** Where static demo builds live. */
  demosDir: z.string().trim().default('public/demos'),
});

export const siteSchema = z.object({
  locale: z.string().trim().default('en'),
  profile: profileSchema,
  socials: socialsSchema,
  services: z.array(serviceSchema).default([]),
  skills: z.array(skillGroupSchema).default([]),
  experience: z.array(experienceSchema).default([]),
  testimonials: z.array(testimonialSchema).default([]),
  contact: contactSchema,
  analytics: analyticsSchema.default({ provider: 'none' }),
  theme: themeSchema,
  repo: repoConfigSchema,
});

export type Site = z.infer<typeof siteSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type SkillGroup = z.infer<typeof skillGroupSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Testimonial = z.infer<typeof testimonialSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Contact = z.infer<typeof contactSchema>;

export const projectFileSchema = projectSchema;
