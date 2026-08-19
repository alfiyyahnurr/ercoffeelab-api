export function formatNotificationTemplate(row: any) {
  return {
    id: Number(row.id),
    code: row.code,
    channel: row.channel,
    subject: row.subject ?? null,
    bodyTemplate: row.body_template,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}
