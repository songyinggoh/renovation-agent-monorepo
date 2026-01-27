# Workload Identity Federation Configuration Verification

**Date**: 2026-01-27
**Workflow**: `.github/workflows/backend-deploy.yml`
**Status**: ⚠️ Partial Verification Complete (GitHub secrets cannot be verified locally)

---

## ✓ Verified Components

### 1. Workflow YAML Syntax
- **Status**: ✅ VALID
- **File**: `.github/workflows/backend-deploy.yml`
- Parsed successfully with no syntax errors

### 2. Workflow Structure
- **Trigger**: Push to `main` branch with changes in `backend/**`
- **Runner**: `ubuntu-latest`
- **Permissions**:
  - `contents: read` ✅
  - `id-token: write` ✅ (Required for OIDC token generation)

### 3. Docker Build Configuration
- **Dockerfile**: `backend/Dockerfile` ✅ EXISTS
- **Build Context**: `backend/` directory
- **Target**: Multi-stage production build
- **Image Tag**: `gcr.io/renovation-planner-agent/renovation-backend`

### 4. Google Cloud Configuration
```yaml
PROJECT_ID: renovation-planner-agent
SERVICE_NAME: renovation-backend
REGION: us-central1
```

### 5. Service Account Configuration
```yaml
service_account: 'songyinggoh@renovation-planner-agent.iam.gserviceaccount.com'
```

### 6. WIF Authentication Flow
The workflow uses the correct pattern:
```yaml
- name: Google Auth
  uses: 'google-github-actions/auth@v2'
  with:
    workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
    service_account: 'songyinggoh@renovation-planner-agent.iam.gserviceaccount.com'
```

---

## ⚠️ Cannot Verify Locally (Requires GitHub/GCP Access)

### 1. GitHub Repository Secret: `WIF_PROVIDER`
**Expected Format**:
```
projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_NAME/providers/PROVIDER_NAME
```

**Verification Steps** (requires GitHub web UI or CLI):
```bash
# Check if secret exists (requires gh CLI with auth)
gh secret list

# Expected output should include:
# WIF_PROVIDER
```

### 2. Google Cloud Workload Identity Pool
**Required GCP Components**:
- Workload Identity Pool
- Workload Identity Provider (configured for GitHub Actions)
- Service Account with proper IAM roles

**Verification Commands** (requires `gcloud` CLI with auth):
```bash
# List Workload Identity Pools
gcloud iam workload-identity-pools list --location=global --project=renovation-planner-agent

# List Providers
gcloud iam workload-identity-pools providers list \
  --workload-identity-pool=POOL_NAME \
  --location=global \
  --project=renovation-planner-agent

# Verify Service Account
gcloud iam service-accounts describe songyinggoh@renovation-planner-agent.iam.gserviceaccount.com
```

### 3. IAM Bindings
**Required Roles for Service Account**:
- `roles/run.admin` - Deploy to Cloud Run
- `roles/iam.serviceAccountUser` - Act as service account
- `roles/storage.admin` - Push to GCR (or `artifactregistry.writer` if using Artifact Registry)
- `roles/cloudbuild.builds.editor` - Submit Cloud Build jobs

**Verification Command**:
```bash
# Check IAM policy for service account
gcloud projects get-iam-policy renovation-planner-agent \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:songyinggoh@renovation-planner-agent.iam.gserviceaccount.com"
```

### 4. Workload Identity Pool Provider Configuration
**Required Attribute Mappings**:
```
google.subject = assertion.sub
attribute.actor = assertion.actor
attribute.repository = assertion.repository
```

**Required Attribute Condition** (for security):
```
assertion.repository == 'YOUR_GITHUB_ORG/YOUR_REPO_NAME'
```

### 5. Service Account Impersonation Binding
```bash
# Verify the service account can be impersonated by the pool
gcloud iam service-accounts add-iam-policy-binding \
  songyinggoh@renovation-planner-agent.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_NAME/attribute.repository/GITHUB_ORG/REPO_NAME"
```

---

## 🔍 Manual Testing Steps

### Step 1: Trigger Workflow Manually
```bash
# Option A: Push to main with backend changes
git checkout main
touch backend/test.txt
git add backend/test.txt
git commit -m "test: trigger deployment workflow"
git push origin main

# Option B: Manually trigger via GitHub UI
# Go to Actions → Deploy Backend to Cloud Run → Run workflow
```

### Step 2: Monitor Workflow Execution
1. Go to GitHub Actions tab
2. Watch for the "Deploy Backend to Cloud Run" workflow
3. Check each step:
   - ✅ Debug - Check Secret (should pass if WIF_PROVIDER is set)
   - ✅ Google Auth (should authenticate via WIF)
   - ✅ Build and Push Docker Image
   - ✅ Deploy to Cloud Run

### Step 3: Verify Deployment
```bash
# Check Cloud Run service
gcloud run services describe renovation-backend \
  --region=us-central1 \
  --project=renovation-planner-agent

# Test the deployed service
curl https://renovation-backend-XXXXX-uc.a.run.app/health
```

---

## 🐛 Common Issues & Troubleshooting

### Issue 1: "WIF_PROVIDER secret is empty"
**Cause**: Secret not set in GitHub repository
**Fix**: Add secret via GitHub UI: Settings → Secrets → Actions → New repository secret

### Issue 2: "Error authenticating with Google Cloud"
**Cause**: Invalid WIF provider URL or missing IAM bindings
**Fix**: Verify WIF provider exists and service account has `workloadIdentityUser` role

### Issue 3: "Permission denied: Cloud Build"
**Cause**: Service account lacks Cloud Build permissions
**Fix**: Add `roles/cloudbuild.builds.editor` role to service account

### Issue 4: "Permission denied: Cloud Run"
**Cause**: Service account lacks Cloud Run deployment permissions
**Fix**: Add `roles/run.admin` role to service account

### Issue 5: "Repository not allowed"
**Cause**: WIF provider attribute condition restricts repository
**Fix**: Update attribute condition to allow this repository

---

## ✅ Security Best Practices Checklist

- [x] Uses OIDC tokens (no long-lived keys)
- [x] Minimal permissions (`id-token: write`, `contents: read`)
- [x] Service account specified explicitly
- [x] Debug step validates secret exists
- [ ] **TODO**: Verify attribute condition restricts to this repository only
- [ ] **TODO**: Verify service account follows least-privilege principle
- [ ] **TODO**: Add Cloud Run environment variables via secrets (DATABASE_URL, API keys, etc.)

---

## 📋 Next Steps

1. **Verify GitHub Secret**:
   - Check if `WIF_PROVIDER` secret exists in repository settings
   - Value should match GCP Workload Identity Provider full resource name

2. **Verify GCP Configuration**:
   - Run verification commands listed above (requires GCP access)
   - Confirm service account has required roles

3. **Test Deployment**:
   - Trigger workflow manually or push backend changes to `main`
   - Monitor workflow execution in GitHub Actions
   - Verify service is running in Cloud Run

4. **Security Hardening** (if not done):
   - Add attribute condition to restrict repository
   - Review service account IAM roles (remove excessive permissions)
   - Add Cloud Run environment variables for secrets (don't hardcode in Dockerfile)

---

## 📚 References

- [GitHub Actions OIDC with Google Cloud](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-google-cloud-platform)
- [Workload Identity Federation Documentation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [google-github-actions/auth](https://github.com/google-github-actions/auth)
