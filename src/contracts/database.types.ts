export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      articles: {
        Row: {
          author: string | null
          cluster_id: string | null
          content_text: string | null
          embed_model: string | null
          embedding: string | null
          enrich_provider: string | null
          enriched_at: string | null
          entities: Json
          fetched_at: string
          headline: string | null
          id: string
          image_url: string | null
          key_fact: string | null
          labels: Json
          lang: string
          lede: string | null
          published_at: string
          recall: Json | null
          source_id: string
          status: string
          summary_brief: string | null
          summary_deep: string | null
          summary_std: string | null
          title: string
          ur: Json | null
          url: string
          url_hash: string
          why_it_matters: string | null
          word_count: number
        }
        Insert: {
          author?: string | null
          cluster_id?: string | null
          content_text?: string | null
          embed_model?: string | null
          embedding?: string | null
          enrich_provider?: string | null
          enriched_at?: string | null
          entities?: Json
          fetched_at?: string
          headline?: string | null
          id?: string
          image_url?: string | null
          key_fact?: string | null
          labels?: Json
          lang?: string
          lede?: string | null
          published_at: string
          recall?: Json | null
          source_id: string
          status?: string
          summary_brief?: string | null
          summary_deep?: string | null
          summary_std?: string | null
          title: string
          ur?: Json | null
          url: string
          url_hash: string
          why_it_matters?: string | null
          word_count?: number
        }
        Update: {
          author?: string | null
          cluster_id?: string | null
          content_text?: string | null
          embed_model?: string | null
          embedding?: string | null
          enrich_provider?: string | null
          enriched_at?: string | null
          entities?: Json
          fetched_at?: string
          headline?: string | null
          id?: string
          image_url?: string | null
          key_fact?: string | null
          labels?: Json
          lang?: string
          lede?: string | null
          published_at?: string
          recall?: Json | null
          source_id?: string
          status?: string
          summary_brief?: string | null
          summary_deep?: string | null
          summary_std?: string | null
          title?: string
          ur?: Json | null
          url?: string
          url_hash?: string
          why_it_matters?: string | null
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "articles_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      clusters: {
        Row: {
          article_count: number
          centroid: string | null
          first_seen: string
          headline: string | null
          id: string
          importance: number
          last_seen: string
          perspectives: Json | null
          source_count: number
        }
        Insert: {
          article_count?: number
          centroid?: string | null
          first_seen?: string
          headline?: string | null
          id?: string
          importance?: number
          last_seen?: string
          perspectives?: Json | null
          source_count?: number
        }
        Update: {
          article_count?: number
          centroid?: string | null
          first_seen?: string
          headline?: string | null
          id?: string
          importance?: number
          last_seen?: string
          perspectives?: Json | null
          source_count?: number
        }
        Relationships: []
      }
      daily_activity: {
        Row: {
          edition_complete: boolean
          local_date: string
          qualifying_reads: number
          recall_correct: number
          recall_total: number
          status: string
          stories_read: number
          user_id: string
        }
        Insert: {
          edition_complete?: boolean
          local_date: string
          qualifying_reads?: number
          recall_correct?: number
          recall_total?: number
          status?: string
          stories_read?: number
          user_id: string
        }
        Update: {
          edition_complete?: boolean
          local_date?: string
          qualifying_reads?: number
          recall_correct?: number
          recall_total?: number
          status?: string
          stories_read?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      edition_items: {
        Row: {
          article_id: string
          breakdown: Json
          edition_id: string
          rank: number
          reasons: Json
          score: number
          section_slug: string
          slot: string
          tier: string
        }
        Insert: {
          article_id: string
          breakdown: Json
          edition_id: string
          rank: number
          reasons: Json
          score: number
          section_slug: string
          slot: string
          tier: string
        }
        Update: {
          article_id?: string
          breakdown?: Json
          edition_id?: string
          rank?: number
          reasons?: Json
          score?: number
          section_slug?: string
          slot?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "edition_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edition_items_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edition_items_section_slug_fkey"
            columns: ["section_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
        ]
      }
      editions: {
        Row: {
          algo_version: string
          created_at: string
          edition_date: string
          editor_note: string
          editor_note_source: string
          id: string
          lead_article_id: string
          number: number
          paper_name: string
          params: Json
          pdf_path: string | null
          presentation: Json
          recall: Json
          receipt: Json
          section_order: string[]
          user_id: string
        }
        Insert: {
          algo_version: string
          created_at?: string
          edition_date: string
          editor_note: string
          editor_note_source?: string
          id?: string
          lead_article_id: string
          number: number
          paper_name: string
          params: Json
          pdf_path?: string | null
          presentation: Json
          recall?: Json
          receipt: Json
          section_order: string[]
          user_id: string
        }
        Update: {
          algo_version?: string
          created_at?: string
          edition_date?: string
          editor_note?: string
          editor_note_source?: string
          id?: string
          lead_article_id?: string
          number?: number
          paper_name?: string
          params?: Json
          pdf_path?: string | null
          presentation?: Json
          recall?: Json
          receipt?: Json
          section_order?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "editions_lead_article_id_fkey"
            columns: ["lead_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      events: {
        Row: {
          article_id: string | null
          edition_id: string | null
          id: number
          local_date: string
          meta: Json
          occurred_at: string
          type: string
          user_id: string
          value: number | null
        }
        Insert: {
          article_id?: string | null
          edition_id?: string | null
          id?: never
          local_date: string
          meta?: Json
          occurred_at?: string
          type: string
          user_id: string
          value?: number | null
        }
        Update: {
          article_id?: string | null
          edition_id?: string | null
          id?: never
          local_date?: string
          meta?: Json
          occurred_at?: string
          type?: string
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "events_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      interest_snapshots: {
        Row: {
          snap_date: string
          user_id: string
          weights: Json
        }
        Insert: {
          snap_date: string
          user_id: string
          weights: Json
        }
        Update: {
          snap_date?: string
          user_id?: string
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "interest_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      job_runs: {
        Row: {
          finished_at: string | null
          id: number
          job: string
          started_at: string
          stats: Json
          status: string
        }
        Insert: {
          finished_at?: string | null
          id?: never
          job: string
          started_at?: string
          stats?: Json
          status?: string
        }
        Update: {
          finished_at?: string | null
          id?: never
          job?: string
          started_at?: string
          stats?: Json
          status?: string
        }
        Relationships: []
      }
      llm_cache: {
        Row: {
          created_at: string
          key: string
          output: Json
          provider: string
          step: string
        }
        Insert: {
          created_at?: string
          key: string
          output: Json
          provider: string
          step: string
        }
        Update: {
          created_at?: string
          key?: string
          output?: Json
          provider?: string
          step?: string
        }
        Relationships: []
      }
      llm_usage: {
        Row: {
          model: string
          rate_limited: number
          requests: number
          tokens_in: number
          tokens_out: number
          usage_day: string
        }
        Insert: {
          model: string
          rate_limited?: number
          requests?: number
          tokens_in?: number
          tokens_out?: number
          usage_day: string
        }
        Update: {
          model?: string
          rate_limited?: number
          requests?: number
          tokens_in?: number
          tokens_out?: number
          usage_day?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          city: string
          created_at: string
          delivery_hour: number
          depth: string
          depth_pref: number
          display_name: string | null
          is_demo: boolean
          lang: string
          n_engaged: number
          neg_emb: string | null
          onboarded_at: string | null
          paper_name: string
          pos_emb: string | null
          time_budget: number
          tz: string
          user_id: string
        }
        Insert: {
          city?: string
          created_at?: string
          delivery_hour?: number
          depth?: string
          depth_pref?: number
          display_name?: string | null
          is_demo?: boolean
          lang?: string
          n_engaged?: number
          neg_emb?: string | null
          onboarded_at?: string | null
          paper_name?: string
          pos_emb?: string | null
          time_budget?: number
          tz?: string
          user_id: string
        }
        Update: {
          city?: string
          created_at?: string
          delivery_hour?: number
          depth?: string
          depth_pref?: number
          display_name?: string | null
          is_demo?: boolean
          lang?: string
          n_engaged?: number
          neg_emb?: string | null
          onboarded_at?: string | null
          paper_name?: string
          pos_emb?: string | null
          time_budget?: number
          tz?: string
          user_id?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          active: boolean
          fail_count: number
          homepage: string | null
          id: string
          kind: string
          last_fetched_at: string | null
          last_status: string | null
          name: string
          quality: number
          region: string
          topics: string[]
          url: string
        }
        Insert: {
          active?: boolean
          fail_count?: number
          homepage?: string | null
          id: string
          kind: string
          last_fetched_at?: string | null
          last_status?: string | null
          name: string
          quality?: number
          region?: string
          topics?: string[]
          url: string
        }
        Update: {
          active?: boolean
          fail_count?: number
          homepage?: string | null
          id?: string
          kind?: string
          last_fetched_at?: string | null
          last_status?: string | null
          name?: string
          quality?: number
          region?: string
          topics?: string[]
          url?: string
        }
        Relationships: []
      }
      streaks: {
        Row: {
          current: number
          freeze_progress: number
          freezes_available: number
          last_repair_at: string | null
          last_streak_date: string | null
          longest: number
          total_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current?: number
          freeze_progress?: number
          freezes_available?: number
          last_repair_at?: string | null
          last_streak_date?: string | null
          longest?: number
          total_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current?: number
          freeze_progress?: number
          freezes_available?: number
          last_repair_at?: string | null
          last_streak_date?: string | null
          longest?: number
          total_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      topics: {
        Row: {
          description: string
          embedding: string | null
          emoji: string | null
          level: number
          name: string
          parent_slug: string | null
          slug: string
          synonyms: string[]
        }
        Insert: {
          description: string
          embedding?: string | null
          emoji?: string | null
          level: number
          name: string
          parent_slug?: string | null
          slug: string
          synonyms?: string[]
        }
        Update: {
          description?: string
          embedding?: string | null
          emoji?: string | null
          level?: number
          name?: string
          parent_slug?: string | null
          slug?: string
          synonyms?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "topics_parent_slug_fkey"
            columns: ["parent_slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_interests: {
        Row: {
          alpha: number
          beta: number
          muted: boolean
          picked: boolean
          pinned: boolean
          prior_alpha: number
          prior_beta: number
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alpha: number
          beta: number
          muted?: boolean
          picked?: boolean
          pinned?: boolean
          prior_alpha: number
          prior_beta: number
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alpha?: number
          beta?: number
          muted?: boolean
          picked?: boolean
          pinned?: boolean
          prior_alpha?: number
          prior_beta?: number
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_interests_slug_fkey"
            columns: ["slug"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "user_interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_llm_usage: {
        Args: {
          p_day: string
          p_in: number
          p_limited: number
          p_model: string
          p_out: number
          p_requests: number
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
