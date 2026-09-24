/**
 * Hand-written types mirroring `supabase/migrations/0001_init.sql`.
 *
 * In a real deployment these are regenerated from the live schema with
 * `supabase gen types typescript`. That command needs a running Supabase
 * project, which does not exist in this sandbox, so the shape below is
 * maintained by hand and must stay in sync with the migration. The shape
 * (Row/Insert/Update/Relationships, plus Views/Functions/Enums/
 * CompositeTypes at the schema level) matches exactly what the Supabase
 * CLI generates, which is what `@supabase/supabase-js` needs to infer
 * query types instead of falling back to `never`.
 */

export type AutomationMode = "draft" | "safe_autopilot" | "autopilot";

export type LeadStage =
  | "new"
  | "contacted"
  | "needs_information"
  | "qualified"
  | "quote_requested"
  | "booking_ready"
  | "won"
  | "lost"
  | "human_review";

export type QualificationStatus =
  | "new"
  | "needs_information"
  | "qualified"
  | "quote_requested"
  | "booking_ready"
  | "human_required";

export type MessageSender = "customer" | "ai" | "human";

export type FollowUpJobStatus = "scheduled" | "sent" | "cancelled" | "failed";

type OrganizationRow = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  country: string | null;
  timezone: string;
  currency: string;
  languages: string[];
  website: string | null;
  description: string | null;
  service_areas_note: string | null;
  business_hours: Record<string, { open: string; close: string } | null>;
  booking_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  brand_tone: string | null;
  ai_instructions: string | null;
  automation_mode: AutomationMode;
  onboarding_completed: boolean;
  plan: string;
  created_at: string;
  updated_at: string;
}

type ProfileRow = {
  id: string;
  org_id: string | null;
  email: string;
  role: "owner" | "agent";
  full_name: string | null;
  created_at: string;
}

type ServiceRow = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  pricing_note: string | null;
  created_at: string;
}

type ServiceAreaRow = {
  id: string;
  org_id: string;
  area: string;
  created_at: string;
}

type FaqRow = {
  id: string;
  org_id: string;
  question: string;
  answer: string;
  created_at: string;
}

type QualificationQuestionRow = {
  id: string;
  org_id: string;
  question: string;
  sort_order: number;
  created_at: string;
}

type PricingRuleRow = {
  id: string;
  org_id: string;
  rule: string;
  created_at: string;
}

type FollowupSettingsRow = {
  org_id: string;
  first_delay_hours: number;
  second_delay_hours: number;
  max_followups: number;
  allowed_start_hour: number;
  allowed_end_hour: number;
  updated_at: string;
}

type LeadRow = {
  id: string;
  org_id: string;
  name: string;
  email: string;
  phone: string | null;
  source: string;
  stage: LeadStage;
  qualification_status: QualificationStatus;
  language: string | null;
  intent: string | null;
  requested_service: string | null;
  urgency: "low" | "medium" | "high" | null;
  sentiment: string | null;
  opted_out: boolean;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

type ConversationRow = {
  id: string;
  org_id: string;
  lead_id: string;
  status: "open" | "human_takeover" | "closed";
  created_at: string;
  updated_at: string;
}

type MessageRow = {
  id: string;
  org_id: string;
  conversation_id: string;
  sender: MessageSender;
  content: string;
  language: string | null;
  pending_approval: boolean;
  created_at: string;
}

type FollowupJobRow = {
  id: string;
  org_id: string;
  lead_id: string;
  attempt_number: number;
  run_at: string;
  status: FollowUpJobStatus;
  cancel_reason: string | null;
  created_at: string;
}

type ActivityLogRow = {
  id: string;
  org_id: string;
  lead_id: string | null;
  actor: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

type ApprovalRow = {
  id: string;
  org_id: string;
  lead_id: string;
  conversation_id: string;
  message_id: string;
  draft_content: string;
  status: "pending" | "approved" | "rejected" | "edited";
  created_at: string;
  resolved_at: string | null;
}

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: OrganizationRow;
        Insert: Partial<OrganizationRow> & { slug: string; name: string };
        Update: Partial<OrganizationRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string; email: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      services: {
        Row: ServiceRow;
        Insert: Partial<ServiceRow> & { org_id: string; name: string };
        Update: Partial<ServiceRow>;
        Relationships: [];
      };
      service_areas: {
        Row: ServiceAreaRow;
        Insert: Partial<ServiceAreaRow> & { org_id: string; area: string };
        Update: Partial<ServiceAreaRow>;
        Relationships: [];
      };
      faqs: {
        Row: FaqRow;
        Insert: Partial<FaqRow> & { org_id: string; question: string; answer: string };
        Update: Partial<FaqRow>;
        Relationships: [];
      };
      qualification_questions: {
        Row: QualificationQuestionRow;
        Insert: Partial<QualificationQuestionRow> & { org_id: string; question: string };
        Update: Partial<QualificationQuestionRow>;
        Relationships: [];
      };
      pricing_rules: {
        Row: PricingRuleRow;
        Insert: Partial<PricingRuleRow> & { org_id: string; rule: string };
        Update: Partial<PricingRuleRow>;
        Relationships: [];
      };
      followup_settings: {
        Row: FollowupSettingsRow;
        Insert: Partial<FollowupSettingsRow> & { org_id: string };
        Update: Partial<FollowupSettingsRow>;
        Relationships: [];
      };
      leads: {
        Row: LeadRow;
        Insert: Partial<LeadRow> & { org_id: string; name: string; email: string };
        Update: Partial<LeadRow>;
        Relationships: [];
      };
      conversations: {
        Row: ConversationRow;
        Insert: Partial<ConversationRow> & { org_id: string; lead_id: string };
        Update: Partial<ConversationRow>;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: Partial<MessageRow> & {
          org_id: string;
          conversation_id: string;
          sender: MessageSender;
          content: string;
        };
        Update: Partial<MessageRow>;
        Relationships: [];
      };
      followup_jobs: {
        Row: FollowupJobRow;
        Insert: Partial<FollowupJobRow> & { org_id: string; lead_id: string; run_at: string };
        Update: Partial<FollowupJobRow>;
        Relationships: [];
      };
      activity_log: {
        Row: ActivityLogRow;
        Insert: Partial<ActivityLogRow> & { org_id: string; actor: string; action: string };
        Update: Partial<ActivityLogRow>;
        Relationships: [];
      };
      approvals: {
        Row: ApprovalRow;
        Insert: Partial<ApprovalRow> & {
          org_id: string;
          lead_id: string;
          conversation_id: string;
          message_id: string;
          draft_content: string;
        };
        Update: Partial<ApprovalRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
