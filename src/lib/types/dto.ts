export interface MetricDto {
  key: string;
  label: string;
  value: string;
  delta?: string;
  status?: 'ok' | 'warning' | 'critical';
}

export interface DashboardDto {
  metrics: MetricDto[];
}

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: 'active' | 'disabled';
  totalEmails?: number;
  unreadEmails?: number;
}

export interface EmailDto {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
}

export interface EmailDetailDto {
  id: string;
  userId: string;
  sender: string;
  recipient: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  bodyText: string;
  bodyHtml: string;
  isRead: boolean;
  isStarred: boolean;
}

export interface WorkerSettingsDto {
  botStatus: string;
  botTokenConfigured: boolean;
  webhookSecretConfigured: boolean;
  allowedIds: string;
  forwardInbound: boolean;
  targetMode: string;
  defaultChatId: string;
  testChatId: string;
}
