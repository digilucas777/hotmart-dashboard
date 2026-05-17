export type DashSpeedPlan = 'starter' | 'pro' | 'agency' | 'enterprise'

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'

export type IntegrationProvider =
  | 'meta_ads'
  | 'google_ads'
  | 'hotmart'
  | 'kiwify'
  | 'shopify'
  | 'whatsapp_api'

export type DashSpeedWidgetType = 'metric' | 'line' | 'bar' | 'pie' | 'table' | 'funnel'

export type DashSpeedWidgetLayout = {
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

export type DashSpeedDashboard = {
  id: string
  user_id: string
  name: string
  description?: string | null
  layout_version: number
  created_at: string
  updated_at: string
}

export type DashSpeedWidget = {
  id: string
  dashboard_id: string
  user_id: string
  type: DashSpeedWidgetType
  title: string
  data_source: string
  config: Record<string, unknown>
  layout: DashSpeedWidgetLayout
  created_at: string
  updated_at: string
}

export type DashSpeedSubscription = {
  id: string
  user_id: string
  plan: DashSpeedPlan
  status: SubscriptionStatus
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  current_period_end?: string | null
}

export const DASH_SPEED_PLANS: Record<DashSpeedPlan, { dashboards: number | null; stripePriceLookupKey: string }> = {
  starter: { dashboards: 1, stripePriceLookupKey: 'dash_speed_starter_monthly' },
  pro: { dashboards: 3, stripePriceLookupKey: 'dash_speed_pro_monthly' },
  agency: { dashboards: 10, stripePriceLookupKey: 'dash_speed_agency_monthly' },
  enterprise: { dashboards: null, stripePriceLookupKey: 'dash_speed_enterprise_custom' },
}

export const FUTURE_INTEGRATIONS: { provider: IntegrationProvider; label: string; oauthReady: boolean }[] = [
  { provider: 'meta_ads', label: 'Meta Ads', oauthReady: true },
  { provider: 'google_ads', label: 'Google Ads', oauthReady: true },
  { provider: 'hotmart', label: 'Hotmart', oauthReady: false },
  { provider: 'kiwify', label: 'Kiwify', oauthReady: false },
  { provider: 'shopify', label: 'Shopify', oauthReady: true },
  { provider: 'whatsapp_api', label: 'WhatsApp API', oauthReady: false },
]
