# Admin Manual

## Platform Management

The Admin Dashboard provides oversight of users, content, payments, and system health.

## User Management

- View all users, filter by role.
- Suspend or activate accounts.
- Reset passwords when needed.

## Instructor Approval

Review instructor applications if approval workflow is enabled. Approve or reject with notes.

## Payments

- Monitor transactions in **Payments**.
- View Razorpay/Stripe settlement status.
- Handle refund requests per platform policy.

## Analytics

Platform-wide metrics: enrollments, revenue, active users, course completions, Learning Universe adoption.

## Certificates

- Audit issued certificates.
- Regenerate or revoke if policy requires.
- Configure certificate templates in Settings.

## Reviews

Moderate course reviews. Remove spam or policy violations.

## System Health

**Settings → System Health** shows database, storage, AI provider status, and queue health.

## AI Configuration

**Settings → AI** tab:

- Enable/disable AI course authoring, LU builder, tutor, quiz generator
- Select provider: OpenAI, Gemini, or hybrid
- Set model name override

## Security

- Enforce strong passwords and session policies.
- Review audit logs (super admin).
- Rotate API keys via environment variables, not the database.

## Troubleshooting

### Payments failing

Verify payment gateway keys in server environment. Check webhook endpoints.

### AI features unavailable

Confirm `OPENAI_API_KEY` or `GOOGLE_AI_API_KEY` is set. Enable feature toggles in AI settings.

### Upload errors

Check disk space and `UPLOAD_DIR` permissions on the server.
