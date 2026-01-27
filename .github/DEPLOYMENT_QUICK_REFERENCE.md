# Deployment Quick Reference

**Active Workflow**: `backend-deploy-ghcr.yml` (GitHub Container Registry - FREE!)

## 🚀 Check Deployment Status

### Option 1: GitHub Actions (Fastest)
```
https://github.com/songyinggoh/renovation-agent-monorepo/actions
```
Look for "Deploy Backend to Cloud Run" workflows

### Option 2: Google Cloud Console
```
https://console.cloud.google.com/run?project=renovation-planner-agent
```
Find service: `renovation-backend` in `us-central1`

### Option 3: gcloud CLI
```bash
# Get service URL
gcloud run services describe renovation-backend \
  --region us-central1 \
  --project renovation-planner-agent \
  --format="value(status.url)"

# Get deployment status
gcloud run services list \
  --region us-central1 \
  --project renovation-planner-agent
```

---

## 📦 Container Registry

**Registry**: GitHub Container Registry (GHCR) - FREE
**Image**: `ghcr.io/songyinggoh/renovation-agent-monorepo-backend`
**Packages**: https://github.com/songyinggoh?tab=packages

**IMPORTANT**: After first deployment, make package public:
1. Go to packages link above
2. Click package → Settings → Change visibility → Public

## 🧪 Test Deployed Service

### Basic Health Check
```bash
# Replace <SERVICE_URL> with URL from Cloud Console
curl https://renovation-backend-XXXXX-uc.a.run.app/health
```

**Expected Response**:
```json
{"status":"ok"}
```

### Detailed Status Check
```bash
curl https://renovation-backend-XXXXX-uc.a.run.app/health/status
```

**Expected Response**:
```json
{
  "status": "healthy",
  "uptime": 12345,
  "database": "connected",
  "timestamp": "2026-01-27T16:45:00.000Z"
}
```

---

## 📊 View Logs

### Recent Logs (Last 50 lines)
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=renovation-backend" \
  --limit 50 \
  --project renovation-planner-agent
```

### Error Logs Only
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=renovation-backend AND severity>=ERROR" \
  --limit 20 \
  --project renovation-planner-agent
```

### Live Tail (Real-time)
```bash
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=renovation-backend" \
  --project renovation-planner-agent
```

---

## 🔄 Trigger New Deployment

### Automatic (Recommended)
Push any change to `backend/**` on `main` branch:
```bash
# Example: Update package.json version
cd backend
npm version patch
git add package.json
git commit -m "chore: bump version"
git push origin main
```

### Manual Trigger
Use GitHub CLI:
```bash
gh workflow run backend-deploy.yml
```

Or via GitHub UI: Actions → Deploy Backend to Cloud Run → Run workflow

---

## ⚙️ Update Environment Variables

```bash
gcloud run services update renovation-backend \
  --region us-central1 \
  --set-env-vars KEY1=value1,KEY2=value2 \
  --project renovation-planner-agent
```

**Common Variables**:
- `DATABASE_URL`: PostgreSQL connection string
- `GOOGLE_API_KEY`: Gemini AI API key
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anon key
- `NODE_ENV`: production (default)
- `PORT`: 3000 (default)

---

## 🐛 Common Issues

### Issue: 404 Not Found
- **Cause**: Wrong URL or service not deployed
- **Fix**: Check service URL in Cloud Console

### Issue: 500 Internal Error
- **Cause**: Application error (check logs)
- **Fix**: `gcloud logging read ...` (see above)

### Issue: Cold Start Slow
- **Cause**: Cloud Run scales to zero
- **Fix**: Normal behavior, or set minimum instances:
  ```bash
  gcloud run services update renovation-backend \
    --min-instances 1 \
    --region us-central1 \
    --project renovation-planner-agent
  ```

### Issue: Deployment Failed
- **Check GitHub Actions logs**
- Common causes:
  - WIF_PROVIDER secret missing/invalid
  - Service account permissions
  - Dockerfile errors
  - Build failures

---

## 📈 Monitoring

### Key Metrics to Watch
- **Request Count**: Total requests per minute
- **Request Latency**: p50, p95, p99 response times
- **Error Rate**: 4xx and 5xx error percentage
- **Instance Count**: Number of running containers
- **CPU/Memory**: Resource utilization

**View in Console**:
```
https://console.cloud.google.com/run/detail/us-central1/renovation-backend/metrics?project=renovation-planner-agent
```

---

## 🔐 Security Checklist

- [x] Using WIF (no service account keys)
- [x] Service deployed successfully
- [ ] Environment variables set securely
- [ ] Custom domain configured (optional)
- [ ] Monitoring alerts configured
- [ ] Backup/DR plan established

---

## 📚 Full Documentation

- [Deployment Status Report](../docs/Deployment_Status_Report.md)
- [WIF Configuration Verification](../docs/WIF_Configuration_Verification.md)
- [Backend README](../backend/README.md)
